const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const BinaryManager = require('../scripts/install-binary');

describe('BinaryManager', () => {
  let manager;
  let tempDir;
  
  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'binary-manager-test-'));
    
    // Mock the bin directory to use temp directory
    manager = new BinaryManager();
    manager.binDir = tempDir;
    manager.binaryPath = path.join(tempDir, manager.binaryName);
  });
  
  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getBinaryName', () => {
    test('should return correct binary name for current platform', () => {
      const binaryName = manager.getBinaryName();
      
      expect(binaryName).toMatch(/^http-load-test-/);
      
      if (os.platform() === 'win32') {
        expect(binaryName).toMatch(/windows.*\.exe$/);
      } else if (os.platform() === 'darwin') {
        expect(binaryName).toMatch(/darwin/);
        expect(binaryName).not.toMatch(/\.exe$/);
      } else if (os.platform() === 'linux') {
        expect(binaryName).toMatch(/linux/);
        expect(binaryName).not.toMatch(/\.exe$/);
      }
    });
    
    test('should include architecture in binary name', () => {
      const binaryName = manager.getBinaryName();
      
      if (os.arch() === 'x64') {
        expect(binaryName).toMatch(/amd64/);
      } else if (os.arch() === 'arm64') {
        expect(binaryName).toMatch(/arm64/);
      }
    });
  });

  describe('getDownloadUrl', () => {
    test('should return correct GitHub release URL', () => {
      const url = manager.getDownloadUrl();
      
      expect(url).toMatch(/^https:\/\/github\.com\/mrtcmn\/http-load-test\/releases\/download\//);
      expect(url).toContain(manager.version);
      expect(url).toContain(manager.binaryName);
    });
  });

  describe('calculateChecksum', () => {
    test('should calculate SHA256 checksum for file', () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');
      
      const checksum = manager.calculateChecksum(testFile);
      
      expect(checksum).toBeTruthy();
      expect(checksum).toHaveLength(64); // SHA256 hex length
      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });
    
    test('should return null for non-existent file', () => {
      const checksum = manager.calculateChecksum('/non/existent/file');
      expect(checksum).toBeNull();
    });
  });

  describe('verifyChecksum', () => {
    test('should return true for matching checksums', () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');
      
      const actualChecksum = manager.calculateChecksum(testFile);
      const result = manager.verifyChecksum(testFile, actualChecksum);
      
      expect(result).toBe(true);
    });
    
    test('should return false for non-matching checksums', () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');
      
      const result = manager.verifyChecksum(testFile, 'invalid-checksum');
      
      expect(result).toBe(false);
    });
    
    test('should return true when no expected checksum provided', () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');
      
      const result = manager.verifyChecksum(testFile, null);
      
      expect(result).toBe(true);
    });
  });

  describe('extractChecksumForBinary', () => {
    test('should extract correct checksum for binary', () => {
      const checksumContent = `
abc123def456  http-load-test-linux-amd64
def456ghi789  http-load-test-darwin-amd64
ghi789jkl012  http-load-test-windows-amd64.exe
      `.trim();
      
      // Mock the binary name to match one in the checksum content
      manager.binaryName = 'http-load-test-linux-amd64';
      
      const checksum = manager.extractChecksumForBinary(checksumContent);
      
      expect(checksum).toBe('abc123def456');
    });
    
    test('should return null for binary not in checksums', () => {
      const checksumContent = `
abc123def456  other-binary-linux-amd64
def456ghi789  another-binary-darwin-amd64
      `.trim();
      
      const checksum = manager.extractChecksumForBinary(checksumContent);
      
      expect(checksum).toBeNull();
    });
    
    test('should return null for empty checksum content', () => {
      const checksum = manager.extractChecksumForBinary(null);
      expect(checksum).toBeNull();
    });
  });

  describe('binaryExists', () => {
    test('should return false when binary does not exist', () => {
      expect(manager.binaryExists()).toBe(false);
    });
    
    test('should return true when binary exists', () => {
      fs.writeFileSync(manager.binaryPath, 'fake binary');
      expect(manager.binaryExists()).toBe(true);
    });
  });

  describe('getBinaryVersion', () => {
    test('should return null when binary does not exist', () => {
      expect(manager.getBinaryVersion()).toBeNull();
    });
    
    test('should return null when binary exists but version command fails', () => {
      // Create a fake binary that will fail when executed
      fs.writeFileSync(manager.binaryPath, 'fake binary');
      fs.chmodSync(manager.binaryPath, '755');
      
      expect(manager.getBinaryVersion()).toBeNull();
    });
  });

  describe('needsUpdate', () => {
    test('should return true when binary does not exist', () => {
      expect(manager.needsUpdate()).toBe(true);
    });
    
    test('should return true when binary version differs from package version', () => {
      // Mock getBinaryVersion to return different version
      manager.getBinaryVersion = jest.fn().mockReturnValue('0.1.0');
      
      expect(manager.needsUpdate()).toBe(true);
    });
    
    test('should return false when binary version matches package version', () => {
      // Mock getBinaryVersion to return same version
      manager.getBinaryVersion = jest.fn().mockReturnValue(manager.version);
      
      expect(manager.needsUpdate()).toBe(false);
    });
  });

  describe('compileFromSource', () => {
    test('should return false when Go is not installed', () => {
      // Mock execSync to throw error for go version check
      const originalExecSync = execSync;
      execSync = jest.fn().mockImplementation((cmd) => {
        if (cmd === 'go version') {
          throw new Error('go not found');
        }
        return originalExecSync(cmd);
      });
      
      const result = manager.compileFromSource();
      
      expect(result).toBe(false);
      
      // Restore original execSync
      execSync = originalExecSync;
    });
  });
});

// Mock Jest functions if not in Jest environment
if (typeof describe === 'undefined') {
  global.describe = (name, fn) => {
    console.log(`\n--- ${name} ---`);
    fn();
  };
  
  global.test = (name, fn) => {
    try {
      fn();
      console.log(`✓ ${name}`);
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`);
    }
  };
  
  global.expect = (actual) => ({
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toMatch: (pattern) => {
      if (!pattern.test(actual)) {
        throw new Error(`Expected ${actual} to match ${pattern}`);
      }
    },
    toContain: (expected) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${actual} to contain ${expected}`);
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`);
      }
    },
    toBeNull: () => {
      if (actual !== null) {
        throw new Error(`Expected ${actual} to be null`);
      }
    },
    toHaveLength: (expected) => {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    }
  });
  
  global.beforeEach = (fn) => fn();
  global.afterEach = (fn) => fn();
  global.jest = {
    fn: () => ({
      mockReturnValue: (value) => () => value,
      mockImplementation: (impl) => impl
    })
  };
}