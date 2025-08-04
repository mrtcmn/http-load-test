package integration

import (
	"http-load-test/internal/config"
	"http-load-test/internal/metrics"
	"testing"
	"time"
)

// TestBasicScenarios runs all basic integration test scenarios
func TestBasicScenarios(t *testing.T) {
	runner := NewScenarioRunner()

	// Start test server once for all scenarios
	if err := runner.testServer.Start(); err != nil {
		t.Fatalf("Failed to start test server: %v", err)
	}
	defer runner.testServer.Stop()

	scenarios := GetBasicScenarios()

	for _, scenario := range scenarios {
		runner.RunScenario(t, scenario)
	}
}

// TestAdvancedScenarios runs advanced integration test scenarios
func TestAdvancedScenarios(t *testing.T) {
	runner := NewScenarioRunner()

	// Start test server once for all scenarios
	if err := runner.testServer.Start(); err != nil {
		t.Fatalf("Failed to start test server: %v", err)
	}
	defer runner.testServer.Stop()

	scenarios := GetAdvancedScenarios()

	for _, scenario := range scenarios {
		runner.RunScenario(t, scenario)
	}
}

// TestCrossPlatformCompatibility tests cross-platform compatibility
func TestCrossPlatformCompatibility(t *testing.T) {
	RunCrossPlatformTests(t)
}

// BenchmarkLowLoad runs low load performance benchmark
func BenchmarkLowLoad(b *testing.B) {
	runner := NewScenarioRunner()
	scenarios := GetBenchmarkScenarios()

	runner.RunBenchmarkScenario(b, scenarios[0]) // Low Load
}

// BenchmarkMediumLoad runs medium load performance benchmark
func BenchmarkMediumLoad(b *testing.B) {
	runner := NewScenarioRunner()
	scenarios := GetBenchmarkScenarios()

	runner.RunBenchmarkScenario(b, scenarios[1]) // Medium Load
}

// BenchmarkHighLoad runs high load performance benchmark
func BenchmarkHighLoad(b *testing.B) {
	runner := NewScenarioRunner()
	scenarios := GetBenchmarkScenarios()

	runner.RunBenchmarkScenario(b, scenarios[2]) // High Load
}

// TestEndToEndWorkflow tests the complete end-to-end workflow
func TestEndToEndWorkflow(t *testing.T) {
	t.Run("Complete Workflow", func(t *testing.T) {
		runner := NewScenarioRunner()

		// Start test server for this workflow test
		if err := runner.testServer.Start(); err != nil {
			t.Fatalf("Failed to start test server: %v", err)
		}
		defer runner.testServer.Stop()

		// Test a comprehensive scenario that exercises multiple components
		scenario := &TestScenario{
			Name:        "End-to-End Workflow",
			Description: "Complete workflow test with multiple request types and validation",
			Config: &config.TestConfig{
				URL:                "http://localhost:8081/test",
				Method:             "POST",
				Body:               `{"workflow": "test", "step": 1}`,
				Headers:            map[string]string{"Content-Type": "application/json"},
				TotalRequests:      50,
				RequestsPerSecond:  10,
				ConcurrentRequests: 5,
				Timeout:            config.Duration(10 * time.Second),
			},
			ServerSetup: func(server *TestServer) error {
				// Configure endpoint with slight delay and custom response
				server.ConfigureEndpoint("/test", &EndpointConfig{
					StatusCode: 200,
					Delay:      50 * time.Millisecond,
					ResponseBody: map[string]interface{}{
						"status":   "success",
						"workflow": "completed",
						"step":     2,
					},
					Headers: map[string]string{
						"X-Workflow": "test-response",
					},
				})
				return nil
			},
			Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
				// Comprehensive validation
				if results.TotalRequests != 50 {
					t.Errorf("Expected 50 total requests, got %d", results.TotalRequests)
				}

				if results.SuccessfulReqs != 50 {
					t.Errorf("Expected 50 successful requests, got %d", results.SuccessfulReqs)
				}

				if results.FailedRequests != 0 {
					t.Errorf("Expected 0 failed requests, got %d", results.FailedRequests)
				}

				// Verify throughput is reasonable (should be close to 10 RPS)
				actualRPS := results.RequestsPerSecond
				if actualRPS < 8 || actualRPS > 12 {
					t.Errorf("Expected RPS around 10, got %.2f", actualRPS)
				}

				// Verify response time metrics
				if results.Percentiles.Min == 0 {
					t.Error("Minimum response time should not be zero")
				}

				if results.Percentiles.P50 == 0 {
					t.Error("P50 percentile should not be zero")
				}

				if results.Percentiles.P95 == 0 {
					t.Error("P95 percentile should not be zero")
				}

				if results.Percentiles.P99 == 0 {
					t.Error("P99 percentile should not be zero")
				}

				// With 50ms delay, average should be at least 50ms
				if results.Percentiles.Avg < 50*time.Millisecond {
					t.Errorf("Average response time too low: %v", results.Percentiles.Avg)
				}

				// Verify server received all requests
				stats := server.GetStats()
				if stats.TotalRequests != 50 {
					t.Errorf("Server received %d requests, expected 50", stats.TotalRequests)
				}

				// Verify all requests were successful (status 200)
				if count, exists := stats.RequestsByCode[200]; !exists || count != 50 {
					t.Errorf("Expected 50 requests with status 200, got %d", count)
				}

				t.Logf("End-to-end test completed successfully:")
				t.Logf("  Total requests: %d", results.TotalRequests)
				t.Logf("  Success rate: %.2f%%", float64(results.SuccessfulReqs)/float64(results.TotalRequests)*100)
				t.Logf("  Average RPS: %.2f", results.RequestsPerSecond)
				t.Logf("  Response times - Min: %v, Avg: %v, P95: %v, Max: %v",
					results.Percentiles.Min,
					results.Percentiles.Avg,
					results.Percentiles.P95,
					results.Percentiles.Max)
			},
		}

		runner.RunScenario(t, scenario)
	})
}
