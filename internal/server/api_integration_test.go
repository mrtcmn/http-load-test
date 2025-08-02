package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"http-load-test/internal/metrics"
)

// TestAPIIntegration tests the complete API integration
func TestAPIIntegration(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Add some test data
	metricsCollector.Start()
	metricsCollector.AddResult(100*time.Millisecond, 200, true, "")
	metricsCollector.AddResult(150*time.Millisecond, 200, true, "")
	metricsCollector.AddResult(200*time.Millisecond, 500, false, "Server Error")

	// Test 1: Health endpoint
	t.Run("Health endpoint", func(t *testing.T) {
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
	})

	// Test 2: Status endpoint
	t.Run("Status endpoint", func(t *testing.T) {
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

		// Verify response structure
		data, ok := response.Data.(map[string]interface{})
		if !ok {
			t.Fatal("Response data should be a map")
		}

		if _, exists := data["status"]; !exists {
			t.Error("Response should contain status field")
		}

		if _, exists := data["realtimeStats"]; !exists {
			t.Error("Response should contain realtimeStats field")
		}
	})

	// Test 3: Results endpoint with realtime data
	t.Run("Results endpoint - realtime", func(t *testing.T) {
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

		data, ok := response.Data.(map[string]interface{})
		if !ok {
			t.Fatal("Response data should be a map")
		}

		if data["type"] != "realtime" {
			t.Error("Expected type to be 'realtime'")
		}
	})

	// Test 4: Results endpoint with final results
	t.Run("Results endpoint - final", func(t *testing.T) {
		// Set final results
		finalResults := &metrics.MetricsSummary{
			TotalRequests:     100,
			SuccessfulReqs:    95,
			FailedRequests:    5,
			Duration:          time.Minute,
			RequestsPerSecond: 1.67,
		}
		server.SetFinalResults(finalResults)

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

		data, ok := response.Data.(map[string]interface{})
		if !ok {
			t.Fatal("Response data should be a map")
		}

		if data["type"] != "final" {
			t.Error("Expected type to be 'final'")
		}
	})

	// Test 5: Export endpoint - JSON
	t.Run("Export endpoint - JSON", func(t *testing.T) {
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
	})

	// Test 6: Export endpoint - CSV
	t.Run("Export endpoint - CSV", func(t *testing.T) {
		exportReq := map[string]string{
			"format": "csv",
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
		if contentType != "text/csv" {
			t.Errorf("Expected Content-Type text/csv, got %s", contentType)
		}
	})
}

// TestAPIErrorHandling tests error handling across all endpoints
func TestAPIErrorHandling(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	// Test invalid methods
	endpoints := []string{"/api/status", "/api/results", "/api/health"}
	for _, endpoint := range endpoints {
		t.Run("Invalid method for "+endpoint, func(t *testing.T) {
			req := httptest.NewRequest("POST", endpoint, nil)
			w := httptest.NewRecorder()

			switch endpoint {
			case "/api/status":
				server.handleStatus(w, req)
			case "/api/results":
				server.handleResults(w, req)
			case "/api/health":
				server.handleHealth(w, req)
			}

			if w.Code != http.StatusMethodNotAllowed {
				t.Errorf("Expected status 405 for %s, got %d", endpoint, w.Code)
			}
		})
	}

	// Test export with invalid format
	t.Run("Export with invalid format", func(t *testing.T) {
		exportReq := map[string]string{
			"format": "xml",
			"type":   "realtime",
		}
		reqBody, _ := json.Marshal(exportReq)

		req := httptest.NewRequest("POST", "/api/export", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		server.handleExport(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", w.Code)
		}
	})

	// Test export with invalid JSON
	t.Run("Export with invalid JSON", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/export", bytes.NewReader([]byte("invalid json")))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		server.handleExport(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", w.Code)
		}
	})
}

// TestAPIResponseFormat tests that all API responses follow the standard format
func TestAPIResponseFormat(t *testing.T) {
	metricsCollector := metrics.NewMetricsCollector()
	server := NewServer(8080, metricsCollector)

	endpoints := []struct {
		method  string
		path    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"GET", "/api/status", server.handleStatus},
		{"GET", "/api/results", server.handleResults},
		{"GET", "/api/health", server.handleHealth},
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint.path, func(t *testing.T) {
			req := httptest.NewRequest(endpoint.method, endpoint.path, nil)
			w := httptest.NewRecorder()
			endpoint.handler(w, req)

			// Check content type
			contentType := w.Header().Get("Content-Type")
			if contentType != "application/json" {
				t.Errorf("Expected Content-Type application/json, got %s", contentType)
			}

			// Check response structure
			var response APIResponse
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatalf("Failed to parse JSON response: %v", err)
			}

			// All successful responses should have Success: true
			if w.Code < 400 && !response.Success {
				t.Error("Successful response should have Success: true")
			}

			// Error responses should have Success: false
			if w.Code >= 400 && response.Success {
				t.Error("Error response should have Success: false")
			}
		})
	}
}
