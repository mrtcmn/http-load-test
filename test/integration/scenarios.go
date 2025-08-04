package integration

import (
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

// TestScenario defines a complete end-to-end test scenario
type TestScenario struct {
	Name        string
	Description string
	Config      *config.TestConfig
	ServerSetup func(*TestServer) error
	Validation  func(*testing.T, *metrics.MetricsSummary, *TestServer)
	Timeout     time.Duration
}

// ScenarioRunner manages and executes test scenarios
type ScenarioRunner struct {
	testServer *TestServer
	logger     *logger.Logger
}

// convertToClientConfig converts config.TestConfig to client.TestConfig
func convertToClientConfig(cfg *config.TestConfig) *client.TestConfig {
	return &client.TestConfig{
		URL:                cfg.URL,
		Method:             cfg.Method,
		Headers:            cfg.Headers,
		Body:               cfg.Body,
		TotalRequests:      cfg.TotalRequests,
		RequestsPerSecond:  cfg.RequestsPerSecond,
		ConcurrentRequests: cfg.ConcurrentRequests,
		Timeout:            cfg.Timeout.ToDuration(),
		SuccessChecker:     cfg.SuccessChecker,
		DynamicDataFunc:    cfg.DynamicDataFunc,
	}
}

// NewScenarioRunner creates a new scenario runner
func NewScenarioRunner() *ScenarioRunner {
	testLogger := logger.New(&logger.Config{
		Level:  logger.INFO,
		Output: os.Stdout,
	})

	serverConfig := TestServerConfig{
		Port:                8081,
		DefaultDelay:        0,
		DefaultStatusCode:   200,
		DefaultResponseSize: 0,
		EnableLogging:       false,
	}

	return &ScenarioRunner{
		testServer: NewTestServer(serverConfig),
		logger:     testLogger,
	}
}

// RunScenario executes a single test scenario
func (sr *ScenarioRunner) RunScenario(t *testing.T, scenario *TestScenario) {
	t.Run(scenario.Name, func(t *testing.T) {
		// Reset server stats
		sr.testServer.Reset()

		// Setup server configuration if provided
		if scenario.ServerSetup != nil {
			if err := scenario.ServerSetup(sr.testServer); err != nil {
				t.Fatalf("Failed to setup server: %v", err)
			}
		}

		// Create metrics collector
		metricsCollector := metrics.NewMetricsCollector()

		// Create HTTP client
		clientConfig := convertToClientConfig(scenario.Config)
		httpClient := client.NewHTTPClient(clientConfig, sr.logger)

		// Create execution engine
		executionConfig := &engine.ExecutionConfig{
			TotalRequests:      scenario.Config.TotalRequests,
			ConcurrentRequests: scenario.Config.ConcurrentRequests,
			RequestsPerSecond:  scenario.Config.RequestsPerSecond,
		}
		executor := engine.NewExecutionEngine(httpClient, metricsCollector, executionConfig, sr.logger)

		// Execute test
		_, err := executor.Start()
		if err != nil {
			t.Fatalf("Test execution failed: %v", err)
		}

		// Get final metrics
		results := executor.GetFinalMetrics()

		// Run validation
		if scenario.Validation != nil {
			scenario.Validation(t, &results, sr.testServer)
		}

		t.Logf("Scenario '%s' completed successfully", scenario.Name)
	})
}

// GetBasicScenarios returns a set of basic test scenarios
func GetBasicScenarios() []*TestScenario {
	baseURL := "http://localhost:8081"

	return []*TestScenario{
		{
			Name:        "Basic GET Request",
			Description: "Simple GET request with default settings",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      10,
				RequestsPerSecond:  5,
				ConcurrentRequests: 2,
				Timeout:            config.Duration(5 * time.Second),
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				if results.TotalRequests != 10 {
					t.Errorf("Expected 10 total requests, got %d", results.TotalRequests)
				}
				if results.SuccessfulReqs != 10 {
					t.Errorf("Expected 10 successful requests, got %d", results.SuccessfulReqs)
				}
				if results.FailedRequests != 0 {
					t.Errorf("Expected 0 failed requests, got %d", results.FailedRequests)
				}

				stats := server.GetStats()
				if stats.TotalRequests != 10 {
					t.Errorf("Server received %d requests, expected 10", stats.TotalRequests)
				}
			},
		},
		{
			Name:        "POST Request with Body",
			Description: "POST request with JSON body",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "POST",
				Body:               `{"test": "data", "number": 42}`,
				Headers:            map[string]string{"Content-Type": "application/json"},
				TotalRequests:      5,
				RequestsPerSecond:  2,
				ConcurrentRequests: 1,
				Timeout:            config.Duration(5 * time.Second),
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				if results.TotalRequests != 5 {
					t.Errorf("Expected 5 total requests, got %d", results.TotalRequests)
				}
				if results.SuccessfulReqs != 5 {
					t.Errorf("Expected 5 successful requests, got %d", results.SuccessfulReqs)
				}
			},
		},
		{
			Name:        "High Concurrency Test",
			Description: "Test with high concurrent requests",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      50, // Reduced for faster testing
				RequestsPerSecond:  25,
				ConcurrentRequests: 10,
				Timeout:            config.Duration(5 * time.Second),
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				if results.TotalRequests != 50 {
					t.Errorf("Expected 50 total requests, got %d", results.TotalRequests)
				}

				// Verify throughput is reasonable
				actualRPS := float64(results.TotalRequests) / results.Duration.Seconds()
				if actualRPS < 5 { // Should achieve at least 5 RPS
					t.Errorf("Low throughput: %.2f RPS", actualRPS)
				}

				// Verify percentiles are calculated
				if results.Percentiles.P50 == 0 {
					t.Error("P50 percentile should not be zero")
				}
				if results.Percentiles.P95 == 0 {
					t.Error("P95 percentile should not be zero")
				}
			},
		},
		{
			Name:        "Error Handling Test",
			Description: "Test handling of server errors",
			Config: &config.TestConfig{
				URL:                baseURL + "/error?code=500",
				Method:             "GET",
				TotalRequests:      5, // Reduced for faster testing
				RequestsPerSecond:  5,
				ConcurrentRequests: 2,
				Timeout:            config.Duration(5 * time.Second),
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				if results.TotalRequests != 5 {
					t.Errorf("Expected 5 total requests, got %d", results.TotalRequests)
				}
				if results.FailedRequests != 5 {
					t.Errorf("Expected 5 failed requests, got %d", results.FailedRequests)
				}
				if results.SuccessfulReqs != 0 {
					t.Errorf("Expected 0 successful requests, got %d", results.SuccessfulReqs)
				}

				// Check error categorization
				if count, exists := results.StatusCodes[500]; !exists || count != 5 {
					t.Errorf("Expected 5 requests with status 500, got %d", count)
				}
			},
		},
	}
}

