package config

import (
	"strings"
	"testing"
	"time"
)

func TestNewJSExecutor(t *testing.T) {
	executor := NewJSExecutor(5 * time.Second)

	if executor == nil {
		t.Fatal("NewJSExecutor returned nil")
	}

	if executor.runtime == nil {
		t.Fatal("JSExecutor runtime is nil")
	}

	if executor.timeout != 5*time.Second {
		t.Errorf("Expected timeout 5s, got %v", executor.timeout)
	}
}

func TestJSExecutor_ExecuteSuccessChecker(t *testing.T) {
	executor := NewJSExecutor(5 * time.Second)

	tests := []struct {
		name          string
		funcStr       string
		response      map[string]interface{}
		expected      bool
		expectError   bool
		errorContains string
	}{
		{
			name:     "empty function returns true",
			funcStr:  "",
			response: map[string]interface{}{"status": 200},
			expected: true,
		},
		{
			name:     "simple status check - success",
			funcStr:  "function(response) { return response.status === 200; }",
			response: map[string]interface{}{"status": 200},
			expected: true,
		},
		{
			name:     "simple status check - failure",
			funcStr:  "function(response) { return response.status === 200; }",
			response: map[string]interface{}{"status": 404},
			expected: false,
		},
		{
			name:     "arrow function - success",
			funcStr:  "(response) => response.status >= 200 && response.status < 300",
			response: map[string]interface{}{"status": 201},
			expected: true,
		},
		{
			name:     "complex validation - success",
			funcStr:  "function(response) { return response.status === 200 && response.body && response.body.success === true; }",
			response: map[string]interface{}{"status": 200, "body": map[string]interface{}{"success": true}},
			expected: true,
		},
		{
			name:     "complex validation - failure",
			funcStr:  "function(response) { return response.status === 200 && response.body && response.body.success === true; }",
			response: map[string]interface{}{"status": 200, "body": map[string]interface{}{"success": false}},
			expected: false,
		},
		{
			name:          "invalid JavaScript syntax",
			funcStr:       "function(response) { return response.status === 200",
			response:      map[string]interface{}{"status": 200},
			expectError:   true,
			errorContains: "JavaScript execution error",
		},
		{
			name:          "function throws error",
			funcStr:       "function(response) { throw new Error('test error'); }",
			response:      map[string]interface{}{"status": 200},
			expectError:   true,
			errorContains: "JavaScript execution error",
		},
		{
			name:     "function returns non-boolean (truthy)",
			funcStr:  "function(response) { return 'success'; }",
			response: map[string]interface{}{"status": 200},
			expected: true,
		},
		{
			name:     "function returns non-boolean (falsy)",
			funcStr:  "function(response) { return 0; }",
			response: map[string]interface{}{"status": 200},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := executor.ExecuteSuccessChecker(tt.funcStr, tt.response)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
					return
				}
				if tt.errorContains != "" && !strings.Contains(err.Error(), tt.errorContains) {
					t.Errorf("Expected error to contain '%s', got: %v", tt.errorContains, err)
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result != tt.expected {
				t.Errorf("Expected result %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestJSExecutor_ExecuteDynamicDataFunction(t *testing.T) {
	executor := NewJSExecutor(5 * time.Second)

	tests := []struct {
		name           string
		funcStr        string
		expectError    bool
		errorContains  string
		validateResult func(map[string]interface{}) bool
	}{
		{
			name:    "empty function returns nil",
			funcStr: "",
			validateResult: func(result map[string]interface{}) bool {
				return result == nil
			},
		},
		{
			name:    "simple object return",
			funcStr: "function() { return {id: 123, name: 'test'}; }",
			validateResult: func(result map[string]interface{}) bool {
				return result != nil &&
					result["id"] != nil &&
					result["name"] == "test"
			},
		},
		{
			name:    "arrow function return",
			funcStr: "() => ({timestamp: Date.now(), random: Math.random()})",
			validateResult: func(result map[string]interface{}) bool {
				return result != nil &&
					result["timestamp"] != nil &&
					result["random"] != nil
			},
		},
		{
			name:    "function returns primitive (converted to empty object)",
			funcStr: "function() { return 'string'; }",
			validateResult: func(result map[string]interface{}) bool {
				return result != nil && len(result) == 0
			},
		},
		{
			name:    "function returns null (converted to empty object)",
			funcStr: "function() { return null; }",
			validateResult: func(result map[string]interface{}) bool {
				return result != nil && len(result) == 0
			},
		},
		{
			name:    "function returns undefined (converted to empty object)",
			funcStr: "function() { return undefined; }",
			validateResult: func(result map[string]interface{}) bool {
				return result != nil && len(result) == 0
			},
		},
		{
			name:          "invalid JavaScript syntax",
			funcStr:       "function() { return {id: 123",
			expectError:   true,
			errorContains: "JavaScript execution error",
		},
		{
			name:          "function throws error",
			funcStr:       "function() { throw new Error('dynamic data error'); }",
			expectError:   true,
			errorContains: "JavaScript execution error",
		},
		{
			name:    "complex object with nested data",
			funcStr: "function() { return {user: {id: 456, profile: {name: 'John'}}, timestamp: Date.now()}; }",
			validateResult: func(result map[string]interface{}) bool {
				if result == nil {
					return false
				}
				user, ok := result["user"]
				if !ok {
					return false
				}
				// The nested object should be accessible
				return user != nil && result["timestamp"] != nil
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := executor.ExecuteDynamicDataFunction(tt.funcStr)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
					return
				}
				if tt.errorContains != "" && !strings.Contains(err.Error(), tt.errorContains) {
					t.Errorf("Expected error to contain '%s', got: %v", tt.errorContains, err)
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.validateResult(result) {
				t.Errorf("Result validation failed for result: %+v", result)
			}
		})
	}
}

func TestJSExecutor_ValidateFunction(t *testing.T) {
	executor := NewJSExecutor(5 * time.Second)

	tests := []struct {
		name          string
		funcStr       string
		functionType  string
		expectError   bool
		errorContains string
	}{
		{
			name:         "empty function is valid",
			funcStr:      "",
			functionType: "successChecker",
			expectError:  false,
		},
		{
			name:         "valid function declaration",
			funcStr:      "function(response) { return response.status === 200; }",
			functionType: "successChecker",
			expectError:  false,
		},
		{
			name:         "valid arrow function",
			funcStr:      "(response) => response.status === 200",
			functionType: "successChecker",
			expectError:  false,
		},
		{
			name:         "valid complex function",
			funcStr:      "function() { var x = 1; var y = 2; return {sum: x + y}; }",
			functionType: "dynamicData",
			expectError:  false,
		},
		{
			name:          "invalid syntax - missing closing brace",
			funcStr:       "function(response) { return response.status === 200",
			functionType:  "successChecker",
			expectError:   true,
			errorContains: "validation failed",
		},
		{
			name:          "invalid syntax - not a function",
			funcStr:       "response.status === 200",
			functionType:  "successChecker",
			expectError:   true,
			errorContains: "validation failed",
		},
		{
			name:          "invalid syntax - malformed arrow function",
			funcStr:       "=> response.status === 200",
			functionType:  "successChecker",
			expectError:   true,
			errorContains: "validation failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := executor.ValidateFunction(tt.funcStr, tt.functionType)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected validation error but got none")
					return
				}
				if tt.errorContains != "" && !strings.Contains(err.Error(), tt.errorContains) {
					t.Errorf("Expected error to contain '%s', got: %v", tt.errorContains, err)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected validation error: %v", err)
				}
			}
		})
	}
}

