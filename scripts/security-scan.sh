#!/bin/bash

# Security scanning script for binaries
# This script performs comprehensive security checks on compiled binaries

set -e

BINARY_FILE="$1"
REPORT_FILE="${2:-security-report.txt}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[SECURITY]${NC} $1"
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
    echo "Usage: $0 <binary-file> [report-file]"
    echo ""
    echo "Examples:"
    echo "  $0 bin/http-load-test"
    echo "  $0 bin/http-load-test security-report.txt"
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

log "Starting security scan of: $BINARY_FILE"

# Initialize report
cat > "$REPORT_FILE" << EOF
Security Scan Report
===================
Binary: $BINARY_FILE
Scan Date: $(date)
Scanner: $(basename "$0")

EOF

# Function to add to report
report() {
    echo "$1" >> "$REPORT_FILE"
}

# 1. Basic file information
log "Gathering basic file information..."
report "1. BASIC FILE INFORMATION"
report "========================="

if command -v file >/dev/null 2>&1; then
    file_info=$(file "$BINARY_FILE")
    report "File Type: $file_info"
    info "File type: $file_info"
else
    warn "file command not available"
    report "File Type: Not available"
fi

file_size=$(stat -c%s "$BINARY_FILE" 2>/dev/null || stat -f%z "$BINARY_FILE" 2>/dev/null || echo "unknown")
report "File Size: $file_size bytes"
info "File size: $file_size bytes"

file_perms=$(ls -l "$BINARY_FILE" | cut -d' ' -f1)
report "Permissions: $file_perms"

report ""

# 2. Checksum verification
log "Verifying file integrity..."
report "2. FILE INTEGRITY"
report "=================="

