package engine

import (
	"http-load-test/internal/client"
	"http-load-test/internal/metrics"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewExecutionEngine(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config
	execConfig := &ExecutionConfig{
		TotalRequests:      10,
		ConcurrentRequests: 2,
		RequestsPerSecond:  5,
	}

	// Create execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)

	if engine == nil {
		t.Fatal("NewExecutionEngine returned nil")
	}

	if engine.client != httpClient {
		t.Error("HTTP client not properly assigned")
	}

	if engine.metricsCollector != metricsCollector {
		t.Error("Metrics collector not properly assigned")
	}

	if engine.config != execConfig {
		t.Error("Execution config not properly assigned")
	}

	if cap(engine.workerPool) != execConfig.ConcurrentRequests {
		t.Errorf("Expected worker pool capacity %d, got %d", execConfig.ConcurrentRequests, cap(engine.workerPool))
	}
}

func TestExecutionEngine_Start_RequestBased(t *testing.T) {
	// Create test server
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config
	execConfig := &ExecutionConfig{
		TotalRequests:      5,
		ConcurrentRequests: 2,
		RequestsPerSecond:  0, // No rate limiting
	}

	// Create and start execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)
	result, err := engine.Start()

	if err != nil {
		t.Fatalf("Execution failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected successful execution, got error: %s", result.Error)
	}

	if result.TotalRequests != 5 {
		t.Errorf("Expected 5 total requests, got %d", result.TotalRequests)
	}

	if result.CompletedRequests != 5 {
		t.Errorf("Expected 5 completed requests, got %d", result.CompletedRequests)
	}

	if result.Duration <= 0 {
		t.Errorf("Expected positive duration, got %v", result.Duration)
	}

	// Verify metrics
	summary := engine.GetFinalMetrics()
	if summary.TotalRequests != 5 {
		t.Errorf("Expected 5 requests in metrics, got %d", summary.TotalRequests)
	}

	if summary.SuccessfulReqs != 5 {
		t.Errorf("Expected 5 successful requests in metrics, got %d", summary.SuccessfulReqs)
	}
}

func TestExecutionEngine_Start_DurationBased(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config with duration
	execConfig := &ExecutionConfig{
		ConcurrentRequests: 2,
		RequestsPerSecond:  10, // 10 RPS
		TestDuration:       500 * time.Millisecond,
	}

	// Create and start execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)
	result, err := engine.Start()

	if err != nil {
		t.Fatalf("Execution failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected successful execution, got error: %s", result.Error)
	}

	// Should have made some requests in 500ms at 10 RPS
	if result.TotalRequests == 0 {
		t.Error("Expected some requests to be made")
	}

	// Duration should be close to 500ms
	expectedDuration := 500 * time.Millisecond
	tolerance := 200 * time.Millisecond
	if result.Duration < expectedDuration-tolerance || result.Duration > expectedDuration+tolerance {
		t.Errorf("Expected duration around %v, got %v", expectedDuration, result.Duration)
	}
}

func TestExecutionEngine_Start_RateLimiting(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config with low RPS
	execConfig := &ExecutionConfig{
		TotalRequests:      3,
		ConcurrentRequests: 1,
		RequestsPerSecond:  2, // 2 RPS - should take at least 1 second for 3 requests
	}

	// Create and start execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)
	startTime := time.Now()
	result, err := engine.Start()
	duration := time.Since(startTime)

	if err != nil {
		t.Fatalf("Execution failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected successful execution, got error: %s", result.Error)
	}

	// With 2 RPS, 3 requests should take at least 1 second
	minExpectedDuration := 1 * time.Second
	if duration < minExpectedDuration {
		t.Errorf("Expected duration >= %v with rate limiting, got %v", minExpectedDuration, duration)
	}
}

func TestExecutionEngine_Start_ConcurrentRequests(t *testing.T) {
	// Create test server with delay
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond) // Add delay to test concurrency
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)

	// Test with different concurrency levels
	testCases := []struct {
		name        string
		concurrent  int
		requests    int
		maxDuration time.Duration
	}{
		{
			name:        "Sequential (1 concurrent)",
			concurrent:  1,
			requests:    3,
			maxDuration: 400 * time.Millisecond, // 3 * 100ms + overhead
		},
		{
			name:        "Concurrent (3 concurrent)",
			concurrent:  3,
			requests:    3,
			maxDuration: 200 * time.Millisecond, // All parallel + overhead
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			execConfig := &ExecutionConfig{
				TotalRequests:      tc.requests,
				ConcurrentRequests: tc.concurrent,
				RequestsPerSecond:  0, // No rate limiting
			}

			engine := NewExecutionEngine(httpClient, metrics.NewMetricsCollector(), execConfig)
			startTime := time.Now()
			result, err := engine.Start()
			duration := time.Since(startTime)

			if err != nil {
				t.Fatalf("Execution failed: %v", err)
			}

			if !result.Success {
				t.Errorf("Expected successful execution, got error: %s", result.Error)
			}

			if duration > tc.maxDuration {
				t.Errorf("Expected duration <= %v, got %v", tc.maxDuration, duration)
			}
		})
	}
}

