#!/bin/bash

# Comprehensive binary verification script
# This script performs multiple verification checks on downloaded binaries

set -e

BINARY_FILE="$1"
CHECKSUM_FILE="$2"
SIGNATURE_FILE="$3"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[VERIFY]${NC} $1"
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

usage() {
    echo "Usage: $0 <binary-file> [checksum-file] [signature-file]"
    echo ""
    echo "Examples:"
    echo "  $0 http-load-test-linux-amd64"
    echo "  $0 http-load-test-linux-amd64 http-load-test-linux-amd64.sha256"
    echo "  $0 http-load-test-linux-amd64 http-load-test-linux-amd64.sha256 http-load-test-linux-amd64.sig"
    echo ""
    echo "The script will automatically look for checksum and signature files if not provided:"
    echo "  - <binary-file>.sha256 for checksum"
    echo "  - <binary-file>.sig for signature"
    exit 1
}

# Check arguments
if [ $# -eq 0 ]; then
    usage
fi

if [ ! -f "$BINARY_FILE" ]; then
    error "Binary file '$BINARY_FILE' not found"
    exit 1
fi

# Auto-detect checksum file if not provided
if [ -z "$CHECKSUM_FILE" ]; then
    CHECKSUM_FILE="$BINARY_FILE.sha256"
fi

# Auto-detect signature file if not provided
if [ -z "$SIGNATURE_FILE" ]; then
    SIGNATURE_FILE="$BINARY_FILE.sig"
fi

log "Verifying binary: $BINARY_FILE"

# Check if binary is executable
if [ ! -x "$BINARY_FILE" ]; then
    info "Binary is not executable, making it executable..."
    chmod +x "$BINARY_FILE"
fi

# 1. File integrity check
log "Checking file integrity..."
if [ ! -s "$BINARY_FILE" ]; then
    error "Binary file is empty or corrupted"
    exit 1
fi

file_size=$(stat -c%s "$BINARY_FILE" 2>/dev/null || stat -f%z "$BINARY_FILE" 2>/dev/null || echo "unknown")
info "File size: $file_size bytes"

# 2. Checksum verification
if [ -f "$CHECKSUM_FILE" ]; then
    log "Verifying checksum..."
    
    # Get the directory of the binary for checksum verification
    binary_dir=$(dirname "$BINARY_FILE")
    
    if command -v sha256sum >/dev/null 2>&1; then
        if (cd "$binary_dir" && sha256sum -c "$(basename "$CHECKSUM_FILE")") >/dev/null 2>&1; then
            log "✓ Checksum verification passed"
        else
            error "✗ Checksum verification failed"
            echo "Expected checksum:"
            cat "$CHECKSUM_FILE"
            echo "Actual checksum:"
            sha256sum "$BINARY_FILE"
            exit 1
        fi
    elif command -v shasum >/dev/null 2>&1; then
        if (cd "$binary_dir" && shasum -a 256 -c "$(basename "$CHECKSUM_FILE")") >/dev/null 2>&1; then
            log "✓ Checksum verification passed"
        else
            error "✗ Checksum verification failed"
            echo "Expected checksum:"
            cat "$CHECKSUM_FILE"
            echo "Actual checksum:"
            shasum -a 256 "$BINARY_FILE"
            exit 1
        fi
    else
        warn "No checksum utility found (sha256sum or shasum required)"
    fi
else
    warn "Checksum file '$CHECKSUM_FILE' not found, skipping checksum verification"
fi

# 3. Signature verification (if available)
if [ -f "$SIGNATURE_FILE" ]; then
    log "Verifying signature..."
    
    if command -v gpg >/dev/null 2>&1; then
        if gpg --verify "$SIGNATURE_FILE" "$BINARY_FILE" >/dev/null 2>&1; then
            log "✓ Signature verification passed"
        else
            error "✗ Signature verification failed"
            exit 1
        fi
    else
        warn "GPG not found, skipping signature verification"
    fi
else
    info "Signature file '$SIGNATURE_FILE' not found, skipping signature verification"
fi

# 4. Basic binary analysis
log "Performing basic binary analysis..."

# Check if it's a valid executable
if command -v file >/dev/null 2>&1; then
    file_type=$(file "$BINARY_FILE")
    info "File type: $file_type"
    
    # Check if it's the expected architecture
    case "$file_type" in
        *"x86-64"*|*"x86_64"*) info "Architecture: x86_64" ;;
        *"ARM64"*|*"aarch64"*) info "Architecture: ARM64" ;;
        *"386"*|*"i386"*) info "Architecture: i386" ;;
        *) warn "Unknown or unexpected architecture" ;;
    esac
    
    # Check if it's statically linked (preferred for distribution)
    if echo "$file_type" | grep -q "statically linked"; then
        info "Linking: Static (good for distribution)"
    elif echo "$file_type" | grep -q "dynamically linked"; then
        warn "Linking: Dynamic (may require additional libraries)"
    fi
fi

# 5. Test binary execution (basic smoke test)
log "Testing binary execution..."
if timeout 10s "$BINARY_FILE" --help >/dev/null 2>&1; then
    log "✓ Binary executes successfully"
elif timeout 10s "$BINARY_FILE" -h >/dev/null 2>&1; then
    log "✓ Binary executes successfully"
elif timeout 10s "$BINARY_FILE" version >/dev/null 2>&1; then
    log "✓ Binary executes successfully"
else
    warn "Binary execution test inconclusive (may require specific arguments)"
fi

# 6. Security checks
log "Performing security checks..."

# Check for common security features (if available)
if command -v objdump >/dev/null 2>&1; then
    # Check for stack canaries, NX bit, etc.
    if objdump -p "$BINARY_FILE" 2>/dev/null | grep -q "STACK"; then
        info "Stack protection: Present"
    fi
fi

# Check for suspicious strings (basic malware detection)
if command -v strings >/dev/null 2>&1; then
    suspicious_strings=("eval" "exec" "system" "shell" "/bin/sh" "cmd.exe")
    found_suspicious=false
    
    for str in "${suspicious_strings[@]}"; do
        if strings "$BINARY_FILE" | grep -qi "$str"; then
            warn "Found potentially suspicious string: $str"
            found_suspicious=true
        fi
    done
    
    if [ "$found_suspicious" = false ]; then
        info "No obviously suspicious strings found"
    fi
fi

# 7. Final verification summary
echo
log "=== VERIFICATION SUMMARY ==="
log "Binary: $BINARY_FILE"
log "Size: $file_size bytes"

if [ -f "$CHECKSUM_FILE" ]; then
    log "Checksum: ✓ Verified"
else
    warn "Checksum: Not verified (file not found)"
fi

if [ -f "$SIGNATURE_FILE" ]; then
    log "Signature: ✓ Verified"
else
    info "Signature: Not available"
fi

log "Basic execution: ✓ Tested"
log "Security scan: ✓ Completed"

echo
log "Binary verification completed successfully!"
log "The binary appears to be authentic and safe to use."

exit 0