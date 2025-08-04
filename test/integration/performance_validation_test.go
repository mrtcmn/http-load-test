package integration

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"sync"
	"testing"
	"time"

	"http-load-test/internal/client"
	"http-load-test/internal/config"
	"http-load-test/internal/engine"
	"http-load-test/internal/logger"
	"http-load-test/internal/metrics"
)

// PerformanceValidationSuite contains comprehensive performance validation tests
type PerformanceValidationSuite struct {
	testServer *TestServer
	logger     *logger.Logger
}

// ResourceMetrics tracks system resource usage during tests
type ResourceMetrics struct {
	MemoryUsage     MemoryStats `json:"memoryUsage"`
	CPUUsage        CPUStats    `json:"cpuUsage"`
	GoroutineCount  int         `json:"goroutineCount"`
	FileDescriptors int         `json:"fileDescriptors"`
}

type MemoryStats struct {
	HeapAlloc     uint64  `json:"heapAlloc"`
	HeapSys       uint64  `json:"heapSys"`
	HeapInuse     uint64  `json:"heapInuse"`
	StackInuse    uint64  `json:"stackInuse"`
	TotalAlloc    uint64  `json:"totalAlloc"`
	NumGC         uint32  `json:"numGC"`
	GCCPUFraction float64 `json:"gcCPUFraction"`
}

type CPUStats struct {
	UserTime   time.Duration `json:"userTime"`
	SystemTime time.Duration `json:"systemTime"`
	TotalTime  time.Duration `json:"totalTime"`
}

// AccuracyTestResult holds results from timing accuracy tests
type AccuracyTestResult struct {
	ExpectedDelay   time.Duration   `json:"expectedDelay"`
	MeasuredDelays  []time.Duration `json:"measuredDelays"`
	MeanError       time.Duration   `json:"meanError"`
	StandardDev     time.Duration   `json:"standardDev"`
	MaxError        time.Duration   `json:"maxError"`
	AccuracyPercent float64         `json:"accuracyPercent"`
}

// ScalabilityTestResult holds results from scalability tests
type ScalabilityTestResult struct {
	ConcurrentRequests int             `json:"concurrentRequests"`
	TotalRequests      int             `json:"totalRequests"`
	Duration           time.Duration   `json:"duration"`
	RequestsPerSecond  float64         `json:"requestsPerSecond"`
	AvgResponseTime    time.Duration   `json:"avgResponseTime"`
	P95ResponseTime    time.Duration   `json:"p95ResponseTime"`
	P99ResponseTime    time.Duration   `json:"p99ResponseTime"`
	ErrorRate          float64         `json:"errorRate"`
	ResourceMetrics    ResourceMetrics `json:"resourceMetrics"`
}

// TestPerformanceValidationSuite runs comprehensive performance validation tests
func TestPerformanceValidationSuite(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance validation suite in short mode")
	}

	suite := &PerformanceValidationSuite{}
	suite.setup(t)
	defer suite.teardown()

	t.Run("GoVsJavaScriptBenchmarks", suite.testGoVsJavaScriptBenchmarks)
	t.Run("MemoryUsageAndResourceConsumption", suite.testMemoryUsageAndResourceConsumption)
	t.Run("TimingAccuracyValidation", suite.testTimingAccuracyValidation)
	t.Run("PercentileCalculationAccuracy", suite.testPercentileCalculationAccuracy)
	t.Run("ScalabilityUnderHighLoad", suite.testScalabilityUnderHighLoad)
	t.Run("ConcurrentLoadScaling", suite.testConcurrentLoadScaling)
	t.Run("MemoryLeakDetection", suite.testMemoryLeakDetection)
	t.Run("ResourceLimitHandling", suite.testResourceLimitHandling)
}

func (s *PerformanceValidationSuite) setup(t *testing.T) {
	// Start test server
	serverConfig := TestServerConfig{
		Port:                8084,
		DefaultDelay:        0,
		DefaultStatusCode:   200,
		DefaultResponseSize: 0,
		EnableLogging:       false,
	}
	s.testServer = NewTestServer(serverConfig)

	if err := s.testServer.Start(); err != nil {
		t.Fatalf("Failed to start test server: %v", err)
	}

	// Create logger
	s.logger = logger.New(&logger.Config{
		Level:  logger.ERROR,
		Output: os.Stdout,
	})
}

func (s *PerformanceValidationSuite) teardown() {
	if s.testServer != nil {
		s.testServer.Stop()
	}
}

