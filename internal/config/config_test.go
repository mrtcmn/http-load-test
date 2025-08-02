package config

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestParseConfig(t *testing.T) {
	tests := []struct {
		name        string
		jsonData    string
		expectError bool
		expected    *TestConfig
	}{
		{
			name: "valid minimal config",
			jsonData: `{
				"url": "https://example.com/api/test"
			}`,
			expectError: false,
			expected: &TestConfig{
				URL:                "https://example.com/api/test",
				Method:             "GET",
				Headers:            map[string]string{},
				TotalRequests:      100,
				RequestsPerSecond:  10,
				ConcurrentRequests: 1,
				Timeout:            Duration(30 * time.Second),
			},
		},
		{
			name: "valid complete config",
			jsonData: `{
				"url": "https://api.example.com/users",
				"method": "POST",
				"headers": {"Content-Type": "application/json"},
				"body": "{\"name\": \"test\"}",
				"totalRequests": 500,
				"requestsPerSecond": 50,
				"concurrentRequests": 10,
				"timeout": "60s",
				"successChecker": "function(response) { return response.status === 200; }",
				"dynamicDataFunc": "function() { return {id: Math.random()}; }"
			}`,
			expectError: false,
			expected: &TestConfig{
				URL:                "https://api.example.com/users",
				Method:             "POST",
				Headers:            map[string]string{"Content-Type": "application/json"},
				Body:               "{\"name\": \"test\"}",
				TotalRequests:      500,
				RequestsPerSecond:  50,
				ConcurrentRequests: 10,
				Timeout:            Duration(60 * time.Second),
				SuccessChecker:     "function(response) { return response.status === 200; }",
				DynamicDataFunc:    "function() { return {id: Math.random()}; }",
			},
		},
		{
			name: "invalid JSON",
			jsonData: `{
				"url": "https://example.com"
				"method": "GET"
			}`,
			expectError: true,
		},
		{
			name: "missing URL",
			jsonData: `{
				"method": "GET"
			}`,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config, err := ParseConfig([]byte(tt.jsonData))

			if tt.expectError {
				if err == nil {
					t.Errorf("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if config.URL != tt.expected.URL {
				t.Errorf("URL mismatch: got %s, want %s", config.URL, tt.expected.URL)
			}

			if config.Method != tt.expected.Method {
				t.Errorf("Method mismatch: got %s, want %s", config.Method, tt.expected.Method)
			}

			if config.TotalRequests != tt.expected.TotalRequests {
				t.Errorf("TotalRequests mismatch: got %d, want %d", config.TotalRequests, tt.expected.TotalRequests)
			}
		})
	}
}

func TestTestConfig_Validate(t *testing.T) {
	tests := []struct {
		name        string
		config      TestConfig
		expectError bool
		errorFields []string
	}{
		{
			name: "valid config",
			config: TestConfig{
				URL:                "https://example.com",
				Method:             "GET",
				TotalRequests:      100,
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: false,
		},
		{
			name: "missing URL",
			config: TestConfig{
				Method:             "GET",
				TotalRequests:      100,
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: true,
			errorFields: []string{"url"},
		},
		{
			name: "invalid URL",
			config: TestConfig{
				URL:                "://invalid-url-missing-scheme",
				Method:             "GET",
				TotalRequests:      100,
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: true,
			errorFields: []string{"url"},
		},
		{
			name: "invalid HTTP method",
			config: TestConfig{
				URL:                "https://example.com",
				Method:             "INVALID",
				TotalRequests:      100,
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: true,
			errorFields: []string{"method"},
		},
		{
			name: "zero total requests",
			config: TestConfig{
				URL:                "https://example.com",
				Method:             "GET",
				TotalRequests:      0,
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: true,
			errorFields: []string{"totalRequests"},
		},
		{
			name: "zero requests per second",
			config: TestConfig{
				URL:                "https://example.com",
				Method:             "GET",
				TotalRequests:      100,
				RequestsPerSecond:  0,
				ConcurrentRequests: 5,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: true,
			errorFields: []string{"requestsPerSecond"},
		},
		{
			name: "concurrent requests exceed total",
			config: TestConfig{
				URL:                "https://example.com",
				Method:             "GET",
				TotalRequests:      10,
				RequestsPerSecond:  10,
				ConcurrentRequests: 20,
				Timeout:            Duration(30 * time.Second),
			},
			expectError: true,
			errorFields: []string{"concurrentRequests"},
		},
		{
			name: "multiple validation errors",
			config: TestConfig{
				URL:                "",
				Method:             "INVALID",
				TotalRequests:      0,
				RequestsPerSecond:  0,
				ConcurrentRequests: 0,
				Timeout:            Duration(0),
			},
			expectError: true,
			errorFields: []string{"url", "method", "totalRequests", "requestsPerSecond", "concurrentRequests", "timeout"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()

			if tt.expectError {
				if err == nil {
					t.Errorf("expected validation error but got none")
					return
				}

				// Check that all expected error fields are present
				errorStr := err.Error()
				for _, field := range tt.errorFields {
					if !strings.Contains(errorStr, field) {
						t.Errorf("expected error for field '%s' but not found in: %s", field, errorStr)
					}
				}
			} else {
				if err != nil {
					t.Errorf("unexpected validation error: %v", err)
				}
			}
		})
	}
}

func TestValidateJavaScriptFunction(t *testing.T) {
	tests := []struct {
		name        string
		funcStr     string
		fieldName   string
		expectError bool
	}{
		{
			name:        "valid function declaration",
			funcStr:     "function(response) { return response.status === 200; }",
			fieldName:   "successChecker",
			expectError: false,
		},
		{
			name:        "valid arrow function",
			funcStr:     "(response) => response.status === 200",
			fieldName:   "successChecker",
			expectError: false,
		},
		{
			name:        "valid complex function",
			funcStr:     "function(response) { if (response.status === 200) { return true; } return false; }",
			fieldName:   "successChecker",
			expectError: false,
		},
		{
			name:        "empty function",
			funcStr:     "",
			fieldName:   "successChecker",
			expectError: true,
		},
		{
			name:        "no function keyword or arrow",
			funcStr:     "response.status === 200",
			fieldName:   "successChecker",
			expectError: true,
		},
		{
			name:        "unbalanced braces",
			funcStr:     "function(response) { return response.status === 200;",
			fieldName:   "successChecker",
			expectError: true,
		},
		{
			name:        "extra closing brace",
			funcStr:     "function(response) { return response.status === 200; }}",
			fieldName:   "successChecker",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateJavaScriptFunction(tt.funcStr, tt.fieldName)

			if tt.expectError {
				if err == nil {
					t.Errorf("expected validation error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected validation error: %v", err)
				}
			}
		})
	}
}

func TestTestConfig_ToJSON(t *testing.T) {
	config := &TestConfig{
		URL:                "https://example.com",
		Method:             "POST",
		Headers:            map[string]string{"Content-Type": "application/json"},
		Body:               "{\"test\": true}",
		TotalRequests:      100,
		RequestsPerSecond:  10,
		ConcurrentRequests: 5,
		Timeout:            Duration(30 * time.Second),
		SuccessChecker:     "function(response) { return true; }",
	}

	jsonData, err := config.ToJSON()
	if err != nil {
		t.Errorf("unexpected error converting to JSON: %v", err)
		return
	}

	// Verify we can parse it back
	var parsed TestConfig
	if err := json.Unmarshal(jsonData, &parsed); err != nil {
		t.Errorf("failed to parse generated JSON: %v", err)
		return
	}

	if parsed.URL != config.URL {
		t.Errorf("URL mismatch after JSON round-trip: got %s, want %s", parsed.URL, config.URL)
	}
}

func TestTestConfig_Clone(t *testing.T) {
	original := &TestConfig{
		URL:                "https://example.com",
		Method:             "POST",
		Headers:            map[string]string{"Content-Type": "application/json", "Authorization": "Bearer token"},
		Body:               "{\"test\": true}",
		TotalRequests:      100,
		RequestsPerSecond:  10,
		ConcurrentRequests: 5,
		Timeout:            Duration(30 * time.Second),
		RequestConfig:      map[string]interface{}{"keepAlive": true, "maxRetries": 3},
	}

	clone := original.Clone()

	// Verify values are copied
	if clone.URL != original.URL {
		t.Errorf("URL not cloned correctly: got %s, want %s", clone.URL, original.URL)
	}

	// Verify maps are deep copied (not sharing references)
	clone.Headers["New-Header"] = "test"
	if _, exists := original.Headers["New-Header"]; exists {
		t.Errorf("Headers map was not deep copied - modification affected original")
	}

	clone.RequestConfig["newKey"] = "newValue"
	if _, exists := original.RequestConfig["newKey"]; exists {
		t.Errorf("RequestConfig map was not deep copied - modification affected original")
	}
}

func TestValidationErrors_Error(t *testing.T) {
	tests := []struct {
		name     string
		errors   ValidationErrors
		expected string
	}{
		{
			name:     "empty errors",
			errors:   ValidationErrors{},
			expected: "",
		},
		{
			name: "single error",
			errors: ValidationErrors{
				{Field: "url", Message: "URL is required"},
			},
			expected: "validation error for field 'url': URL is required",
		},
		{
			name: "multiple errors",
			errors: ValidationErrors{
				{Field: "url", Message: "URL is required"},
				{Field: "method", Message: "invalid HTTP method"},
			},
			expected: "validation error for field 'url': URL is required; validation error for field 'method': invalid HTTP method",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.errors.Error()
			if result != tt.expected {
				t.Errorf("Error() = %q, want %q", result, tt.expected)
			}
		})
	}
}
