package integration

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// TestServerConfig holds configuration for the test HTTP server
type TestServerConfig struct {
	Port                int
	DefaultDelay        time.Duration
	DefaultStatusCode   int
	DefaultResponseSize int
	EnableLogging       bool
}

// TestServer provides a configurable HTTP server for testing
type TestServer struct {
	config    TestServerConfig
	server    *http.Server
	mux       *http.ServeMux
	stats     *ServerStats
	responses map[string]*EndpointConfig
	mutex     sync.RWMutex
}

// ServerStats tracks request statistics
type ServerStats struct {
	TotalRequests   int64            `json:"totalRequests"`
	RequestsByPath  map[string]int64 `json:"requestsByPath"`
	RequestsByCode  map[int]int64    `json:"requestsByCode"`
	StartTime       time.Time        `json:"startTime"`
	LastRequestTime time.Time        `json:"lastRequestTime"`
	mutex           sync.RWMutex
}

// EndpointConfig defines behavior for a specific endpoint
type EndpointConfig struct {
	StatusCode   int               `json:"statusCode"`
	Delay        time.Duration     `json:"delay"`
	ResponseBody interface{}       `json:"responseBody"`
	Headers      map[string]string `json:"headers"`
	FailureRate  float64           `json:"failureRate"`  // 0.0 to 1.0
	ResponseSize int               `json:"responseSize"` // For generating large responses
}

// NewTestServer creates a new configurable test server
func NewTestServer(config TestServerConfig) *TestServer {
	if config.Port == 0 {
		config.Port = 8080
	}
	if config.DefaultStatusCode == 0 {
		config.DefaultStatusCode = 200
	}

	mux := http.NewServeMux()
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", config.Port),
		Handler: mux,
	}

	ts := &TestServer{
		config:    config,
		server:    server,
		mux:       mux,
		responses: make(map[string]*EndpointConfig),
		stats: &ServerStats{
			RequestsByPath: make(map[string]int64),
			RequestsByCode: make(map[int]int64),
			StartTime:      time.Now(),
		},
	}

	// Set up default routes
	ts.setupRoutes()

	return ts
}

// setupRoutes configures the default routes for the test server
func (ts *TestServer) setupRoutes() {
	// Default test endpoint
	ts.mux.HandleFunc("/test", ts.handleRequest)

	// Configurable endpoint
	ts.mux.HandleFunc("/api/", ts.handleRequest)

	// Health check endpoint
	ts.mux.HandleFunc("/health", ts.handleHealth)

	// Stats endpoint
	ts.mux.HandleFunc("/stats", ts.handleStats)

	// Configuration endpoint
	ts.mux.HandleFunc("/config", ts.handleConfig)

	// Large response endpoint for testing
	ts.mux.HandleFunc("/large", ts.handleLargeResponse)

	// Slow endpoint for timeout testing
	ts.mux.HandleFunc("/slow", ts.handleSlowResponse)

	// Error endpoint for error testing
	ts.mux.HandleFunc("/error", ts.handleErrorResponse)
}

// handleRequest is the main request handler that applies endpoint configuration
func (ts *TestServer) handleRequest(w http.ResponseWriter, r *http.Request) {
	ts.updateStats(r.URL.Path)

	// Get endpoint configuration
	config := ts.getEndpointConfig(r.URL.Path)

	// Apply delay if configured
	if config.Delay > 0 {
		time.Sleep(config.Delay)
	}

	// Check for simulated failure
	if config.FailureRate > 0 && ts.shouldFail(config.FailureRate) {
		ts.updateStatsCode(500)
		http.Error(w, "Simulated server error", http.StatusInternalServerError)
		return
	}

	// Set custom headers
	for key, value := range config.Headers {
		w.Header().Set(key, value)
	}

	// Set content type
	w.Header().Set("Content-Type", "application/json")

	// Set status code
	w.WriteHeader(config.StatusCode)
	ts.updateStatsCode(config.StatusCode)

	// Generate response body
	var responseBody interface{}
	if config.ResponseBody != nil {
		responseBody = config.ResponseBody
	} else if config.ResponseSize > 0 {
		responseBody = ts.generateLargeResponse(config.ResponseSize)
	} else {
		responseBody = map[string]interface{}{
			"status":    "success",
			"timestamp": time.Now().Unix(),
			"path":      r.URL.Path,
			"method":    r.Method,
		}
	}

	json.NewEncoder(w).Encode(responseBody)
}

// handleHealth provides a simple health check endpoint
func (ts *TestServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	ts.updateStats("/health")
	ts.updateStatsCode(200)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy",
		"uptime": time.Since(ts.stats.StartTime).Seconds(),
	})
}

// handleStats returns server statistics
func (ts *TestServer) handleStats(w http.ResponseWriter, r *http.Request) {
	ts.stats.mutex.RLock()
	defer ts.stats.mutex.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ts.stats)
}

// handleConfig allows runtime configuration of endpoints
func (ts *TestServer) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		var config map[string]*EndpointConfig
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		ts.mutex.Lock()
		for path, endpointConfig := range config {
			ts.responses[path] = endpointConfig
		}
		ts.mutex.Unlock()

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "configured"})
	} else {
		ts.mutex.RLock()
		defer ts.mutex.RUnlock()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ts.responses)
	}
}

