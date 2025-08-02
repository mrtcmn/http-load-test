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

func TestNewMetricsStreamer(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	config := DefaultStreamingConfig()

	streamer := NewMetricsStreamer(server, collector, config)

	if streamer == nil {
		t.Fatal("NewMetricsStreamer returned nil")
	}

	if streamer.server != server {
		t.Error("Streamer server not set correctly")
	}

	if streamer.collector != collector {
		t.Error("Streamer collector not set correctly")
	}

	if streamer.config.UpdateInterval != config.UpdateInterval {
		t.Error("Streamer config not set correctly")
	}
}

func TestDefaultStreamingConfig(t *testing.T) {
	config := DefaultStreamingConfig()

	if config.UpdateInterval != 500*time.Millisecond {
		t.Errorf("Expected update interval 500ms, got %v", config.UpdateInterval)
	}

	if config.BufferSize != 1000 {
		t.Errorf("Expected buffer size 1000, got %d", config.BufferSize)
	}

	if config.MaxBufferedEvents != 100 {
		t.Errorf("Expected max buffered events 100, got %d", config.MaxBufferedEvents)
	}
}

func TestStreamerStartStop(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	config := DefaultStreamingConfig()

	streamer := NewMetricsStreamer(server, collector, config)

	// Initially not streaming
	if streamer.IsStreaming() {
		t.Error("Streamer should not be streaming initially")
	}

	// Start streaming
	err := streamer.Start()
	if err != nil {
		t.Fatalf("Failed to start streaming: %v", err)
	}

	if !streamer.IsStreaming() {
		t.Error("Streamer should be streaming after Start()")
	}

	// Stop streaming
	streamer.Stop()

	if streamer.IsStreaming() {
		t.Error("Streamer should not be streaming after Stop()")
	}
}

func TestStreamerDoubleStart(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	config := DefaultStreamingConfig()

	streamer := NewMetricsStreamer(server, collector, config)

	// Start streaming twice
	err1 := streamer.Start()
	err2 := streamer.Start()

	if err1 != nil {
		t.Fatalf("First start failed: %v", err1)
	}

	if err2 != nil {
		t.Fatalf("Second start failed: %v", err2)
	}

	if !streamer.IsStreaming() {
		t.Error("Streamer should be streaming after double start")
	}

	streamer.Stop()
}

func TestMetricsBuffering(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	config := StreamingConfig{
		UpdateInterval:    100 * time.Millisecond,
		BufferSize:        10,
		MaxBufferedEvents: 5, // Small buffer for testing
	}

	streamer := NewMetricsStreamer(server, collector, config)

	// Add some test data to collector
	collector.Start()
	for i := 0; i < 3; i++ {
		collector.AddResult(time.Duration(i*100)*time.Millisecond, 200, true, "")
	}

	// Manually add to buffer to test buffering logic
	for i := 0; i < 7; i++ { // More than MaxBufferedEvents
		stats := collector.GetRealTimeStats()
		streamer.addToBuffer(stats)
	}

	// Check buffer size is limited
	bufferSize := streamer.getBufferSize()
	if bufferSize != config.MaxBufferedEvents {
		t.Errorf("Expected buffer size %d, got %d", config.MaxBufferedEvents, bufferSize)
	}

	// Get buffered metrics
	buffered := streamer.GetBufferedMetrics()
	if len(buffered) != config.MaxBufferedEvents {
		t.Errorf("Expected %d buffered metrics, got %d", config.MaxBufferedEvents, len(buffered))
	}

	// Clear buffer
	streamer.ClearBuffer()
	if streamer.getBufferSize() != 0 {
		t.Error("Buffer should be empty after ClearBuffer()")
	}
}

