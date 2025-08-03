package errors

import (
	"fmt"
	"net"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestLoadTestError_Error(t *testing.T) {
	err := New(NetworkError, "NET_001", "Network connection failed")
	expected := "[network:NET_001] Network connection failed"

	if err.Error() != expected {
		t.Errorf("Expected '%s', got '%s'", expected, err.Error())
	}
}

func TestLoadTestError_WithContext(t *testing.T) {
	err := New(NetworkError, "NET_001", "Network connection failed").
		WithContext("host", "example.com").
		WithContext("port", "80")

	if err.Context["host"] != "example.com" {
		t.Errorf("Expected host context to be 'example.com', got '%s'", err.Context["host"])
	}

	if err.Context["port"] != "80" {
		t.Errorf("Expected port context to be '80', got '%s'", err.Context["port"])
	}
}

func TestLoadTestError_WithDetails(t *testing.T) {
	err := New(NetworkError, "NET_001", "Network connection failed").
		WithDetails("Connection timed out after 30 seconds")

	expected := "[network:NET_001] Network connection failed: Connection timed out after 30 seconds"
	if err.Error() != expected {
		t.Errorf("Expected '%s', got '%s'", expected, err.Error())
	}
}

func TestCategorizeError_NetworkError(t *testing.T) {
	// Test timeout error
	timeoutErr := &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: fmt.Errorf("i/o timeout"),
	}

	categorized := CategorizeError(timeoutErr)
	if categorized.Type != NetworkError {
		t.Errorf("Expected NetworkError, got %s", categorized.Type)
	}
}

func TestCategorizeError_DNSError(t *testing.T) {
	dnsErr := &net.DNSError{
		Err:    "no such host",
		Name:   "nonexistent.example.com",
		Server: "8.8.8.8:53",
	}

	categorized := CategorizeError(dnsErr)
	if categorized.Type != DNSError {
		t.Errorf("Expected DNSError, got %s", categorized.Type)
	}

	if categorized.Context["host"] != "nonexistent.example.com" {
		t.Errorf("Expected host context to be 'nonexistent.example.com', got '%s'", categorized.Context["host"])
	}
}

func TestCategorizeError_URLError(t *testing.T) {
	urlErr := &url.Error{
		Op:  "Get",
		URL: "http://example.com",
		Err: fmt.Errorf("connection refused"),
	}

	categorized := CategorizeError(urlErr)
	if categorized.Type != NetworkError {
		t.Errorf("Expected NetworkError, got %s", categorized.Type)
	}

	if categorized.Context["url"] != "http://example.com" {
		t.Errorf("Expected URL context to be 'http://example.com', got '%s'", categorized.Context["url"])
	}
}

func TestCategorizeError_StringMatching(t *testing.T) {
	tests := []struct {
		errorMsg     string
		expectedType ErrorType
	}{
		{"connection refused", ConnectionError},
		{"timeout occurred", TimeoutError},
		{"no such host", DNSError},
		{"http: server gave HTTP response", HTTPError},
		{"tls: handshake failure", NetworkError},
	}

	for _, test := range tests {
		err := fmt.Errorf(test.errorMsg)
		categorized := CategorizeError(err)

		if categorized.Type != test.expectedType {
			t.Errorf("For error '%s', expected %s, got %s", test.errorMsg, test.expectedType, categorized.Type)
		}
	}
}

func TestErrorCollector(t *testing.T) {
	collector := NewErrorCollector(5)

	// Add some errors
	err1 := New(NetworkError, "NET_001", "Network error 1")
	err2 := New(HTTPError, "HTTP_500", "HTTP error")
	err3 := New(NetworkError, "NET_002", "Network error 2")

	collector.Add(err1)
	collector.Add(err2)
	collector.Add(err3)

	summary := collector.GetSummary()

	if summary.TotalErrors != 3 {
		t.Errorf("Expected 3 total errors, got %d", summary.TotalErrors)
	}

	if summary.ErrorsByType[NetworkError] != 2 {
		t.Errorf("Expected 2 network errors, got %d", summary.ErrorsByType[NetworkError])
	}

	if summary.ErrorsByType[HTTPError] != 1 {
		t.Errorf("Expected 1 HTTP error, got %d", summary.ErrorsByType[HTTPError])
	}

	if summary.ErrorsByCode["NET_001"] != 1 {
		t.Errorf("Expected 1 NET_001 error, got %d", summary.ErrorsByCode["NET_001"])
	}
}