// testGoVsJavaScriptBenchmarks performs comprehensive benchmarks comparing Go vs JavaScript
func (s *PerformanceValidationSuite) testGoVsJavaScriptBenchmarks(t *testing.T) {
	benchmarkConfigs := []struct {
		name                string
		totalRequests       int
		requestsPerSecond   int
		concurrentRequests  int
		expectedImprovement float64 // minimum expected throughput improvement
	}{
		{"LowLoad", 100, 10, 2, 1.5},
		{"MediumLoad", 500, 50, 10, 2.0},
		{"HighLoad", 1000, 100, 20, 2.5},
		{"VeryHighLoad", 2000, 200, 50, 3.0},
	}

	for _, bc := range benchmarkConfigs {
		t.Run(bc.name, func(t *testing.T) {
			s.testServer.Reset()

			testConfig := &config.TestConfig{
				URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
				Method:             "GET",
				TotalRequests:      bc.totalRequests,
				RequestsPerSecond:  bc.requestsPerSecond,
				ConcurrentRequests: bc.concurrentRequests,
				Timeout:            config.Duration(10 * time.Second),
			}

			// Run Go implementation
			goResult := s.runGoPerformanceTest(t, testConfig)
			t.Logf("Go Implementation - RPS: %.2f, Avg: %v, P95: %v, Memory: %d bytes",
				goResult.RequestsPerSecond, goResult.AvgResponseTime, goResult.P95ResponseTime, goResult.MemoryUsage)

			// Run JavaScript implementation if available
			jsResult := s.runJavaScriptPerformanceTest(t, testConfig)
			if jsResult != nil {
				t.Logf("JavaScript Implementation - RPS: %.2f, Avg: %v, P95: %v, Memory: %d bytes",
					jsResult.RequestsPerSecond, jsResult.AvgResponseTime, jsResult.P95ResponseTime, jsResult.MemoryUsage)

				// Validate performance improvement
				improvement := goResult.RequestsPerSecond / jsResult.RequestsPerSecond
				if improvement < bc.expectedImprovement {
					t.Errorf("Go implementation throughput improvement insufficient: %.2fx (expected >= %.2fx)",
						improvement, bc.expectedImprovement)
				} else {
					t.Logf("✓ Go implementation is %.2fx faster than JavaScript", improvement)
				}

				// Validate response time improvement
				responseTimeImprovement := float64(jsResult.AvgResponseTime) / float64(goResult.AvgResponseTime)
				if responseTimeImprovement < 1.2 {
					t.Errorf("Go implementation response time improvement insufficient: %.2fx (expected >= 1.2x)",
						responseTimeImprovement)
				} else {
					t.Logf("✓ Go implementation has %.2fx better response times", responseTimeImprovement)
				}
			}

			// Validate Go performance meets requirements
			s.validateGoPerformanceRequirements(t, goResult, testConfig)
		})
	}
}

// testMemoryUsageAndResourceConsumption tests memory usage and resource consumption
func (s *PerformanceValidationSuite) testMemoryUsageAndResourceConsumption(t *testing.T) {
	testConfigs := []struct {
		name               string
		totalRequests      int
		concurrentRequests int
		maxMemoryMB        int64 // Maximum expected memory usage in MB
	}{
		{"SmallLoad", 100, 5, 50},
		{"MediumLoad", 1000, 20, 100},
		{"LargeLoad", 5000, 50, 200},
	}

	for _, tc := range testConfigs {
		t.Run(tc.name, func(t *testing.T) {
			s.testServer.Reset()

			testConfig := &config.TestConfig{
				URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
				Method:             "GET",
				TotalRequests:      tc.totalRequests,
				RequestsPerSecond:  tc.totalRequests / 10, // Complete in ~10 seconds
				ConcurrentRequests: tc.concurrentRequests,
				Timeout:            config.Duration(5 * time.Second),
			}

			// Monitor resource usage during test
			resourceMetrics := s.monitorResourceUsage(t, testConfig)

			// Validate memory usage
			memoryUsageMB := int64(resourceMetrics.MemoryUsage.HeapAlloc) / (1024 * 1024)
			if memoryUsageMB > tc.maxMemoryMB {
				t.Errorf("Memory usage too high: %d MB (expected <= %d MB)", memoryUsageMB, tc.maxMemoryMB)
			} else {
				t.Logf("✓ Memory usage within limits: %d MB", memoryUsageMB)
			}

			// Validate goroutine count is reasonable
			if resourceMetrics.GoroutineCount > tc.concurrentRequests*2+50 {
				t.Errorf("Too many goroutines: %d (expected <= %d)",
					resourceMetrics.GoroutineCount, tc.concurrentRequests*2+50)
			} else {
				t.Logf("✓ Goroutine count reasonable: %d", resourceMetrics.GoroutineCount)
			}

			// Log detailed resource metrics
			t.Logf("Resource Metrics:")
			t.Logf("  Heap Allocated: %d bytes", resourceMetrics.MemoryUsage.HeapAlloc)
			t.Logf("  Heap In Use: %d bytes", resourceMetrics.MemoryUsage.HeapInuse)
			t.Logf("  Stack In Use: %d bytes", resourceMetrics.MemoryUsage.StackInuse)
			t.Logf("  GC CPU Fraction: %.4f", resourceMetrics.MemoryUsage.GCCPUFraction)
			t.Logf("  Goroutines: %d", resourceMetrics.GoroutineCount)
		})
	}
}

