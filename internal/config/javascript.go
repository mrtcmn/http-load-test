package config

import (
	"context"
	"fmt"
	"time"

	"github.com/dop251/goja"
)

// JSExecutor handles JavaScript function execution in a secure sandbox
type JSExecutor struct {
	runtime *goja.Runtime
	timeout time.Duration
}

// NewJSExecutor creates a new JavaScript executor with security constraints
func NewJSExecutor(timeout time.Duration) *JSExecutor {
	runtime := goja.New()

	// Disable potentially dangerous global objects for security
	runtime.Set("require", goja.Undefined())
	runtime.Set("process", goja.Undefined())
	runtime.Set("global", goja.Undefined())
	runtime.Set("Buffer", goja.Undefined())

	// Set up a limited console for debugging (optional)
	console := runtime.NewObject()
	console.Set("log", func(args ...interface{}) {
		// In production, this could be disabled or logged securely
		// For now, we'll keep it minimal
	})
	runtime.Set("console", console)

	return &JSExecutor{
		runtime: runtime,
		timeout: timeout,
	}
}

// ExecuteSuccessChecker executes a success checker JavaScript function
// The function should accept a response object and return a boolean
func (js *JSExecutor) ExecuteSuccessChecker(funcStr string, response map[string]interface{}) (bool, error) {
	if funcStr == "" {
		return true, nil // Default to success if no checker provided
	}

	ctx, cancel := context.WithTimeout(context.Background(), js.timeout)
	defer cancel()

	// Create a channel to handle the result
	resultChan := make(chan struct {
		result bool
		err    error
	}, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				resultChan <- struct {
					result bool
					err    error
				}{false, fmt.Errorf("JavaScript execution panic: %v", r)}
			}
		}()

		// Set the response object in the JavaScript context
		js.runtime.Set("response", response)

		// Wrap the function to ensure it returns a boolean
		wrappedFunc := fmt.Sprintf(`
			(function() {
				var userFunc = %s;
				var result = userFunc(response);
				return Boolean(result);
			})()
		`, funcStr)

		value, err := js.runtime.RunString(wrappedFunc)
		if err != nil {
			resultChan <- struct {
				result bool
				err    error
			}{false, fmt.Errorf("JavaScript execution error: %w", err)}
			return
		}

		result := value.ToBoolean()
		resultChan <- struct {
			result bool
			err    error
		}{result, nil}
	}()

	select {
	case result := <-resultChan:
		return result.result, result.err
	case <-ctx.Done():
		return false, fmt.Errorf("JavaScript execution timeout after %v", js.timeout)
	}
}

// ExecuteDynamicDataFunction executes a dynamic data JavaScript function
// The function should return an object that will be used as request data
func (js *JSExecutor) ExecuteDynamicDataFunction(funcStr string) (map[string]interface{}, error) {
	if funcStr == "" {
		return nil, nil // No dynamic data if no function provided
	}

	ctx, cancel := context.WithTimeout(context.Background(), js.timeout)
	defer cancel()

	// Create a channel to handle the result
	resultChan := make(chan struct {
		result map[string]interface{}
		err    error
	}, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				resultChan <- struct {
					result map[string]interface{}
					err    error
				}{nil, fmt.Errorf("JavaScript execution panic: %v", r)}
			}
		}()

		// Add some utility functions that might be useful for dynamic data
		js.runtime.Set("Math", map[string]interface{}{
			"random": func() float64 {
				return js.runtime.Get("Math").ToObject(js.runtime).Get("random").ToFloat()
			},
			"floor": func(x float64) int64 {
				return int64(x)
			},
		})

		// Set current timestamp
		js.runtime.Set("Date", map[string]interface{}{
			"now": func() int64 {
				return time.Now().UnixMilli()
			},
		})

		// Wrap the function to ensure it returns an object
		wrappedFunc := fmt.Sprintf(`
			(function() {
				var userFunc = %s;
				var result = userFunc();
				return result || {};
			})()
		`, funcStr)

		value, err := js.runtime.RunString(wrappedFunc)
		if err != nil {
			resultChan <- struct {
				result map[string]interface{}
				err    error
			}{nil, fmt.Errorf("JavaScript execution error: %w", err)}
			return
		}

		// Convert the result to a Go map
		result := make(map[string]interface{})
		if value != nil && !goja.IsUndefined(value) && !goja.IsNull(value) {
			// Check if the value is actually an object (not a primitive)
			if value.ExportType().Kind().String() == "map" {
				obj := value.ToObject(js.runtime)
				if obj != nil {
					for _, key := range obj.Keys() {
						val := obj.Get(key)
						result[key] = val.Export()
					}
				}
			}
			// If it's a primitive, we return an empty map as intended
		}

		resultChan <- struct {
			result map[string]interface{}
			err    error
		}{result, nil}
	}()

	select {
	case result := <-resultChan:
		return result.result, result.err
	case <-ctx.Done():
		return nil, fmt.Errorf("JavaScript execution timeout after %v", js.timeout)
	}
}

// ValidateFunction performs more thorough validation of JavaScript functions
// This is more comprehensive than the basic validation in config.go
func (js *JSExecutor) ValidateFunction(funcStr string, functionType string) error {
	if funcStr == "" {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	// Create a channel to handle the result
	resultChan := make(chan error, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				resultChan <- fmt.Errorf("JavaScript validation panic: %v", r)
			}
		}()

		// Try to parse the function without executing it
		testCode := fmt.Sprintf(`
			(function() {
				try {
					var testFunc = %s;
					if (typeof testFunc !== 'function') {
						throw new Error('Expression does not evaluate to a function');
					}
					return true;
				} catch (e) {
					throw new Error('Function validation failed: ' + e.message);
				}
			})()
		`, funcStr)

		_, err := js.runtime.RunString(testCode)
		resultChan <- err
	}()

	select {
	case err := <-resultChan:
		if err != nil {
			return fmt.Errorf("JavaScript function validation failed for %s: %w", functionType, err)
		}
		return nil
	case <-ctx.Done():
		return fmt.Errorf("JavaScript function validation timeout for %s", functionType)
	}
}

// Clone creates a new JSExecutor with the same configuration
func (js *JSExecutor) Clone() *JSExecutor {
	return NewJSExecutor(js.timeout)
}

// SetTimeout updates the execution timeout
func (js *JSExecutor) SetTimeout(timeout time.Duration) {
	js.timeout = timeout
}
