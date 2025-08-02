package websocket

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"http-load-test/internal/metrics"

	"github.com/gorilla/websocket"
)

func TestNewServer(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)

	if server == nil {
		t.Fatal("NewServer returned nil")
	}

	if server.metrics != collector {
		t.Error("Server metrics collector not set correctly")
	}

	if len(server.connections) != 0 {
		t.Error("Server should start with no connections")
	}
}

func TestWebSocketUpgrade(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	server.Start()

	// Create test server
	testServer := httptest.NewServer(http.HandlerFunc(server.HandleWebSocket))
	defer testServer.Close()

	// Convert http://127.0.0.1 to ws://127.0.0.1
	url := "ws" + strings.TrimPrefix(testServer.URL, "http")

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	// Give some time for connection to register
	time.Sleep(100 * time.Millisecond)

	// Check connection count
	if server.GetConnectionCount() != 1 {
		t.Errorf("Expected 1 connection, got %d", server.GetConnectionCount())
	}
}

func TestMetricsBroadcast(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	collector.Start()

	// Add some test data
	collector.AddResult(100*time.Millisecond, 200, true, "")
	collector.AddResult(150*time.Millisecond, 200, true, "")

	server := NewServer(collector)
	server.Start()

	// Create test server
	testServer := httptest.NewServer(http.HandlerFunc(server.HandleWebSocket))
	defer testServer.Close()

	// Convert http://127.0.0.1 to ws://127.0.0.1
	url := "ws" + strings.TrimPrefix(testServer.URL, "http")

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	// Give some time for connection to register
	time.Sleep(100 * time.Millisecond)

	// Broadcast metrics
	server.BroadcastMetrics()

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read message
	_, message, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	// Parse message
	var metricsMsg MetricsMessage
	if err := json.Unmarshal(message, &metricsMsg); err != nil {
		t.Fatalf("Failed to unmarshal message: %v", err)
	}

	// Verify message type
	if metricsMsg.Type != "metrics" {
		t.Errorf("Expected message type 'metrics', got '%s'", metricsMsg.Type)
	}

	// Verify metrics data
	if metricsMsg.Data.CompletedRequests != 2 {
		t.Errorf("Expected 2 completed requests, got %d", metricsMsg.Data.CompletedRequests)
	}

	if metricsMsg.Data.SuccessfulReqs != 2 {
		t.Errorf("Expected 2 successful requests, got %d", metricsMsg.Data.SuccessfulReqs)
	}
}

func TestTestCompleteBroadcast(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	collector.Start()
	collector.AddResult(100*time.Millisecond, 200, true, "")
	collector.End()

	server := NewServer(collector)
	server.Start()

	// Create test server
	testServer := httptest.NewServer(http.HandlerFunc(server.HandleWebSocket))
	defer testServer.Close()

	// Convert http://127.0.0.1 to ws://127.0.0.1
	url := "ws" + strings.TrimPrefix(testServer.URL, "http")

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	// Give some time for connection to register
	time.Sleep(100 * time.Millisecond)

	// Broadcast test complete
	summary := collector.GetSummary()
	server.BroadcastTestComplete(summary)

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read message
	_, message, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	// Parse message
	var completeMsg TestCompleteMessage
	if err := json.Unmarshal(message, &completeMsg); err != nil {
		t.Fatalf("Failed to unmarshal message: %v", err)
	}

	// Verify message type
	if completeMsg.Type != "test_complete" {
		t.Errorf("Expected message type 'test_complete', got '%s'", completeMsg.Type)
	}

	// Verify summary data
	if completeMsg.Summary.TotalRequests != 1 {
		t.Errorf("Expected 1 total request, got %d", completeMsg.Summary.TotalRequests)
	}
}

func TestErrorBroadcast(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	server.Start()

	// Create test server
	testServer := httptest.NewServer(http.HandlerFunc(server.HandleWebSocket))
	defer testServer.Close()

	// Convert http://127.0.0.1 to ws://127.0.0.1
	url := "ws" + strings.TrimPrefix(testServer.URL, "http")

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	// Give some time for connection to register
	time.Sleep(100 * time.Millisecond)

	// Broadcast error
	errorMsg := "Test error message"
	server.BroadcastError(errorMsg)

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read message
	_, message, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	// Parse message
	var errMsg ErrorMessage
	if err := json.Unmarshal(message, &errMsg); err != nil {
		t.Fatalf("Failed to unmarshal message: %v", err)
	}

	// Verify message type
	if errMsg.Type != "error" {
		t.Errorf("Expected message type 'error', got '%s'", errMsg.Type)
	}

	// Verify error message
	if errMsg.Error != errorMsg {
		t.Errorf("Expected error message '%s', got '%s'", errorMsg, errMsg.Error)
	}
}

func TestConnectionLifecycle(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	server.Start()

	// Create test server
	testServer := httptest.NewServer(http.HandlerFunc(server.HandleWebSocket))
	defer testServer.Close()

	// Convert http://127.0.0.1 to ws://127.0.0.1
	url := "ws" + strings.TrimPrefix(testServer.URL, "http")

	// Connect multiple clients
	conn1, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect client 1: %v", err)
	}

	conn2, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect client 2: %v", err)
	}

	// Give some time for connections to register
	time.Sleep(100 * time.Millisecond)

	// Check connection count
	if server.GetConnectionCount() != 2 {
		t.Errorf("Expected 2 connections, got %d", server.GetConnectionCount())
	}

	// Close one connection
	conn1.Close()
	time.Sleep(100 * time.Millisecond)

	// Check connection count
	if server.GetConnectionCount() != 1 {
		t.Errorf("Expected 1 connection after closing one, got %d", server.GetConnectionCount())
	}

	// Close second connection
	conn2.Close()
	time.Sleep(100 * time.Millisecond)

	// Check connection count
	if server.GetConnectionCount() != 0 {
		t.Errorf("Expected 0 connections after closing all, got %d", server.GetConnectionCount())
	}
}

func TestGenerateConnectionID(t *testing.T) {
	id1 := generateConnectionID()
	id2 := generateConnectionID()

	if id1 == id2 {
		t.Error("Generated connection IDs should be unique")
	}

	if len(id1) != 16 { // 8 bytes = 16 hex characters
		t.Errorf("Expected connection ID length 16, got %d", len(id1))
	}
}
