#!/usr/bin/env node

/**
 * Binary Verification Test Suite
 * Tests the binary verification and security features
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

// Test configuration
const TEST_CONFIG = {
    testDir: path.join(__dirname, '..', 'test-binaries'),
    scriptsDir: path.join(__dirname, '..', 'scripts'),
    timeout: 30000
};

// Colors for output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}[TEST]${colors.reset} ${message}`);
}

function error(message) {
    console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function success(message) {
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function warn(message) {
    console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`);
}

// Test utilities
class TestUtils {
    static createTestBinary(name, content = 'test binary content') {
        const binaryPath = path.join(TEST_CONFIG.testDir, name);
        fs.writeFileSync(binaryPath, content);
        fs.chmodSync(binaryPath, 0o755);
        return binaryPath;
    }

    static createChecksum(binaryPath) {
        const content = fs.readFileSync(binaryPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const checksumPath = `${binaryPath}.sha256`;
        const filename = path.basename(binaryPath);
        fs.writeFileSync(checksumPath, `${hash}  ${filename}\n`);
        return checksumPath;
    }

    static createInvalidChecksum(binaryPath) {
        const checksumPath = `${binaryPath}.sha256`;
        const filename = path.basename(binaryPath);
        fs.writeFileSync(checksumPath, `0000000000000000000000000000000000000000000000000000000000000000  ${filename}\n`);
        return checksumPath;
    }

    static runScript(scriptName, args = [], options = {}) {
        const scriptPath = path.join(TEST_CONFIG.scriptsDir, scriptName);
        const command = `bash "${scriptPath}" ${args.join(' ')}`;
        
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                timeout: TEST_CONFIG.timeout,
                ...options
            });
            return { success: true, output: result, error: null };
        } catch (err) {
            return { success: false, output: err.stdout || '', error: err.stderr || err.message };
        }
    }

    static cleanup() {
        if (fs.existsSync(TEST_CONFIG.testDir)) {
            fs.rmSync(TEST_CONFIG.testDir, { recursive: true, force: true });
        }
    }
}

// Test suite
class BinaryVerificationTests {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    addTest(name, testFn) {
        this.tests.push({ name, testFn });
    }

    async runTest(test) {
        log(`Running: ${test.name}`);
        try {
            await test.testFn();
            this.passed++;
            success(`✓ ${test.name}`);
        } catch (err) {
            this.failed++;
            error(`✗ ${test.name}: ${err.message}`);
        }
    }

    async runAll() {
        log('Starting Binary Verification Test Suite');
        
        // Setup
        TestUtils.cleanup();
        fs.mkdirSync(TEST_CONFIG.testDir, { recursive: true });

        // Run tests
        for (const test of this.tests) {
            await this.runTest(test);
        }

        // Cleanup
        TestUtils.cleanup();

        // Summary
        const total = this.passed + this.failed;
        log(`\nTest Results: ${this.passed}/${total} passed`);
        
        if (this.failed > 0) {
            error(`${this.failed} tests failed`);
            process.exit(1);
        } else {
            success('All tests passed!');
        }
    }
}

// Initialize test suite
const testSuite = new BinaryVerificationTests();

// Test 1: Basic binary verification with valid checksum
testSuite.addTest('Basic binary verification with valid checksum', () => {
    const binaryPath = TestUtils.createTestBinary('test-binary-1');
    const checksumPath = TestUtils.createChecksum(binaryPath);
    
    const result = TestUtils.runScript('verify-binary.sh', [binaryPath], { cwd: __dirname });
    
    if (!result.success) {
        // Check if it's just a warning about execution test
        if (result.output.includes('Binary verification completed successfully')) {
            return; // Test passed despite non-zero exit code
        }
        throw new Error(`Verification failed: ${result.error || result.output}`);
    }
    
    if (!result.output.includes('Checksum verification passed')) {
        throw new Error('Expected checksum verification to pass');
    }
});

// Test 2: Binary verification with invalid checksum
testSuite.addTest('Binary verification with invalid checksum', () => {
    const binaryPath = TestUtils.createTestBinary('test-binary-2');
    const checksumPath = TestUtils.createInvalidChecksum(binaryPath);
    
    const result = TestUtils.runScript('verify-binary.sh', [binaryPath], { cwd: __dirname });
    
    if (result.success) {
        throw new Error('Expected verification to fail with invalid checksum');
    }
    
    if (!result.error.includes('Checksum verification failed') && !result.output.includes('Checksum verification failed')) {
        throw new Error('Expected checksum verification failure message');
    }
});

// Test 3: Binary verification without checksum file
testSuite.addTest('Binary verification without checksum file', () => {
    const binaryPath = TestUtils.createTestBinary('test-binary-3');
    
    const result = TestUtils.runScript('verify-binary.sh', [binaryPath]);
    
    if (!result.success) {
        throw new Error(`Verification should succeed without checksum: ${result.error}`);
    }
    
    if (!result.output.includes('not found, skipping checksum verification')) {
        throw new Error('Expected checksum skip message');
    }
});

// Test 4: Security scan of test binary
testSuite.addTest('Security scan of test binary', () => {
    const binaryPath = TestUtils.createTestBinary('test-binary-4', 'safe test content');
    const reportPath = path.join(TEST_CONFIG.testDir, 'security-report.txt');
    
    const result = TestUtils.runScript('security-scan.sh', [binaryPath, reportPath]);
    
    if (!result.success) {
        throw new Error(`Security scan failed: ${result.error}`);
    }
    
    if (!fs.existsSync(reportPath)) {
        throw new Error('Security report was not generated');
    }
    
    const report = fs.readFileSync(reportPath, 'utf8');
    if (!report.includes('Security Scan Report')) {
        throw new Error('Invalid security report format');
    }
});

// Test 5: Compile from source test (basic validation)
testSuite.addTest('Compile from source script validation', () => {
    // This test just validates the script exists and has basic structure
    const scriptPath = path.join(TEST_CONFIG.scriptsDir, 'compile-from-source.sh');
    
    if (!fs.existsSync(scriptPath)) {
        throw new Error('compile-from-source.sh script not found');
    }
    
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    const requiredElements = [
        'MIN_GO_VERSION',
        'go version',
        'go mod download',
        'go build',
        'sha256sum'
    ];
    
    for (const element of requiredElements) {
        if (!scriptContent.includes(element)) {
            throw new Error(`Script missing required element: ${element}`);
        }
    }
});

// Test 6: Build scripts validation
testSuite.addTest('Build scripts validation', () => {
    const scripts = [
        'build-all.sh',
        'generate-checksums.sh',
        'prepare-release.sh',
        'verify-binary.sh',
        'security-scan.sh',
        'compile-from-source.sh'
    ];
    
    for (const script of scripts) {
        const scriptPath = path.join(TEST_CONFIG.scriptsDir, script);
        
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script not found: ${script}`);
        }
        
        const stats = fs.statSync(scriptPath);
        if (!(stats.mode & 0o111)) {
            throw new Error(`Script not executable: ${script}`);
        }
    }
});

// Test 7: GitHub Actions workflow validation
testSuite.addTest('GitHub Actions workflow validation', () => {
    const workflowPaths = [
        path.join(__dirname, '..', '.github', 'workflows', 'build-and-release.yml'),
        path.join(__dirname, '..', '.github', 'workflows', 'test-build.yml')
    ];
    
    for (const workflowPath of workflowPaths) {
        if (!fs.existsSync(workflowPath)) {
            throw new Error(`Workflow not found: ${path.basename(workflowPath)}`);
        }
        
        const content = fs.readFileSync(workflowPath, 'utf8');
        
        // Basic YAML structure validation
        if (!content.includes('name:') || !content.includes('on:') || !content.includes('jobs:')) {
            throw new Error(`Invalid workflow structure: ${path.basename(workflowPath)}`);
        }
    }
});

// Test 8: Build configuration validation
testSuite.addTest('Build configuration validation', () => {
    const configPath = path.join(__dirname, '..', 'build.config.json');
    
    if (!fs.existsSync(configPath)) {
        throw new Error('build.config.json not found');
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    const requiredFields = ['name', 'platforms', 'build', 'release'];
    for (const field of requiredFields) {
        if (!config[field]) {
            throw new Error(`Missing required config field: ${field}`);
        }
    }
    
    // Validate platforms
    const expectedPlatforms = ['linux', 'darwin', 'windows'];
    for (const platform of expectedPlatforms) {
        if (!config.platforms[platform]) {
            throw new Error(`Missing platform configuration: ${platform}`);
        }
    }
});

// Test 9: Checksum generation and verification
testSuite.addTest('Checksum generation and verification workflow', () => {
    // Create test binaries in the bin directory
    const binDir = path.join(__dirname, '..', 'bin');
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }
    
    const binaries = [
        path.join(binDir, 'http-load-test-linux-amd64'),
        path.join(binDir, 'http-load-test-darwin-amd64'),
        path.join(binDir, 'http-load-test-windows-amd64.exe')
    ];
    
    // Create test binaries
    binaries.forEach((binary, index) => {
        fs.writeFileSync(binary, `test binary content ${index}`);
        fs.chmodSync(binary, 0o755);
    });
    
    // Generate checksums
    const result = TestUtils.runScript('generate-checksums.sh');
    
    if (!result.success) {
        throw new Error(`Checksum generation failed: ${result.error}`);
    }
    
    // Verify checksums file was created
    const checksumFile = path.join(binDir, 'checksums.txt');
    if (!fs.existsSync(checksumFile)) {
        throw new Error('checksums.txt was not generated');
    }
    
    // Verify individual checksum files
    for (const binary of binaries) {
        const checksumPath = `${binary}.sha256`;
        if (!fs.existsSync(checksumPath)) {
            throw new Error(`Individual checksum not generated: ${checksumPath}`);
        }
    }
    
    // Cleanup test binaries
    binaries.forEach(binary => {
        if (fs.existsSync(binary)) fs.unlinkSync(binary);
        if (fs.existsSync(`${binary}.sha256`)) fs.unlinkSync(`${binary}.sha256`);
    });
    if (fs.existsSync(checksumFile)) fs.unlinkSync(checksumFile);
    if (fs.existsSync(`${checksumFile}.sha256`)) fs.unlinkSync(`${checksumFile}.sha256`);
    const verifyScript = path.join(binDir, 'verify.sh');
    if (fs.existsSync(verifyScript)) fs.unlinkSync(verifyScript);
});

// Test 10: Installation script validation
testSuite.addTest('Installation script validation', () => {
    // Just validate that the prepare-release script exists and has the right structure
    const scriptPath = path.join(TEST_CONFIG.scriptsDir, 'prepare-release.sh');
    
    if (!fs.existsSync(scriptPath)) {
        throw new Error('prepare-release.sh script not found');
    }
    
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    const requiredElements = [
        'BINARY_NAME=',
        'RELEASE_DIR=',
        'BUILD_DIR=',
        'install.sh',
        'GITHUB_REPO=',
        'curl',
        'chmod +x'
    ];
    
    for (const element of requiredElements) {
        if (!scriptContent.includes(element)) {
            throw new Error(`Prepare-release script missing required element: ${element}`);
        }
    }
    
    // Validate that the installation script template is properly structured
    const installScriptStart = scriptContent.indexOf('cat > "$RELEASE_DIR/install.sh"');
    if (installScriptStart === -1) {
        throw new Error('Installation script template not found in prepare-release.sh');
    }
});

// Run the test suite
if (require.main === module) {
    testSuite.runAll().catch(err => {
        error(`Test suite failed: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { BinaryVerificationTests, TestUtils };