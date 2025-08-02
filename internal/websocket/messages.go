package websocket

import (
	"http-load-test/internal/metrics"
	"time"
)

// MetricsMessage represents a real-time metrics update
type MetricsMessage struct {
	Type      string                `json:"type"`
	Timestamp time.Time             `json:"timestamp"`
	Data      metrics.RealtimeStats `json:"data"`
}

// TestCompleteMessage represents a test completion notification
type TestCompleteMessage struct {
	Type      string                 `json:"type"`
	Timestamp time.Time              `json:"timestamp"`
	Summary   metrics.MetricsSummary `json:"summary"`
}

// ErrorMessage represents an error notification
type ErrorMessage struct {
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Error     string    `json:"error"`
}

// StatusMessage represents a general status update
type StatusMessage struct {
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Status    string    `json:"status"`
	Message   string    `json:"message,omitempty"`
}

// EnhancedMetricsMessage represents a real-time metrics update with metadata
type EnhancedMetricsMessage struct {
	Type      string                `json:"type"`
	Timestamp time.Time             `json:"timestamp"`
	Data      metrics.RealtimeStats `json:"data"`
	Metadata  MetricsMetadata       `json:"metadata"`
}

// MetricsMetadata contains additional information about the metrics
type MetricsMetadata struct {
	UpdateInterval time.Duration `json:"updateInterval"`
	BufferSize     int           `json:"bufferSize"`
	Connections    int           `json:"connections"`
}

// HistoricalDataMessage represents historical metrics data
type HistoricalDataMessage struct {
	Type      string                  `json:"type"`
	Timestamp time.Time               `json:"timestamp"`
	Data      []metrics.RealtimeStats `json:"data"`
	Count     int                     `json:"count"`
}

// StreamingStats represents statistics about the streaming system
type StreamingStats struct {
	IsActive       bool          `json:"isActive"`
	LastUpdate     time.Time     `json:"lastUpdate"`
	UpdateInterval time.Duration `json:"updateInterval"`
	BufferSize     int           `json:"bufferSize"`
	MaxBuffer      int           `json:"maxBuffer"`
	Connections    int           `json:"connections"`
}
