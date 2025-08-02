package config

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// TestConfig represents the configuration for an HTTP load test
type TestConfig struct {
	URL                string            `json:"url"`
	Method             string            `json:"method"`
	Headers            map[string]string `json:"headers"`
	Body               string            `json:"body"`
	TotalRequests      int               `json:"totalRequests"`
	RequestsPerSecond  int               `json:"requestsPerSecond"`
	ConcurrentRequests int               `json:"concurrentRequests"`
	Timeout            Duration          `json:"timeout"`
	SuccessChecker     string            `json:"successChecker"`  // JavaScript function as string
	DynamicDataFunc    string            `json:"dynamicDataFunc"` // JavaScript function as string

	// Additional configuration options for backward compatibility
	RequestConfig map[string]interface{} `json:"requestConfig,omitempty"`
}

// Duration wraps time.Duration to provide custom JSON marshaling
type Duration time.Duration

// UnmarshalJSON implements json.Unmarshaler for Duration
func (d *Duration) UnmarshalJSON(data []byte) error {
	var v interface{}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}

	switch value := v.(type) {
	case float64:
		*d = Duration(time.Duration(value) * time.Second)
		return nil
	case string:
		duration, err := time.ParseDuration(value)
		if err != nil {
			return err
		}
		*d = Duration(duration)
		return nil
	default:
		return fmt.Errorf("invalid duration format")
	}
}

// MarshalJSON implements json.Marshaler for Duration
func (d Duration) MarshalJSON() ([]byte, error) {
	return json.Marshal(time.Duration(d).String())
}

// String returns the string representation of the duration
func (d Duration) String() string {
	return time.Duration(d).String()
}

// ToDuration converts Duration to time.Duration
func (d Duration) ToDuration() time.Duration {
	return time.Duration(d)
}

// ValidationError represents a configuration validation error
type ValidationError struct {
	Field   string
	Message string
}

func (e ValidationError) Error() string {
	return fmt.Sprintf("validation error for field '%s': %s", e.Field, e.Message)
}

// ValidationErrors represents multiple validation errors
type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	if len(e) == 0 {
		return ""
	}

	var messages []string
	for _, err := range e {
		messages = append(messages, err.Error())
	}
	return strings.Join(messages, "; ")
}

// ParseConfig parses JSON configuration data into a TestConfig struct
func ParseConfig(data []byte) (*TestConfig, error) {
	var config TestConfig

	// Set default values
	config.Method = "GET"
	config.Headers = make(map[string]string)
	config.TotalRequests = 100
	config.RequestsPerSecond = 10
	config.ConcurrentRequests = 1
	config.Timeout = Duration(30 * time.Second)

	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse JSON configuration: %w", err)
	}

	if err := config.Validate(); err != nil {
		return nil, err
	}

	return &config, nil
}

// Validate validates the configuration and returns any validation errors
func (c *TestConfig) Validate() error {
	var errors ValidationErrors

	// Validate URL
	if c.URL == "" {
		errors = append(errors, ValidationError{
			Field:   "url",
			Message: "URL is required",
		})
	} else {
		if _, err := url.Parse(c.URL); err != nil {
			errors = append(errors, ValidationError{
				Field:   "url",
				Message: fmt.Sprintf("invalid URL format: %v", err),
			})
		}
	}

	// Validate HTTP method
	validMethods := map[string]bool{
		"GET": true, "POST": true, "PUT": true, "DELETE": true,
		"PATCH": true, "HEAD": true, "OPTIONS": true,
	}
	if !validMethods[strings.ToUpper(c.Method)] {
		errors = append(errors, ValidationError{
			Field:   "method",
			Message: fmt.Sprintf("invalid HTTP method: %s", c.Method),
		})
	}

	// Validate numeric parameters
	if c.TotalRequests <= 0 {
		errors = append(errors, ValidationError{
			Field:   "totalRequests",
			Message: "totalRequests must be greater than 0",
		})
	}

	if c.RequestsPerSecond <= 0 {
		errors = append(errors, ValidationError{
			Field:   "requestsPerSecond",
			Message: "requestsPerSecond must be greater than 0",
		})
	}

	if c.ConcurrentRequests <= 0 {
		errors = append(errors, ValidationError{
			Field:   "concurrentRequests",
			Message: "concurrentRequests must be greater than 0",
		})
	}

	if c.Timeout.ToDuration() <= 0 {
		errors = append(errors, ValidationError{
			Field:   "timeout",
			Message: "timeout must be greater than 0",
		})
	}

	// Validate that concurrent requests doesn't exceed total requests
	if c.ConcurrentRequests > c.TotalRequests {
		errors = append(errors, ValidationError{
			Field:   "concurrentRequests",
			Message: "concurrentRequests cannot exceed totalRequests",
		})
	}

	// Validate JavaScript functions if provided
	if c.SuccessChecker != "" {
		if err := validateJavaScriptFunction(c.SuccessChecker, "successChecker"); err != nil {
			errors = append(errors, *err)
		}
	}

	if c.DynamicDataFunc != "" {
		if err := validateJavaScriptFunction(c.DynamicDataFunc, "dynamicDataFunc"); err != nil {
			errors = append(errors, *err)
		}
	}

	if len(errors) > 0 {
		return errors
	}

	return nil
}

// validateJavaScriptFunction performs basic validation on JavaScript function strings
func validateJavaScriptFunction(funcStr, fieldName string) *ValidationError {
	// Basic validation - check if it looks like a function
	funcStr = strings.TrimSpace(funcStr)

	if funcStr == "" {
		return &ValidationError{
			Field:   fieldName,
			Message: "JavaScript function cannot be empty",
		}
	}

	// Check if it contains function keyword or arrow function syntax
	if !strings.Contains(funcStr, "function") && !strings.Contains(funcStr, "=>") {
		return &ValidationError{
			Field:   fieldName,
			Message: "JavaScript function must contain 'function' keyword or arrow function syntax '=>'",
		}
	}

	// Check for balanced braces (basic syntax check)
	braceCount := 0
	for _, char := range funcStr {
		switch char {
		case '{':
			braceCount++
		case '}':
			braceCount--
		}
	}

	if braceCount != 0 {
		return &ValidationError{
			Field:   fieldName,
			Message: "JavaScript function has unbalanced braces",
		}
	}

	return nil
}

// ToJSON converts the configuration to JSON format
func (c *TestConfig) ToJSON() ([]byte, error) {
	return json.MarshalIndent(c, "", "  ")
}

// Clone creates a deep copy of the configuration
func (c *TestConfig) Clone() *TestConfig {
	clone := *c

	// Deep copy headers map
	if c.Headers != nil {
		clone.Headers = make(map[string]string)
		for k, v := range c.Headers {
			clone.Headers[k] = v
		}
	}

	// Deep copy request config map
	if c.RequestConfig != nil {
		clone.RequestConfig = make(map[string]interface{})
		for k, v := range c.RequestConfig {
			clone.RequestConfig[k] = v
		}
	}

	return &clone
}
