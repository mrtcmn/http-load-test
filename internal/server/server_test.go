package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"http-load-test/internal/metrics"
)

func TestNewServer(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	if server == nil {
		t.Fatal("NewServer returned nil")
	}

	if server.port != 8080 {
		t.Errorf("Expected port 8080, got %d", server.port)
	}

	if server.metrics != metricsCollector {
		t.Error("Metrics collector not set correctly")
	}

	if server.isRunning {
		t.Error("Server should not be running initially")
	}

	if server.wsServer == nil {
		t.Error("WebSocket server not initialized")
	}
}

func TestServerStartStop(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(0, metricsCollector) // Use port 0 for automatic assignment

	// Test start
	err := server.Start()
	if err != nil {
		t.Fatalf("Failed to start server: %v", err)
	}

	if !server.IsRunning() {
		t.Error("Server should be running after start")
	}

	// Test double start
	err = server.Start()
	if err == nil {
		t.Error("Expected error when starting already running server")
	}

	// Test stop
	err = server.Stop()
	if err != nil {
		t.Fatalf("Failed to stop server: %v", err)
	}

	if server.IsRunning() {
		t.Error("Server should not be running after stop")
	}

	// Test double stop
	err = server.Stop()
	if err != nil {
		t.Errorf("Unexpected error when stopping already stopped server: %v", err)
	}
}

func TestCORSMiddleware(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Create a test handler
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("test"))
	})

	// Wrap with CORS middleware
	handler := server.corsMiddleware(testHandler)

	// Test regular request
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Check CORS headers
	expectedHeaders := map[string]string{
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
		"Access-Control-Max-Age":       "86400",
	}

	for header, expectedValue := range expectedHeaders {
		if got := w.Header().Get(header); got != expectedValue {
			t.Errorf("Expected %s header to be %s, got %s", header, expectedValue, got)
		}
	}

	// Test OPTIONS request
	req = httptest.NewRequest("OPTIONS", "/test", nil)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for OPTIONS request, got %d", w.Code)
	}
}

func TestSecurityMiddleware(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Create a test handler
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Wrap with security middleware
	handler := server.securityMiddleware(testHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Check security headers
	expectedHeaders := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"X-XSS-Protection":       "1; mode=block",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
	}

	for header, expectedValue := range expectedHeaders {
		if got := w.Header().Get(header); got != expectedValue {
			t.Errorf("Expected %s header to be %s, got %s", header, expectedValue, got)
		}
	}

	// Check CSP header exists
	csp := w.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Error("Content-Security-Policy header not set")
	}

	if !strings.Contains(csp, "default-src 'self'") {
		t.Error("CSP should contain default-src 'self'")
	}
}

func TestHandleStatus(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Test GET request
	req := httptest.NewRequest("GET", "/api/status", nil)
	w := httptest.NewRecorder()
	server.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response APIResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if !response.Success {
		t.Error("Expected successful response")
	}

	// Check response structure
	data, ok := response.Data.(map[string]interface{})
	if !ok {
		t.Fatal("Response data is not a map")
	}

	if _, exists := data["status"]; !exists {
		t.Error("Response should contain status field")
	}

	if _, exists := data["connections"]; !exists {
		t.Error("Response should contain connections field")
	}

	// Test invalid method
	req = httptest.NewRequest("POST", "/api/status", nil)
	w = httptest.NewRecorder()
	server.handleStatus(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", w.Code)
	}
}