// testTimingAccuracyValidation tests the accuracy of timing measurements
func (s *PerformanceValidationSuite) testTimingAccuracyValidation(t *testing.T) {
	delays := []time.Duration{
		10 * time.Millisecond,
		50 * time.Millisecond,
		100 * time.Millisecond,
		200 * time.Millisecond,
	}

	for _, delay := range delays {
		t.Run(fmt.Sprintf("Delay_%dms", delay.Milliseconds()), func(t *testing.T) {
			s.testServer.Reset()

			// Configure server to add artificial delay
			s.testServer.SetDefaultDelay(int(delay.Milliseconds()))

			testConfig := &config.TestConfig{
				URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
				Method:             "GET",
				TotalRequests:      50, // Smaller sample for accuracy testing
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            config.Duration(5 * time.Second),
			}

			accuracyResult := s.measureTimingAccuracy(t, testConfig, delay)

			// Validate timing accuracy (should be within 10% of expected delay)
			maxAllowedError := float64(delay) * 0.1
			if float64(accuracyResult.MeanError) > maxAllowedError {
				t.Errorf("Timing accuracy insufficient: mean error %v (expected <= %v)",
					accuracyResult.MeanError, time.Duration(maxAllowedError))
			} else {
				t.Logf("✓ Timing accuracy good: mean error %v (%.2f%% of expected)",
					accuracyResult.MeanError, accuracyResult.AccuracyPercent)
			}

			// Log detailed accuracy metrics
			t.Logf("Timing Accuracy Results:")
			t.Logf("  Expected Delay: %v", accuracyResult.ExpectedDelay)
			t.Logf("  Mean Error: %v", accuracyResult.MeanError)
			t.Logf("  Standard Deviation: %v", accuracyResult.StandardDev)
			t.Logf("  Max Error: %v", accuracyResult.MaxError)
			t.Logf("  Accuracy: %.2f%%", accuracyResult.AccuracyPercent)
		})
	}
}

// testPercentileCalculationAccuracy tests the accuracy of percentile calculations
func (s *PerformanceValidationSuite) testPercentileCalculationAccuracy(t *testing.T) {
	// Create a test with known response time distribution
	s.testServer.Reset()
	s.testServer.SetVariableDelay(true) // Enable variable delays for distribution testing

	testConfig := &config.TestConfig{
		URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
		Method:             "GET",
		TotalRequests:      1000, // Large sample for accurate percentile calculation
		RequestsPerSecond:  100,
		ConcurrentRequests: 20,
		Timeout:            config.Duration(5 * time.Second),
	}

	// Run test and collect detailed timing data
	result := s.runDetailedPerformanceTest(t, testConfig)

	// Validate percentile calculations by comparing with manual calculation
	sortedTimes := make([]time.Duration, len(result.ResponseTimes))
	copy(sortedTimes, result.ResponseTimes)
	sort.Slice(sortedTimes, func(i, j int) bool {
		return sortedTimes[i] < sortedTimes[j]
	})

	// Calculate expected percentiles manually
	expectedP50 := sortedTimes[len(sortedTimes)*50/100]
	expectedP95 := sortedTimes[len(sortedTimes)*95/100]
	expectedP99 := sortedTimes[len(sortedTimes)*99/100]

	// Compare with engine results (allow 5% tolerance)
	tolerance := 0.05

	if !s.isWithinTolerance(result.Percentiles.P50, expectedP50, tolerance) {
		t.Errorf("P50 calculation inaccurate: got %v, expected %v", result.Percentiles.P50, expectedP50)
	} else {
		t.Logf("✓ P50 calculation accurate: %v", result.Percentiles.P50)
	}

	if !s.isWithinTolerance(result.Percentiles.P95, expectedP95, tolerance) {
		t.Errorf("P95 calculation inaccurate: got %v, expected %v", result.Percentiles.P95, expectedP95)
	} else {
		t.Logf("✓ P95 calculation accurate: %v", result.Percentiles.P95)
	}

	if !s.isWithinTolerance(result.Percentiles.P99, expectedP99, tolerance) {
		t.Errorf("P99 calculation inaccurate: got %v, expected %v", result.Percentiles.P99, expectedP99)
	} else {
		t.Logf("✓ P99 calculation accurate: %v", result.Percentiles.P99)
	}
}

