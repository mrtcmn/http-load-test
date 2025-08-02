package metrics

import (
	"testing"
	"time"
)

func TestNewMetricsCollector(t *testing.T) {
	collector := NewMetricsCollector()

	if collector == nil {
		t.Fatal("NewMetricsCollector returned nil")
	}

	if collector.statusCodes == nil {
		t.Error("statusCodes map not initialized")
	}

	if collector.errors == nil {
		t.Error("errors map not initialized")
	}

	if collector.histogramBuckets == nil {
		t.Error("histogramBuckets map not initialized")
	}

	if len(collector.bucketRanges) == 0 {
		t.Error("bucketRanges not initialized")
	}
}

func TestMetricsCollector_StartEnd(t *testing.T) {
	collector := NewMetricsCollector()

	// Test start
	collector.Start()
	if collector.startTime.IsZero() {
		t.Error("Start time not set")
	}

	startTime := collector.startTime
	time.Sleep(10 * time.Millisecond)

	// Test end
	collector.End()
	if collector.endTime.IsZero() {
		t.Error("End time not set")
	}

	if collector.endTime.Before(startTime) {
		t.Error("End time is before start time")
	}
}

func TestMetricsCollector_AddResult(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Add successful result
	collector.AddResult(100*time.Millisecond, 200, true, "")

	if collector.GetCount() != 1 {
		t.Errorf("Expected count 1, got %d", collector.GetCount())
	}

	stats := collector.GetRealTimeStats()
	if stats.SuccessfulReqs != 1 {
		t.Errorf("Expected 1 successful request, got %d", stats.SuccessfulReqs)
	}

	if stats.FailedRequests != 0 {
		t.Errorf("Expected 0 failed requests, got %d", stats.FailedRequests)
	}

	// Add failed result
	collector.AddResult(200*time.Millisecond, 500, false, "Internal Server Error")

	if collector.GetCount() != 2 {
		t.Errorf("Expected count 2, got %d", collector.GetCount())
	}

	stats = collector.GetRealTimeStats()
	if stats.SuccessfulReqs != 1 {
		t.Errorf("Expected 1 successful request, got %d", stats.SuccessfulReqs)
	}

	if stats.FailedRequests != 1 {
		t.Errorf("Expected 1 failed request, got %d", stats.FailedRequests)
	}
}

func TestMetricsCollector_CalculatePercentiles(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Add test data with known values
	testTimes := []time.Duration{
		10 * time.Millisecond,  // Min
		20 * time.Millisecond,
		30 * time.Millisecond,
		40 * time.Millisecond,
		50 * time.Millisecond,  // P50 (median)
		60 * time.Millisecond,
		70 * time.Millisecond,
		80 * time.Millisecond,
		90 * time.Millisecond,
		100 * time.Millisecond, // Max
	}

	for i, duration := range testTimes {
		collector.AddResult(duration, 200, true, "")
		_ = i
	}

	percentiles := collector.CalculatePercentiles()

	// Verify min and max
	if percentiles.Min != 10*time.Millisecond {
		t.Errorf("Expected min 10ms, got %v", percentiles.Min)
	}

	if percentiles.Max != 100*time.Millisecond {
		t.Errorf("Expected max 100ms, got %v", percentiles.Max)
	}

	// Verify P50 (median) - should be around 50ms
	expectedP50 := 50 * time.Millisecond
	if percentiles.P50 < 45*time.Millisecond || percentiles.P50 > 55*time.Millisecond {
		t.Errorf("Expected P50 around %v, got %v", expectedP50, percentiles.P50)
	}

	// Verify P95 - should be around 95ms
	if percentiles.P95 < 90*time.Millisecond || percentiles.P95 > 100*time.Millisecond {
		t.Errorf("Expected P95 between 90-100ms, got %v", percentiles.P95)
	}

	// Verify P99 - should be around 99ms
	if percentiles.P99 < 95*time.Millisecond || percentiles.P99 > 100*time.Millisecond {
		t.Errorf("Expected P99 between 95-100ms, got %v", percentiles.P99)
	}

	// Verify average
	expectedAvg := 55 * time.Millisecond // (10+20+...+100)/10 = 550/10 = 55
	if percentiles.Avg != expectedAvg {
		t.Errorf("Expected avg %v, got %v", expectedAvg, percentiles.Avg)
	}
}

func TestMetricsCollector_CalculatePercentiles_EmptyData(t *testing.T) {
	collector := NewMetricsCollector()
	percentiles := collector.CalculatePercentiles()

	if percentiles.P50 != 0 {
		t.Errorf("Expected P50 to be 0 for empty data, got %v", percentiles.P50)
	}

	if percentiles.P95 != 0 {
		t.Errorf("Expected P95 to be 0 for empty data, got %v", percentiles.P95)
	}

	if percentiles.P99 != 0 {
		t.Errorf("Expected P99 to be 0 for empty data, got %v", percentiles.P99)
	}
}

