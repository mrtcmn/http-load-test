package errors

import (
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

// ErrorType represents the category of error
type ErrorType string

const (
	// Network-related errors
	NetworkError    ErrorType = "network"
	TimeoutError    ErrorType = "timeout"
	ConnectionError ErrorType = "connection"
	DNSError        ErrorType = "dns"

	// HTTP-related errors
	HTTPError     ErrorType = "http"
	ResponseError ErrorType = "response"

	// Configuration errors
	ConfigError     ErrorType = "config"
	ValidationError ErrorType = "validation"

	// System errors
	SystemError   ErrorType = "system"
	ResourceError ErrorType = "resource"

	// Application errors
	ExecutionError ErrorType = "execution"
	InternalError  ErrorType = "internal"

	// JavaScript errors
	JavaScriptError ErrorType = "javascript"

	// WebSocket errors
	WebSocketError ErrorType = "websocket"
)

// LoadTestError represents a categorized error with additional context
type LoadTestError struct {
	Type        ErrorType         `json:"type"`
	Code        string            `json:"code"`
	Message     string            `json:"message"`
	Details     string            `json:"details,omitempty"`
	Cause       error             `json:"-"`
	Context     map[string]string `json:"context,omitempty"`
	Timestamp   time.Time         `json:"timestamp"`
	Recoverable bool              `json:"recoverable"`
}

// Error implements the error interface
func (e *LoadTestError) Error() string {
	if e.Details != "" {
		return fmt.Sprintf("[%s:%s] %s: %s", e.Type, e.Code, e.Message, e.Details)
	}
	return fmt.Sprintf("[%s:%s] %s", e.Type, e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *LoadTestError) Unwrap() error {
	return e.Cause
}

// WithContext adds context information to the error
func (e *LoadTestError) WithContext(key, value string) *LoadTestError {
	if e.Context == nil {
		e.Context = make(map[string]string)
	}
	e.Context[key] = value
	return e
}

// WithDetails adds additional details to the error
func (e *LoadTestError) WithDetails(details string) *LoadTestError {
	e.Details = details
	return e
}

// IsRecoverable returns whether the error is recoverable
func (e *LoadTestError) IsRecoverable() bool {
	return e.Recoverable
}

// New creates a new LoadTestError
func New(errorType ErrorType, code, message string) *LoadTestError {
	return &LoadTestError{
		Type:      errorType,
		Code:      code,
		Message:   message,
		Timestamp: time.Now(),
	}
}

// Wrap wraps an existing error with LoadTestError context
func Wrap(err error, errorType ErrorType, code, message string) *LoadTestError {
	return &LoadTestError{
		Type:      errorType,
		Code:      code,
		Message:   message,
		Cause:     err,
		Timestamp: time.Now(),
	}
}

// CategorizeError automatically categorizes a generic error
func CategorizeError(err error) *LoadTestError {
	if err == nil {
		return nil
	}

	// Check if it's already a LoadTestError
	if loadTestErr, ok := err.(*LoadTestError); ok {
		return loadTestErr
	}

	// Categorize based on error type and content
	errorStr := err.Error()
	errorStrLower := strings.ToLower(errorStr)

	// Network errors
	if netErr, ok := err.(net.Error); ok {
		if netErr.Timeout() {
			return Wrap(err, TimeoutError, "NET_TIMEOUT", "Network operation timed out").
				WithContext("timeout", "true")
		}
		return Wrap(err, NetworkError, "NET_ERROR", "Network error occurred")
	}

	// DNS errors
	if dnsErr, ok := err.(*net.DNSError); ok {
		return Wrap(err, DNSError, "DNS_ERROR", "DNS resolution failed").
			WithContext("host", dnsErr.Name).
			WithContext("server", dnsErr.Server)
	}

	// URL errors
	if urlErr, ok := err.(*url.Error); ok {
		if urlErr.Timeout() {
			return Wrap(err, TimeoutError, "URL_TIMEOUT", "URL request timed out").
				WithContext("url", urlErr.URL).
				WithContext("operation", urlErr.Op)
		}
		return Wrap(err, NetworkError, "URL_ERROR", "URL operation failed").
			WithContext("url", urlErr.URL).
			WithContext("operation", urlErr.Op)
	}

	// System call errors
	if syscallErr, ok := err.(*net.OpError); ok {
		if syscallErr.Op == "dial" {
			return Wrap(err, ConnectionError, "CONN_FAILED", "Failed to establish connection").
				WithContext("network", syscallErr.Net).
				WithContext("address", syscallErr.Addr.String())
		}
		return Wrap(err, SystemError, "SYSCALL_ERROR", "System call failed").
			WithContext("operation", syscallErr.Op)
	}

	// Connection refused
	if strings.Contains(errorStrLower, "connection refused") {
		return Wrap(err, ConnectionError, "CONN_REFUSED", "Connection refused by target server")
	}

	// Timeout errors
	if strings.Contains(errorStrLower, "timeout") || strings.Contains(errorStrLower, "deadline exceeded") {
		return Wrap(err, TimeoutError, "TIMEOUT", "Operation timed out")
	}

	// DNS errors
	if strings.Contains(errorStrLower, "no such host") || strings.Contains(errorStrLower, "dns") {
		return Wrap(err, DNSError, "DNS_RESOLUTION", "DNS resolution failed")
	}

	// HTTP errors
	if strings.Contains(errorStrLower, "http") {
		return Wrap(err, HTTPError, "HTTP_ERROR", "HTTP operation failed")
	}

	// TLS/SSL errors
	if strings.Contains(errorStrLower, "tls") || strings.Contains(errorStrLower, "ssl") || strings.Contains(errorStrLower, "certificate") {
		return Wrap(err, NetworkError, "TLS_ERROR", "TLS/SSL error occurred")
	}

	// Default to internal error
	return Wrap(err, InternalError, "UNKNOWN", "Unknown error occurred")
}

// Predefined error constructors

// NewConfigError creates a configuration error
func NewConfigError(code, message string) *LoadTestError {
	return New(ConfigError, code, message)
}

// NewValidationError creates a validation error
func NewValidationError(field, message string) *LoadTestError {
	return New(ValidationError, "VALIDATION_FAILED", message).
		WithContext("field", field)
}

// NewNetworkError creates a network error
func NewNetworkError(code, message string) *LoadTestError {
	return New(NetworkError, code, message)
}

// NewTimeoutError creates a timeout error
func NewTimeoutError(operation string, duration time.Duration) *LoadTestError {
	return New(TimeoutError, "OPERATION_TIMEOUT", fmt.Sprintf("%s operation timed out", operation)).
		WithContext("operation", operation).
		WithContext("duration", duration.String())
}

// NewConnectionError creates a connection error
func NewConnectionError(address, message string) *LoadTestError {
	return New(ConnectionError, "CONNECTION_FAILED", message).
		WithContext("address", address)
}

// NewHTTPError creates an HTTP error
func NewHTTPError(statusCode int, message string) *LoadTestError {
	return New(HTTPError, fmt.Sprintf("HTTP_%d", statusCode), message).
		WithContext("status_code", fmt.Sprintf("%d", statusCode))
}

// NewJavaScriptError creates a JavaScript execution error
func NewJavaScriptError(code, message string) *LoadTestError {
	return New(JavaScriptError, code, message)
}

// NewWebSocketError creates a WebSocket error
func NewWebSocketError(code, message string) *LoadTestError {
	return New(WebSocketError, code, message)
}

// NewExecutionError creates an execution error
func NewExecutionError(code, message string) *LoadTestError {
	return New(ExecutionError, code, message)
}

// NewResourceError creates a resource error
func NewResourceError(resource, message string) *LoadTestError {
	return New(ResourceError, "RESOURCE_ERROR", message).
		WithContext("resource", resource)
}

// ErrorSummary provides a summary of errors for reporting
type ErrorSummary struct {
	TotalErrors   int               `json:"totalErrors"`
	ErrorsByType  map[ErrorType]int `json:"errorsByType"`
	ErrorsByCode  map[string]int    `json:"errorsByCode"`
	RecentErrors  []*LoadTestError  `json:"recentErrors"`
	CriticalCount int               `json:"criticalCount"`
}

// ErrorCollector collects and categorizes errors during test execution
type ErrorCollector struct {
	errors       []*LoadTestError
	maxRecent    int
	errorsByType map[ErrorType]int
	errorsByCode map[string]int
}

// NewErrorCollector creates a new error collector
func NewErrorCollector(maxRecent int) *ErrorCollector {
	return &ErrorCollector{
		errors:       make([]*LoadTestError, 0),
		maxRecent:    maxRecent,
		errorsByType: make(map[ErrorType]int),
		errorsByCode: make(map[string]int),
	}
}

// Add adds an error to the collector
func (ec *ErrorCollector) Add(err error) {
	if err == nil {
		return
	}

	loadTestErr := CategorizeError(err)
	ec.errors = append(ec.errors, loadTestErr)
	ec.errorsByType[loadTestErr.Type]++
	ec.errorsByCode[loadTestErr.Code]++

	// Keep only recent errors
	if len(ec.errors) > ec.maxRecent {
		ec.errors = ec.errors[len(ec.errors)-ec.maxRecent:]
	}
}

// GetSummary returns an error summary
func (ec *ErrorCollector) GetSummary() *ErrorSummary {
	criticalCount := 0
	for errorType, count := range ec.errorsByType {
		if errorType == SystemError || errorType == InternalError || errorType == ResourceError {
			criticalCount += count
		}
	}

	return &ErrorSummary{
		TotalErrors:   len(ec.errors),
		ErrorsByType:  ec.copyTypeMap(),
		ErrorsByCode:  ec.copyCodeMap(),
		RecentErrors:  ec.getRecentErrors(),
		CriticalCount: criticalCount,
	}
}

// Reset clears all collected errors
func (ec *ErrorCollector) Reset() {
	ec.errors = make([]*LoadTestError, 0)
	ec.errorsByType = make(map[ErrorType]int)
	ec.errorsByCode = make(map[string]int)
}

// GetRecentErrors returns the most recent errors
func (ec *ErrorCollector) getRecentErrors() []*LoadTestError {
	if len(ec.errors) == 0 {
		return []*LoadTestError{}
	}

	// Return a copy to avoid external modification
	recent := make([]*LoadTestError, len(ec.errors))
	copy(recent, ec.errors)
	return recent
}

// Helper methods for copying maps
func (ec *ErrorCollector) copyTypeMap() map[ErrorType]int {
	copy := make(map[ErrorType]int)
	for k, v := range ec.errorsByType {
		copy[k] = v
	}
	return copy
}

func (ec *ErrorCollector) copyCodeMap() map[string]int {
	copy := make(map[string]int)
	for k, v := range ec.errorsByCode {
		copy[k] = v
	}
	return copy
}

// IsNetworkError checks if an error is network-related
func IsNetworkError(err error) bool {
	if loadTestErr, ok := err.(*LoadTestError); ok {
		return loadTestErr.Type == NetworkError ||
			loadTestErr.Type == ConnectionError ||
			loadTestErr.Type == DNSError ||
			loadTestErr.Type == TimeoutError
	}
	return false
}

// IsRecoverableError checks if an error is recoverable
func IsRecoverableError(err error) bool {
	if loadTestErr, ok := err.(*LoadTestError); ok {
		return loadTestErr.IsRecoverable()
	}
	return false
}

// GetErrorType returns the error type if it's a LoadTestError
func GetErrorType(err error) ErrorType {
	if loadTestErr, ok := err.(*LoadTestError); ok {
		return loadTestErr.Type
	}
	return InternalError
}
