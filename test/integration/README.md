# Integration Test Framework

This directory contains the comprehensive integration test framework for the HTTP Load Test project. The framework provides end-to-end testing capabilities, performance benchmarking, and cross-platform compatibility validation.

## Overview

The integration test framework consists of several components:

- **Test Server**: Configurable HTTP server for testing various scenarios
- **Test Scenarios**: Predefined test cases covering different use cases
- **Performance Tests**: Benchmarks comparing Go vs JavaScript implementations
- **Cross-Platform Tests**: Validation of cross-platform binary compatibility
- **Test Runner**: Automated test execution and reporting

## Test Structure

```
test/integration/
├── README.md                    # This file
├── config.json                  # Test configuration
├── test_server.go              # Configurable test HTTP server
├── scenarios.go                # Test scenario definitions
├── integration_test.go         # Main integration tests
├── performance_test.go         # Performance comparison tests
└── run_integration_tests.go    # Test runner utility
```

## Running Tests

### Using Make Commands

```bash
# Run all integration tests
make test-integration

# Run specific test suites
make test-integration-basic
make test-integration-advanced
make test-performance
make test-cross-platform
make benchmark

# Run all tests (unit + integration)
make test-all
```

### Using the Test Runner Directly

```bash
# Run all test suites
go run test/runner/run_integration_tests.go -suite=all

# Run specific test suite
go run test/runner/run_integration_tests.go -suite=basic

# Run with verbose output
go run test/runner/run_integration_tests.go -suite=performance -v

# Run in short mode (skip long-running tests)
go run test/runner/run_integration_tests.go -suite=all -short

# Show help
go run test/runner/run_integration_tests.go -help
```

### Using Go Test Directly

```bash
# Run all integration tests
go test -v ./test/integration

# Run specific test functions
go test -v ./test/integration -run TestBasicScenarios
go test -v ./test/integration -run TestGoVsJavaScriptPerformance

# Run benchmarks
go test -v ./test/integration -bench=. -benchmem
```

## Test Suites

### Basic Integration Tests
- Simple GET/POST requests
- Header and body validation
- Basic error handling
- Response time measurement

### Advanced Integration Tests
- High concurrency scenarios
- Mixed success/failure rates
- Variable response times
- Custom headers and authentication
- Large response handling

### Performance Tests
- Go vs JavaScript implementation comparison
- Memory usage analysis
- Throughput benchmarking
- Response time percentile validation
- Resource consumption monitoring

### Cross-Platform Tests
- Binary compilation for different platforms
- Platform detection validation
- Cross-compilation verification

### Benchmark Tests
- Low, medium, and high load scenarios
- Performance regression detection
- Resource utilization measurement

## Test Server Features

The configurable test server provides:

- **Configurable Responses**: Custom status codes, delays, and response bodies
- **Failure Simulation**: Configurable failure rates for testing error handling
- **Large Response Generation**: Testing with various response sizes
- **Request Statistics**: Detailed metrics on received requests
- **Runtime Configuration**: Dynamic endpoint configuration during tests

### Test Server Endpoints

- `GET /test` - Basic test endpoint
- `GET /health` - Health check endpoint
- `GET /stats` - Server statistics
- `POST /config` - Runtime configuration
- `GET /large?size=N` - Large response generation
- `GET /slow?delay=N` - Slow response simulation
- `GET /error?code=N` - Error response simulation

## Configuration

Test configuration is managed through `config.json`:

```json
{
  "testServer": {
    "port": 8081,
    "defaultDelay": 0,
    "defaultStatusCode": 200,
    "enableLogging": false
  },
  "performanceThresholds": {
    "minSuccessRate": 0.95,
    "minThroughputRatio": 0.8,
    "maxP95ResponseTime": "1s"
  }
}
```

## Performance Validation

The framework validates that the Go implementation meets performance requirements:

1. **Success Rate**: Minimum 95% success rate for all requests
2. **Throughput**: Achieves at least 80% of target requests per second
3. **Response Times**: P95 response time under 1 second
4. **Go vs JavaScript**: At least 1.5x throughput improvement over JavaScript
5. **Memory Usage**: Efficient memory utilization

## Test Results

Test results are saved to `test/results/` directory:

- `performance_test_*.json` - Performance comparison results
- `integration_test_report.html` - Comprehensive test report
- Individual test logs and metrics

## Adding New Tests

### Adding a Basic Scenario

```go
func GetCustomScenarios() []*TestScenario {
    return []*TestScenario{
        {
            Name:        "Custom Test",
            Description: "Description of the test",
            Config: &config.TestConfig{
                URL:                "http://localhost:8081/test",
                Method:             "GET",
                TotalRequests:      10,
                RequestsPerSecond:  5,
                ConcurrentRequests: 2,
                Timeout:            5 * time.Second,
            },
            Validation: func(t *testing.T, results *metrics.MetricsSummary, server *TestServer) {
                // Custom validation logic
            },
        },
    }
}
```

### Adding a Performance Test

```go
func BenchmarkCustomScenario(b *testing.B) {
    runner := NewScenarioRunner()
    scenario := &BenchmarkScenario{
        Name: "Custom Benchmark",
        Config: &config.TestConfig{
            // Configuration
        },
    }
    runner.RunBenchmarkScenario(b, scenario)
}
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure test server ports (8081-8083) are available
2. **Timeout Issues**: Increase timeout values for slow systems
3. **Cross-Platform Tests**: Ensure Go cross-compilation tools are installed
4. **JavaScript Tests**: Require Node.js and npm packages for comparison tests

### Debug Mode

Run tests with verbose output to see detailed execution:

```bash
go run test/runner/run_integration_tests.go -suite=basic -v
```

### Test Server Debugging

Enable test server logging:

```json
{
  "testServer": {
    "enableLogging": true
  }
}
```

## CI/CD Integration

The integration tests are designed to run in CI/CD environments:

```yaml
# Example GitHub Actions step
- name: Run Integration Tests
  run: |
    make test-integration-basic
    make test-performance
```

For performance tests that require comparison with JavaScript, ensure Node.js is available in the CI environment.

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Add appropriate validation and error handling
3. Update this README with new test descriptions
4. Ensure tests are deterministic and don't rely on external services
5. Add performance thresholds for new benchmark tests

## Requirements Coverage

This integration test framework addresses the following requirements:

- **Requirement 1.2**: Performance validation and throughput measurement
- **Requirement 3.1**: Percentile calculation accuracy testing
- **Requirement 3.2**: Real-time metrics validation
- **Requirement 3.3**: Response time distribution testing
- **Requirement 3.4**: Error categorization validation
- **Requirement 3.5**: Histogram tracking verification