// testScalabilityUnderHighLoad tests scalability under high concurrent loads
func (s *PerformanceValidationSuite) testScalabilityUnderHighLoad(t *testing.T) {
	concurrencyLevels := []int{10, 25, 50, 100, 200}
	baseRequests := 1000

	var results []ScalabilityTestResult

	for _, concurrency := range concurrencyLevels {
		t.Run(fmt.Sprintf("Concurrency_%d", concurrency), func(t *testing.T) {
			s.testServer.Reset()

			testConfig := &config.TestConfig{
				URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
				Method:             "GET",
				TotalRequests:      baseRequests,
				RequestsPerSecond:  concurrency * 5, // Scale RPS with concurrency
				ConcurrentRequests: concurrency,
				Timeout:            config.Duration(10 * time.Second),
			}

			result := s.runScalabilityTest(t, testConfig)
			results = append(results, result)

			// Validate that error rate stays reasonable even under high load
			if result.ErrorRate > 0.05 { // 5% error rate threshold
				t.Errorf("Error rate too high under load: %.2f%% (expected <= 5%%)", result.ErrorRate*100)
			} else {
				t.Logf("✓ Error rate acceptable: %.2f%%", result.ErrorRate*100)
			}

			// Validate that P95 response time doesn't degrade too much
			if result.P95ResponseTime > 2*time.Second {
				t.Errorf("P95 response time too high: %v (expected <= 2s)", result.P95ResponseTime)
			} else {
				t.Logf("✓ P95 response time acceptable: %v", result.P95ResponseTime)
			}

			t.Logf("Scalability Results (Concurrency %d):", concurrency)
			t.Logf("  RPS: %.2f", result.RequestsPerSecond)
			t.Logf("  Avg Response Time: %v", result.AvgResponseTime)
			t.Logf("  P95 Response Time: %v", result.P95ResponseTime)
			t.Logf("  Error Rate: %.2f%%", result.ErrorRate*100)
			t.Logf("  Memory Usage: %d MB", result.ResourceMetrics.MemoryUsage.HeapAlloc/(1024*1024))
		})
	}

	// Analyze scalability trends
	s.analyzeScalabilityTrends(t, results)
}

// testConcurrentLoadScaling tests how performance scales with concurrent load
func (s *PerformanceValidationSuite) testConcurrentLoadScaling(t *testing.T) {
	// Test with increasing concurrent requests while keeping total requests constant
	totalRequests := 2000
	concurrencyLevels := []int{5, 10, 20, 50, 100}

	var throughputResults []float64
	var responseTimeResults []time.Duration

	for _, concurrency := range concurrencyLevels {
		t.Run(fmt.Sprintf("ConcurrentScaling_%d", concurrency), func(t *testing.T) {
			s.testServer.Reset()

			testConfig := &config.TestConfig{
				URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
				Method:             "GET",
				TotalRequests:      totalRequests,
				RequestsPerSecond:  200, // Keep RPS constant
				ConcurrentRequests: concurrency,
				Timeout:            config.Duration(10 * time.Second),
			}

			result := s.runGoPerformanceTest(t, testConfig)
			throughputResults = append(throughputResults, result.RequestsPerSecond)
			responseTimeResults = append(responseTimeResults, result.AvgResponseTime)

			t.Logf("Concurrency %d: RPS=%.2f, AvgTime=%v",
				concurrency, result.RequestsPerSecond, result.AvgResponseTime)
		})
	}

	// Validate that throughput generally increases with concurrency (up to a point)
	s.validateConcurrencyScaling(t, concurrencyLevels, throughputResults, responseTimeResults)
}

// testMemoryLeakDetection tests for memory leaks during extended operation
func (s *PerformanceValidationSuite) testMemoryLeakDetection(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping memory leak detection in short mode")
	}

	s.testServer.Reset()

	testConfig := &config.TestConfig{
		URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
		Method:             "GET",
		TotalRequests:      100,
		RequestsPerSecond:  20,
		ConcurrentRequests: 10,
		Timeout:            config.Duration(5 * time.Second),
	}

	var memorySnapshots []uint64
	iterations := 10

	for i := 0; i < iterations; i++ {
		t.Logf("Memory leak test iteration %d/%d", i+1, iterations)

		// Force garbage collection before measurement
		runtime.GC()
		runtime.GC() // Call twice to ensure cleanup

		var memBefore runtime.MemStats
		runtime.ReadMemStats(&memBefore)

		// Run test
		s.runGoPerformanceTest(t, testConfig)

		// Force garbage collection after test
		runtime.GC()
		runtime.GC()

		var memAfter runtime.MemStats
		runtime.ReadMemStats(&memAfter)

		memorySnapshots = append(memorySnapshots, memAfter.HeapAlloc)

		// Small delay between iterations
		time.Sleep(100 * time.Millisecond)
	}

	// Analyze memory trend
	s.analyzeMemoryTrend(t, memorySnapshots)
}

