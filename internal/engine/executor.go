package engine

import (
	"context"
	"fmt"
	"http-load-test/internal/client"
	"http-load-test/internal/metrics"
	"sync"
	"time"
)

// ExecutionEngine handles concurrent HTTP request execution with rate limiting
type ExecutionEngine struct {
	client          *client.HTTPClient
	metricsCollector *metrics.MetricsCollector
	config          *ExecutionConfig
	
	// Worker pool management
	workerPool   chan struct{}
	requestQueue chan requestJob
	
	// Rate limiting
	rateLimiter *time.Ticker
	
	// Execution control
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
	
	// Status tracking
	mutex           sync.RWMutex
	isRunning       bool
	requestsSent    int
	requestsCompleted int
}

// ExecutionConfig contains configuration for the execution engine
type ExecutionConfig struct {
	TotalRequests      int
	ConcurrentRequests int
	RequestsPerSecond  int
	TestDuration       time.Duration // Optional: run for specific duration instead of request count
}

// requestJob represents a single request job
type requestJob struct {
	id        int
	timestamp time.Time
}

// ExecutionResult contains the results of the load test execution
type ExecutionResult struct {
	TotalRequests     int
	CompletedRequests int
	Duration          time.Duration
	Success           bool
	Error             string
}

// NewExecutionEngine creates a new execution engine
func NewExecutionEngine(httpClient *client.HTTPClient, metricsCollector *metrics.MetricsCollector, config *ExecutionConfig) *ExecutionEngine {
	ctx, cancel := context.WithCancel(context.Background())
	
	return &ExecutionEngine{
		client:           httpClient,
		metricsCollector: metricsCollector,
		config:           config,
		workerPool:       make(chan struct{}, config.ConcurrentRequests),
		requestQueue:     make(chan requestJob, config.ConcurrentRequests*2), // Buffer for smooth operation
		ctx:              ctx,
		cancel:           cancel,
	}
}

// Start begins the load test execution
func (e *ExecutionEngine) Start() (*ExecutionResult, error) {
	e.mutex.Lock()
	if e.isRunning {
		e.mutex.Unlock()
		return nil, fmt.Errorf("execution engine is already running")
	}
	e.isRunning = true
	e.mutex.Unlock()

	// Initialize rate limiter if requests per second is specified
	if e.config.RequestsPerSecond > 0 {
		interval := time.Second / time.Duration(e.config.RequestsPerSecond)
		e.rateLimiter = time.NewTicker(interval)
		defer e.rateLimiter.Stop()
	}

	// Start metrics collection
	e.metricsCollector.Start()
	defer e.metricsCollector.End()

	// Start worker pool
	e.startWorkers()

	// Schedule requests
	startTime := time.Now()
	var executionError error

	if e.config.TestDuration > 0 {
		// Duration-based execution
		executionError = e.executeDurationBased()
	} else {
		// Request count-based execution
		executionError = e.executeRequestBased()
	}

	// Stop scheduling new requests
	close(e.requestQueue)

	// Wait for all workers to complete
	e.wg.Wait()

	duration := time.Since(startTime)

	e.mutex.Lock()
	e.isRunning = false
	completed := e.requestsCompleted
	sent := e.requestsSent
	e.mutex.Unlock()

	result := &ExecutionResult{
		TotalRequests:     sent,
		CompletedRequests: completed,
		Duration:          duration,
		Success:           executionError == nil,
	}

	if executionError != nil {
		result.Error = executionError.Error()
	}

	return result, executionError
}

// Stop gracefully stops the execution
func (e *ExecutionEngine) Stop() {
	e.cancel()
}

// GetStatus returns the current execution status
func (e *ExecutionEngine) GetStatus() (bool, int, int) {
	e.mutex.RLock()
	defer e.mutex.RUnlock()
	return e.isRunning, e.requestsSent, e.requestsCompleted
}