// handleLargeResponse generates large responses for testing
func (ts *TestServer) handleLargeResponse(w http.ResponseWriter, r *http.Request) {
	ts.updateStats("/large")

	sizeStr := r.URL.Query().Get("size")
	size := 1024 // Default 1KB
	if sizeStr != "" {
		if parsedSize, err := strconv.Atoi(sizeStr); err == nil {
			size = parsedSize
		}
	}

	response := ts.generateLargeResponse(size)

	w.Header().Set("Content-Type", "application/json")
	ts.updateStatsCode(200)
	json.NewEncoder(w).Encode(response)
}

// handleSlowResponse simulates slow responses
func (ts *TestServer) handleSlowResponse(w http.ResponseWriter, r *http.Request) {
	ts.updateStats("/slow")

	delayStr := r.URL.Query().Get("delay")
	delay := 1000 // Default 1 second
	if delayStr != "" {
		if parsedDelay, err := strconv.Atoi(delayStr); err == nil {
			delay = parsedDelay
		}
	}

	time.Sleep(time.Duration(delay) * time.Millisecond)

	w.Header().Set("Content-Type", "application/json")
	ts.updateStatsCode(200)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "slow response",
		"delay":  delay,
	})
}

// handleErrorResponse simulates various error conditions
func (ts *TestServer) handleErrorResponse(w http.ResponseWriter, r *http.Request) {
	ts.updateStats("/error")

	codeStr := r.URL.Query().Get("code")
	code := 500 // Default server error
	if codeStr != "" {
		if parsedCode, err := strconv.Atoi(codeStr); err == nil {
			code = parsedCode
		}
	}

	ts.updateStatsCode(code)
	http.Error(w, fmt.Sprintf("Simulated error with code %d", code), code)
}

// ConfigureEndpoint sets configuration for a specific endpoint
func (ts *TestServer) ConfigureEndpoint(path string, config *EndpointConfig) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()
	ts.responses[path] = config
}

// getEndpointConfig retrieves configuration for an endpoint
func (ts *TestServer) getEndpointConfig(path string) *EndpointConfig {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	if config, exists := ts.responses[path]; exists {
		return config
	}

	// Return default configuration
	return &EndpointConfig{
		StatusCode:   ts.config.DefaultStatusCode,
		Delay:        ts.config.DefaultDelay,
		ResponseBody: nil,
		Headers:      make(map[string]string),
		FailureRate:  0.0,
		ResponseSize: ts.config.DefaultResponseSize,
	}
}

// shouldFail determines if a request should fail based on failure rate
func (ts *TestServer) shouldFail(failureRate float64) bool {
	// Simple pseudo-random failure simulation using nanoseconds
	// This gives us a more random distribution
	nanos := time.Now().UnixNano()
	return (nanos % 1000) < int64(failureRate*1000)
}

// generateLargeResponse creates a response of specified size
func (ts *TestServer) generateLargeResponse(size int) map[string]interface{} {
	data := make([]byte, size)
	for i := range data {
		data[i] = byte('A' + (i % 26))
	}

	return map[string]interface{}{
		"status": "success",
		"size":   size,
		"data":   string(data),
	}
}

// updateStats updates request statistics
func (ts *TestServer) updateStats(path string) {
	ts.stats.mutex.Lock()
	defer ts.stats.mutex.Unlock()

	ts.stats.TotalRequests++
	ts.stats.RequestsByPath[path]++
	ts.stats.LastRequestTime = time.Now()
}

// updateStatsCode updates status code statistics
func (ts *TestServer) updateStatsCode(code int) {
	ts.stats.mutex.Lock()
	defer ts.stats.mutex.Unlock()
	ts.stats.RequestsByCode[code]++
}

// Start starts the test server
func (ts *TestServer) Start() error {
	if ts.config.EnableLogging {
		fmt.Printf("Starting test server on port %d\n", ts.config.Port)
	}

	go func() {
		if err := ts.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("Test server error: %v\n", err)
		}
	}()

	// Wait a moment for server to start
	time.Sleep(100 * time.Millisecond)
	return nil
}

// Stop stops the test server
func (ts *TestServer) Stop() error {
	if ts.config.EnableLogging {
		fmt.Println("Stopping test server")
	}
	return ts.server.Close()
}

// GetStats returns current server statistics
func (ts *TestServer) GetStats() *ServerStats {
	ts.stats.mutex.RLock()
	defer ts.stats.mutex.RUnlock()

	// Create a copy to avoid race conditions
	statsCopy := &ServerStats{
		TotalRequests:   ts.stats.TotalRequests,
		RequestsByPath:  make(map[string]int64),
		RequestsByCode:  make(map[int]int64),
		StartTime:       ts.stats.StartTime,
		LastRequestTime: ts.stats.LastRequestTime,
	}

	for k, v := range ts.stats.RequestsByPath {
		statsCopy.RequestsByPath[k] = v
	}
	for k, v := range ts.stats.RequestsByCode {
		statsCopy.RequestsByCode[k] = v
	}

	return statsCopy
}

// GetURL returns the server URL
func (ts *TestServer) GetURL() string {
	return fmt.Sprintf("http://localhost:%d", ts.config.Port)
}

// Reset resets server statistics
func (ts *TestServer) Reset() {
	ts.stats.mutex.Lock()
	defer ts.stats.mutex.Unlock()

	ts.stats.TotalRequests = 0
	ts.stats.RequestsByPath = make(map[string]int64)
	ts.stats.RequestsByCode = make(map[int]int64)
	ts.stats.StartTime = time.Now()
	ts.stats.LastRequestTime = time.Time{}
}