// testResourceLimitHandling tests behavior under resource constraints
func (s *PerformanceValidationSuite) testResourceLimitHandling(t *testing.T) {
	// Test with very high concurrency to stress resource limits
	s.testServer.Reset()

	testConfig := &config.TestConfig{
		URL:                fmt.Sprintf("http://localhost:%d/test", s.testServer.config.Port),
		Method:             "GET",
		TotalRequests:      1000,
		RequestsPerSecond:  500,
		ConcurrentRequests: 500, // Very high concurrency
		Timeout:            config.Duration(2 * time.Second),
	}

	// Monitor resource usage during high-stress test
	resourceMetrics := s.monitorResourceUsage(t, testConfig)

	// Validate that the system handles high load gracefully
	t.Logf("Resource usage under high stress:")
	t.Logf("  Goroutines: %d", resourceMetrics.GoroutineCount)
	t.Logf("  Memory: %d MB", resourceMetrics.MemoryUsage.HeapAlloc/(1024*1024))
	t.Logf("  GC CPU Fraction: %.4f", resourceMetrics.MemoryUsage.GCCPUFraction)

	// Validate that GC pressure isn't too high
	if resourceMetrics.MemoryUsage.GCCPUFraction > 0.3 {
		t.Errorf("GC CPU fraction too high: %.4f (expected <= 0.3)",
			resourceMetrics.MemoryUsage.GCCPUFraction)
	} else {
		t.Logf("✓ GC CPU fraction acceptable: %.4f", resourceMetrics.MemoryUsage.GCCPUFraction)
	}
}

// Helper methods

func (s *PerformanceValidationSuite) runGoPerformanceTest(t *testing.T, testConfig *config.TestConfig) *PerformanceTestResult {
	// Create metrics collector
	metricsCollector := metrics.NewMetricsCollector()

	// Create HTTP client
	clientConfig := &client.TestConfig{
		URL:                testConfig.URL,
		Method:             testConfig.Method,
		Headers:            testConfig.Headers,
		Body:               testConfig.Body,
		TotalRequests:      testConfig.TotalRequests,
		RequestsPerSecond:  testConfig.RequestsPerSecond,
		ConcurrentRequests: testConfig.ConcurrentRequests,
		Timeout:            testConfig.Timeout.ToDuration(),
		SuccessChecker:     testConfig.SuccessChecker,
		DynamicDataFunc:    testConfig.DynamicDataFunc,
	}
	httpClient := client.NewHTTPClient(clientConfig, s.logger)

	// Create execution engine
	executionConfig := &engine.ExecutionConfig{
		TotalRequests:      testConfig.TotalRequests,
		ConcurrentRequests: testConfig.ConcurrentRequests,
		RequestsPerSecond:  testConfig.RequestsPerSecond,
	}
	executor := engine.NewExecutionEngine(httpClient, metricsCollector, executionConfig, s.logger)

	// Measure memory before test
	var memBefore runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&memBefore)

	// Execute test
	startTime := time.Now()
	_, err := executor.Start()
	if err != nil {
		t.Fatalf("Go performance test failed: %v", err)
	}

	// Get final metrics
	results := executor.GetFinalMetrics()
	endTime := time.Now()

	// Measure memory after test
	var memAfter runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&memAfter)

	memoryUsed := int64(memAfter.TotalAlloc - memBefore.TotalAlloc)

	return &PerformanceTestResult{
		Implementation:    "Go",
		TotalRequests:     results.TotalRequests,
		SuccessfulReqs:    results.SuccessfulReqs,
		Duration:          results.Duration,
		RequestsPerSecond: results.RequestsPerSecond,
		AvgResponseTime:   results.Percentiles.Avg,
		P95ResponseTime:   results.Percentiles.P95,
		P99ResponseTime:   results.Percentiles.P99,
		MemoryUsage:       memoryUsed,
		CPUTime:           endTime.Sub(startTime),
	}
}

func (s *PerformanceValidationSuite) runJavaScriptPerformanceTest(t *testing.T, testConfig *config.TestConfig) *PerformanceTestResult {
	// Check if Node.js is available
	if !s.isNodeJSAvailable() {
		t.Log("Node.js not available, skipping JavaScript performance test")
		return nil
	}

	// Create a temporary test script
	testScript := s.createJavaScriptTestScript(testConfig)
	defer os.Remove(testScript)

	// Execute JavaScript test
	startTime := time.Now()
	cmd := exec.Command("node", testScript)
	output, err := cmd.CombinedOutput()
	endTime := time.Now()

	if err != nil {
		t.Logf("JavaScript performance test failed: %v\nOutput: %s", err, string(output))
		return nil
	}

	// Parse results from JavaScript output
	var jsResults map[string]interface{}
	if err := json.Unmarshal(output, &jsResults); err != nil {
		t.Logf("Failed to parse JavaScript results: %v", err)
		return nil
	}

	// Convert to PerformanceTestResult
	return &PerformanceTestResult{
		Implementation:    "JavaScript",
		TotalRequests:     int(jsResults["totalRequests"].(float64)),
		SuccessfulReqs:    int(jsResults["successfulRequests"].(float64)),
		Duration:          time.Duration(jsResults["duration"].(float64)) * time.Millisecond,
		RequestsPerSecond: jsResults["requestsPerSecond"].(float64),
		AvgResponseTime:   time.Duration(jsResults["avgResponseTime"].(float64)) * time.Millisecond,
		P95ResponseTime:   time.Duration(jsResults["p95ResponseTime"].(float64)) * time.Millisecond,
		P99ResponseTime:   time.Duration(jsResults["p99ResponseTime"].(float64)) * time.Millisecond,
		MemoryUsage:       int64(jsResults["memoryUsage"].(float64)),
		CPUTime:           endTime.Sub(startTime),
	}
}

