#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

class BinaryManager {
  constructor() {
    this.packageJson = require('../package.json');
    this.version = this.packageJson.version;
    this.binDir = path.join(__dirname, '..', 'bin');
    this.binaryName = this.getBinaryName();
    this.binaryPath = path.join(this.binDir, this.binaryName);
    this.githubRepo = 'mrtcmn/http-load-test';
  }

  getBinaryName() {
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
        throw new Error(`Unsupported platform: ${platform}`);
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
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    const extension = platform === 'win32' ? '.exe' : '';
    return `http-load-test-${platformName}-${archName}${extension}`;
  }

  getDownloadUrl() {
    return `https://github.com/${this.githubRepo}/releases/download/v${this.version}/${this.binaryName}`;
  }

  getChecksumUrl() {
    return `https://github.com/${this.githubRepo}/releases/download/v${this.version}/checksums.txt`;
  }

  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destination);
      
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          return this.downloadFile(response.headers.location, destination)
            .then(resolve)
            .catch(reject);
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (err) => {
          fs.unlink(destination, () => {}); // Delete partial file
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  async downloadChecksums() {
    const checksumPath = path.join(this.binDir, 'checksums.txt');
    try {
      await this.downloadFile(this.getChecksumUrl(), checksumPath);
      return fs.readFileSync(checksumPath, 'utf8');
    } catch (error) {
      console.warn('Warning: Could not download checksums for verification');
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
      return true; // Skip verification if no checksum available
    }
    
    const actualChecksum = this.calculateChecksum(filePath);
    return actualChecksum === expectedChecksum;
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
    
    // Ensure bin directory exists
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }

    try {
      // Download checksums first
      const checksumContent = await this.downloadChecksums();
      const expectedChecksum = this.extractChecksumForBinary(checksumContent);
      
      // Download binary
      await this.downloadFile(this.getDownloadUrl(), this.binaryPath);
      
      // Verify checksum
      if (!this.verifyChecksum(this.binaryPath, expectedChecksum)) {
        throw new Error('Binary checksum verification failed');
      }
      
      // Make binary executable on Unix systems
      if (os.platform() !== 'win32') {
        fs.chmodSync(this.binaryPath, '755');
      }
      
      console.log(`Successfully downloaded and installed ${this.binaryName}`);
      return true;
    } catch (error) {
      console.error(`Failed to download binary: ${error.message}`);
      
      // Try to compile from source as fallback
      return this.compileFromSource();
    }
  }

  compileFromSource() {
    console.log('Attempting to compile from source...');
    
    try {
      // Check if Go is installed
      execSync('go version', { stdio: 'ignore' });
      
      // Compile the binary
      const buildCommand = `go build -o "${this.binaryPath}" ./cmd/http-load-test`;
      execSync(buildCommand, { stdio: 'inherit' });
      
      console.log('Successfully compiled binary from source');
      return true;
    } catch (error) {
      console.error('Failed to compile from source. Please ensure Go is installed.');
      console.error('You can install Go from: https://golang.org/dl/');
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
      const output = execSync(`"${this.binaryPath}" --version`, { encoding: 'utf8' });
      const match = output.match(/version\s+(\S+)/i);
      return match ? match[1] : null;
    } catch (error) {
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
    if (this.binaryExists() && !this.needsUpdate()) {
      console.log(`Binary ${this.binaryName} is up to date (v${this.getBinaryVersion()})`);
      return true;
    }
    
    if (this.needsUpdate()) {
      console.log(`Updating binary from v${this.getBinaryVersion()} to v${this.version}`);
    }
    
    return await this.downloadBinary();
  }

  getBinaryPath() {
    return this.binaryPath;
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