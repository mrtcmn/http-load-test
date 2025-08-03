#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');
const { ErrorHandler, ErrorCodes } = require('../lib/ErrorHandler');

class BinaryManager {
  constructor() {
    this.packageJson = require('../package.json');
    this.version = this.packageJson.version;
    this.binDir = path.join(__dirname, '..', 'bin');
    this.binaryName = this.getBinaryName();
    this.binaryPath = path.join(this.binDir, this.binaryName);
    this.githubRepo = 'mrtcmn/http-load-test';
    this.errorHandler = new ErrorHandler();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.errorHandler.on('error', (error) => {
      console.error(`Binary Manager Error [${error.code}]: ${error.getUserMessage()}`);
      if (process.env.DEBUG) {
        console.error('Error details:', error.toJSON());
      }
    });

    this.errorHandler.on('retry', ({ error, attempt, maxRetries }) => {
      console.warn(`Retrying operation (${attempt}/${maxRetries}): ${error.getUserMessage()}`);
    });
  }

  getBinaryName() {
    try {
      const platform = os.platform();
      const arch = os.arch();
      
      let platformName;
      switch (platform) {
        case 'win32':
          platformName = 'windows';
          break;
        case 'darwin':
          platformName = 'darwin';
          break;
        case 'linux':
          platformName = 'linux';
          break;
        default:
          throw this.errorHandler.createBinaryError(
            ErrorCodes.BINARY_NOT_FOUND,
            `Unsupported platform: ${platform}`,
            null,
            { platform, arch }
          );
      }

      let archName;
      switch (arch) {
        case 'x64':
          archName = 'amd64';
          break;
        case 'arm64':
          archName = 'arm64';
          break;
        default:
          throw this.errorHandler.createBinaryError(
            ErrorCodes.BINARY_NOT_FOUND,
            `Unsupported architecture: ${arch}`,
            null,
            { platform, arch }
          );
      }

      const extension = platform === 'win32' ? '.exe' : '';
      return `http-load-test-${platformName}-${archName}${extension}`;
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      throw this.errorHandler.createBinaryError(
        ErrorCodes.BINARY_NOT_FOUND,
        `Failed to determine binary name: ${error.message}`,
        error
      );
    }
  }

  getDownloadUrl() {
    return `https://github.com/${this.githubRepo}/releases/download/v${this.version}/${this.binaryName}`;
  }

  getChecksumUrl() {
    return `https://github.com/${this.githubRepo}/releases/download/v${this.version}/checksums.txt`;
  }