func (s *PerformanceValidationSuite) isNodeJSAvailable() bool {
	cmd := exec.Command("node", "--version")
	return cmd.Run() == nil
}

func (s *PerformanceValidationSuite) createJavaScriptTestScript(testConfig *config.TestConfig) string {
	tempFile, err := os.CreateTemp("", "js-perf-test-*.js")
	if err != nil {
		return ""
	}
	defer tempFile.Close()

	// Create a comprehensive JavaScript test script
	script := fmt.Sprintf(`
const axios = require('axios');
const { performance } = require('perf_hooks');

async function runTest() {
    const config = {
        url: '%s',
        method: '%s',
        totalRequests: %d,
        requestsPerSecond: %d,
        concurrentRequests: %d,
        timeout: %d
    };

    const results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        responseTimes: [],
        startTime: performance.now()
    };

    const promises = [];
    const requestInterval = 1000 / config.requestsPerSecond;
    const batchSize = Math.min(config.concurrentRequests, config.totalRequests);
    
    // Process requests in batches to control concurrency
    for (let i = 0; i < config.totalRequests; i += batchSize) {
        const batchPromises = [];
        const currentBatchSize = Math.min(batchSize, config.totalRequests - i);
        
        for (let j = 0; j < currentBatchSize; j++) {
            const requestIndex = i + j;
            const promise = new Promise((resolve) => {
                setTimeout(async () => {
                    const requestStart = performance.now();
                    try {
                        await axios({
                            method: config.method,
                            url: config.url,
                            timeout: config.timeout
                        });
                        const requestEnd = performance.now();
                        results.responseTimes.push(requestEnd - requestStart);
                        results.successfulRequests++;
                    } catch (error) {
                        results.failedRequests++;
                    }
                    results.totalRequests++;
                    resolve();
                }, requestIndex * requestInterval);
            });
            batchPromises.push(promise);
        }
        
        // Wait for current batch to complete before starting next batch
        await Promise.all(batchPromises);
    }
    
    const endTime = performance.now();
    const duration = endTime - results.startTime;
    
    // Calculate percentiles
    results.responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(results.responseTimes.length * 0.95);
    const p99Index = Math.floor(results.responseTimes.length * 0.99);
    
    const avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
    
    const output = {
        totalRequests: results.totalRequests,
        successfulRequests: results.successfulRequests,
        duration: duration,
        requestsPerSecond: results.totalRequests / (duration / 1000),
        avgResponseTime: avgResponseTime || 0,
        p95ResponseTime: results.responseTimes[p95Index] || 0,
        p99ResponseTime: results.responseTimes[p99Index] || 0,
        memoryUsage: process.memoryUsage().heapUsed
    };
    
    console.log(JSON.stringify(output));
}

runTest().catch(console.error);
`,
		testConfig.URL,
		testConfig.Method,
		testConfig.TotalRequests,
		testConfig.RequestsPerSecond,
		testConfig.ConcurrentRequests,
		int(testConfig.Timeout.ToDuration().Milliseconds()),
	)

	tempFile.WriteString(script)
	return tempFile.Name()
}

func (s *PerformanceValidationSuite) monitorResourceUsage(t *testing.T, testConfig *config.TestConfig) ResourceMetrics {
	var resourceMetrics ResourceMetrics
	var wg sync.WaitGroup

	// Start resource monitoring
	wg.Add(1)
	go func() {
		defer wg.Done()

		// Monitor resources during test execution
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()

		var maxMemory MemoryStats
		var maxGoroutines int

		for i := 0; i < 100; i++ { // Monitor for ~10 seconds
			select {
			case <-ticker.C:
				var memStats runtime.MemStats
				runtime.ReadMemStats(&memStats)

				if memStats.HeapAlloc > maxMemory.HeapAlloc {
					maxMemory = MemoryStats{
						HeapAlloc:     memStats.HeapAlloc,
						HeapSys:       memStats.HeapSys,
						HeapInuse:     memStats.HeapInuse,
						StackInuse:    memStats.StackInuse,
						TotalAlloc:    memStats.TotalAlloc,
						NumGC:         memStats.NumGC,
						GCCPUFraction: memStats.GCCPUFraction,
					}
				}

				goroutines := runtime.NumGoroutine()
				if goroutines > maxGoroutines {
					maxGoroutines = goroutines
				}
			}
		}

		resourceMetrics.MemoryUsage = maxMemory
		resourceMetrics.GoroutineCount = maxGoroutines
	}()

	// Run the actual test
	s.runGoPerformanceTest(t, testConfig)

	// Wait for monitoring to complete
	wg.Wait()

	return resourceMetrics
}