func TestRealTimeStreaming(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	server.Start()

	config := StreamingConfig{
		UpdateInterval:    200 * time.Millisecond, // Fast updates for testing
		BufferSize:        100,
		MaxBufferedEvents: 50,
	}

	streamer := NewMetricsStreamer(server, collector, config)

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

	// Add test data and start streaming
	collector.Start()
	collector.AddResult(100*time.Millisecond, 200, true, "")
	collector.AddResult(150*time.Millisecond, 200, true, "")

	err = streamer.Start()
	if err != nil {
		t.Fatalf("Failed to start streaming: %v", err)
	}
	defer streamer.Stop()

	// Wait for at least one update
	time.Sleep(300 * time.Millisecond)

	// Set read deadline and try to read a message
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	_, message, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read streaming message: %v", err)
	}

	// Try to parse as enhanced metrics message
	var enhancedMsg EnhancedMetricsMessage
	if err := json.Unmarshal(message, &enhancedMsg); err != nil {
		// If that fails, try regular metrics message
		var regularMsg MetricsMessage
		if err := json.Unmarshal(message, &regularMsg); err != nil {
			t.Fatalf("Failed to unmarshal message as either enhanced or regular metrics: %v", err)
		}

		// Verify regular message
		if regularMsg.Type != "metrics" {
			t.Errorf("Expected message type 'metrics', got '%s'", regularMsg.Type)
		}
	} else {
		// Verify enhanced message
		if enhancedMsg.Type != "metrics" {
			t.Errorf("Expected message type 'metrics', got '%s'", enhancedMsg.Type)
		}

		if enhancedMsg.Data.CompletedRequests != 2 {
			t.Errorf("Expected 2 completed requests, got %d", enhancedMsg.Data.CompletedRequests)
		}

		if enhancedMsg.Metadata.Connections != 1 {
			t.Errorf("Expected 1 connection in metadata, got %d", enhancedMsg.Metadata.Connections)
		}
	}
}

func TestForceUpdate(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	server.Start()

	config := DefaultStreamingConfig()
	streamer := NewMetricsStreamer(server, collector, config)

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

	// Add test data and start streaming
	collector.Start()
	collector.AddResult(100*time.Millisecond, 200, true, "")

	err = streamer.Start()
	if err != nil {
		t.Fatalf("Failed to start streaming: %v", err)
	}
	defer streamer.Stop()

	// Force an immediate update
	streamer.ForceUpdate()

	// Give some time for the update to be processed
	time.Sleep(100 * time.Millisecond)

	// Set read deadline and try to read a message
	conn.SetReadDeadline(time.Now().Add(1 * time.Second))

	_, message, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read forced update message: %v", err)
	}

	// Verify we got a metrics message
	var msg map[string]interface{}
	if err := json.Unmarshal(message, &msg); err != nil {
		t.Fatalf("Failed to unmarshal message: %v", err)
	}

	if msg["type"] != "metrics" {
		t.Errorf("Expected message type 'metrics', got '%v'", msg["type"])
	}
}

func TestStreamingStats(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	config := DefaultStreamingConfig()

	streamer := NewMetricsStreamer(server, collector, config)

	// Get stats before starting
	stats := streamer.GetStreamingStats()
	if stats.IsActive {
		t.Error("Streaming should not be active initially")
	}

	// Start streaming
	streamer.Start()
	defer streamer.Stop()

	// Get stats after starting
	stats = streamer.GetStreamingStats()
	if !stats.IsActive {
		t.Error("Streaming should be active after start")
	}

	if stats.UpdateInterval != config.UpdateInterval {
		t.Errorf("Expected update interval %v, got %v", config.UpdateInterval, stats.UpdateInterval)
	}

	if stats.MaxBuffer != config.MaxBufferedEvents {
		t.Errorf("Expected max buffer %d, got %d", config.MaxBufferedEvents, stats.MaxBuffer)
	}
}

func TestUpdateConfig(t *testing.T) {
	collector := metrics.NewMetricsCollector()
	server := NewServer(collector)
	config := DefaultStreamingConfig()

	streamer := NewMetricsStreamer(server, collector, config)

	// Update configuration
	newConfig := StreamingConfig{
		UpdateInterval:    1 * time.Second,
		BufferSize:        2000,
		MaxBufferedEvents: 200,
	}

	streamer.UpdateConfig(newConfig)

	// Verify configuration was updated
	stats := streamer.GetStreamingStats()
	if stats.UpdateInterval != newConfig.UpdateInterval {
		t.Errorf("Expected update interval %v, got %v", newConfig.UpdateInterval, stats.UpdateInterval)
	}

	if stats.MaxBuffer != newConfig.MaxBufferedEvents {
		t.Errorf("Expected max buffer %d, got %d", newConfig.MaxBufferedEvents, stats.MaxBuffer)
	}
}
