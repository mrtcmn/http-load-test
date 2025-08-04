package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// TestSuite represents a test suite configuration
type TestSuite struct {
	Name        string
	Package     string
	Description string
	Timeout     string
}

// Available test suites
var testSuites = []TestSuite{
	{
		Name:        "basic",
		Package:     "./test/integration",
		Description: "Basic integration tests",
		Timeout:     "5m",
	},
	{
		Name:        "advanced",
		Package:     "./test/integration",
		Description: "Advanced integration scenarios",
		Timeout:     "10m",
	},
	{
		Name:        "performance",
		Package:     "./test/integration",
		Description: "Performance comparison tests",
		Timeout:     "15m",
	},
	{
		Name:        "cross-platform",
		Package:     "./test/integration",
		Description: "Cross-platform compatibility tests",
		Timeout:     "10m",
	},
	{
		Name:        "benchmark",
		Package:     "./test/integration",
		Description: "Performance benchmarks",
		Timeout:     "20m",
	},
}

func main() {
	var (
		suite    = flag.String("suite", "all", "Test suite to run (basic, advanced, performance, cross-platform, benchmark, all)")
		verbose  = flag.Bool("v", false, "Verbose output")
		short    = flag.Bool("short", false, "Run tests in short mode")
		parallel = flag.Int("parallel", 4, "Number of parallel test processes")
		output   = flag.String("output", "", "Output format (json, verbose)")
		help     = flag.Bool("help", false, "Show help")
	)
	flag.Parse()

	if *help {
		showHelp()
		return
	}

	// Ensure we're in the project root
	if err := ensureProjectRoot(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Create results directory
	if err := os.MkdirAll("test/results", 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create results directory: %v\n", err)
		os.Exit(1)
	}

	// Run requested test suite(s)
	if *suite == "all" {
		runAllSuites(*verbose, *short, *parallel, *output)
	} else {
		runSpecificSuite(*suite, *verbose, *short, *parallel, *output)
	}
}

// showHelp displays usage information
func showHelp() {
	fmt.Println("Integration Test Runner")
	fmt.Println("=======================")
	fmt.Println()
	fmt.Println("Usage: go run test/integration/run_integration_tests.go [options]")
	fmt.Println()
	fmt.Println("Options:")
	flag.PrintDefaults()
	fmt.Println()
	fmt.Println("Available test suites:")
	for _, suite := range testSuites {
		fmt.Printf("  %-15s %s\n", suite.Name, suite.Description)
	}
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  go run test/integration/run_integration_tests.go -suite=basic")
	fmt.Println("  go run test/integration/run_integration_tests.go -suite=performance -v")
	fmt.Println("  go run test/integration/run_integration_tests.go -suite=all -short")
}

// ensureProjectRoot ensures we're running from the project root
func ensureProjectRoot() error {
	if _, err := os.Stat("go.mod"); err != nil {
		return fmt.Errorf("must run from project root directory (go.mod not found)")
	}
	return nil
}

// runAllSuites runs all available test suites
func runAllSuites(verbose, short bool, parallel int, output string) {
	fmt.Println("Running all integration test suites...")
	fmt.Println()

	totalPassed := 0
	totalFailed := 0

	for _, suite := range testSuites {
		fmt.Printf("=== Running %s tests ===\n", suite.Name)
		passed, failed := runSuite(suite, verbose, short, parallel, output)
		totalPassed += passed
		totalFailed += failed
		fmt.Println()
	}

	// Summary
	fmt.Println("=== Integration Test Summary ===")
	fmt.Printf("Total Passed: %d\n", totalPassed)
	fmt.Printf("Total Failed: %d\n", totalFailed)

	if totalFailed > 0 {
		os.Exit(1)
	}
}

// runSpecificSuite runs a specific test suite
func runSpecificSuite(suiteName string, verbose, short bool, parallel int, output string) {
	for _, suite := range testSuites {
		if suite.Name == suiteName {
			fmt.Printf("Running %s tests...\n", suite.Name)
			passed, failed := runSuite(suite, verbose, short, parallel, output)

			fmt.Printf("\nResults: %d passed, %d failed\n", passed, failed)
			if failed > 0 {
				os.Exit(1)
			}
			return
		}
	}

	fmt.Fprintf(os.Stderr, "Unknown test suite: %s\n", suiteName)
	fmt.Fprintf(os.Stderr, "Available suites: %s\n", getAvailableSuites())
	os.Exit(1)
}

// runSuite executes a specific test suite
func runSuite(suite TestSuite, verbose, short bool, parallel int, output string) (passed, failed int) {
	args := []string{"test"}

	// Add timeout
	args = append(args, "-timeout", suite.Timeout)

	// Add parallel flag
	args = append(args, "-parallel", fmt.Sprintf("%d", parallel))

	// Add verbose flag if requested
	if verbose {
		args = append(args, "-v")
	}

	// Add short flag if requested
	if short {
		args = append(args, "-short")
	}

	// Add output format if specified
	if output != "" {
		switch output {
		case "json":
			args = append(args, "-json")
		case "verbose":
			args = append(args, "-v")
		}
	}

	// Determine which tests to run based on suite
	switch suite.Name {
	case "basic":
		args = append(args, "-run", "TestBasicScenarios")
	case "advanced":
		args = append(args, "-run", "TestAdvancedScenarios")
	case "performance":
		args = append(args, "-run", "TestGoVsJavaScriptPerformance")
	case "cross-platform":
		args = append(args, "-run", "TestCrossPlatformCompatibility")
	case "benchmark":
		args = append(args, "-bench", ".")
		args = append(args, "-benchmem")
	}

	// Add package
	args = append(args, suite.Package)

	// Execute test
	cmd := exec.Command("go", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	fmt.Printf("Executing: go %s\n", strings.Join(args, " "))

	if err := cmd.Run(); err != nil {
		fmt.Printf("Test suite %s failed: %v\n", suite.Name, err)
		return 0, 1
	}

	return 1, 0
}

// getAvailableSuites returns a comma-separated list of available suites
func getAvailableSuites() string {
	var suites []string
	for _, suite := range testSuites {
		suites = append(suites, suite.Name)
	}
	return strings.Join(suites, ", ")
}

// Additional utility functions for test management

// cleanupTestArtifacts removes temporary test files and artifacts
func cleanupTestArtifacts() error {
	// Remove temporary test files
	patterns := []string{
		"test/results/*.json",
		"test/results/*.log",
		"test/tmp/*",
		"*.test",
	}

	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}

		for _, match := range matches {
			os.Remove(match)
		}
	}

	return nil
}

// generateTestReport generates a comprehensive test report
func generateTestReport(results []TestResult) error {
	reportFile := "test/results/integration_test_report.html"

	// Create HTML report
	html := `<!DOCTYPE html>
<html>
<head>
    <title>Integration Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .passed { color: green; }
        .failed { color: red; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Integration Test Report</h1>
    <table>
        <tr>
            <th>Test Suite</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Details</th>
        </tr>`

	for _, result := range results {
		status := "passed"
		class := "passed"
		if result.Failed > 0 {
			status = "failed"
			class = "failed"
		}

		html += fmt.Sprintf(`
        <tr>
            <td>%s</td>
            <td class="%s">%s</td>
            <td>%s</td>
            <td>%d passed, %d failed</td>
        </tr>`, result.Suite, class, status, result.Duration, result.Passed, result.Failed)
	}

	html += `
    </table>
</body>
</html>`

	return os.WriteFile(reportFile, []byte(html), 0644)
}

// TestResult represents the result of a test suite execution
type TestResult struct {
	Suite    string
	Passed   int
	Failed   int
	Duration string
}
