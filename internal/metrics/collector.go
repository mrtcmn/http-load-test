package metrics

import (
	"sort"
	"sync"
	"time"
)

// PercentileMetrics represents percentile calculations for response times
type PercentileMetrics struct {
	P50 time.Duration `json:"p50"`
	P95 time.Duration `json:"p95"`
	P99 time.Duration `json:"p99"`
	Min time.Duration `json:"min"`
	Max time.Duration `json:"max"`
	Avg time.Duration `json:"avg"`
}

// ResponseTimeMetrics contains detailed response time statistics
type ResponseTimeMetrics struct {
	Min       time.Duration  `json:"min"`
	Max       time.Duration  `json:"max"`
	Avg       time.Duration  `json:"avg"`
	Total     time.Duration  `json:"total"`
	Count     int            `json:"count"`
	Histogram map[string]int `json:"histogram"` // Time ranges to count
}

// MetricsSummary represents the complete metrics summary
type MetricsSummary struct {
	TotalRequests     int                 `json:"totalRequests"`
	SuccessfulReqs    int                 `json:"successfulRequests"`
	FailedRequests    int                 `json:"failedRequests"`
	Duration          time.Duration       `json:"duration"`
	RequestsPerSecond float64             `json:"requestsPerSecond"`
	Percentiles       PercentileMetrics   `json:"percentiles"`
	StatusCodes       map[int]int         `json:"statusCodes"`
	Errors            map[string]int      `json:"errors"`
	ResponseTimes     ResponseTimeMetrics `json:"responseTimes"`
}

// RealtimeStats represents real-time statistics during test execution
type RealtimeStats struct {
	ElapsedTime       time.Duration     `json:"elapsedTime"`
	CompletedRequests int               `json:"completedRequests"`
	SuccessfulReqs    int               `json:"successfulRequests"`
	FailedRequests    int               `json:"failedRequests"`
	CurrentRPS        float64           `json:"currentRPS"`
	AvgResponseTime   time.Duration     `json:"avgResponseTime"`
	StatusCodes       map[int]int       `json:"statusCodes"`
	RecentPercentiles PercentileMetrics `json:"recentPercentiles"`
}

// MetricsCollector handles thread-safe collection and calculation of metrics
type MetricsCollector struct {
	mutex         sync.RWMutex
	responseTimes []time.Duration
	statusCodes   map[int]int
	errors        map[string]int
	startTime     time.Time
	endTime       time.Time
	totalRequests int
	successful    int
	failed        int

	// Histogram buckets for response time distribution
	histogramBuckets map[string]int
	bucketRanges     []HistogramBucket
}

// HistogramBucket represents a time range bucket for histogram tracking
type HistogramBucket struct {
	Label string
	Min   time.Duration
	Max   time.Duration
}

// NewMetricsCollector creates a new metrics collector
func NewMetricsCollector() *MetricsCollector {
	buckets := []HistogramBucket{
		{"0-10ms", 0, 10 * time.Millisecond},
		{"10-50ms", 10 * time.Millisecond, 50 * time.Millisecond},
		{"50-100ms", 50 * time.Millisecond, 100 * time.Millisecond},
		{"100-500ms", 100 * time.Millisecond, 500 * time.Millisecond},
		{"500ms-1s", 500 * time.Millisecond, 1 * time.Second},
		{"1s-5s", 1 * time.Second, 5 * time.Second},
		{"5s+", 5 * time.Second, time.Duration(1<<63 - 1)}, // Max duration
	}

	return &MetricsCollector{
		statusCodes:      make(map[int]int),
		errors:           make(map[string]int),
		histogramBuckets: make(map[string]int),
		bucketRanges:     buckets,
	}
}

// Start marks the beginning of the test
func (m *MetricsCollector) Start() {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.startTime = time.Now()
}

// End marks the end of the test
func (m *MetricsCollector) End() {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.endTime = time.Now()
}

// AddResult adds a request result to the metrics collection
func (m *MetricsCollector) AddResult(duration time.Duration, statusCode int, success bool, errorMsg string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	m.totalRequests++
	m.responseTimes = append(m.responseTimes, duration)

	if success {
		m.successful++
	} else {
		m.failed++
		if errorMsg != "" {
			m.errors[errorMsg]++
		}
	}

	m.statusCodes[statusCode]++

	// Update histogram
	m.updateHistogram(duration)
}

// updateHistogram updates the response time histogram
func (m *MetricsCollector) updateHistogram(duration time.Duration) {
	for _, bucket := range m.bucketRanges {
		if duration >= bucket.Min && duration < bucket.Max {
			m.histogramBuckets[bucket.Label]++
			break
		}
	}
}

// CalculatePercentiles calculates percentile metrics from collected response times
func (m *MetricsCollector) CalculatePercentiles() PercentileMetrics {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if len(m.responseTimes) == 0 {
		return PercentileMetrics{}
	}

	// Create a copy and sort it
	times := make([]time.Duration, len(m.responseTimes))
	copy(times, m.responseTimes)
	sort.Slice(times, func(i, j int) bool {
		return times[i] < times[j]
	})

	// Calculate percentiles
	p50 := calculatePercentile(times, 50)
	p95 := calculatePercentile(times, 95)
	p99 := calculatePercentile(times, 99)

	// Calculate min, max, avg
	min := times[0]
	max := times[len(times)-1]

	var total time.Duration
	for _, t := range times {
		total += t
	}
	avg := total / time.Duration(len(times))

	return PercentileMetrics{
		P50: p50,
		P95: p95,
		P99: p99,
		Min: min,
		Max: max,
		Avg: avg,
	}
}