// startWorkers initializes the worker pool
func (e *ExecutionEngine) startWorkers() {
	for i := 0; i < e.config.ConcurrentRequests; i++ {
		e.wg.Add(1)
		go e.worker(i)
	}
}

// worker processes requests from the queue
func (e *ExecutionEngine) worker(workerID int) {
	defer e.wg.Done()

	for {
		select {
		case job, ok := <-e.requestQueue:
			if !ok {
				// Channel closed, worker should exit
				return
			}
			
			// Acquire worker slot
			e.workerPool <- struct{}{}
			
			// Execute the request
			e.executeRequest(job)
			
			// Release worker slot
			<-e.workerPool
			
			// Update completed count
			e.mutex.Lock()
			e.requestsCompleted++
			e.mutex.Unlock()

		case <-e.ctx.Done():
			// Context cancelled, worker should exit
			return
		}
	}
}

// executeRequest executes a single HTTP request
func (e *ExecutionEngine) executeRequest(job requestJob) {
	// Create request context with timeout
	requestCtx, cancel := context.WithTimeout(e.ctx, e.client.GetConfig().Timeout)
	defer cancel()

	// Execute the request
	result := e.client.ExecuteRequest(requestCtx)

	// Add result to metrics
	errorMsg := ""
	if result.Error != "" {
		errorMsg = result.Error
	}
	
	e.metricsCollector.AddResult(
		result.Duration,
		result.StatusCode,
		result.Success,
		errorMsg,
	)
}

// executeRequestBased executes a fixed number of requests
func (e *ExecutionEngine) executeRequestBased() error {
	for i := 0; i < e.config.TotalRequests; i++ {
		select {
		case <-e.ctx.Done():
			return fmt.Errorf("execution cancelled")
		default:
		}

		// Apply rate limiting if configured
		if e.rateLimiter != nil {
			select {
			case <-e.rateLimiter.C:
				// Rate limit tick, proceed
			case <-e.ctx.Done():
				return fmt.Errorf("execution cancelled during rate limiting")
			}
		}

		// Schedule request
		job := requestJob{
			id:        i,
			timestamp: time.Now(),
		}

		select {
		case e.requestQueue <- job:
			e.mutex.Lock()
			e.requestsSent++
			e.mutex.Unlock()
		case <-e.ctx.Done():
			return fmt.Errorf("execution cancelled while scheduling request")
		}
	}

	return nil
}

// executeDurationBased executes requests for a specific duration
func (e *ExecutionEngine) executeDurationBased() error {
	endTime := time.Now().Add(e.config.TestDuration)
	requestID := 0

	for time.Now().Before(endTime) {
		select {
		case <-e.ctx.Done():
			return fmt.Errorf("execution cancelled")
		default:
		}

		// Apply rate limiting if configured
		if e.rateLimiter != nil {
			select {
			case <-e.rateLimiter.C:
				// Rate limit tick, proceed
			case <-e.ctx.Done():
				return fmt.Errorf("execution cancelled during rate limiting")
			}
		}

		// Check if we still have time
		if time.Now().After(endTime) {
			break
		}

		// Schedule request
		job := requestJob{
			id:        requestID,
			timestamp: time.Now(),
		}

		select {
		case e.requestQueue <- job:
			e.mutex.Lock()
			e.requestsSent++
			e.mutex.Unlock()
			requestID++
		case <-e.ctx.Done():
			return fmt.Errorf("execution cancelled while scheduling request")
		default:
			// Queue is full, wait a bit and try again
			time.Sleep(time.Millisecond)
		}
	}

	return nil
}

// GetRealTimeMetrics returns current metrics during execution
func (e *ExecutionEngine) GetRealTimeMetrics() metrics.RealtimeStats {
	return e.metricsCollector.GetRealTimeStats()
}

// GetFinalMetrics returns the final metrics summary
func (e *ExecutionEngine) GetFinalMetrics() metrics.MetricsSummary {
	return e.metricsCollector.GetSummary()
}