func TestHandleResults(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Test with no results
	req := httptest.NewRequest("GET", "/api/results", nil)
	w := httptest.NewRecorder()
	server.handleResults(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response APIResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should return realtime stats when no final results
	data, ok := response.Data.(map[string]interface{})
	if !ok {
		t.Fatal("Response data is not a map")
	}

	if data["type"] != "realtime" {
		t.Error("Expected type to be 'realtime'")
	}

	// Test with final results
	finalResults := &metrics.MetricsSummary{
		TotalRequests:     100,
		SuccessfulReqs:    95,
		FailedRequests:    5,
		Duration:          time.Minute,
		RequestsPerSecond: 1.67,
	}
	server.SetFinalResults(finalResults)

	req = httptest.NewRequest("GET", "/api/results", nil)
	w = httptest.NewRecorder()
	server.handleResults(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	data, ok = response.Data.(map[string]interface{})
	if !ok {
		t.Fatal("Response data is not a map")
	}

	if data["type"] != "final" {
		t.Error("Expected type to be 'final'")
	}

	// Test invalid method
	req = httptest.NewRequest("POST", "/api/results", nil)
	w = httptest.NewRecorder()
	server.handleResults(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", w.Code)
	}
}

func TestHandleExport(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Add some test data to metrics
	metricsCollector.Start()
	metricsCollector.AddResult(100*time.Millisecond, 200, true, "")
	metricsCollector.AddResult(150*time.Millisecond, 200, true, "")
	metricsCollector.AddResult(200*time.Millisecond, 500, false, "Server Error")

	// Test JSON export
	exportReq := map[string]string{
		"format": "json",
		"type":   "realtime",
	}
	reqBody, _ := json.Marshal(exportReq)

	req := httptest.NewRequest("POST", "/api/export", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	server.handleExport(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", contentType)
	}

	contentDisposition := w.Header().Get("Content-Disposition")
	if !strings.Contains(contentDisposition, "attachment") {
		t.Error("Expected Content-Disposition to contain 'attachment'")
	}

	// Test CSV export
	exportReq["format"] = "csv"
	reqBody, _ = json.Marshal(exportReq)

	req = httptest.NewRequest("POST", "/api/export", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	server.handleExport(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	contentType = w.Header().Get("Content-Type")
	if contentType != "text/csv" {
		t.Errorf("Expected Content-Type text/csv, got %s", contentType)
	}

	// Verify CSV content structure
	csvContent := w.Body.String()
	if !strings.Contains(csvContent, "Metric,Value,Unit") {
		t.Error("CSV should contain header row")
	}

	// Test invalid format
	exportReq["format"] = "xml"
	reqBody, _ = json.Marshal(exportReq)

	req = httptest.NewRequest("POST", "/api/export", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	server.handleExport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	// Test invalid method
	req = httptest.NewRequest("GET", "/api/export", nil)
	w = httptest.NewRecorder()
	server.handleExport(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", w.Code)
	}

	// Test invalid JSON
	req = httptest.NewRequest("POST", "/api/export", strings.NewReader("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	server.handleExport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

func TestHandleHealth(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	req := httptest.NewRequest("GET", "/api/health", nil)
	w := httptest.NewRecorder()
	server.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response APIResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if !response.Success {
		t.Error("Expected successful response")
	}

	data, ok := response.Data.(map[string]interface{})
	if !ok {
		t.Fatal("Response data is not a map")
	}

	expectedFields := []string{"status", "timestamp", "version", "connections", "uptime"}
	for _, field := range expectedFields {
		if _, exists := data[field]; !exists {
			t.Errorf("Health response should contain %s field", field)
		}
	}

	if data["status"] != "healthy" {
		t.Error("Expected status to be 'healthy'")
	}

	// Test invalid method
	req = httptest.NewRequest("POST", "/api/health", nil)
	w = httptest.NewRecorder()
	server.handleHealth(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", w.Code)
	}
}

func TestUpdateTestStatus(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Test initial status
	if server.testStatus.IsRunning {
		t.Error("Initial test status should not be running")
	}

	// Update status
	newStatus := TestStatus{
		IsRunning: true,
		StartTime: time.Now(),
		Message:   "Test in progress",
	}
	server.UpdateTestStatus(newStatus)

	if !server.testStatus.IsRunning {
		t.Error("Test status should be running after update")
	}

	if server.testStatus.Message != "Test in progress" {
		t.Error("Test status message not updated correctly")
	}
}

func TestSetFinalResults(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Set running status first
	server.UpdateTestStatus(TestStatus{IsRunning: true})

	if !server.testStatus.IsRunning {
		t.Error("Test should be running before setting final results")
	}

	// Set final results
	results := &metrics.MetricsSummary{
		TotalRequests:  100,
		SuccessfulReqs: 95,
		FailedRequests: 5,
	}
	server.SetFinalResults(results)

	if server.finalResults != results {
		t.Error("Final results not set correctly")
	}

	if server.testStatus.IsRunning {
		t.Error("Test status should not be running after setting final results")
	}
}

func TestStaticFileServing(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Create a test server to test static file serving
	mux := http.NewServeMux()
	server.setupRoutes(mux)

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	// Should serve the index.html file
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for static file, got %d", w.Code)
	}

	// Check if it's HTML content
	contentType := w.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		t.Errorf("Expected HTML content type, got %s", contentType)
	}

	// Check if it contains expected HTML content
	body := w.Body.String()
	if !strings.Contains(body, "HTTP Load Test - Dashboard") {
		t.Error("Static file should contain expected title")
	}
}

func TestAPIResponseHelpers(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Test writeJSONResponse
	w := httptest.NewRecorder()
	testData := map[string]string{"test": "data"}
	server.writeJSONResponse(w, http.StatusOK, testData)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", contentType)
	}

	var response APIResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if !response.Success {
		t.Error("Expected successful response")
	}

	// Test writeErrorResponse
	w = httptest.NewRecorder()
	server.writeErrorResponse(w, http.StatusBadRequest, "Test error")

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if response.Success {
		t.Error("Expected unsuccessful response")
	}

	if response.Error != "Test error" {
		t.Errorf("Expected error message 'Test error', got %s", response.Error)
	}
}

func TestCSVExport(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Test MetricsSummary CSV export
	summary := &metrics.MetricsSummary{
		TotalRequests:     100,
		SuccessfulReqs:    95,
		FailedRequests:    5,
		Duration:          time.Minute,
		RequestsPerSecond: 1.67,
		Percentiles: metrics.PercentileMetrics{
			P50: 100 * time.Millisecond,
			P95: 200 * time.Millisecond,
			P99: 300 * time.Millisecond,
			Min: 50 * time.Millisecond,
			Max: 400 * time.Millisecond,
			Avg: 150 * time.Millisecond,
		},
		StatusCodes: map[int]int{200: 95, 500: 5},
		Errors:      map[string]int{"Server Error": 5},
	}

	w := httptest.NewRecorder()
	server.exportCSV(w, summary, "test.csv")

	csvContent := w.Body.String()

	// Check CSV structure
	lines := strings.Split(csvContent, "\n")
	if len(lines) < 10 {
		t.Error("CSV should have multiple lines")
	}

	// Check header
	if !strings.Contains(lines[0], "Metric,Value,Unit") {
		t.Error("CSV should start with header row")
	}

	// Check some data rows
	if !strings.Contains(csvContent, "Total Requests,100,count") {
		t.Error("CSV should contain total requests data")
	}

	if !strings.Contains(csvContent, "Status Code,Count,count") {
		t.Error("CSV should contain status code header")
	}

	if !strings.Contains(csvContent, "200,95,count") {
		t.Error("CSV should contain status code data")
	}
}

func BenchmarkHandleStatus(b *testing.B) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	req := httptest.NewRequest("GET", "/api/status", nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := httptest.NewRecorder()
		server.handleStatus(w, req)
	}
}

func BenchmarkHandleExportJSON(b *testing.B) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Add some test data
	metricsCollector.Start()
	for i := 0; i < 1000; i++ {
		metricsCollector.AddResult(time.Duration(i)*time.Millisecond, 200, true, "")
	}

	exportReq := map[string]string{
		"format": "json",
		"type":   "realtime",
	}
	reqBody, _ := json.Marshal(exportReq)

	req := httptest.NewRequest("POST", "/api/export", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := httptest.NewRecorder()
		// Create a new request for each iteration
		newReq := httptest.NewRequest("POST", "/api/export", bytes.NewReader(reqBody))
		newReq.Header.Set("Content-Type", "application/json")
		server.handleExport(w, newReq)
	}
}
