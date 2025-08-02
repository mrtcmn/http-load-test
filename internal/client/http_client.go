package client

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// TestConfig represents the configuration for HTTP load testing
type TestConfig struct {
	URL                string            `json:"url"`
	Method             string            `json:"method"`
	Headers            map[string]string `json:"headers"`
	Body               string            `json:"body"`
	TotalRequests      int               `json:"totalRequests"`
	RequestsPerSecond  int               `json:"requestsPerSecond"`
	ConcurrentRequests int               `json:"concurrentRequests"`
	Timeout            time.Duration     `json:"timeout"`
	SuccessChecker     string            `json:"successChecker"`
	DynamicDataFunc    string            `json:"dynamicDataFunc"`
}

// RequestResult represents the result of a single HTTP request
type RequestResult struct {
	StartTime    time.Time     `json:"startTime"`
	EndTime      time.Time     `json:"endTime"`
	Duration     time.Duration `json:"duration"`
	StatusCode   int           `json:"statusCode"`
	Success      bool          `json:"success"`
	Error        string        `json:"error,omitempty"`
	ResponseSize int64         `json:"responseSize"`
}

// HTTPClient handles HTTP request execution with precise timing measurements
type HTTPClient struct {
	client *http.Client
	config *TestConfig
}

// NewHTTPClient creates a new HTTPClient with the given configuration
func NewHTTPClient(config *TestConfig) *HTTPClient {
	client := &http.Client{
		Timeout: config.Timeout,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	return &HTTPClient{
		client: client,
		config: config,
	}
}

// ExecuteRequest executes a single HTTP request with microsecond-precision timing
func (c *HTTPClient) ExecuteRequest(ctx context.Context) *RequestResult {
	result := &RequestResult{}
	
	// Record start time with microsecond precision
	result.StartTime = time.Now()
	
	// Create HTTP request
	req, err := c.createRequest(ctx)
	if err != nil {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)
		result.Error = fmt.Sprintf("failed to create request: %v", err)
		result.Success = false
		return result
	}
	
	// Execute the request
	resp, err := c.client.Do(req)
	if err != nil {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)
		result.Error = fmt.Sprintf("request failed: %v", err)
		result.Success = false
		return result
	}
	defer resp.Body.Close()
	
	// Record end time immediately after response
	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(result.StartTime)
	result.StatusCode = resp.StatusCode
	
	// Read response body to get size
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Error = fmt.Sprintf("failed to read response body: %v", err)
		result.Success = false
		return result
	}
	
	result.ResponseSize = int64(len(body))
	
	// Determine success based on status code (2xx range)
	result.Success = resp.StatusCode >= 200 && resp.StatusCode < 300
	
	return result
}

// createRequest creates an HTTP request based on the configuration
func (c *HTTPClient) createRequest(ctx context.Context) (*http.Request, error) {
	var body io.Reader
	if c.config.Body != "" {
		body = bytes.NewBufferString(c.config.Body)
	}
	
	req, err := http.NewRequestWithContext(ctx, c.config.Method, c.config.URL, body)
	if err != nil {
		return nil, err
	}
	
	// Add custom headers
	for key, value := range c.config.Headers {
		req.Header.Set(key, value)
	}
	
	// Set default Content-Type if not specified and body is present
	if c.config.Body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	
	return req, nil
}

// SetTimeout updates the client timeout
func (c *HTTPClient) SetTimeout(timeout time.Duration) {
	c.client.Timeout = timeout
	c.config.Timeout = timeout
}

// GetConfig returns the current configuration
func (c *HTTPClient) GetConfig() *TestConfig {
	return c.config
}