func TestMetricsCollector_CalculatePercentiles_SingleValue(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	singleValue := 50 * time.Millisecond
	collector.AddResult(singleValue, 200, true, "")

	percentiles := collector.CalculatePercentiles()

	if percentiles.P50 != singleValue {
		t.Errorf("Expected P50 %v, got %v", singleValue, percentiles.P50)
	}

	if percentiles.P95 != singleValue {
		t.Errorf("Expected P95 %v, got %v", singleValue, percentiles.P95)
	}

	if percentiles.P99 != singleValue {
		t.Errorf("Expected P99 %v, got %v", singleValue, percentiles.P99)
	}

	if percentiles.Min != singleValue {
		t.Errorf("Expected Min %v, got %v", singleValue, percentiles.Min)
	}

	if percentiles.Max != singleValue {
		t.Errorf("Expected Max %v, got %v", singleValue, percentiles.Max)
	}

	if percentiles.Avg != singleValue {
		t.Errorf("Expected Avg %v, got %v", singleValue, percentiles.Avg)
	}
}

func TestCalculatePercentile(t *testing.T) {
	testCases := []struct {
		name       string
		times      []time.Duration
		percentile float64
		minExpected time.Duration
		maxExpected time.Duration
	}{
		{
			name:        "P50 of 1-10",
			times:       []time.Duration{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
			percentile:  50,
			minExpected: 5 * time.Nanosecond,
			maxExpected: 6 * time.Nanosecond,
		},
		{
			name:        "P0 (minimum)",
			times:       []time.Duration{1, 2, 3, 4, 5},
			percentile:  0,
			minExpected: 1,
			maxExpected: 1,
		},
		{
			name:        "P100 (maximum)",
			times:       []time.Duration{1, 2, 3, 4, 5},
			percentile:  100,
			minExpected: 5,
			maxExpected: 5,
		},
		{
			name:        "P25 of 1-4",
			times:       []time.Duration{1, 2, 3, 4},
			percentile:  25,
			minExpected: 1 * time.Nanosecond,
			maxExpected: 2 * time.Nanosecond,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := calculatePercentile(tc.times, tc.percentile)
			
			if result < tc.minExpected || result > tc.maxExpected {
				t.Errorf("Expected result between %v and %v, got %v", tc.minExpected, tc.maxExpected, result)
			}
		})
	}
}

func TestMetricsCollector_GetSummary(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Add test data
	collector.AddResult(100*time.Millisecond, 200, true, "")
	collector.AddResult(200*time.Millisecond, 404, false, "Not Found")
	collector.AddResult(150*time.Millisecond, 200, true, "")

	time.Sleep(10 * time.Millisecond) // Ensure some duration
	collector.End()

	summary := collector.GetSummary()

	if summary.TotalRequests != 3 {
		t.Errorf("Expected 3 total requests, got %d", summary.TotalRequests)
	}

	if summary.SuccessfulReqs != 2 {
		t.Errorf("Expected 2 successful requests, got %d", summary.SuccessfulReqs)
	}

	if summary.FailedRequests != 1 {
		t.Errorf("Expected 1 failed request, got %d", summary.FailedRequests)
	}

	if summary.Duration <= 0 {
		t.Errorf("Expected positive duration, got %v", summary.Duration)
	}

	if summary.RequestsPerSecond <= 0 {
		t.Errorf("Expected positive RPS, got %f", summary.RequestsPerSecond)
	}

	// Check status codes
	if summary.StatusCodes[200] != 2 {
		t.Errorf("Expected 2 requests with status 200, got %d", summary.StatusCodes[200])
	}

	if summary.StatusCodes[404] != 1 {
		t.Errorf("Expected 1 request with status 404, got %d", summary.StatusCodes[404])
	}

	// Check errors
	if summary.Errors["Not Found"] != 1 {
		t.Errorf("Expected 1 'Not Found' error, got %d", summary.Errors["Not Found"])
	}

	// Check response time metrics
	if summary.ResponseTimes.Count != 3 {
		t.Errorf("Expected 3 response times, got %d", summary.ResponseTimes.Count)
	}

	if summary.ResponseTimes.Min != 100*time.Millisecond {
		t.Errorf("Expected min response time 100ms, got %v", summary.ResponseTimes.Min)
	}

	if summary.ResponseTimes.Max != 200*time.Millisecond {
		t.Errorf("Expected max response time 200ms, got %v", summary.ResponseTimes.Max)
	}
}

