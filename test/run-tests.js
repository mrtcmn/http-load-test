#!/usr/bin/env node

const BinaryManager = require('../scripts/install-binary');
const os = require('os');
const fs = require('fs');
const path = require('path');

console.log('Running Binary Manager Tests...\n');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
  }
}

function expect(actual) {
  return {
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
  };
}

// Test BinaryManager
const manager = new BinaryManager();

console.log('--- BinaryManager Tests ---');

test('should create BinaryManager instance', () => {
  expect(manager).toBeTruthy();
  expect(manager.version).toBeTruthy();
});

test('should return correct binary name for current platform', () => {
  const binaryName = manager.getBinaryName();
  
  expect(binaryName).toMatch(/^http-load-test-/);
  
  if (os.platform() === 'win32') {
    expect(binaryName).toMatch(/windows.*\.exe$/);
  } else if (os.platform() === 'darwin') {
    expect(binaryName).toMatch(/darwin/);
  } else if (os.platform() === 'linux') {
    expect(binaryName).toMatch(/linux/);
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

test('should return correct GitHub release URL', () => {
  const url = manager.getDownloadUrl();
  
  expect(url).toMatch(/^https:\/\/github\.com\/mrtcmn\/http-load-test\/releases\/download\//);
  expect(url).toContain(manager.version);
  expect(url).toContain(manager.binaryName);
});

test('should calculate SHA256 checksum for file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  const testFile = path.join(tempDir, 'test.txt');
  
  try {
    fs.writeFileSync(testFile, 'test content');
    
    const checksum = manager.calculateChecksum(testFile);
    
    expect(checksum).toBeTruthy();
    expect(checksum).toHaveLength(64); // SHA256 hex length
    expect(checksum).toMatch(/^[a-f0-9]+$/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('should return null for non-existent file checksum', () => {
  const checksum = manager.calculateChecksum('/non/existent/file');
  expect(checksum).toBeNull();
});

test('should verify matching checksums', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  const testFile = path.join(tempDir, 'test.txt');
  
  try {
    fs.writeFileSync(testFile, 'test content');
    
    const actualChecksum = manager.calculateChecksum(testFile);
    const result = manager.verifyChecksum(testFile, actualChecksum);
    
    expect(result).toBe(true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('should extract correct checksum for binary', () => {
  const checksumContent = `
abc123def456  http-load-test-linux-amd64
def456ghi789  http-load-test-darwin-amd64
ghi789jkl012  http-load-test-windows-amd64.exe
  `.trim();
  
  // Create a temporary manager with known binary name
  const testManager = new BinaryManager();
  testManager.binaryName = 'http-load-test-linux-amd64';
  
  const checksum = testManager.extractChecksumForBinary(checksumContent);
  
  expect(checksum).toBe('abc123def456');
});

test('should return true when binary does not exist (needs update)', () => {
  expect(manager.needsUpdate()).toBe(true);
});

console.log('\n--- Tests completed ---');
console.log(`Platform: ${os.platform()}-${os.arch()}`);
console.log(`Binary name: ${manager.getBinaryName()}`);
console.log(`Download URL: ${manager.getDownloadUrl()}`);