func TestErrorCollector_MaxRecent(t *testing.T) {
	collector := NewErrorCollector(2) // Only keep 2 recent errors

	// Add 3 errors
	for i := 0; i < 3; i++ {
		err := New(NetworkError, fmt.Sprintf("NET_%03d", i), fmt.Sprintf("Network error %d", i))
		collector.Add(err)
	}

	summary := collector.GetSummary()

	// Should only have 2 recent errors
	if len(summary.RecentErrors) != 2 {
		t.Errorf("Expected 2 recent errors, got %d", len(summary.RecentErrors))
	}

	// Should be the last 2 errors added
	if summary.RecentErrors[0].Code != "NET_001" {
		t.Errorf("Expected first recent error to be NET_001, got %s", summary.RecentErrors[0].Code)
	}

	if summary.RecentErrors[1].Code != "NET_002" {
		t.Errorf("Expected second recent error to be NET_002, got %s", summary.RecentErrors[1].Code)
	}
}

func TestPredefinedErrorConstructors(t *testing.T) {
	tests := []struct {
		constructor  func() *LoadTestError
		expectedType ErrorType
		expectedCode string
	}{
		{
			func() *LoadTestError { return NewConfigError("INVALID_CONFIG", "Invalid configuration") },
			ConfigError,
			"INVALID_CONFIG",
		},
		{
			func() *LoadTestError { return NewValidationError("url", "URL is required") },
			ValidationError,
			"VALIDATION_FAILED",
		},
		{
			func() *LoadTestError { return NewNetworkError("NET_001", "Network failed") },
			NetworkError,
			"NET_001",
		},
		{
			func() *LoadTestError { return NewTimeoutError("request", 30*time.Second) },
			TimeoutError,
			"OPERATION_TIMEOUT",
		},
		{
			func() *LoadTestError { return NewConnectionError("localhost:8080", "Connection refused") },
			ConnectionError,
			"CONNECTION_FAILED",
		},
		{
			func() *LoadTestError { return NewHTTPError(500, "Internal server error") },
			HTTPError,
			"HTTP_500",
		},
		{
			func() *LoadTestError { return NewJavaScriptError("JS_001", "JavaScript execution failed") },
			JavaScriptError,
			"JS_001",
		},
		{
			func() *LoadTestError { return NewWebSocketError("WS_001", "WebSocket connection failed") },
			WebSocketError,
			"WS_001",
		},
		{
			func() *LoadTestError { return NewExecutionError("EXEC_001", "Execution failed") },
			ExecutionError,
			"EXEC_001",
		},
		{
			func() *LoadTestError { return NewResourceError("memory", "Out of memory") },
			ResourceError,
			"RESOURCE_ERROR",
		},
	}

	for _, test := range tests {
		err := test.constructor()

		if err.Type != test.expectedType {
			t.Errorf("Expected type %s, got %s", test.expectedType, err.Type)
		}

		if err.Code != test.expectedCode {
			t.Errorf("Expected code %s, got %s", test.expectedCode, err.Code)
		}
	}
}

func TestIsNetworkError(t *testing.T) {
	networkErr := NewNetworkError("NET_001", "Network error")
	httpErr := NewHTTPError(500, "HTTP error")

	if !IsNetworkError(networkErr) {
		t.Error("Expected network error to be identified as network error")
	}

	if IsNetworkError(httpErr) {
		t.Error("Expected HTTP error not to be identified as network error")
	}

	// Test with regular error
	regularErr := fmt.Errorf("regular error")
	if IsNetworkError(regularErr) {
		t.Error("Expected regular error not to be identified as network error")
	}
}

func TestGetErrorType(t *testing.T) {
	loadTestErr := NewNetworkError("NET_001", "Network error")
	regularErr := fmt.Errorf("regular error")

	if GetErrorType(loadTestErr) != NetworkError {
		t.Errorf("Expected NetworkError, got %s", GetErrorType(loadTestErr))
	}

	if GetErrorType(regularErr) != InternalError {
		t.Errorf("Expected InternalError for regular error, got %s", GetErrorType(regularErr))
	}
}

func TestWrap(t *testing.T) {
	originalErr := fmt.Errorf("original error")
	wrappedErr := Wrap(originalErr, NetworkError, "NET_001", "Network operation failed")

	if wrappedErr.Type != NetworkError {
		t.Errorf("Expected NetworkError, got %s", wrappedErr.Type)
	}

	if wrappedErr.Code != "NET_001" {
		t.Errorf("Expected code NET_001, got %s", wrappedErr.Code)
	}

	if wrappedErr.Unwrap() != originalErr {
		t.Error("Expected wrapped error to unwrap to original error")
	}

	if !strings.Contains(wrappedErr.Error(), "Network operation failed") {
		t.Errorf("Expected error message to contain 'Network operation failed', got: %s", wrappedErr.Error())
	}
}
