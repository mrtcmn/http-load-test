#!/bin/bash

# Release preparation script
# This script prepares a complete release package with binaries, web assets, and documentation

set -e

VERSION=${1:-"dev"}
RELEASE_DIR="release"
BUILD_DIR="bin"
WEB_DIR="web"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[RELEASE]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Validate version format
if [[ ! "$VERSION" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-.*)?$ ]] && [ "$VERSION" != "dev" ]; then
    warn "Version format should be like v1.0.0 or 1.0.0"
fi

log "Preparing release $VERSION..."

# Clean and create release directory
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Build all binaries
log "Building binaries..."
./scripts/build-all.sh "$VERSION"

# Generate checksums
log "Generating checksums..."
./scripts/generate-checksums.sh

# Build web assets
log "Building web frontend..."
if [ -d "$WEB_DIR" ]; then
    cd "$WEB_DIR"
    if [ -f "package.json" ]; then
        npm ci
        npm run build
        cd ..
        
        # Create web assets archive
        tar -czf "$RELEASE_DIR/web-assets.tar.gz" -C "$WEB_DIR" dist/
        
        # Generate web assets checksum
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$RELEASE_DIR/web-assets.tar.gz" > "$RELEASE_DIR/web-assets.tar.gz.sha256"
        elif command -v shasum >/dev/null 2>&1; then
            shasum -a 256 "$RELEASE_DIR/web-assets.tar.gz" > "$RELEASE_DIR/web-assets.tar.gz.sha256"
        fi
        
        log "✓ Web assets packaged"
    else
        warn "No package.json found in $WEB_DIR, skipping web build"
    fi
else
    warn "Web directory $WEB_DIR not found, skipping web build"
fi

# Copy binaries to release directory
log "Copying binaries..."
cp "$BUILD_DIR"/http-load-test-* "$RELEASE_DIR/"
cp "$BUILD_DIR"/checksums.* "$RELEASE_DIR/"
cp "$BUILD_DIR"/verify.sh "$RELEASE_DIR/"

# Create release notes
log "Generating release notes..."
cat > "$RELEASE_DIR/RELEASE_NOTES.md" << EOF
# Release $VERSION

## Binary Downloads

| Platform | Architecture | Download | Checksum |
|----------|--------------|----------|----------|
| Linux | x64 | [http-load-test-linux-amd64](./http-load-test-linux-amd64) | [SHA256](./http-load-test-linux-amd64.sha256) |
| Linux | ARM64 | [http-load-test-linux-arm64](./http-load-test-linux-arm64) | [SHA256](./http-load-test-linux-arm64.sha256) |
| macOS | x64 | [http-load-test-darwin-amd64](./http-load-test-darwin-amd64) | [SHA256](./http-load-test-darwin-amd64.sha256) |
| macOS | ARM64 | [http-load-test-darwin-arm64](./http-load-test-darwin-arm64) | [SHA256](./http-load-test-darwin-arm64.sha256) |
| Windows | x64 | [http-load-test-windows-amd64.exe](./http-load-test-windows-amd64.exe) | [SHA256](./http-load-test-windows-amd64.exe.sha256) |

## Verification

All binaries include SHA256 checksums for verification. Use the provided verification script:

\`\`\`bash
# Verify a specific binary
./verify.sh http-load-test-linux-amd64

# Or manually verify using sha256sum/shasum
sha256sum -c http-load-test-linux-amd64.sha256
\`\`\`

## Installation

### NPM Package
\`\`\`bash
npm install -g http-load-test@$VERSION
\`\`\`

### Direct Binary Download
1. Download the appropriate binary for your platform
2. Verify the checksum
3. Make executable: \`chmod +x http-load-test-*\`
4. Move to PATH: \`mv http-load-test-* /usr/local/bin/http-load-test\`

## Web Assets

The web frontend is included in the NPM package and also available as a separate archive:
- [web-assets.tar.gz](./web-assets.tar.gz) ([SHA256](./web-assets.tar.gz.sha256))

## Changes

See [CHANGELOG.md](../CHANGELOG.md) for detailed changes in this release.
EOF

# Create installation script
log "Creating installation script..."
cat > "$RELEASE_DIR/install.sh" << 'EOF'
#!/bin/bash

# Installation script for http-load-test
# Usage: curl -sSL https://github.com/mrtcmn/http-load-test/releases/latest/download/install.sh | bash

set -e

BINARY_NAME="http-load-test"
INSTALL_DIR="/usr/local/bin"
GITHUB_REPO="mrtcmn/http-load-test"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INSTALL]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case $ARCH in
    x86_64) ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case $OS in
    linux) PLATFORM="linux" ;;
    darwin) PLATFORM="darwin" ;;
    *) error "Unsupported OS: $OS"; exit 1 ;;
esac

BINARY_SUFFIX="$PLATFORM-$ARCH"
BINARY_FILE="$BINARY_NAME-$BINARY_SUFFIX"

log "Detected platform: $OS/$ARCH"
log "Installing $BINARY_NAME..."

# Get latest release
LATEST_RELEASE=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_RELEASE" ]; then
    error "Failed to get latest release information"
    exit 1
fi

log "Latest release: $LATEST_RELEASE"

# Download binary
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/$LATEST_RELEASE/$BINARY_FILE"
CHECKSUM_URL="https://github.com/$GITHUB_REPO/releases/download/$LATEST_RELEASE/$BINARY_FILE.sha256"

log "Downloading $BINARY_FILE..."
curl -sSL "$DOWNLOAD_URL" -o "/tmp/$BINARY_FILE"

log "Downloading checksum..."
curl -sSL "$CHECKSUM_URL" -o "/tmp/$BINARY_FILE.sha256"

# Verify checksum
log "Verifying checksum..."
cd /tmp
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$BINARY_FILE.sha256"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$BINARY_FILE.sha256"
else
    error "No checksum utility found"
    exit 1
fi

# Install binary
log "Installing to $INSTALL_DIR..."
chmod +x "/tmp/$BINARY_FILE"

if [ -w "$INSTALL_DIR" ]; then
    mv "/tmp/$BINARY_FILE" "$INSTALL_DIR/$BINARY_NAME"
else
    sudo mv "/tmp/$BINARY_FILE" "$INSTALL_DIR/$BINARY_NAME"
fi

# Cleanup
rm -f "/tmp/$BINARY_FILE.sha256"

log "Installation completed successfully!"
log "Run '$BINARY_NAME --help' to get started"
EOF

chmod +x "$RELEASE_DIR/install.sh"

# Create archive
log "Creating release archive..."
tar -czf "$RELEASE_DIR.tar.gz" -C "$RELEASE_DIR" .

# Generate final checksums
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$RELEASE_DIR.tar.gz" > "$RELEASE_DIR.tar.gz.sha256"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$RELEASE_DIR.tar.gz" > "$RELEASE_DIR.tar.gz.sha256"
fi

log "Release preparation completed!"
info "Release directory: $RELEASE_DIR/"
info "Release archive: $RELEASE_DIR.tar.gz"

# Display summary
echo
echo "=== RELEASE SUMMARY ==="
echo "Version: $VERSION"
echo "Binaries: $(ls -1 "$RELEASE_DIR"/http-load-test-* | wc -l)"
echo "Total size: $(du -sh "$RELEASE_DIR" | cut -f1)"
echo
echo "Files in release:"
ls -la "$RELEASE_DIR/"