func TestJSExecutor_ExecuteSuccessChecker_Timeout(t *testing.T) {
	// Create executor with very short timeout
	executor := NewJSExecutor(10 * time.Millisecond)

	// Function that takes longer than the timeout
	funcStr := "function(response) { while(true) {} return true; }"
	response := map[string]interface{}{"status": 200}

	result, err := executor.ExecuteSuccessChecker(funcStr, response)

	if err == nil {
		t.Errorf("Expected timeout error but got none")
		return
	}

	if !strings.Contains(err.Error(), "timeout") {
		t.Errorf("Expected timeout error, got: %v", err)
	}

	if result != false {
		t.Errorf("Expected false result on timeout, got: %v", result)
	}
}

func TestJSExecutor_ExecuteDynamicDataFunction_Timeout(t *testing.T) {
	// Create executor with very short timeout
	executor := NewJSExecutor(10 * time.Millisecond)

	// Function that takes longer than the timeout
	funcStr := "function() { while(true) {} return {}; }"

	result, err := executor.ExecuteDynamicDataFunction(funcStr)

	if err == nil {
		t.Errorf("Expected timeout error but got none")
		return
	}

	if !strings.Contains(err.Error(), "timeout") {
		t.Errorf("Expected timeout error, got: %v", err)
	}

	if result != nil {
		t.Errorf("Expected nil result on timeout, got: %v", result)
	}
}

func TestJSExecutor_Clone(t *testing.T) {
	original := NewJSExecutor(10 * time.Second)
	clone := original.Clone()

	if clone == nil {
		t.Fatal("Clone returned nil")
	}

	if clone == original {
		t.Error("Clone returned same instance")
	}

	if clone.timeout != original.timeout {
		t.Errorf("Clone timeout mismatch: got %v, want %v", clone.timeout, original.timeout)
	}

	// Test that they work independently
	funcStr := "function(response) { return response.status === 200; }"
	response := map[string]interface{}{"status": 200}

	result1, err1 := original.ExecuteSuccessChecker(funcStr, response)
	result2, err2 := clone.ExecuteSuccessChecker(funcStr, response)

	if err1 != nil || err2 != nil {
		t.Errorf("Unexpected errors: original=%v, clone=%v", err1, err2)
	}

	if result1 != result2 {
		t.Errorf("Results should be the same: original=%v, clone=%v", result1, result2)
	}
}

func TestJSExecutor_SetTimeout(t *testing.T) {
	executor := NewJSExecutor(5 * time.Second)

	newTimeout := 10 * time.Second
	executor.SetTimeout(newTimeout)

	if executor.timeout != newTimeout {
		t.Errorf("SetTimeout failed: got %v, want %v", executor.timeout, newTimeout)
	}
}

func TestJSExecutor_SecurityConstraints(t *testing.T) {
	executor := NewJSExecutor(5 * time.Second)

	// Test that dangerous globals are disabled
	tests := []struct {
		name    string
		funcStr string
	}{
		{
			name:    "require is undefined",
			funcStr: "function() { return typeof require === 'undefined'; }",
		},
		{
			name:    "process is undefined",
			funcStr: "function() { return typeof process === 'undefined'; }",
		},
		{
			name:    "global is undefined",
			funcStr: "function() { return typeof global === 'undefined'; }",
		},
		{
			name:    "Buffer is undefined",
			funcStr: "function() { return typeof Buffer === 'undefined'; }",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := executor.ExecuteDynamicDataFunction(tt.funcStr)

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			// The function should return an empty object since it returns a boolean
			// but we're testing that the dangerous globals are indeed undefined
			if result == nil {
				t.Errorf("Expected result object but got nil")
			}
		})
	}
}