func TestMetricsCollector_GetRealTimeStats(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Add some test data
	collector.AddResult(100*time.Millisecond, 200, true, "")
	collector.AddResult(200*time.Millisecond, 500, false, "Server Error")

	time.Sleep(10 * time.Millisecond) // Ensure some elapsed time

	stats := collector.GetRealTimeStats()

	if stats.CompletedRequests != 2 {
		t.Errorf("Expected 2 completed requests, got %d", stats.CompletedRequests)
	}

	if stats.SuccessfulReqs != 1 {
		t.Errorf("Expected 1 successful request, got %d", stats.SuccessfulReqs)
	}

	if stats.FailedRequests != 1 {
		t.Errorf("Expected 1 failed request, got %d", stats.FailedRequests)
	}

	if stats.ElapsedTime <= 0 {
		t.Errorf("Expected positive elapsed time, got %v", stats.ElapsedTime)
	}

	if stats.CurrentRPS <= 0 {
		t.Errorf("Expected positive current RPS, got %f", stats.CurrentRPS)
	}

	if stats.AvgResponseTime != 150*time.Millisecond {
		t.Errorf("Expected avg response time 150ms, got %v", stats.AvgResponseTime)
	}
}

func TestMetricsCollector_Histogram(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Add requests with different response times to test histogram buckets
	testCases := []struct {
		duration time.Duration
		bucket   string
	}{
		{5 * time.Millisecond, "0-10ms"},
		{25 * time.Millisecond, "10-50ms"},
		{75 * time.Millisecond, "50-100ms"},
		{250 * time.Millisecond, "100-500ms"},
		{750 * time.Millisecond, "500ms-1s"},
		{2 * time.Second, "1s-5s"},
		{10 * time.Second, "5s+"},
	}

	for _, tc := range testCases {
		collector.AddResult(tc.duration, 200, true, "")
	}

	summary := collector.GetSummary()

	for _, tc := range testCases {
		if summary.ResponseTimes.Histogram[tc.bucket] != 1 {
			t.Errorf("Expected 1 request in bucket %s, got %d", tc.bucket, summary.ResponseTimes.Histogram[tc.bucket])
		}
	}
}

func TestMetricsCollector_Reset(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Add some data
	collector.AddResult(100*time.Millisecond, 200, true, "")
	collector.AddResult(200*time.Millisecond, 404, false, "Not Found")

	// Verify data exists
	if collector.GetCount() != 2 {
		t.Errorf("Expected count 2 before reset, got %d", collector.GetCount())
	}

	// Reset
	collector.Reset()

	// Verify data is cleared
	if collector.GetCount() != 0 {
		t.Errorf("Expected count 0 after reset, got %d", collector.GetCount())
	}

	summary := collector.GetSummary()
	if summary.TotalRequests != 0 {
		t.Errorf("Expected 0 total requests after reset, got %d", summary.TotalRequests)
	}

	if len(summary.StatusCodes) != 0 {
		t.Errorf("Expected empty status codes after reset, got %v", summary.StatusCodes)
	}

	if len(summary.Errors) != 0 {
		t.Errorf("Expected empty errors after reset, got %v", summary.Errors)
	}
}

func TestMetricsCollector_ThreadSafety(t *testing.T) {
	collector := NewMetricsCollector()
	collector.Start()

	// Test concurrent access
	done := make(chan bool, 10)

	// Start multiple goroutines adding results
	for i := 0; i < 10; i++ {
		go func(id int) {
			for j := 0; j < 100; j++ {
				collector.AddResult(time.Duration(j)*time.Millisecond, 200, true, "")
			}
			done <- true
		}(i)
	}

	// Start goroutines reading stats
	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				_ = collector.GetRealTimeStats()
				_ = collector.CalculatePercentiles()
			}
			done <- true
		}()
	}

	// Wait for all goroutines to complete
	for i := 0; i < 15; i++ {
		<-done
	}

	// Verify final count
	expectedCount := 10 * 100 // 10 goroutines * 100 requests each
	if collector.GetCount() != expectedCount {
		t.Errorf("Expected count %d, got %d", expectedCount, collector.GetCount())
	}
}

func TestMetricsCollector_EdgeCases(t *testing.T) {
	collector := NewMetricsCollector()

	// Test getting stats before starting
	stats := collector.GetRealTimeStats()
	if stats.ElapsedTime < 0 {
		t.Error("Elapsed time should not be negative")
	}

	// Test percentiles with no data
	percentiles := collector.CalculatePercentiles()
	if percentiles.P50 != 0 {
		t.Error("P50 should be 0 with no data")
	}

	// Test summary with no data
	summary := collector.GetSummary()
	if summary.TotalRequests != 0 {
		t.Error("Total requests should be 0 with no data")
	}
}