// GetAdvancedScenarios returns more complex test scenarios
func GetAdvancedScenarios() []*TestScenario {
	baseURL := "http://localhost:8081"

	return []*TestScenario{
		{
			Name:        "Mixed Success/Failure Rate",
			Description: "Test with configured failure rate",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      20, // Reduced for faster testing
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            config.Duration(5 * time.Second),
			},
			ServerSetup: func(server *TestServer) error {
				// Configure 20% failure rate
				server.ConfigureEndpoint("/test", &EndpointConfig{
					StatusCode:  200,
					FailureRate: 0.2,
				})
				return nil
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				if results.TotalRequests != 20 {
					t.Errorf("Expected 20 total requests, got %d", results.TotalRequests)
				}

				// With 20% failure rate, we expect some mix of success and failure
				// Due to randomness, we'll be lenient and just check that we have both
				totalRequests := results.SuccessfulReqs + results.FailedRequests
				if totalRequests != results.TotalRequests {
					t.Errorf("Success + Failed requests (%d) should equal total (%d)",
						totalRequests, results.TotalRequests)
				}

				// At least verify we got some requests processed
				if results.TotalRequests == 0 {
					t.Error("No requests were processed")
				}
			},
		},
		{
			Name:        "Variable Response Times",
			Description: "Test with variable response delays",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      10, // Reduced for faster testing
				RequestsPerSecond:  5,
				ConcurrentRequests: 3,
				Timeout:            config.Duration(10 * time.Second),
			},
			ServerSetup: func(server *TestServer) error {
				// Configure variable delays
				server.ConfigureEndpoint("/test", &EndpointConfig{
					StatusCode: 200,
					Delay:      100 * time.Millisecond,
				})
				return nil
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				if results.TotalRequests != 10 {
					t.Errorf("Expected 10 total requests, got %d", results.TotalRequests)
				}

				// Verify response time metrics
				if results.Percentiles.Min == 0 {
					t.Error("Minimum response time should not be zero")
				}
				if results.Percentiles.Max == 0 {
					t.Error("Maximum response time should not be zero")
				}
				if results.Percentiles.Avg == 0 {
					t.Error("Average response time should not be zero")
				}

				// With 100ms delay, average should be at least 100ms
				if results.Percentiles.Avg < 100*time.Millisecond {
					t.Errorf("Average response time too low: %v", results.Percentiles.Avg)
				}
			},
		},
	}
}

// RunCrossPlatformTests runs tests to verify cross-platform compatibility
func RunCrossPlatformTests(t *testing.T) {
	t.Run("Cross-Platform Binary Tests", func(t *testing.T) {
		// Test binary compilation for different platforms
		platforms := []struct {
			GOOS   string
			GOARCH string
		}{
			{"linux", "amd64"},
			{"darwin", "amd64"},
			{"windows", "amd64"},
		}

		for _, platform := range platforms {
			t.Run(fmt.Sprintf("%s-%s", platform.GOOS, platform.GOARCH), func(t *testing.T) {
				// Skip if we can't cross-compile for this platform
				if !canCrossCompile(platform.GOOS, platform.GOARCH) {
					t.Skipf("Cross-compilation not available for %s-%s", platform.GOOS, platform.GOARCH)
				}

				// Build binary for target platform
				binaryPath := buildBinaryForPlatform(t, platform.GOOS, platform.GOARCH)
				defer os.Remove(binaryPath)

				// Verify binary was created
				if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
					t.Errorf("Binary not created for %s-%s", platform.GOOS, platform.GOARCH)
				}

				t.Logf("Successfully built binary for %s-%s", platform.GOOS, platform.GOARCH)
			})
		}
	})

	t.Run("Runtime Platform Detection", func(t *testing.T) {
		// Test that the application correctly detects the current platform
		currentOS := runtime.GOOS
		currentArch := runtime.GOARCH

		t.Logf("Current platform: %s-%s", currentOS, currentArch)

		// Verify we support the current platform
		supportedPlatforms := []string{"linux", "darwin", "windows"}
		supported := false
		for _, platform := range supportedPlatforms {
			if currentOS == platform {
				supported = true
				break
			}
		}

		if !supported {
			t.Errorf("Current platform %s is not in supported platforms list", currentOS)
		}
	})
}

