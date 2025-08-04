# Binary Distribution System

This document describes the cross-platform binary distribution system for http-load-test, including build automation, security verification, and release management.

## Overview

The binary distribution system provides:
- Automated cross-platform compilation for Linux, macOS, and Windows
- Comprehensive security verification and checksum validation
- Automated GitHub releases with binary assets
- Fallback compilation from source
- NPM package integration with binary management

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Source Code   │───▶│  Build Pipeline  │───▶│   Binaries      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   GitHub Actions │    │   Verification  │
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  GitHub Release  │    │  NPM Package    │
                       └──────────────────┘    └─────────────────┘
```

## Build Pipeline

### Supported Platforms

| Platform | Architecture | Binary Name | Notes |
|----------|--------------|-------------|-------|
| Linux | x64 | `http-load-test-linux-amd64` | Statically linked |
| Linux | ARM64 | `http-load-test-linux-arm64` | Statically linked |
| macOS | x64 | `http-load-test-darwin-amd64` | Intel Macs |
| macOS | ARM64 | `http-load-test-darwin-arm64` | Apple Silicon |
| Windows | x64 | `http-load-test-windows-amd64.exe` | Statically linked |

### Build Scripts

#### `scripts/build-all.sh`
Builds binaries for all supported platforms with checksums.

```bash
# Build all platforms
./scripts/build-all.sh

# Build with specific version
./scripts/build-all.sh v1.0.0
```

#### `scripts/generate-checksums.sh`
Generates comprehensive checksums and verification files.

```bash
# Generate checksums for all binaries in bin/
./scripts/generate-checksums.sh
```

#### `scripts/prepare-release.sh`
Prepares a complete release package with binaries, web assets, and documentation.

```bash
# Prepare release
./scripts/prepare-release.sh v1.0.0
```

### GitHub Actions Workflows

#### Build and Release (`build-and-release.yml`)
- Triggered on version tags (`v*`)
- Builds all platform binaries
- Generates checksums and verification files
- Creates GitHub release with assets
- Publishes to NPM

#### Test Build (`test-build.yml`)
- Triggered on pushes and PRs
- Tests build scripts and cross-platform compilation
- Validates binary integrity
- Runs verification tests

## Security and Verification

### Checksum Verification

Every binary includes a SHA256 checksum file:

```bash
# Verify binary integrity
sha256sum -c http-load-test-linux-amd64.sha256

# Or use the verification script
./verify.sh http-load-test-linux-amd64
```

### Security Scanning

The `scripts/security-scan.sh` script performs comprehensive security analysis:

```bash
# Scan binary for security issues
./scripts/security-scan.sh bin/http-load-test security-report.txt
```

Security checks include:
- File integrity verification
- Debug symbol detection
- Static/dynamic linking analysis
- Security feature detection (PIE/ASLR, stack canaries)
- String analysis for suspicious content
- Entropy analysis
- Basic execution testing

### Binary Verification Script

The `scripts/verify-binary.sh` script provides comprehensive verification:

```bash
# Full verification
./scripts/verify-binary.sh http-load-test-linux-amd64

# With custom checksum file
./scripts/verify-binary.sh binary.exe custom.sha256
```

Verification includes:
- File integrity checks
- Checksum validation
- Signature verification (if available)
- Basic binary analysis
- Security scanning
- Execution testing

## Fallback Compilation

When pre-built binaries are unavailable, the system can compile from source:

```bash
# Compile from source
./scripts/compile-from-source.sh

# Skip tests during compilation
SKIP_TESTS=true ./scripts/compile-from-source.sh
```

Requirements:
- Go 1.19 or later
- Internet connection for dependency download
- Platform-specific build tools (if needed)

## Installation Methods

### NPM Package (Recommended)

```bash
# Global installation
npm install -g http-load-test

# Project installation
npm install http-load-test
```

The NPM package automatically:
- Downloads the appropriate binary for your platform
- Verifies binary integrity
- Handles updates
- Provides fallback compilation if needed

### Direct Binary Download

```bash
# Download and install script
curl -sSL https://github.com/mrtcmn/http-load-test/releases/latest/download/install.sh | bash