// calculatePercentile calculates the specified percentile from sorted durations
func calculatePercentile(sortedTimes []time.Duration, percentile float64) time.Duration {
	if len(sortedTimes) == 0 {
		return 0
	}

	if percentile <= 0 {
		return sortedTimes[0]
	}
	if percentile >= 100 {
		return sortedTimes[len(sortedTimes)-1]
	}

	// Calculate index using the nearest-rank method
	index := (percentile / 100.0) * float64(len(sortedTimes)-1)

	// If index is exact, return that element
	if index == float64(int(index)) {
		return sortedTimes[int(index)]
	}

	// Otherwise, interpolate between two nearest values
	lower := int(index)
	upper := lower + 1

	if upper >= len(sortedTimes) {
		return sortedTimes[len(sortedTimes)-1]
	}

	// Linear interpolation
	fraction := index - float64(lower)
	lowerVal := float64(sortedTimes[lower])
	upperVal := float64(sortedTimes[upper])

	interpolated := lowerVal + fraction*(upperVal-lowerVal)
	return time.Duration(interpolated)
}

// GetSummary returns the complete metrics summary
func (m *MetricsCollector) GetSummary() MetricsSummary {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	duration := m.endTime.Sub(m.startTime)
	if m.endTime.IsZero() {
		duration = time.Since(m.startTime)
	}

	var rps float64
	if duration > 0 {
		rps = float64(m.totalRequests) / duration.Seconds()
	}

	percentiles := m.calculatePercentilesUnsafe()

	// Calculate response time metrics
	var total time.Duration
	var min, max time.Duration
	if len(m.responseTimes) > 0 {
		min = m.responseTimes[0]
		max = m.responseTimes[0]
		for _, t := range m.responseTimes {
			total += t
			if t < min {
				min = t
			}
			if t > max {
				max = t
			}
		}
	}

	var avg time.Duration
	if len(m.responseTimes) > 0 {
		avg = total / time.Duration(len(m.responseTimes))
	}

	return MetricsSummary{
		TotalRequests:     m.totalRequests,
		SuccessfulReqs:    m.successful,
		FailedRequests:    m.failed,
		Duration:          duration,
		RequestsPerSecond: rps,
		Percentiles:       percentiles,
		StatusCodes:       copyIntMap(m.statusCodes),
		Errors:            copyStringMap(m.errors),
		ResponseTimes: ResponseTimeMetrics{
			Min:       min,
			Max:       max,
			Avg:       avg,
			Total:     total,
			Count:     len(m.responseTimes),
			Histogram: copyStringMap(m.histogramBuckets),
		},
	}
}

// GetRealTimeStats returns current real-time statistics
func (m *MetricsCollector) GetRealTimeStats() RealtimeStats {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	elapsed := time.Since(m.startTime)

	var currentRPS float64
	if elapsed > 0 {
		currentRPS = float64(m.totalRequests) / elapsed.Seconds()
	}

	var avgResponseTime time.Duration
	if len(m.responseTimes) > 0 {
		var total time.Duration
		for _, t := range m.responseTimes {
			total += t
		}
		avgResponseTime = total / time.Duration(len(m.responseTimes))
	}

	percentiles := m.calculatePercentilesUnsafe()

	return RealtimeStats{
		ElapsedTime:       elapsed,
		CompletedRequests: m.totalRequests,
		SuccessfulReqs:    m.successful,
		FailedRequests:    m.failed,
		CurrentRPS:        currentRPS,
		AvgResponseTime:   avgResponseTime,
		StatusCodes:       copyIntMap(m.statusCodes),
		RecentPercentiles: percentiles,
	}
}

// calculatePercentilesUnsafe calculates percentiles without locking (assumes already locked)
func (m *MetricsCollector) calculatePercentilesUnsafe() PercentileMetrics {
	if len(m.responseTimes) == 0 {
		return PercentileMetrics{}
	}

	// Create a copy and sort it
	times := make([]time.Duration, len(m.responseTimes))
	copy(times, m.responseTimes)
	sort.Slice(times, func(i, j int) bool {
		return times[i] < times[j]
	})

	// Calculate percentiles
	p50 := calculatePercentile(times, 50)
	p95 := calculatePercentile(times, 95)
	p99 := calculatePercentile(times, 99)

	// Calculate min, max, avg
	min := times[0]
	max := times[len(times)-1]

	var total time.Duration
	for _, t := range times {
		total += t
	}
	avg := total / time.Duration(len(times))

	return PercentileMetrics{
		P50: p50,
		P95: p95,
		P99: p99,
		Min: min,
		Max: max,
		Avg: avg,
	}
}

// Reset clears all collected metrics
func (m *MetricsCollector) Reset() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	m.responseTimes = nil
	m.statusCodes = make(map[int]int)
	m.errors = make(map[string]int)
	m.histogramBuckets = make(map[string]int)
	m.totalRequests = 0
	m.successful = 0
	m.failed = 0
	m.startTime = time.Time{}
	m.endTime = time.Time{}
}

// GetCount returns the current number of collected results
func (m *MetricsCollector) GetCount() int {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return m.totalRequests
}

// GetResponseTimes returns a copy of all collected response times
func (m *MetricsCollector) GetResponseTimes() []time.Duration {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	times := make([]time.Duration, len(m.responseTimes))
	copy(times, m.responseTimes)
	return times
}

// Helper functions to copy maps safely
func copyIntMap(original map[int]int) map[int]int {
	copy := make(map[int]int)
	for k, v := range original {
		copy[k] = v
	}
	return copy
}

func copyStringMap(original map[string]int) map[string]int {
	copy := make(map[string]int)
	for k, v := range original {
		copy[k] = v
	}
	return copy
}