  async downloadFile(url, destination, retryKey = null) {
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this._downloadFileAttempt(url, destination);
        return;
      } catch (error) {
        lastError = error;
        
        const categorizedError = this.errorHandler.categorizeError(error, {
          operation: 'download',
          url,
          destination,
          attempt
        });

        if (attempt < maxRetries && categorizedError.recoverable) {
          console.warn(`Download attempt ${attempt} failed, retrying...`);
          await this._delay(1000 * attempt); // Exponential backoff
          continue;
        }
        
        throw this.errorHandler.createBinaryError(
          ErrorCodes.BINARY_DOWNLOAD_FAILED,
          `Failed to download binary after ${maxRetries} attempts: ${error.message}`,
          error,
          { url, destination, attempts: maxRetries }
        );
      }
    }
  }

  async _downloadFileAttempt(url, destination) {
    return new Promise((resolve, reject) => {
      // Clean up any existing partial file
      if (fs.existsSync(destination)) {
        try {
          fs.unlinkSync(destination);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      const file = fs.createWriteStream(destination);
      const timeout = setTimeout(() => {
        file.destroy();
        reject(new Error('Download timeout after 60 seconds'));
      }, 60000);
      
      https.get(url, (response) => {
        clearTimeout(timeout);
        
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.destroy();
          // Handle redirects
          return this._downloadFileAttempt(response.headers.location, destination)
            .then(resolve)
            .catch(reject);
        }
        
        if (response.statusCode !== 200) {
          file.destroy();
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);
        
        file.on('finish', () => {
          file.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        file.on('error', (err) => {
          clearTimeout(timeout);
          fs.unlink(destination, () => {}); // Delete partial file
          reject(err);
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        file.destroy();
        reject(err);
      });
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async downloadChecksums() {
    const checksumPath = path.join(this.binDir, 'checksums.txt');
    try {
      await this.downloadFile(this.getChecksumUrl(), checksumPath, 'checksum-download');
      return fs.readFileSync(checksumPath, 'utf8');
    } catch (error) {
      console.warn('Warning: Could not download checksums for verification:', error.message);
      return null;
    }
  }

  calculateChecksum(filePath) {
    try {
      const crypto = require('crypto');
      const fileBuffer = fs.readFileSync(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      console.warn('Warning: Could not calculate checksum');
      return null;
    }
  }

  verifyChecksum(filePath, expectedChecksum) {
    if (!expectedChecksum) {
      console.warn('Warning: Skipping checksum verification (no checksum available)');
      return true; // Skip verification if no checksum available
    }
    
    try {
      const actualChecksum = this.calculateChecksum(filePath);
      if (!actualChecksum) {
        console.warn('Warning: Could not calculate checksum for verification');
        return true; // Skip verification if calculation failed
      }
      
      const isValid = actualChecksum === expectedChecksum;
      if (!isValid) {
        console.error(`Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`);
      }
      
      return isValid;
    } catch (error) {
      console.warn('Warning: Checksum verification failed:', error.message);
      return true; // Skip verification on error
    }
  }

  extractChecksumForBinary(checksumContent) {
    if (!checksumContent) return null;
    
    const lines = checksumContent.split('\n');
    for (const line of lines) {
      if (line.includes(this.binaryName)) {
        return line.split(/\s+/)[0];
      }
    }
    return null;
  }

  async downloadBinary() {
    console.log(`Downloading ${this.binaryName} for ${os.platform()}-${os.arch()}...`);
    
    try {
      // Ensure bin directory exists
      if (!fs.existsSync(this.binDir)) {
        fs.mkdirSync(this.binDir, { recursive: true });
      }

      // Download checksums first
      const checksumContent = await this.downloadChecksums();
      const expectedChecksum = this.extractChecksumForBinary(checksumContent);
      
      // Download binary
      await this.downloadFile(this.getDownloadUrl(), this.binaryPath, 'binary-download');
      
      // Verify checksum
      if (!this.verifyChecksum(this.binaryPath, expectedChecksum)) {
        throw this.errorHandler.createBinaryError(
          ErrorCodes.BINARY_CHECKSUM_FAILED,
          'Binary checksum verification failed',
          null,
          { expectedChecksum, binaryPath: this.binaryPath }
        );
      }
      
      // Make binary executable on Unix systems
      if (os.platform() !== 'win32') {
        try {
          fs.chmodSync(this.binaryPath, '755');
        } catch (error) {
          throw this.errorHandler.createBinaryError(
            ErrorCodes.BINARY_PERMISSION_DENIED,
            `Failed to make binary executable: ${error.message}`,
            error,
            { binaryPath: this.binaryPath }
          );
        }
      }
      
      console.log(`Successfully downloaded and installed ${this.binaryName}`);
      return true;
    } catch (error) {
      // If it's already a LoadTestError, re-throw it
      if (error.code) {
        console.error(`Binary download failed: ${error.getUserMessage()}`);
        if (process.env.DEBUG) {
          console.error('Troubleshooting steps:');
          error.getTroubleshootingSteps().forEach((step, index) => {
            console.error(`  ${index + 1}. ${step}`);
          });
        }
        
        // Try to compile from source as fallback
        console.log('Attempting to compile from source as fallback...');
        return this.compileFromSource();
      }
      
      // Wrap generic errors
      const wrappedError = this.errorHandler.createBinaryError(
        ErrorCodes.BINARY_DOWNLOAD_FAILED,
        `Failed to download binary: ${error.message}`,
        error
      );
      
      console.error(`Binary download failed: ${wrappedError.getUserMessage()}`);
      
      // Try to compile from source as fallback
      return this.compileFromSource();
    }
  }

  compileFromSource() {
    console.log('Attempting to compile from source...');
    
    try {
      // Check if Go is installed
      try {
        execSync('go version', { stdio: 'ignore' });
      } catch (goError) {
        throw this.errorHandler.createBinaryError(
          ErrorCodes.BINARY_COMPILATION_FAILED,
          'Go is not installed or not in PATH. Please install Go from https://golang.org/dl/',
          goError,
          { requirement: 'go', url: 'https://golang.org/dl/' }
        );
      }
      
      // Compile the binary
      const buildCommand = `go build -o "${this.binaryPath}" ./cmd/http-load-test`;
      console.log(`Running: ${buildCommand}`);
      
      try {
        execSync(buildCommand, { stdio: 'inherit' });
      } catch (buildError) {
        throw this.errorHandler.createBinaryError(
          ErrorCodes.BINARY_COMPILATION_FAILED,
          `Go build failed: ${buildError.message}`,
          buildError,
          { command: buildCommand }
        );
      }
      
      // Verify the binary was created
      if (!fs.existsSync(this.binaryPath)) {
        throw this.errorHandler.createBinaryError(
          ErrorCodes.BINARY_COMPILATION_FAILED,
          'Binary was not created after compilation',
          null,
          { expectedPath: this.binaryPath }
        );
      }
      
      console.log('Successfully compiled binary from source');
      return true;
    } catch (error) {
      if (error.code) {
        console.error(`Compilation failed: ${error.getUserMessage()}`);
        if (process.env.DEBUG) {
          console.error('Troubleshooting steps:');
          error.getTroubleshootingSteps().forEach((step, index) => {
            console.error(`  ${index + 1}. ${step}`);
          });
        }
        return false;
      }
      
      const wrappedError = this.errorHandler.createBinaryError(
        ErrorCodes.BINARY_COMPILATION_FAILED,
        `Compilation failed: ${error.message}`,
        error
      );
      
      console.error(`Compilation failed: ${wrappedError.getUserMessage()}`);
      return false;
    }
  }

  binaryExists() {
    return fs.existsSync(this.binaryPath);
  }

  getBinaryVersion() {
    if (!this.binaryExists()) {
      return null;
    }
    
    try {
      const output = execSync(`"${this.binaryPath}" --version`, { 
        encoding: 'utf8',
        timeout: 5000 // 5 second timeout
      });
      const match = output.match(/version\s+(\S+)/i);
      return match ? match[1] : null;
    } catch (error) {
      console.warn(`Warning: Could not get binary version: ${error.message}`);
      return null;
    }
  }

  needsUpdate() {
    const currentVersion = this.getBinaryVersion();
    if (!currentVersion) {
      return true;
    }
    
    // Simple version comparison (assumes semantic versioning)
    return currentVersion !== this.version;
  }

  async ensureBinary() {
    try {
      if (this.binaryExists() && !this.needsUpdate()) {
        const currentVersion = this.getBinaryVersion();
        console.log(`Binary ${this.binaryName} is up to date (v${currentVersion || 'unknown'})`);
        return true;
      }
      
      if (this.needsUpdate()) {
        const currentVersion = this.getBinaryVersion();
        console.log(`Updating binary from v${currentVersion || 'unknown'} to v${this.version}`);
      } else {
        console.log(`Installing binary ${this.binaryName} v${this.version}`);
      }
      
      const success = await this.downloadBinary();
      
      if (success) {
        // Final verification
        if (!this.binaryExists()) {
          throw this.errorHandler.createBinaryError(
            ErrorCodes.BINARY_NOT_FOUND,
            'Binary installation appeared to succeed but binary is not found',
            null,
            { expectedPath: this.binaryPath }
          );
        }
        
        console.log('Binary installation completed successfully');
      }
      
      return success;
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      
      throw this.errorHandler.createBinaryError(
        ErrorCodes.BINARY_NOT_FOUND,
        `Failed to ensure binary availability: ${error.message}`,
        error
      );
    }
  }

  getBinaryPath() {
    return this.binaryPath;
  }

  /**
   * Get error statistics from the error handler
   */
  getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Clear error history
   */
  clearErrors() {
    this.errorHandler.clearHistory();
  }

  /**
   * Check if binary is healthy (exists and executable)
   */
  isBinaryHealthy() {
    if (!this.binaryExists()) {
      return { healthy: false, reason: 'Binary does not exist' };
    }

    try {
      // Try to run the binary with --help to check if it's executable
      execSync(`"${this.binaryPath}" --help`, { 
        stdio: 'ignore',
        timeout: 5000 
      });
      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        reason: `Binary is not executable: ${error.message}` 
      };
    }
  }
}

// Export for use in other modules
module.exports = BinaryManager;

// Run installation if called directly
if (require.main === module) {
  const manager = new BinaryManager();
  manager.ensureBinary()
    .then((success) => {
      if (!success) {
        console.error('Failed to install binary');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Installation failed:', error.message);
      process.exit(1);
    });
}