package integration

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"http-load-test/internal/client"
	"http-load-test/internal/config"
	"http-load-test/internal/engine"
	"http-load-test/internal/logger"
	"http-load-test/internal/metrics"
)

// PerformanceTestResult holds results from a performance test
type PerformanceTestResult struct {
	Implementation    string        `json:"implementation"`
	TotalRequests     int           `json:"totalRequests"`
	SuccessfulReqs    int           `json:"successfulRequests"`
	Duration          time.Duration `json:"duration"`
	RequestsPerSecond float64       `json:"requestsPerSecond"`
	AvgResponseTime   time.Duration `json:"avgResponseTime"`
	P95ResponseTime   time.Duration `json:"p95ResponseTime"`
	P99ResponseTime   time.Duration `json:"p99ResponseTime"`
	MemoryUsage       int64         `json:"memoryUsage"` // in bytes
	CPUTime           time.Duration `json:"cpuTime"`
}

// PerformanceComparison holds comparison results between implementations
type PerformanceComparison struct {
	GoResult         *PerformanceTestResult  `json:"goResult"`
	JavaScriptResult *PerformanceTestResult  `json:"javascriptResult"`
	Improvement      *PerformanceImprovement `json:"improvement"`
}

// PerformanceImprovement quantifies the improvement of Go over JavaScript
type PerformanceImprovement struct {
	ThroughputImprovement float64 `json:"throughputImprovement"` // multiplier (e.g., 2.5x)
	ResponseTimeReduction float64 `json:"responseTimeReduction"` // percentage reduction
	MemoryReduction       float64 `json:"memoryReduction"`       // percentage reduction
}

// TestGoVsJavaScriptPerformance compares Go and JavaScript implementations
func TestGoVsJavaScriptPerformance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance comparison test in short mode")
	}

	// Start test server
	serverConfig := TestServerConfig{
		Port:                8082,
		DefaultDelay:        0,
		DefaultStatusCode:   200,
		DefaultResponseSize: 0,
		EnableLogging:       false,
	}
	testServer := NewTestServer(serverConfig)

	if err := testServer.Start(); err != nil {
		t.Fatalf("Failed to start test server: %v", err)
	}
	defer testServer.Stop()

	// Test configurations for comparison
	testConfigs := []*config.TestConfig{
		{
			URL:                "http://localhost:8082/test",
			Method:             "GET",
			TotalRequests:      50, // Reduced for faster testing
			RequestsPerSecond:  20,
			ConcurrentRequests: 5,
			Timeout:            config.Duration(5 * time.Second),
		},
		{
			URL:                "http://localhost:8082/test",
			Method:             "GET",
			TotalRequests:      100, // Reduced for faster testing
			RequestsPerSecond:  50,
			ConcurrentRequests: 10,
			Timeout:            config.Duration(5 * time.Second),
		},
		{
			URL:                "http://localhost:8082/test",
			Method:             "GET",
			TotalRequests:      200, // Reduced for faster testing
			RequestsPerSecond:  100,
			ConcurrentRequests: 20,
			Timeout:            config.Duration(5 * time.Second),
		},
	}

	for i, testConfig := range testConfigs {
		t.Run(fmt.Sprintf("Performance_Test_%d_Requests_%d", testConfig.TotalRequests, testConfig.RequestsPerSecond), func(t *testing.T) {
			// Reset server stats
			testServer.Reset()

			// Run Go implementation test
			goResult := runGoPerformanceTest(t, testConfig)

			// Run JavaScript implementation test (if available)
			jsResult := runJavaScriptPerformanceTest(t, testConfig)

			// Compare results
			comparison := comparePerformanceResults(goResult, jsResult)

			// Log results
			logPerformanceComparison(t, comparison)

			// Validate that Go implementation meets performance requirements
			validateGoPerformance(t, goResult, testConfig)

			// If JavaScript test was successful, validate improvement
			if jsResult != nil {
				validatePerformanceImprovement(t, comparison)
			}

			// Save results to file for analysis
			savePerformanceResults(t, fmt.Sprintf("performance_test_%d", i), comparison)
		})
	}
}

