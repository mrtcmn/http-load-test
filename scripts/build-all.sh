#!/bin/bash

# Build script for cross-platform binary compilation
# This script builds binaries for all supported platforms and generates checksums

set -e

BINARY_NAME="http-load-test"
BUILD_DIR="bin"
VERSION=${1:-"dev"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Clean and create build directory
log "Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build flags
LDFLAGS="-s -w -X main.version=$VERSION"

# Platform configurations
platforms=(
    "linux:amd64:linux-amd64"
    "linux:arm64:linux-arm64"
    "darwin:amd64:darwin-amd64"
    "darwin:arm64:darwin-arm64"
    "windows:amd64:windows-amd64"
)

# Build for each platform
for platform_config in "${platforms[@]}"; do
    IFS=':' read -r GOOS GOARCH suffix <<< "$platform_config"
    
    log "Building for $GOOS/$GOARCH..."
    
    # Set binary extension for Windows
    extension=""
    if [ "$GOOS" = "windows" ]; then
        extension=".exe"
    fi
    
    binary_path="$BUILD_DIR/$BINARY_NAME-$suffix$extension"
    
    # Build binary
    if CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" go build -ldflags "$LDFLAGS" -o "$binary_path" ./cmd/http-load-test; then
        log "✓ Built $binary_path"
        
        # Generate checksum
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$binary_path" > "$binary_path.sha256"
        elif command -v shasum >/dev/null 2>&1; then
            shasum -a 256 "$binary_path" > "$binary_path.sha256"
        else
            warn "No checksum utility found, skipping checksum generation for $binary_path"
        fi
        
        # Display binary info
        size=$(du -h "$binary_path" | cut -f1)
        log "  Size: $size"
        
    else
        error "Failed to build for $GOOS/$GOARCH"
        exit 1
    fi
done

log "Build completed successfully!"
log "Binaries available in $BUILD_DIR/"

# List all generated files
ls -la "$BUILD_DIR/"