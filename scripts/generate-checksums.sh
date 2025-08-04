#!/bin/bash

# Generate checksums and signatures for release binaries
# This script creates comprehensive verification files for binary distribution

set -e

BUILD_DIR="bin"
CHECKSUMS_FILE="$BUILD_DIR/checksums.txt"
CHECKSUMS_SHA256="$BUILD_DIR/checksums.sha256"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[CHECKSUM]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if build directory exists
if [ ! -d "$BUILD_DIR" ]; then
    warn "Build directory $BUILD_DIR does not exist. Creating it..."
    mkdir -p "$BUILD_DIR"
fi

log "Generating comprehensive checksums..."

# Create checksums file
> "$CHECKSUMS_FILE"

# Generate checksums for all binaries
for file in "$BUILD_DIR"/http-load-test-*; do
    if [ -f "$file" ] && [[ ! "$file" =~ \.sha256$ ]]; then
        filename=$(basename "$file")
        log "Processing $filename..."
        
        # Generate SHA256
        if command -v sha256sum >/dev/null 2>&1; then
            checksum=$(sha256sum "$file" | cut -d' ' -f1)
        elif command -v shasum >/dev/null 2>&1; then
            checksum=$(shasum -a 256 "$file" | cut -d' ' -f1)
        else
            warn "No checksum utility found"
            continue
        fi
        
        # Add to checksums file
        echo "$checksum  $filename" >> "$CHECKSUMS_FILE"
        
        # Get file size
        size=$(du -h "$file" | cut -f1)
        
        log "  SHA256: $checksum"
        log "  Size: $size"
    fi
done

# Generate checksum of checksums file
if [ -f "$CHECKSUMS_FILE" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$CHECKSUMS_FILE" > "$CHECKSUMS_SHA256"
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$CHECKSUMS_FILE" > "$CHECKSUMS_SHA256"
    fi
    
    log "Generated $CHECKSUMS_FILE"
    log "Generated $CHECKSUMS_SHA256"
fi

# Create verification script
cat > "$BUILD_DIR/verify.sh" << 'EOF'
#!/bin/bash

# Binary verification script
# Usage: ./verify.sh <binary-file>

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <binary-file>"
    echo "Example: $0 http-load-test-linux-amd64"
    exit 1
fi

BINARY_FILE="$1"
CHECKSUM_FILE="$1.sha256"

if [ ! -f "$BINARY_FILE" ]; then
    echo "Error: Binary file $BINARY_FILE not found"
    exit 1
fi

if [ ! -f "$CHECKSUM_FILE" ]; then
    echo "Error: Checksum file $CHECKSUM_FILE not found"
    exit 1
fi

echo "Verifying $BINARY_FILE..."

if command -v sha256sum >/dev/null 2>&1; then
    if sha256sum -c "$CHECKSUM_FILE"; then
        echo "✓ Verification successful: $BINARY_FILE is authentic"
    else
        echo "✗ Verification failed: $BINARY_FILE may be corrupted or tampered with"
        exit 1
    fi
elif command -v shasum >/dev/null 2>&1; then
    if shasum -a 256 -c "$CHECKSUM_FILE"; then
        echo "✓ Verification successful: $BINARY_FILE is authentic"
    else
        echo "✗ Verification failed: $BINARY_FILE may be corrupted or tampered with"
        exit 1
    fi
else
    echo "Error: No checksum utility found (sha256sum or shasum required)"
    exit 1
fi
EOF

chmod +x "$BUILD_DIR/verify.sh"

log "Generated verification script: $BUILD_DIR/verify.sh"
log "Checksum generation completed!"

# Display summary
echo
echo "=== VERIFICATION FILES ==="
if [ -f "$CHECKSUMS_FILE" ]; then
    cat "$CHECKSUMS_FILE"
fi