func (s *PerformanceValidationSuite) measureTimingAccuracy(t *testing.T, testConfig *config.TestConfig, expectedDelay time.Duration) AccuracyTestResult {
	// Run test and collect detailed timing data
	result := s.runDetailedPerformanceTest(t, testConfig)

	// Calculate timing accuracy metrics
	var totalError time.Duration
	var maxError time.Duration
	var errors []time.Duration

	for _, responseTime := range result.ResponseTimes {
		// Account for network overhead (subtract minimum observed time)
		minTime := result.Percentiles.Min
		adjustedTime := responseTime - minTime

		error := time.Duration(math.Abs(float64(adjustedTime - expectedDelay)))
		errors = append(errors, error)
		totalError += error

		if error > maxError {
			maxError = error
		}
	}

	meanError := totalError / time.Duration(len(errors))

	// Calculate standard deviation
	var variance float64
	for _, error := range errors {
		diff := float64(error - meanError)
		variance += diff * diff
	}
	variance /= float64(len(errors))
	standardDev := time.Duration(math.Sqrt(variance))

	// Calculate accuracy percentage
	accuracyPercent := (1.0 - float64(meanError)/float64(expectedDelay)) * 100

	return AccuracyTestResult{
		ExpectedDelay:   expectedDelay,
		MeasuredDelays:  result.ResponseTimes,
		MeanError:       meanError,
		StandardDev:     standardDev,
		MaxError:        maxError,
		AccuracyPercent: accuracyPercent,
	}
}

func (s *PerformanceValidationSuite) runDetailedPerformanceTest(t *testing.T, testConfig *config.TestConfig) *DetailedPerformanceResult {
	// Create metrics collector
	metricsCollector := metrics.NewMetricsCollector()

	// Create HTTP client
	clientConfig := &client.TestConfig{
		URL:                testConfig.URL,
		Method:             testConfig.Method,
		Headers:            testConfig.Headers,
		Body:               testConfig.Body,
		TotalRequests:      testConfig.TotalRequests,
		RequestsPerSecond:  testConfig.RequestsPerSecond,
		ConcurrentRequests: testConfig.ConcurrentRequests,
		Timeout:            testConfig.Timeout.ToDuration(),
		SuccessChecker:     testConfig.SuccessChecker,
		DynamicDataFunc:    testConfig.DynamicDataFunc,
	}
	httpClient := client.NewHTTPClient(clientConfig, s.logger)

	// Create execution engine
	executionConfig := &engine.ExecutionConfig{
		TotalRequests:      testConfig.TotalRequests,
		ConcurrentRequests: testConfig.ConcurrentRequests,
		RequestsPerSecond:  testConfig.RequestsPerSecond,
	}
	executor := engine.NewExecutionEngine(httpClient, metricsCollector, executionConfig, s.logger)

	// Execute test
	_, err := executor.Start()
	if err != nil {
		t.Fatalf("Detailed performance test failed: %v", err)
	}

	// Get final metrics
	results := executor.GetFinalMetrics()

	// Get detailed response times from metrics collector
	responseTimes := metricsCollector.GetResponseTimes()

	return &DetailedPerformanceResult{
		Percentiles:   results.Percentiles,
		ResponseTimes: responseTimes,
	}
}

func (s *PerformanceValidationSuite) runScalabilityTest(t *testing.T, testConfig *config.TestConfig) ScalabilityTestResult {
	// Monitor resources during test
	resourceMetrics := s.monitorResourceUsage(t, testConfig)

	// Run performance test
	result := s.runGoPerformanceTest(t, testConfig)

	errorRate := float64(result.TotalRequests-result.SuccessfulReqs) / float64(result.TotalRequests)

	return ScalabilityTestResult{
		ConcurrentRequests: testConfig.ConcurrentRequests,
		TotalRequests:      result.TotalRequests,
		Duration:           result.Duration,
		RequestsPerSecond:  result.RequestsPerSecond,
		AvgResponseTime:    result.AvgResponseTime,
		P95ResponseTime:    result.P95ResponseTime,
		P99ResponseTime:    result.P99ResponseTime,
		ErrorRate:          errorRate,
		ResourceMetrics:    resourceMetrics,
	}
}

func (s *PerformanceValidationSuite) isWithinTolerance(actual, expected time.Duration, tolerance float64) bool {
	diff := math.Abs(float64(actual - expected))
	return diff <= float64(expected)*tolerance
}

