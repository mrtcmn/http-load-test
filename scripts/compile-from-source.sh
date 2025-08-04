#!/bin/bash

# Fallback compilation from source
# This script compiles the binary from source when pre-built binaries are not available

set -e

# Configuration
BINARY_NAME="http-load-test"
SOURCE_DIR="./cmd/http-load-test"
BUILD_DIR="bin"
MIN_GO_VERSION="1.19"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[COMPILE]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Function to compare version numbers
version_compare() {
    if [[ $1 == $2 ]]; then
        return 0
    fi
    local IFS=.
    local i ver1=($1) ver2=($2)
    # fill empty fields in ver1 with zeros
    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++)); do
        if [[ -z ${ver2[i]} ]]; then
            # fill empty fields in ver2 with zeros
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]})); then
            return 1
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]})); then
            return 2
        fi
    done
    return 0
}

log "Starting compilation from source..."

# 1. Check if Go is installed
if ! command -v go >/dev/null 2>&1; then
    error "Go is not installed. Please install Go $MIN_GO_VERSION or later."
    echo "Visit https://golang.org/dl/ for installation instructions."
    exit 1
fi

# 2. Check Go version
GO_VERSION=$(go version | grep -oE 'go[0-9]+\.[0-9]+(\.[0-9]+)?' | sed 's/go//')
log "Found Go version: $GO_VERSION"

version_compare "$GO_VERSION" "$MIN_GO_VERSION"
case $? in
    2)
        error "Go version $GO_VERSION is too old. Minimum required: $MIN_GO_VERSION"
        exit 1
        ;;
    0|1)
        info "Go version is compatible"
        ;;
esac

# 3. Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    error "Source directory '$SOURCE_DIR' not found"
    exit 1
fi

if [ ! -f "$SOURCE_DIR/main.go" ]; then
    error "main.go not found in '$SOURCE_DIR'"
    exit 1
fi

# 4. Check for go.mod
if [ ! -f "go.mod" ]; then
    error "go.mod not found. This doesn't appear to be a Go module."
    exit 1
fi

# 5. Create build directory
mkdir -p "$BUILD_DIR"

# 6. Download dependencies
log "Downloading Go dependencies..."
if ! go mod download; then
    error "Failed to download Go dependencies"
    exit 1
fi

# 7. Verify dependencies
log "Verifying dependencies..."
if ! go mod verify; then
    error "Dependency verification failed"
    exit 1
fi

# 8. Run tests (optional but recommended)
if [ "${SKIP_TESTS:-false}" != "true" ]; then
    log "Running tests..."
    if go test ./...; then
        log "✓ All tests passed"
    else
        warn "Some tests failed, but continuing with compilation"
    fi
fi

# 9. Detect platform
GOOS=$(go env GOOS)
GOARCH=$(go env GOARCH)
log "Target platform: $GOOS/$GOARCH"

# 10. Set build flags
LDFLAGS="-s -w"
if [ -n "${VERSION:-}" ]; then
    LDFLAGS="$LDFLAGS -X main.version=$VERSION"
fi

# Set binary extension for Windows
EXTENSION=""
if [ "$GOOS" = "windows" ]; then
    EXTENSION=".exe"
fi

BINARY_PATH="$BUILD_DIR/$BINARY_NAME$EXTENSION"

# 11. Compile the binary
log "Compiling binary..."
info "Source: $SOURCE_DIR"
info "Output: $BINARY_PATH"
info "Flags: $LDFLAGS"

if CGO_ENABLED=0 go build -ldflags "$LDFLAGS" -o "$BINARY_PATH" "$SOURCE_DIR"; then
    log "✓ Compilation successful"
else
    error "Compilation failed"
    exit 1
fi

# 12. Verify the binary
if [ ! -f "$BINARY_PATH" ]; then
    error "Binary was not created at expected location: $BINARY_PATH"
    exit 1
fi

# Make binary executable
chmod +x "$BINARY_PATH"

# 13. Test the binary
log "Testing compiled binary..."
if timeout 10s "$BINARY_PATH" --help >/dev/null 2>&1; then
    log "✓ Binary test successful"
elif timeout 10s "$BINARY_PATH" -h >/dev/null 2>&1; then
    log "✓ Binary test successful"
else
    warn "Binary test inconclusive (may require specific arguments)"
fi

# 14. Generate checksum
log "Generating checksum..."
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$BINARY_PATH" > "$BINARY_PATH.sha256"
    log "✓ SHA256 checksum generated"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$BINARY_PATH" > "$BINARY_PATH.sha256"
    log "✓ SHA256 checksum generated"
else
    warn "No checksum utility found, skipping checksum generation"
fi

# 15. Display binary information
BINARY_SIZE=$(du -h "$BINARY_PATH" | cut -f1)
log "=== COMPILATION SUMMARY ==="
log "Binary: $BINARY_PATH"
log "Size: $BINARY_SIZE"
log "Platform: $GOOS/$GOARCH"
log "Go version: $GO_VERSION"

if [ -f "$BINARY_PATH.sha256" ]; then
    log "Checksum: $(cat "$BINARY_PATH.sha256" | cut -d' ' -f1)"
fi

echo
log "Compilation from source completed successfully!"
log "Binary is ready for use: $BINARY_PATH"

# 16. Optional: Create a simple installation script
cat > "$BUILD_DIR/install-local.sh" << EOF
#!/bin/bash
# Local installation script for compiled binary

INSTALL_DIR="/usr/local/bin"
BINARY_NAME="$BINARY_NAME"
BINARY_PATH="$BINARY_PATH"

if [ -w "\$INSTALL_DIR" ]; then
    cp "\$BINARY_PATH" "\$INSTALL_DIR/\$BINARY_NAME"
else
    sudo cp "\$BINARY_PATH" "\$INSTALL_DIR/\$BINARY_NAME"
fi

echo "Binary installed to \$INSTALL_DIR/\$BINARY_NAME"
echo "Run '\$BINARY_NAME --help' to get started"
EOF

chmod +x "$BUILD_DIR/install-local.sh"
info "Local installation script created: $BUILD_DIR/install-local.sh"

exit 0