// runGoPerformanceTest executes a performance test using the Go implementation
func runGoPerformanceTest(t *testing.T, testConfig *config.TestConfig) *PerformanceTestResult {
	// Create logger
	testLogger := logger.New(&logger.Config{
		Level:  logger.ERROR, // Minimal logging for performance test
		Output: os.Stdout,
	})

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
	httpClient := client.NewHTTPClient(clientConfig, testLogger)

	// Create execution engine
	executionConfig := &engine.ExecutionConfig{
		TotalRequests:      testConfig.TotalRequests,
		ConcurrentRequests: testConfig.ConcurrentRequests,
		RequestsPerSecond:  testConfig.RequestsPerSecond,
	}
	executor := engine.NewExecutionEngine(httpClient, metricsCollector, executionConfig, testLogger)

	// Measure memory before test
	var memBefore runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&memBefore)

	// Measure CPU time
	startTime := time.Now()

	// Execute test
	_, err := executor.Start()
	if err != nil {
		t.Fatalf("Go performance test failed: %v", err)
	}

	// Get final metrics
	results := executor.GetFinalMetrics()
	if err != nil {
		t.Fatalf("Go performance test failed: %v", err)
	}

	endTime := time.Now()
	cpuTime := endTime.Sub(startTime)

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
		CPUTime:           cpuTime,
	}
}

// runJavaScriptPerformanceTest executes a performance test using the JavaScript implementation
func runJavaScriptPerformanceTest(t *testing.T, testConfig *config.TestConfig) *PerformanceTestResult {
	// Check if Node.js is available
	if !isNodeJSAvailable() {
		t.Log("Node.js not available, skipping JavaScript performance test")
		return nil
	}

	// Create a temporary test script
	testScript := createJavaScriptTestScript(testConfig)
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

// isNodeJSAvailable checks if Node.js is available in the system
func isNodeJSAvailable() bool {
	cmd := exec.Command("node", "--version")
	return cmd.Run() == nil
}

// createJavaScriptTestScript creates a temporary JavaScript test script
func createJavaScriptTestScript(testConfig *config.TestConfig) string {
	tempFile, err := os.CreateTemp("", "js-perf-test-*.js")
	if err != nil {
		return ""
	}
	defer tempFile.Close()

	// Create a simple JavaScript test script that mimics the Go test
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
    
    for (let i = 0; i < config.totalRequests; i++) {
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
            }, i * requestInterval);
        });
        promises.push(promise);
    }

    await Promise.all(promises);
    
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

// comparePerformanceResults compares Go and JavaScript performance results
func comparePerformanceResults(goResult, jsResult *PerformanceTestResult) *PerformanceComparison {
	comparison := &PerformanceComparison{
		GoResult:         goResult,
		JavaScriptResult: jsResult,
	}

	if jsResult != nil {
		// Calculate improvements
		throughputImprovement := goResult.RequestsPerSecond / jsResult.RequestsPerSecond
		responseTimeReduction := (float64(jsResult.AvgResponseTime-goResult.AvgResponseTime) / float64(jsResult.AvgResponseTime)) * 100
		memoryReduction := (float64(jsResult.MemoryUsage-goResult.MemoryUsage) / float64(jsResult.MemoryUsage)) * 100

		comparison.Improvement = &PerformanceImprovement{
			ThroughputImprovement: throughputImprovement,
			ResponseTimeReduction: responseTimeReduction,
			MemoryReduction:       memoryReduction,
		}
	}

	return comparison
}

// logPerformanceComparison logs the performance comparison results
func logPerformanceComparison(t *testing.T, comparison *PerformanceComparison) {
	t.Logf("=== Performance Comparison Results ===")

	if comparison.GoResult != nil {
		t.Logf("Go Implementation:")
		t.Logf("  Requests/sec: %.2f", comparison.GoResult.RequestsPerSecond)
		t.Logf("  Avg response time: %v", comparison.GoResult.AvgResponseTime)
		t.Logf("  P95 response time: %v", comparison.GoResult.P95ResponseTime)
		t.Logf("  Memory usage: %d bytes", comparison.GoResult.MemoryUsage)
		t.Logf("  Success rate: %.2f%%", float64(comparison.GoResult.SuccessfulReqs)/float64(comparison.GoResult.TotalRequests)*100)
	}

	if comparison.JavaScriptResult != nil {
		t.Logf("JavaScript Implementation:")
		t.Logf("  Requests/sec: %.2f", comparison.JavaScriptResult.RequestsPerSecond)
		t.Logf("  Avg response time: %v", comparison.JavaScriptResult.AvgResponseTime)
		t.Logf("  P95 response time: %v", comparison.JavaScriptResult.P95ResponseTime)
		t.Logf("  Memory usage: %d bytes", comparison.JavaScriptResult.MemoryUsage)
		t.Logf("  Success rate: %.2f%%", float64(comparison.JavaScriptResult.SuccessfulReqs)/float64(comparison.JavaScriptResult.TotalRequests)*100)

		if comparison.Improvement != nil {
			t.Logf("Performance Improvement (Go vs JavaScript):")
			t.Logf("  Throughput: %.2fx faster", comparison.Improvement.ThroughputImprovement)
			t.Logf("  Response time: %.1f%% reduction", comparison.Improvement.ResponseTimeReduction)
			t.Logf("  Memory usage: %.1f%% reduction", comparison.Improvement.MemoryReduction)
		}
	}
}