func TestExecutionEngine_Start_ErrorHandling(t *testing.T) {
	// Create test server that returns errors
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Server Error"))
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config
	execConfig := &ExecutionConfig{
		TotalRequests:      3,
		ConcurrentRequests: 1,
		RequestsPerSecond:  0,
	}

	// Create and start execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)
	result, err := engine.Start()

	if err != nil {
		t.Fatalf("Execution failed: %v", err)
	}

	if !result.Success {
		t.Errorf("Expected successful execution even with HTTP errors, got error: %s", result.Error)
	}

	// Verify metrics captured the errors
	summary := engine.GetFinalMetrics()
	if summary.FailedRequests != 3 {
		t.Errorf("Expected 3 failed requests in metrics, got %d", summary.FailedRequests)
	}

	if summary.StatusCodes[500] != 3 {
		t.Errorf("Expected 3 requests with status 500, got %d", summary.StatusCodes[500])
	}
}

func TestExecutionEngine_Stop(t *testing.T) {
	// Create test server with delay
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Second) // Long delay
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config with many requests
	execConfig := &ExecutionConfig{
		TotalRequests:      100,
		ConcurrentRequests: 1,
		RequestsPerSecond:  0,
	}

	// Create execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)

	// Start execution in goroutine
	resultChan := make(chan *ExecutionResult, 1)
	errorChan := make(chan error, 1)
	go func() {
		result, err := engine.Start()
		resultChan <- result
		errorChan <- err
	}()

	// Wait a bit then stop
	time.Sleep(100 * time.Millisecond)
	engine.Stop()

	// Wait for completion
	select {
	case result := <-resultChan:
		err := <-errorChan
		if err == nil {
			t.Error("Expected error when stopping execution")
		}
		if result.Success {
			t.Error("Expected unsuccessful result when stopping execution")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Execution did not stop within timeout")
	}
}

func TestExecutionEngine_GetStatus(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config
	execConfig := &ExecutionConfig{
		TotalRequests:      5,
		ConcurrentRequests: 1,
		RequestsPerSecond:  0,
	}

	// Create execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)

	// Check initial status
	running, sent, completed := engine.GetStatus()
	if running {
		t.Error("Expected engine not to be running initially")
	}
	if sent != 0 || completed != 0 {
		t.Errorf("Expected 0 sent and completed initially, got sent=%d, completed=%d", sent, completed)
	}

	// Start execution in goroutine
	done := make(chan bool)
	go func() {
		engine.Start()
		done <- true
	}()

	// Check status during execution
	time.Sleep(100 * time.Millisecond)
	running, sent, completed = engine.GetStatus()
	if !running {
		t.Error("Expected engine to be running during execution")
	}

	// Wait for completion
	<-done

	// Check final status
	running, sent, completed = engine.GetStatus()
	if running {
		t.Error("Expected engine not to be running after completion")
	}
	if sent != 5 {
		t.Errorf("Expected 5 requests sent, got %d", sent)
	}
	if completed != 5 {
		t.Errorf("Expected 5 requests completed, got %d", completed)
	}
}

func TestExecutionEngine_GetRealTimeMetrics(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config
	execConfig := &ExecutionConfig{
		TotalRequests:      3,
		ConcurrentRequests: 1,
		RequestsPerSecond:  0,
	}

	// Create execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)

	// Start execution in goroutine
	done := make(chan bool)
	go func() {
		engine.Start()
		done <- true
	}()

	// Get real-time metrics during execution
	time.Sleep(50 * time.Millisecond)
	stats := engine.GetRealTimeMetrics()

	if stats.ElapsedTime <= 0 {
		t.Error("Expected positive elapsed time")
	}

	// Wait for completion
	<-done

	// Get final real-time metrics
	finalStats := engine.GetRealTimeMetrics()
	if finalStats.CompletedRequests != 3 {
		t.Errorf("Expected 3 completed requests in final stats, got %d", finalStats.CompletedRequests)
	}
}

func TestExecutionEngine_AlreadyRunning(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create client and metrics collector
	config := &client.TestConfig{
		URL:     server.URL,
		Method:  "GET",
		Timeout: 10 * time.Second,
	}
	httpClient := client.NewHTTPClient(config)
	metricsCollector := metrics.NewMetricsCollector()

	// Create execution config
	execConfig := &ExecutionConfig{
		TotalRequests:      5,
		ConcurrentRequests: 1,
		RequestsPerSecond:  0,
	}

	// Create execution engine
	engine := NewExecutionEngine(httpClient, metricsCollector, execConfig)

	// Start first execution in goroutine
	done := make(chan bool)
	go func() {
		engine.Start()
		done <- true
	}()

	// Try to start again while running
	time.Sleep(50 * time.Millisecond)
	result, err := engine.Start()

	if err == nil {
		t.Error("Expected error when starting already running engine")
	}

	if result != nil {
		t.Error("Expected nil result when starting already running engine")
	}

	// Wait for first execution to complete
	<-done
}