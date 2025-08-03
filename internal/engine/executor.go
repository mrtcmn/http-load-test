package engine

import (
	"context"
	"fmt"
	"http-load-test/internal/client"
	"http-load-test/internal/errors"
	"http-load-test/internal/logger"
	"http-load-test/internal/metrics"
	"sync"
	"time"
)

// ExecutionEngine handles concurrent HTTP request execution with rate limiting
type ExecutionEngine struct {
	client           *client.HTTPClient
	metricsCollector *metrics.MetricsCollector
	config           *ExecutionConfig
	logger           *logger.Logger
	errorCollector   *errors.ErrorCollector

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
	mutex             sync.RWMutex
	isRunning         bool
	requestsSent      int
	requestsCompleted int

	// Shutdown handling
	shutdownRequested bool
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
func NewExecutionEngine(httpClient *client.HTTPClient, metricsCollector *metrics.MetricsCollector, config *ExecutionConfig, log *logger.Logger) *ExecutionEngine {
	if log == nil {
		log = logger.GetGlobalLogger().WithPrefix("execution-engine")
	}

	ctx, cancel := context.WithCancel(context.Background())

	log.Info("Created execution engine: concurrent=%d, rps=%d, total=%d",
		config.ConcurrentRequests, config.RequestsPerSecond, config.TotalRequests)

	return &ExecutionEngine{
		client:           httpClient,
		metricsCollector: metricsCollector,
		config:           config,
		logger:           log,
		errorCollector:   errors.NewErrorCollector(500), // Keep last 500 errors
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
		return nil, errors.NewExecutionError("ENGINE_RUNNING", "execution engine is already running")
	}
	e.isRunning = true
	e.shutdownRequested = false
	e.mutex.Unlock()

	e.logger.Info("Starting load test execution")

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
	e.mutex.Lock()
	if !e.isRunning {
		e.mutex.Unlock()
		return
	}
	e.shutdownRequested = true
	e.mutex.Unlock()

	e.logger.Info("Stopping execution engine gracefully")
	e.cancel()

	// Wait for workers to finish with timeout
	done := make(chan struct{})
	go func() {
		e.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		e.logger.Info("All workers stopped successfully")
	case <-time.After(30 * time.Second):
		e.logger.Warn("Timeout waiting for workers to stop")
	}
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

	e.logger.Debug("Worker %d started", workerID)
	defer e.logger.Debug("Worker %d stopped", workerID)

	for {
		select {
		case job, ok := <-e.requestQueue:
			if !ok {
				// Channel closed, worker should exit
				e.logger.Debug("Worker %d: request queue closed", workerID)
				return
			}

			// Check if shutdown was requested
			if e.IsShutdownRequested() {
				e.logger.Debug("Worker %d: shutdown requested, exiting", workerID)
				return
			}

			// Acquire worker slot
			select {
			case e.workerPool <- struct{}{}:
				// Got slot, proceed
			case <-e.ctx.Done():
				// Context cancelled while waiting for slot
				return
			}

			// Execute the request
			e.executeRequest(job, workerID)

			// Release worker slot
			<-e.workerPool

			// Update completed count
			e.mutex.Lock()
			e.requestsCompleted++
			e.mutex.Unlock()

		case <-e.ctx.Done():
			// Context cancelled, worker should exit
			e.logger.Debug("Worker %d: context cancelled", workerID)
			return
		}
	}
}

// executeRequest executes a single HTTP request
func (e *ExecutionEngine) executeRequest(job requestJob, workerID int) {
	// Create request context with timeout
	requestCtx, cancel := context.WithTimeout(e.ctx, e.client.GetConfig().Timeout)
	defer cancel()

	// Execute the request
	result := e.client.ExecuteRequest(requestCtx)

	// Log request completion
	if result.Success {
		e.logger.Debug("Worker %d: request %d completed successfully (status=%d, duration=%v)",
			workerID, job.id, result.StatusCode, result.Duration)
	} else {
		e.logger.Warn("Worker %d: request %d failed (status=%d, error=%s)",
			workerID, job.id, result.StatusCode, result.Error)

		// Collect error for analysis
		if result.Error != "" {
			loadTestErr := errors.CategorizeError(fmt.Errorf(result.Error)).
				WithContext("worker_id", fmt.Sprintf("%d", workerID)).
				WithContext("request_id", fmt.Sprintf("%d", job.id))
			e.errorCollector.Add(loadTestErr)
		}
	}

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

// GetErrorSummary returns a summary of execution errors
func (e *ExecutionEngine) GetErrorSummary() *errors.ErrorSummary {
	return e.errorCollector.GetSummary()
}

// IsShutdownRequested returns whether shutdown has been requested
func (e *ExecutionEngine) IsShutdownRequested() bool {
	e.mutex.RLock()
	defer e.mutex.RUnlock()
	return e.shutdownRequested
}

// SetLogger updates the logger instance
func (e *ExecutionEngine) SetLogger(log *logger.Logger) {
	e.logger = log
}