// validateGoPerformance validates that Go implementation meets performance requirements
func validateGoPerformance(t *testing.T, result *PerformanceTestResult, config *config.TestConfig) {
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

	// Validate response times are reasonable (should be under 1 second for P95)
	if result.P95ResponseTime > time.Second {
		t.Errorf("Go implementation P95 response time too high: %v (expected < 1s)", result.P95ResponseTime)
	}
}

// validatePerformanceImprovement validates that Go shows improvement over JavaScript
func validatePerformanceImprovement(t *testing.T, comparison *PerformanceComparison) {
	if comparison.Improvement == nil {
		return
	}

	// Validate throughput improvement (should be at least 1.5x faster)
	if comparison.Improvement.ThroughputImprovement < 1.5 {
		t.Errorf("Go throughput improvement insufficient: %.2fx (expected >= 1.5x)",
			comparison.Improvement.ThroughputImprovement)
	}

	// Validate response time reduction (should be at least 10% faster)
	if comparison.Improvement.ResponseTimeReduction < 10 {
		t.Errorf("Go response time improvement insufficient: %.1f%% (expected >= 10%%)",
			comparison.Improvement.ResponseTimeReduction)
	}

	t.Logf("Performance improvement validation passed:")
	t.Logf("  Throughput: %.2fx improvement", comparison.Improvement.ThroughputImprovement)
	t.Logf("  Response time: %.1f%% improvement", comparison.Improvement.ResponseTimeReduction)
}

// savePerformanceResults saves performance results to a file for analysis
func savePerformanceResults(t *testing.T, testName string, comparison *PerformanceComparison) {
	// Create results directory if it doesn't exist
	resultsDir := "test/results"
	os.MkdirAll(resultsDir, 0755)

	// Save results as JSON
	filename := filepath.Join(resultsDir, fmt.Sprintf("%s_results.json", testName))
	file, err := os.Create(filename)
	if err != nil {
		t.Logf("Failed to create results file: %v", err)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(comparison); err != nil {
		t.Logf("Failed to write results: %v", err)
		return
	}

	t.Logf("Performance results saved to: %s", filename)
}

// BenchmarkGoImplementation benchmarks the Go implementation specifically
func BenchmarkGoImplementation(b *testing.B) {
	// Start test server
	serverConfig := TestServerConfig{
		Port:                8083,
		DefaultDelay:        0,
		DefaultStatusCode:   200,
		DefaultResponseSize: 0,
		EnableLogging:       false,
	}
	testServer := NewTestServer(serverConfig)

	if err := testServer.Start(); err != nil {
		b.Fatalf("Failed to start test server: %v", err)
	}
	defer testServer.Stop()

	// Test configuration
	testConfig := &config.TestConfig{
		URL:                "http://localhost:8083/test",
		Method:             "GET",
		TotalRequests:      50, // Reduced for faster benchmarking
		RequestsPerSecond:  25,
		ConcurrentRequests: 5,
		Timeout:            config.Duration(5 * time.Second),
	}

	// Create logger
	testLogger := logger.New(&logger.Config{
		Level:  logger.ERROR,
		Output: os.Stdout,
	})

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		// Reset server stats
		testServer.Reset()

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
		httpClient := client.NewHTTPClient(clientConfig, testLogger)

		// Create execution engine
		executionConfig := &engine.ExecutionConfig{
			TotalRequests:      testConfig.TotalRequests,
			ConcurrentRequests: testConfig.ConcurrentRequests,
			RequestsPerSecond:  testConfig.RequestsPerSecond,
		}
		executor := engine.NewExecutionEngine(httpClient, metricsCollector, executionConfig, testLogger)

		// Execute test
		_, err := executor.Start()
		if err != nil {
			b.Fatalf("Benchmark execution failed: %v", err)
		}

		// Get final metrics
		results := executor.GetFinalMetrics()

		if err != nil {
			b.Fatalf("Benchmark execution failed: %v", err)
		}

		// Report metrics
		b.ReportMetric(float64(results.RequestsPerSecond), "rps")
		b.ReportMetric(float64(results.Percentiles.P95.Nanoseconds())/1e6, "p95_ms")
		b.ReportMetric(float64(results.Percentiles.Avg.Nanoseconds())/1e6, "avg_ms")
		b.ReportMetric(float64(results.SuccessfulReqs)/float64(results.TotalRequests)*100, "success_rate")
	}
}
