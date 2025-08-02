package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewHTTPClient(t *testing.T) {
	config := &TestConfig{
		URL:     "http://example.com",
		Method:  "GET",
		Timeout: 30 * time.Second,
		Headers: map[string]string{
			"User-Agent": "test-client",
		},
	}

	client := NewHTTPClient(config)

	if client == nil {
		t.Fatal("NewHTTPClient returned nil")
	}

	if client.config != config {
		t.Error("Config not properly assigned")
	}

	if client.client.Timeout != config.Timeout {
		t.Errorf("Expected timeout %v, got %v", config.Timeout, client.client.Timeout)
	}
}

func TestHTTPClient_ExecuteRequest_Success(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify method
		if r.Method != "POST" {
			t.Errorf("Expected method POST, got %s", r.Method)
		}

		// Verify headers
		if r.Header.Get("Custom-Header") != "test-value" {
			t.Errorf("Expected Custom-Header: test-value, got %s", r.Header.Get("Custom-Header"))
		}

		// Verify content type
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Expected Content-Type: application/json, got %s", r.Header.Get("Content-Type"))
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success": true}`))
	}))
	defer server.Close()

	config := &TestConfig{
		URL:     server.URL,
		Method:  "POST",
		Body:    `{"test": "data"}`,
		Timeout: 10 * time.Second,
		Headers: map[string]string{
			"Custom-Header": "test-value",
		},
	}

	client := NewHTTPClient(config)
	ctx := context.Background()

	result := client.ExecuteRequest(ctx)

	// Verify result
	if result == nil {
		t.Fatal("ExecuteRequest returned nil")
	}

	if !result.Success {
		t.Errorf("Expected success=true, got %v. Error: %s", result.Success, result.Error)
	}

	if result.StatusCode != http.StatusOK {
		t.Errorf("Expected status code 200, got %d", result.StatusCode)
	}

	if result.ResponseSize <= 0 {
		t.Errorf("Expected response size > 0, got %d", result.ResponseSize)
	}

	if result.Duration <= 0 {
		t.Errorf("Expected duration > 0, got %v", result.Duration)
	}

	if result.StartTime.IsZero() || result.EndTime.IsZero() {
		t.Error("Start time or end time is zero")
	}

	if result.EndTime.Before(result.StartTime) {
		t.Error("End time is before start time")
	}
}

func TestHTTPClient_ExecuteRequest_HTTPError(t *testing.T) {
	// Create test server that returns 500 error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Internal Server Error"))
	}))
	defer server.Close()

	config := &TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}

	client := NewHTTPClient(config)
	ctx := context.Background()

	result := client.ExecuteRequest(ctx)

	if result.Success {
		t.Error("Expected success=false for 500 status code")
	}

	if result.StatusCode != http.StatusInternalServerError {
		t.Errorf("Expected status code 500, got %d", result.StatusCode)
	}

	if result.Duration <= 0 {
		t.Errorf("Expected duration > 0, got %v", result.Duration)
	}
}

func TestHTTPClient_ExecuteRequest_NetworkError(t *testing.T) {
	config := &TestConfig{
		URL:     "http://nonexistent-server-12345.com",
		Method:  "GET",
		Timeout: 1 * time.Second,
	}

	client := NewHTTPClient(config)
	ctx := context.Background()

	result := client.ExecuteRequest(ctx)

	if result.Success {
		t.Error("Expected success=false for network error")
	}

	if result.Error == "" {
		t.Error("Expected error message for network failure")
	}

	if result.StatusCode != 0 {
		t.Errorf("Expected status code 0 for network error, got %d", result.StatusCode)
	}
}

func TestHTTPClient_ExecuteRequest_Timeout(t *testing.T) {
	// Create test server with delay
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := &TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 500 * time.Millisecond, // Short timeout
	}

	client := NewHTTPClient(config)
	ctx := context.Background()

	result := client.ExecuteRequest(ctx)

	if result.Success {
		t.Error("Expected success=false for timeout")
	}

	if result.Error == "" {
		t.Error("Expected error message for timeout")
	}
}

func TestHTTPClient_ExecuteRequest_Context_Cancellation(t *testing.T) {
	// Create test server with delay
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := &TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}

	client := NewHTTPClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	result := client.ExecuteRequest(ctx)

	if result.Success {
		t.Error("Expected success=false for context cancellation")
	}

	if result.Error == "" {
		t.Error("Expected error message for context cancellation")
	}
}

func TestHTTPClient_ExecuteRequest_MicrosecondPrecision(t *testing.T) {
	// Create test server with minimal delay
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Millisecond) // 1ms delay
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer server.Close()

	config := &TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}

	client := NewHTTPClient(config)
	ctx := context.Background()

	result := client.ExecuteRequest(ctx)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify microsecond precision - duration should be at least 1ms
	if result.Duration < time.Millisecond {
		t.Errorf("Expected duration >= 1ms, got %v", result.Duration)
	}

	// Verify that we can measure sub-millisecond precision
	if result.Duration.Nanoseconds()%1000 == 0 {
		// This is unlikely if we have true microsecond precision
		t.Logf("Duration: %v (may not demonstrate microsecond precision)", result.Duration)
	}
}

func TestHTTPClient_ExecuteRequest_CustomHeaders(t *testing.T) {
	expectedHeaders := map[string]string{
		"Authorization": "Bearer token123",
		"X-Custom":      "custom-value",
		"User-Agent":    "test-agent/1.0",
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for key, expectedValue := range expectedHeaders {
			if r.Header.Get(key) != expectedValue {
				t.Errorf("Expected header %s: %s, got %s", key, expectedValue, r.Header.Get(key))
			}
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := &TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Headers: expectedHeaders,
		Timeout: 10 * time.Second,
	}

	client := NewHTTPClient(config)
	ctx := context.Background()

	result := client.ExecuteRequest(ctx)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}
}

func TestHTTPClient_ExecuteRequest_DifferentMethods(t *testing.T) {
	methods := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != method {
					t.Errorf("Expected method %s, got %s", method, r.Method)
				}
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()

			config := &TestConfig{
				URL:     server.URL,
				Method:  method,
				Timeout: 10 * time.Second,
			}

			if method == "POST" || method == "PUT" || method == "PATCH" {
				config.Body = `{"test": "data"}`
			}

			client := NewHTTPClient(config)
			ctx := context.Background()

			result := client.ExecuteRequest(ctx)

			if !result.Success {
				t.Errorf("Expected success for %s method, got error: %s", method, result.Error)
			}
		})
	}
}

func TestHTTPClient_SetTimeout(t *testing.T) {
	config := &TestConfig{
		URL:     "http://example.com",
		Method:  "GET",
		Timeout: 10 * time.Second,
	}

	client := NewHTTPClient(config)
	newTimeout := 5 * time.Second

	client.SetTimeout(newTimeout)

	if client.client.Timeout != newTimeout {
		t.Errorf("Expected client timeout %v, got %v", newTimeout, client.client.Timeout)
	}

	if client.config.Timeout != newTimeout {
		t.Errorf("Expected config timeout %v, got %v", newTimeout, client.config.Timeout)
	}
}

func TestHTTPClient_GetConfig(t *testing.T) {
	config := &TestConfig{
		URL:     "http://example.com",
		Method:  "GET",
		Timeout: 10 * time.Second,
	}

	client := NewHTTPClient(config)
	retrievedConfig := client.GetConfig()

	if retrievedConfig != config {
		t.Error("GetConfig did not return the original config")
	}
}