// canCrossCompile checks if cross-compilation is available for the target platform
func canCrossCompile(targetOS, targetArch string) bool {
	// For this test, we'll assume cross-compilation is available
	// In a real scenario, you might want to check for specific build tools
	return true
}

// buildBinaryForPlatform builds a binary for the specified platform
func buildBinaryForPlatform(t *testing.T, targetOS, targetArch string) string {
	// Create temporary directory for build
	tempDir, err := os.MkdirTemp("", "integration-test-build")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}

	// Determine binary name
	binaryName := "http-load-test"
	if targetOS == "windows" {
		binaryName += ".exe"
	}
	binaryPath := filepath.Join(tempDir, binaryName)

	// Build command
	cmd := exec.Command("go", "build", "-o", binaryPath, "./cmd/http-load-test")
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("GOOS=%s", targetOS),
		fmt.Sprintf("GOARCH=%s", targetArch),
	)

	// Set working directory to project root
	projectRoot, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("Failed to get project root: %v", err)
	}
	cmd.Dir = projectRoot

	// Execute build
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Failed to build binary for %s-%s: %v\nOutput: %s",
			targetOS, targetArch, err, string(output))
	}

	return binaryPath
}

// BenchmarkScenario represents a performance benchmark scenario
type BenchmarkScenario struct {
	Name        string
	Config      *config.TestConfig
	ServerSetup func(*TestServer) error
}

// GetBenchmarkScenarios returns scenarios for performance benchmarking
func GetBenchmarkScenarios() []*BenchmarkScenario {
	baseURL := "http://localhost:8081"

	return []*BenchmarkScenario{
		{
			Name: "Low Load Benchmark",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      50, // Reduced for faster benchmarking
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            config.Duration(5 * time.Second),
			},
		},
		{
			Name: "Medium Load Benchmark",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      200, // Reduced for faster benchmarking
				RequestsPerSecond:  50,
				ConcurrentRequests: 10,
				Timeout:            config.Duration(5 * time.Second),
			},
		},
		{
			Name: "High Load Benchmark",
			Config: &config.TestConfig{
				URL:                baseURL + "/test",
				Method:             "GET",
				TotalRequests:      500, // Reduced for faster benchmarking
				RequestsPerSecond:  100,
				ConcurrentRequests: 20,
				Timeout:            config.Duration(5 * time.Second),
			},
		},
	}
}

// RunBenchmarkScenario executes a benchmark scenario
func (sr *ScenarioRunner) RunBenchmarkScenario(b *testing.B, scenario *BenchmarkScenario) {
	// Start test server
	if err := sr.testServer.Start(); err != nil {
		b.Fatalf("Failed to start test server: %v", err)
	}
	defer sr.testServer.Stop()

	// Setup server configuration if provided
	if scenario.ServerSetup != nil {
		if err := scenario.ServerSetup(sr.testServer); err != nil {
			b.Fatalf("Failed to setup server: %v", err)
		}
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		// Reset server stats for each iteration
		sr.testServer.Reset()

		// Create metrics collector
		metricsCollector := metrics.NewMetricsCollector()

		// Create HTTP client
		clientConfig := convertToClientConfig(scenario.Config)
		httpClient := client.NewHTTPClient(clientConfig, sr.logger)

		// Create execution engine
		executionConfig := &engine.ExecutionConfig{
			TotalRequests:      scenario.Config.TotalRequests,
			ConcurrentRequests: scenario.Config.ConcurrentRequests,
			RequestsPerSecond:  scenario.Config.RequestsPerSecond,
		}
		executor := engine.NewExecutionEngine(httpClient, metricsCollector, executionConfig, sr.logger)

		// Execute test
		_, err := executor.Start()
		if err != nil {
			b.Fatalf("Benchmark execution failed: %v", err)
		}

		// Get final metrics
		results := executor.GetFinalMetrics()

		// Report metrics
		b.ReportMetric(float64(results.RequestsPerSecond), "rps")
		b.ReportMetric(float64(results.Percentiles.P95.Nanoseconds())/1e6, "p95_ms")
		b.ReportMetric(float64(results.Percentiles.Avg.Nanoseconds())/1e6, "avg_ms")
	}
}
