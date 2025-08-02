package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"http-load-test/internal/metrics"
)

// StreamingConfig holds configuration for the metrics streaming system
type StreamingConfig struct {
	UpdateInterval    time.Duration // How often to broadcast metrics
	BufferSize        int           // Size of the metrics buffer
	MaxBufferedEvents int           // Maximum events to buffer before dropping
}

// DefaultStreamingConfig returns a default streaming configuration
func DefaultStreamingConfig() StreamingConfig {
	return StreamingConfig{
		UpdateInterval:    500 * time.Millisecond, // Update every 500ms
		BufferSize:        1000,                   // Buffer up to 1000 metrics
		MaxBufferedEvents: 100,                    // Keep last 100 events
	}
}

// MetricsStreamer manages real-time metrics streaming
type MetricsStreamer struct {
	server    *Server
	collector *metrics.MetricsCollector
	config    StreamingConfig

	// Streaming state
	isStreaming bool
	mutex       sync.RWMutex
	ctx         context.Context
	cancel      context.CancelFunc

	// Buffering system
	metricsBuffer []metrics.RealtimeStats
	bufferMutex   sync.RWMutex
	lastUpdate    time.Time
}

// NewMetricsStreamer creates a new metrics streaming manager
func NewMetricsStreamer(server *Server, collector *metrics.MetricsCollector, config StreamingConfig) *MetricsStreamer {
	return &MetricsStreamer{
		server:        server,
		collector:     collector,
		config:        config,
		metricsBuffer: make([]metrics.RealtimeStats, 0, config.BufferSize),
	}
}

// Start begins the metrics streaming process
func (ms *MetricsStreamer) Start() error {
	ms.mutex.Lock()
	defer ms.mutex.Unlock()

	if ms.isStreaming {
		return nil // Already streaming
	}

	ms.ctx, ms.cancel = context.WithCancel(context.Background())
	ms.isStreaming = true
	ms.lastUpdate = time.Now()

	// Start the streaming goroutine
	go ms.streamingLoop()

	log.Printf("Metrics streaming started with %v update interval", ms.config.UpdateInterval)
	return nil
}

// Stop halts the metrics streaming process
func (ms *MetricsStreamer) Stop() {
	ms.mutex.Lock()
	defer ms.mutex.Unlock()

	if !ms.isStreaming {
		return // Not streaming
	}

	ms.cancel()
	ms.isStreaming = false

	log.Printf("Metrics streaming stopped")
}

// IsStreaming returns whether the streamer is currently active
func (ms *MetricsStreamer) IsStreaming() bool {
	ms.mutex.RLock()
	defer ms.mutex.RUnlock()
	return ms.isStreaming
}

// streamingLoop is the main loop that handles periodic metrics broadcasting
func (ms *MetricsStreamer) streamingLoop() {
	ticker := time.NewTicker(ms.config.UpdateInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ms.ctx.Done():
			return

		case <-ticker.C:
			ms.collectAndBroadcastMetrics()
		}
	}
}

// collectAndBroadcastMetrics collects current metrics and broadcasts them
func (ms *MetricsStreamer) collectAndBroadcastMetrics() {
	if ms.collector == nil {
		return
	}

	// Get current real-time stats
	stats := ms.collector.GetRealTimeStats()

	// Add to buffer
	ms.addToBuffer(stats)

	// Create metrics message with enhanced data
	message := EnhancedMetricsMessage{
		Type:      "metrics",
		Timestamp: time.Now(),
		Data:      stats,
		Metadata: MetricsMetadata{
			UpdateInterval: ms.config.UpdateInterval,
			BufferSize:     ms.getBufferSize(),
			Connections:    ms.server.GetConnectionCount(),
		},
	}

	// Serialize and broadcast
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling enhanced metrics: %v", err)
		return
	}

	// Use the server's broadcast mechanism
	select {
	case ms.server.broadcast <- data:
		ms.lastUpdate = time.Now()
	default:
		log.Printf("Broadcast channel full, metrics update dropped")
	}
}

// addToBuffer adds metrics to the internal buffer with size management
func (ms *MetricsStreamer) addToBuffer(stats metrics.RealtimeStats) {
	ms.bufferMutex.Lock()
	defer ms.bufferMutex.Unlock()

	// Add to buffer
	ms.metricsBuffer = append(ms.metricsBuffer, stats)

	// Trim buffer if it exceeds max size
	if len(ms.metricsBuffer) > ms.config.MaxBufferedEvents {
		// Keep only the most recent events
		start := len(ms.metricsBuffer) - ms.config.MaxBufferedEvents
		ms.metricsBuffer = ms.metricsBuffer[start:]
	}
}

// getBufferSize returns the current buffer size
func (ms *MetricsStreamer) getBufferSize() int {
	ms.bufferMutex.RLock()
	defer ms.bufferMutex.RUnlock()
	return len(ms.metricsBuffer)
}

// GetBufferedMetrics returns a copy of the buffered metrics
func (ms *MetricsStreamer) GetBufferedMetrics() []metrics.RealtimeStats {
	ms.bufferMutex.RLock()
	defer ms.bufferMutex.RUnlock()

	// Return a copy to avoid race conditions
	buffer := make([]metrics.RealtimeStats, len(ms.metricsBuffer))
	copy(buffer, ms.metricsBuffer)
	return buffer
}

// ClearBuffer clears the metrics buffer
func (ms *MetricsStreamer) ClearBuffer() {
	ms.bufferMutex.Lock()
	defer ms.bufferMutex.Unlock()
	ms.metricsBuffer = ms.metricsBuffer[:0]
}

// BroadcastHistoricalData sends buffered metrics to a specific connection
func (ms *MetricsStreamer) BroadcastHistoricalData(connectionID string) error {
	bufferedMetrics := ms.GetBufferedMetrics()

	if len(bufferedMetrics) == 0 {
		return nil // No historical data to send
	}

	// Create historical data message
	message := HistoricalDataMessage{
		Type:      "historical_data",
		Timestamp: time.Now(),
		Data:      bufferedMetrics,
		Count:     len(bufferedMetrics),
	}

	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	// Send to specific connection (this would require extending the server)
	// For now, we'll broadcast to all connections
	select {
	case ms.server.broadcast <- data:
		log.Printf("Historical data broadcasted (%d metrics)", len(bufferedMetrics))
	default:
		log.Printf("Failed to broadcast historical data - channel full")
	}

	return nil
}

// GetStreamingStats returns statistics about the streaming system
func (ms *MetricsStreamer) GetStreamingStats() StreamingStats {
	ms.mutex.RLock()
	isStreaming := ms.isStreaming
	lastUpdate := ms.lastUpdate
	ms.mutex.RUnlock()

	return StreamingStats{
		IsActive:       isStreaming,
		LastUpdate:     lastUpdate,
		UpdateInterval: ms.config.UpdateInterval,
		BufferSize:     ms.getBufferSize(),
		MaxBuffer:      ms.config.MaxBufferedEvents,
		Connections:    ms.server.GetConnectionCount(),
	}
}

// UpdateConfig updates the streaming configuration
func (ms *MetricsStreamer) UpdateConfig(config StreamingConfig) {
	ms.mutex.Lock()
	defer ms.mutex.Unlock()

	ms.config = config
	log.Printf("Streaming configuration updated: interval=%v, buffer=%d",
		config.UpdateInterval, config.MaxBufferedEvents)
}

// ForceUpdate immediately collects and broadcasts current metrics
func (ms *MetricsStreamer) ForceUpdate() {
	if !ms.IsStreaming() {
		return
	}

	go ms.collectAndBroadcastMetrics()
}