func (s *PerformanceValidationSuite) analyzeScalabilityTrends(t *testing.T, results []ScalabilityTestResult) {
	t.Log("=== Scalability Trend Analysis ===")

	for i, result := range results {
		t.Logf("Concurrency %d: RPS=%.2f, P95=%v, ErrorRate=%.2f%%, Memory=%dMB",
			result.ConcurrentRequests,
			result.RequestsPerSecond,
			result.P95ResponseTime,
			result.ErrorRate*100,
			result.ResourceMetrics.MemoryUsage.HeapAlloc/(1024*1024))
	}

	// Check for performance degradation
	if len(results) >= 2 {
		lastResult := results[len(results)-1]
		firstResult := results[0]

		throughputRatio := lastResult.RequestsPerSecond / firstResult.RequestsPerSecond
		responseTimeRatio := float64(lastResult.P95ResponseTime) / float64(firstResult.P95ResponseTime)

		t.Logf("Scalability Summary:")
		t.Logf("  Throughput scaling: %.2fx", throughputRatio)
		t.Logf("  Response time scaling: %.2fx", responseTimeRatio)

		if throughputRatio < 0.5 {
			t.Errorf("Throughput degraded significantly under high load: %.2fx", throughputRatio)
		}

		if responseTimeRatio > 5.0 {
			t.Errorf("Response time degraded significantly under high load: %.2fx", responseTimeRatio)
		}
	}
}

func (s *PerformanceValidationSuite) validateConcurrencyScaling(t *testing.T, concurrencyLevels []int, throughputResults []float64, responseTimeResults []time.Duration) {
	t.Log("=== Concurrency Scaling Analysis ===")

	for i, concurrency := range concurrencyLevels {
		t.Logf("Concurrency %d: RPS=%.2f, AvgTime=%v",
			concurrency, throughputResults[i], responseTimeResults[i])
	}

	// Find optimal concurrency level (highest throughput)
	maxThroughput := 0.0
	optimalConcurrency := 0

	for i, throughput := range throughputResults {
		if throughput > maxThroughput {
			maxThroughput = throughput
			optimalConcurrency = concurrencyLevels[i]
		}
	}

	t.Logf("Optimal concurrency level: %d (%.2f RPS)", optimalConcurrency, maxThroughput)

	// Validate that throughput increases with concurrency up to a point
	improvementFound := false
	for i := 1; i < len(throughputResults); i++ {
		if throughputResults[i] > throughputResults[i-1]*1.1 { // 10% improvement
			improvementFound = true
			break
		}
	}

	if !improvementFound {
		t.Errorf("No significant throughput improvement found with increased concurrency")
	} else {
		t.Logf("✓ Concurrency scaling shows performance improvement")
	}
}

func (s *PerformanceValidationSuite) analyzeMemoryTrend(t *testing.T, memorySnapshots []uint64) {
	t.Log("=== Memory Leak Analysis ===")

	// Calculate trend
	firstSnapshot := memorySnapshots[0]
	lastSnapshot := memorySnapshots[len(memorySnapshots)-1]

	for i, snapshot := range memorySnapshots {
		t.Logf("Iteration %d: %d bytes (%.2f MB)", i+1, snapshot, float64(snapshot)/(1024*1024))
	}

	// Check for memory leak (significant increase over time)
	memoryIncrease := float64(lastSnapshot) / float64(firstSnapshot)

	if memoryIncrease > 2.0 { // More than 2x increase indicates potential leak
		t.Errorf("Potential memory leak detected: %.2fx increase from %d to %d bytes",
			memoryIncrease, firstSnapshot, lastSnapshot)
	} else {
		t.Logf("✓ No significant memory leak detected: %.2fx change", memoryIncrease)
	}

	// Calculate memory stability (standard deviation)
	mean := float64(0)
	for _, snapshot := range memorySnapshots {
		mean += float64(snapshot)
	}
	mean /= float64(len(memorySnapshots))

	variance := float64(0)
	for _, snapshot := range memorySnapshots {
		diff := float64(snapshot) - mean
		variance += diff * diff
	}
	variance /= float64(len(memorySnapshots))
	stdDev := math.Sqrt(variance)

	stabilityPercent := (1.0 - stdDev/mean) * 100
	t.Logf("Memory stability: %.2f%% (lower is more stable)", 100-stabilityPercent)
}

func (s *PerformanceValidationSuite) validateGoPerformanceRequirements(t *testing.T, result *PerformanceTestResult, config *config.TestConfig) {
	// Validate success rate
	successRate := float64(result.SuccessfulReqs) / float64(result.TotalRequests)
	if successRate < 0.95 { // 95% success rate minimum
		t.Errorf("Go implementation success rate too low: %.2f%% (expected >= 95%%)", successRate*100)
	}

	// Validate throughput is reasonable (should achieve at least 80% of target RPS)
	minExpectedRPS := float64(config.RequestsPerSecond) * 0.8
	if result.RequestsPerSecond < minExpectedRPS {
		t.Errorf("Go implementation throughput too low: %.2f RPS (expected >= %.2f RPS)",
			result.RequestsPerSecond, minExpectedRPS)
	}

	// Validate response times are reasonable
	if result.P95ResponseTime > 2*time.Second {
		t.Errorf("Go implementation P95 response time too high: %v (expected < 2s)", result.P95ResponseTime)
	}
}

// DetailedPerformanceResult holds detailed performance test results
type DetailedPerformanceResult struct {
	Percentiles   metrics.PercentileMetrics `json:"percentiles"`
	ResponseTimes []time.Duration           `json:"responseTimes"`
}