# Manual download
wget https://github.com/mrtcmn/http-load-test/releases/latest/download/http-load-test-linux-amd64
chmod +x http-load-test-linux-amd64
sudo mv http-load-test-linux-amd64 /usr/local/bin/http-load-test
```

### Verification After Installation

```bash
# Verify installation
http-load-test --version

# Run help
http-load-test --help

# Test basic functionality
http-load-test run --url https://httpbin.org/get --requests 10
```

## Release Process

### Automated Release (Recommended)

1. Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. GitHub Actions automatically:
   - Builds all platform binaries
   - Runs tests and security scans
   - Generates checksums and verification files
   - Creates GitHub release
   - Publishes to NPM

### Manual Release

1. Prepare the release:
   ```bash
   ./scripts/prepare-release.sh v1.0.0
   ```

2. Upload assets to GitHub release manually

3. Publish to NPM:
   ```bash
   npm publish
   ```

## Configuration

### Build Configuration (`build.config.json`)

```json
{
  "name": "http-load-test",
  "platforms": {
    "linux": {
      "amd64": { "enabled": true, "cgo": false },
      "arm64": { "enabled": true, "cgo": false }
    },
    "darwin": {
      "amd64": { "enabled": true, "cgo": false },
      "arm64": { "enabled": true, "cgo": false }
    },
    "windows": {
      "amd64": { "enabled": true, "cgo": false, "extension": ".exe" }
    }
  }
}
```

### GitHub Actions Secrets

Required secrets for automated releases:
- `GITHUB_TOKEN`: Automatically provided
- `NPM_TOKEN`: NPM authentication token

## Troubleshooting

### Build Issues

```bash
# Clean build environment
make clean

# Rebuild dependencies
make deps

# Test build locally
make build
```

### Verification Failures

```bash
# Re-download binary
rm http-load-test-*
# Download again from GitHub releases

# Verify checksums manually
sha256sum http-load-test-linux-amd64
cat http-load-test-linux-amd64.sha256
```

### Compilation Issues

```bash
# Check Go version
go version

# Update dependencies
go mod tidy
go mod download

# Compile with verbose output
go build -v ./cmd/http-load-test
```

## Security Considerations

### Binary Integrity
- All binaries include SHA256 checksums
- Verification scripts validate integrity before execution
- GitHub releases provide tamper-evident distribution

### Supply Chain Security
- Automated builds from source code
- Reproducible build process
- Dependency verification with `go mod verify`
- Security scanning of compiled binaries

### Distribution Security
- HTTPS-only downloads
- Checksum verification before installation
- Optional signature verification (future enhancement)
- Fallback to source compilation

## Monitoring and Maintenance

### Build Health
- GitHub Actions provide build status
- Test suite validates binary functionality
- Cross-platform compatibility testing

### Security Updates
- Regular dependency updates
- Security scanning in CI/CD
- Automated vulnerability detection
- Quick patch release process

### Performance Monitoring
- Binary size tracking
- Build time optimization
- Download speed monitoring
- Installation success rates

## Future Enhancements

### Planned Features
- GPG signature verification
- Binary signing for Windows/macOS
- Container image distribution
- Package manager integration (Homebrew, Chocolatey)
- Reproducible builds
- SLSA compliance

### Metrics and Analytics
- Download statistics
- Platform usage analytics
- Installation success rates
- Performance benchmarks

## Contributing

### Adding New Platforms

1. Update `build.config.json`
2. Add platform to `scripts/build-all.sh`
3. Update GitHub Actions matrix
4. Test cross-compilation
5. Update documentation

### Improving Security

1. Add new security checks to `scripts/security-scan.sh`
2. Enhance verification in `scripts/verify-binary.sh`
3. Update test suite
4. Document new security features

For more information, see [CONTRIBUTING.md](../CONTRIBUTING.md).