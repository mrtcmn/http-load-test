package logger

import (
	"bytes"
	"strings"
	"testing"
)

func TestLogger_SetLevel(t *testing.T) {
	var buf bytes.Buffer
	config := &Config{
		Level:  INFO,
		Output: &buf,
		Prefix: "[test]",
	}
	logger := New(config)

	// Test that DEBUG messages are not logged at INFO level
	logger.Debug("debug message")
	if buf.Len() > 0 {
		t.Error("DEBUG message should not be logged at INFO level")
	}

	// Test that INFO messages are logged
	logger.Info("info message")
	if buf.Len() == 0 {
		t.Error("INFO message should be logged at INFO level")
	}

	// Reset buffer and change level to DEBUG
	buf.Reset()
	logger.SetLevel(DEBUG)

	// Test that DEBUG messages are now logged
	logger.Debug("debug message")
	if buf.Len() == 0 {
		t.Error("DEBUG message should be logged at DEBUG level")
	}
}

func TestLogger_WithPrefix(t *testing.T) {
	var buf bytes.Buffer
	config := &Config{
		Level:  INFO,
		Output: &buf,
		Prefix: "[test]",
	}
	logger := New(config)

	// Create logger with additional prefix
	subLogger := logger.WithPrefix("sub")
	subLogger.Info("test message")

	output := buf.String()
	if !strings.Contains(output, "[test][sub]") {
		t.Errorf("Expected output to contain '[test][sub]', got: %s", output)
	}
}

func TestLogger_LogLevels(t *testing.T) {
	var buf bytes.Buffer
	config := &Config{
		Level:  DEBUG,
		Output: &buf,
		Prefix: "[test]",
	}
	logger := New(config)

	tests := []struct {
		level    LogLevel
		message  string
		logFunc  func(string, ...interface{})
		expected string
	}{
		{DEBUG, "debug message", logger.Debug, "DEBUG"},
		{INFO, "info message", logger.Info, "INFO"},
		{WARN, "warn message", logger.Warn, "WARN"},
		{ERROR, "error message", logger.Error, "ERROR"},
	}

	for _, test := range tests {
		buf.Reset()
		test.logFunc(test.message)
		output := buf.String()

		if !strings.Contains(output, test.expected) {
			t.Errorf("Expected output to contain '%s', got: %s", test.expected, output)
		}

		if !strings.Contains(output, test.message) {
			t.Errorf("Expected output to contain '%s', got: %s", test.message, output)
		}
	}
}

func TestParseLogLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected LogLevel
		hasError bool
	}{
		{"DEBUG", DEBUG, false},
		{"INFO", INFO, false},
		{"WARN", WARN, false},
		{"WARNING", WARN, false},
		{"ERROR", ERROR, false},
		{"FATAL", FATAL, false},
		{"debug", DEBUG, false}, // case insensitive
		{"invalid", INFO, true},
	}

	for _, test := range tests {
		level, err := ParseLogLevel(test.input)

		if test.hasError {
			if err == nil {
				t.Errorf("Expected error for input '%s'", test.input)
			}
		} else {
			if err != nil {
				t.Errorf("Unexpected error for input '%s': %v", test.input, err)
			}
			if level != test.expected {
				t.Errorf("Expected level %v for input '%s', got %v", test.expected, test.input, level)
			}
		}
	}
}

func TestGlobalLogger(t *testing.T) {
	var buf bytes.Buffer

	// Create a test logger and set it as global
	config := &Config{
		Level:  DEBUG,
		Output: &buf,
		Prefix: "[global-test]",
	}
	testLogger := New(config)
	SetGlobalLogger(testLogger)

	// Test global logging functions
	Info("test global info")
	output := buf.String()

	if !strings.Contains(output, "[global-test]") {
		t.Errorf("Expected output to contain '[global-test]', got: %s", output)
	}

	if !strings.Contains(output, "test global info") {
		t.Errorf("Expected output to contain 'test global info', got: %s", output)
	}
}

func TestLogger_ShowCaller(t *testing.T) {
	var buf bytes.Buffer
	config := &Config{
		Level:      INFO,
		Output:     &buf,
		Prefix:     "[test]",
		ShowCaller: true,
	}
	logger := New(config)

	logger.Info("test message")
	output := buf.String()

	// Should contain filename and line number
	if !strings.Contains(output, "logger_test.go:") {
		t.Errorf("Expected output to contain caller information, got: %s", output)
	}
}