if [ -f "$BINARY_FILE.sha256" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
        if sha256sum -c "$BINARY_FILE.sha256" >/dev/null 2>&1; then
            report "Checksum: VERIFIED"
            log "✓ Checksum verified"
        else
            report "Checksum: FAILED"
            warn "Checksum verification failed"
        fi
    elif command -v shasum >/dev/null 2>&1; then
        if shasum -a 256 -c "$BINARY_FILE.sha256" >/dev/null 2>&1; then
            report "Checksum: VERIFIED"
            log "✓ Checksum verified"
        else
            report "Checksum: FAILED"
            warn "Checksum verification failed"
        fi
    else
        report "Checksum: UTILITY_NOT_FOUND"
        warn "No checksum utility available"
    fi
else
    report "Checksum: NOT_AVAILABLE"
    info "No checksum file found"
fi

report ""

# 3. Binary analysis
log "Analyzing binary structure..."
report "3. BINARY ANALYSIS"
report "=================="

# Check for debug symbols
if command -v objdump >/dev/null 2>&1; then
    if objdump -h "$BINARY_FILE" 2>/dev/null | grep -q "debug"; then
        report "Debug Symbols: PRESENT"
        warn "Debug symbols found (may leak information)"
    else
        report "Debug Symbols: STRIPPED"
        log "✓ Debug symbols stripped"
    fi
else
    report "Debug Symbols: CANNOT_CHECK"
fi

# Check for static linking
if command -v ldd >/dev/null 2>&1; then
    if ldd "$BINARY_FILE" 2>/dev/null | grep -q "not a dynamic executable"; then
        report "Linking: STATIC"
        log "✓ Statically linked"
    else
        report "Linking: DYNAMIC"
        info "Dynamically linked"
        report "Dependencies:"
        ldd "$BINARY_FILE" 2>/dev/null | while read line; do
            report "  $line"
        done
    fi
elif command -v otool >/dev/null 2>&1; then
    # macOS
    if otool -L "$BINARY_FILE" 2>/dev/null | grep -q "not an object file"; then
        report "Linking: STATIC"
        log "✓ Statically linked"
    else
        report "Linking: DYNAMIC"
        info "Dynamically linked"
        report "Dependencies:"
        otool -L "$BINARY_FILE" 2>/dev/null | tail -n +2 | while read line; do
            report "  $line"
        done
    fi
else
    report "Linking: CANNOT_CHECK"
fi

report ""

# 4. Security features analysis
log "Checking security features..."
report "4. SECURITY FEATURES"
report "===================="

# Stack canaries (if available)
if command -v objdump >/dev/null 2>&1; then
    if objdump -d "$BINARY_FILE" 2>/dev/null | grep -q "__stack_chk"; then
        report "Stack Canaries: ENABLED"
        log "✓ Stack canaries enabled"
    else
        report "Stack Canaries: NOT_DETECTED"
        info "Stack canaries not detected"
    fi
else
    report "Stack Canaries: CANNOT_CHECK"
fi

# ASLR/PIE support
if command -v readelf >/dev/null 2>&1; then
    if readelf -h "$BINARY_FILE" 2>/dev/null | grep -q "DYN"; then
        report "PIE/ASLR: ENABLED"
        log "✓ PIE/ASLR support enabled"
    else
        report "PIE/ASLR: DISABLED"
        warn "PIE/ASLR support not enabled"
    fi
elif command -v otool >/dev/null 2>&1; then
    # macOS check
    if otool -hv "$BINARY_FILE" 2>/dev/null | grep -q "PIE"; then
        report "PIE/ASLR: ENABLED"
        log "✓ PIE/ASLR support enabled"
    else
        report "PIE/ASLR: UNKNOWN"
        info "PIE/ASLR status unknown on macOS"
    fi
else
    report "PIE/ASLR: CANNOT_CHECK"
fi

report ""

# 5. String analysis
log "Analyzing embedded strings..."
report "5. STRING ANALYSIS"
report "=================="

if command -v strings >/dev/null 2>&1; then
    # Look for suspicious strings
    suspicious_patterns=(
        "eval"
        "exec"
        "system"
        "shell"
        "/bin/sh"
        "cmd.exe"
        "powershell"
        "wget"
        "curl.*http"
        "password"
        "secret"
        "token"
        "api.*key"
    )
    
    strings_output=$(strings "$BINARY_FILE")
    suspicious_found=false
    
    for pattern in "${suspicious_patterns[@]}"; do
        if echo "$strings_output" | grep -qi "$pattern"; then
            report "Suspicious String: $pattern"
            warn "Found potentially suspicious string: $pattern"
            suspicious_found=true
        fi
    done
    
    if [ "$suspicious_found" = false ]; then
        report "Suspicious Strings: NONE_FOUND"
        log "✓ No obviously suspicious strings found"
    fi
    
    # Count total strings
    string_count=$(echo "$strings_output" | wc -l)
    report "Total Strings: $string_count"
    
    # Look for URLs
    url_count=$(echo "$strings_output" | grep -c "http" || echo "0")
    report "URLs Found: $url_count"
    
else
    report "String Analysis: UTILITY_NOT_AVAILABLE"
    warn "strings utility not available"
fi

report ""

# 6. Entropy analysis (basic)
log "Performing entropy analysis..."
report "6. ENTROPY ANALYSIS"
report "==================="

if command -v xxd >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then
    # Simple entropy calculation
    entropy=$(xxd -p "$BINARY_FILE" | tr -d '\n' | fold -w2 | sort | uniq -c | awk '
        BEGIN { total=0; entropy=0 }
        { count[NR]=$1; total+=$1 }
        END {
            for(i=1; i<=NR; i++) {
                p = count[i]/total
                if(p > 0) entropy -= p * log(p)/log(2)
            }
            printf "%.2f", entropy
        }
    ')
    
    report "Entropy: $entropy bits"
    
    # Interpret entropy
    if awk "BEGIN {exit !($entropy > 7.5)}"; then
        report "Entropy Level: HIGH (possible packing/encryption)"
        warn "High entropy detected - may indicate packing or encryption"
    elif awk "BEGIN {exit !($entropy > 6.0)}"; then
        report "Entropy Level: MEDIUM (normal for compiled binary)"
        info "Medium entropy - normal for compiled binary"
    else
        report "Entropy Level: LOW"
        info "Low entropy detected"
    fi
else
    report "Entropy: CANNOT_CALCULATE"
    info "Entropy calculation utilities not available"
fi

report ""

# 7. Execution test
log "Testing binary execution..."
report "7. EXECUTION TEST"
report "================="

# Test if binary runs without crashing
if timeout 5s "$BINARY_FILE" --help >/dev/null 2>&1; then
    report "Execution Test: PASSED (--help)"
    log "✓ Binary executes successfully"
elif timeout 5s "$BINARY_FILE" -h >/dev/null 2>&1; then
    report "Execution Test: PASSED (-h)"
    log "✓ Binary executes successfully"
elif timeout 5s "$BINARY_FILE" version >/dev/null 2>&1; then
    report "Execution Test: PASSED (version)"
    log "✓ Binary executes successfully"
else
    report "Execution Test: INCONCLUSIVE"
    warn "Binary execution test inconclusive"
fi

report ""

# 8. Final security assessment
log "Generating security assessment..."
report "8. SECURITY ASSESSMENT"
report "======================"

security_score=100
issues=()

# Deduct points for issues
if grep -q "Debug Symbols: PRESENT" "$REPORT_FILE"; then
    security_score=$((security_score - 10))
    issues+=("Debug symbols present")
fi

if grep -q "PIE/ASLR: DISABLED" "$REPORT_FILE"; then
    security_score=$((security_score - 15))
    issues+=("PIE/ASLR disabled")
fi

if grep -q "Checksum: FAILED" "$REPORT_FILE"; then
    security_score=$((security_score - 25))
    issues+=("Checksum verification failed")
fi

if grep -q "Suspicious String:" "$REPORT_FILE"; then
    security_score=$((security_score - 20))
    issues+=("Suspicious strings found")
fi

if grep -q "Entropy Level: HIGH" "$REPORT_FILE"; then
    security_score=$((security_score - 10))
    issues+=("Unusually high entropy")
fi

report "Security Score: $security_score/100"

if [ ${#issues[@]} -eq 0 ]; then
    report "Issues: NONE"
    log "✓ No security issues detected"
else
    report "Issues:"
    for issue in "${issues[@]}"; do
        report "  - $issue"
    done
fi

# Overall assessment
if [ $security_score -ge 90 ]; then
    report "Overall Assessment: EXCELLENT"
    log "✓ Excellent security posture"
elif [ $security_score -ge 75 ]; then
    report "Overall Assessment: GOOD"
    log "✓ Good security posture"
elif [ $security_score -ge 60 ]; then
    report "Overall Assessment: ACCEPTABLE"
    warn "Acceptable security posture with minor issues"
else
    report "Overall Assessment: POOR"
    error "Poor security posture - review required"
fi

report ""
report "Scan completed at: $(date)"

log "Security scan completed!"
log "Report saved to: $REPORT_FILE"

# Display summary
echo
log "=== SECURITY SUMMARY ==="
log "Binary: $BINARY_FILE"
log "Security Score: $security_score/100"
if [ ${#issues[@]} -eq 0 ]; then
    log "Issues: None detected"
else
    log "Issues: ${#issues[@]} found"
fi
log "Full report: $REPORT_FILE"

exit 0