package server

import (
	"context"
	"embed"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"http-load-test/internal/errors"
	"http-load-test/internal/logger"
	"http-load-test/internal/metrics"
	"http-load-test/internal/websocket"
)

//go:embed static/*
var staticFiles embed.FS

// Server represents the HTTP server for the load testing application
type Server struct {
	httpServer     *http.Server
	wsServer       *websocket.Server
	metrics        *metrics.MetricsCollector
	logger         *logger.Logger
	errorCollector *errors.ErrorCollector
	port           int
	isRunning      bool
	mutex          sync.RWMutex
	testStatus     TestStatus
	finalResults   *metrics.MetricsSummary
}

// TestStatus represents the current status of a load test
type TestStatus struct {
	IsRunning   bool      `json:"isRunning"`
	StartTime   time.Time `json:"startTime,omitempty"`
	ElapsedTime string    `json:"elapsedTime,omitempty"`
	Progress    float64   `json:"progress,omitempty"`
	Message     string    `json:"message,omitempty"`
}

// APIResponse represents a standard API response structure
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message,omitempty"`
}

// NewServer creates a new HTTP server instance
func NewServer(port int, metricsCollector *metrics.MetricsCollector, log *logger.Logger) *Server {
	if log == nil {
		log = logger.GetGlobalLogger().WithPrefix("http-server")
	}

	wsServer := websocket.NewServer(metricsCollector, log.WithPrefix("websocket"))

	return &Server{
		port:           port,
		wsServer:       wsServer,
		metrics:        metricsCollector,
		logger:         log,
		errorCollector: errors.NewErrorCollector(200), // Keep last 200 errors
		isRunning:      false,
		testStatus: TestStatus{
			IsRunning: false,
		},
	}
}

// Start starts the HTTP server
func (s *Server) Start() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.isRunning {
		return errors.NewExecutionError("SERVER_RUNNING", "server is already running")
	}

	s.logger.Info("Starting HTTP server on port %d", s.port)

	// Start WebSocket server
	if err := s.wsServer.Start(); err != nil {
		loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_START_FAILED", "failed to start WebSocket server")
		s.errorCollector.Add(loadTestErr)
		return loadTestErr
	}

	// Create HTTP server with routes
	mux := http.NewServeMux()
	s.setupRoutes(mux)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.port),
		Handler:      s.corsMiddleware(s.securityMiddleware(s.errorMiddleware(mux))),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
		ErrorLog:     s.createErrorLogger(),
	}

	s.isRunning = true

	// Start server in goroutine
	go func() {
		s.logger.Info("HTTP server listening on :%d", s.port)
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			loadTestErr := errors.Wrap(err, errors.SystemError, "HTTP_SERVER_ERROR", "HTTP server error")
			s.errorCollector.Add(loadTestErr)
			s.logger.Error("HTTP server error: %v", loadTestErr)
		}
	}()

	return nil
}

// Stop stops the HTTP server
func (s *Server) Stop() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if !s.isRunning {
		s.logger.Debug("Server is not running, nothing to stop")
		return nil
	}

	s.logger.Info("Stopping HTTP server")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Stop WebSocket server
	if err := s.wsServer.Close(); err != nil {
		loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_STOP_FAILED", "failed to stop WebSocket server")
		s.errorCollector.Add(loadTestErr)
		s.logger.Warn("Error stopping WebSocket server: %v", loadTestErr)
	}

	// Stop HTTP server
	if err := s.httpServer.Shutdown(ctx); err != nil {
		loadTestErr := errors.Wrap(err, errors.SystemError, "HTTP_SHUTDOWN_FAILED", "failed to shutdown HTTP server")
		s.errorCollector.Add(loadTestErr)
		s.logger.Error("Failed to shutdown HTTP server: %v", loadTestErr)
		return loadTestErr
	}

	s.isRunning = false
	s.logger.Info("HTTP server stopped successfully")
	return nil
}

// setupRoutes configures all HTTP routes
func (s *Server) setupRoutes(mux *http.ServeMux) {
	// Static file serving
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Printf("Error setting up static files: %v", err)
		// Fallback to serving from current directory if embed fails
		mux.Handle("/", http.FileServer(http.Dir("./web/dist/")))
	} else {
		mux.Handle("/", http.FileServer(http.FS(staticFS)))
	}

	// API routes
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/results", s.handleResults)
	mux.HandleFunc("/api/export", s.handleExport)
	mux.HandleFunc("/api/health", s.handleHealth)

	// WebSocket endpoint
	mux.HandleFunc("/ws/metrics", s.wsServer.HandleWebSocket)
}

// corsMiddleware adds CORS headers
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// securityMiddleware adds security headers
func (s *Server) securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Content Security Policy for development
		csp := "default-src 'self'; " +
			"script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"connect-src 'self' ws: wss:; " +
			"img-src 'self' data: blob:; " +
			"font-src 'self' data:;"
		w.Header().Set("Content-Security-Policy", csp)

		next.ServeHTTP(w, r)
	})
}

// errorMiddleware handles panics and logs errors
func (s *Server) errorMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				s.logger.Error("Panic in HTTP handler: %v", err)
				loadTestErr := errors.New(errors.InternalError, "HANDLER_PANIC", "internal server error")
				s.errorCollector.Add(loadTestErr)
				s.writeErrorResponse(w, http.StatusInternalServerError, "Internal server error")
			}
		}()

		// Log request
		s.logger.Debug("HTTP %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)

		next.ServeHTTP(w, r)
	})
}

// createErrorLogger creates a logger for the HTTP server
func (s *Server) createErrorLogger() *logger.Logger {
	return s.logger.WithPrefix("http-server-error")
}

// handleStatus handles GET /api/status requests
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	s.mutex.RLock()
	status := s.testStatus
	s.mutex.RUnlock()

	// Update elapsed time if test is running
	if status.IsRunning && !status.StartTime.IsZero() {
		elapsed := time.Since(status.StartTime)
		status.ElapsedTime = elapsed.Round(time.Second).String()
	}

	// Add real-time stats if available
	var realtimeStats *metrics.RealtimeStats
	if s.metrics != nil {
		stats := s.metrics.GetRealTimeStats()
		realtimeStats = &stats
	}

	response := map[string]interface{}{
		"status":        status,
		"realtimeStats": realtimeStats,
		"connections":   s.wsServer.GetConnectionCount(),
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// handleResults handles GET /api/results requests
func (s *Server) handleResults(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	s.mutex.RLock()
	results := s.finalResults
	s.mutex.RUnlock()

	if results == nil {
		// Return current metrics if no final results available
		if s.metrics != nil {
			currentStats := s.metrics.GetRealTimeStats()
			s.writeJSONResponse(w, http.StatusOK, map[string]interface{}{
				"type":    "realtime",
				"results": currentStats,
			})
			return
		}

		s.writeErrorResponse(w, http.StatusNotFound, "No results available")
		return
	}

	s.writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"type":    "final",
		"results": results,
	})
}

// handleExport handles POST /api/export requests
func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Parse request body
	var exportReq struct {
		Format string `json:"format"`
		Type   string `json:"type"` // "final" or "realtime"
	}

	if err := json.NewDecoder(r.Body).Decode(&exportReq); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate format
	if exportReq.Format != "json" && exportReq.Format != "csv" {
		s.writeErrorResponse(w, http.StatusBadRequest, "Format must be 'json' or 'csv'")
		return
	}

	// Get data based on type
	var data interface{}
	var filename string

	if exportReq.Type == "final" && s.finalResults != nil {
		data = s.finalResults
		filename = fmt.Sprintf("load-test-results-%s.%s",
			time.Now().Format("2006-01-02-15-04-05"), exportReq.Format)
	} else if s.metrics != nil {
		stats := s.metrics.GetRealTimeStats()
		data = stats
		filename = fmt.Sprintf("load-test-realtime-%s.%s",
			time.Now().Format("2006-01-02-15-04-05"), exportReq.Format)
	} else {
		s.writeErrorResponse(w, http.StatusNotFound, "No data available for export")
		return
	}

	// Export based on format
	switch exportReq.Format {
	case "json":
		s.exportJSON(w, data, filename)
	case "csv":
		s.exportCSV(w, data, filename)
	}
}

// handleHealth handles GET /api/health requests
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	health := map[string]interface{}{
		"status":      "healthy",
		"timestamp":   time.Now(),
		"version":     "1.0.0",
		"connections": s.wsServer.GetConnectionCount(),
		"uptime":      time.Since(time.Now()).String(), // This would be actual uptime in real implementation
	}

	s.writeJSONResponse(w, http.StatusOK, health)
}

// exportJSON exports data as JSON
func (s *Server) exportJSON(w http.ResponseWriter, data interface{}, filename string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")

	if err := encoder.Encode(data); err != nil {
		log.Printf("Error encoding JSON export: %v", err)
		s.writeErrorResponse(w, http.StatusInternalServerError, "Failed to export data")
	}
}

// exportCSV exports data as CSV
func (s *Server) exportCSV(w http.ResponseWriter, data interface{}, filename string) {
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Convert data to CSV format based on type
	switch v := data.(type) {
	case *metrics.MetricsSummary:
		s.writeSummaryCSV(writer, v)
	case metrics.RealtimeStats:
		s.writeRealtimeCSV(writer, v)
	default:
		s.writeErrorResponse(w, http.StatusInternalServerError, "Unsupported data type for CSV export")
	}
}

// writeSummaryCSV writes MetricsSummary to CSV
func (s *Server) writeSummaryCSV(writer *csv.Writer, summary *metrics.MetricsSummary) {
	// Write headers
	headers := []string{
		"Metric", "Value", "Unit",
	}
	writer.Write(headers)

	// Write summary data
	rows := [][]string{
		{"Total Requests", strconv.Itoa(summary.TotalRequests), "count"},
		{"Successful Requests", strconv.Itoa(summary.SuccessfulReqs), "count"},
		{"Failed Requests", strconv.Itoa(summary.FailedRequests), "count"},
		{"Duration", summary.Duration.String(), "duration"},
		{"Requests Per Second", fmt.Sprintf("%.2f", summary.RequestsPerSecond), "rps"},
		{"P50 Response Time", summary.Percentiles.P50.String(), "duration"},
		{"P95 Response Time", summary.Percentiles.P95.String(), "duration"},
		{"P99 Response Time", summary.Percentiles.P99.String(), "duration"},
		{"Min Response Time", summary.Percentiles.Min.String(), "duration"},
		{"Max Response Time", summary.Percentiles.Max.String(), "duration"},
		{"Avg Response Time", summary.Percentiles.Avg.String(), "duration"},
	}

	for _, row := range rows {
		writer.Write(row)
	}

	// Write status codes
	writer.Write([]string{"", "", ""}) // Empty row
	writer.Write([]string{"Status Code", "Count", "count"})
	for code, count := range summary.StatusCodes {
		writer.Write([]string{strconv.Itoa(code), strconv.Itoa(count), "count"})
	}

	// Write errors
	if len(summary.Errors) > 0 {
		writer.Write([]string{"", "", ""}) // Empty row
		writer.Write([]string{"Error", "Count", "count"})
		for error, count := range summary.Errors {
			writer.Write([]string{error, strconv.Itoa(count), "count"})
		}
	}
}

// writeRealtimeCSV writes RealtimeStats to CSV
func (s *Server) writeRealtimeCSV(writer *csv.Writer, stats metrics.RealtimeStats) {
	// Write headers
	headers := []string{
		"Metric", "Value", "Unit",
	}
	writer.Write(headers)

	// Write realtime data
	rows := [][]string{
		{"Elapsed Time", stats.ElapsedTime.String(), "duration"},
		{"Completed Requests", strconv.Itoa(stats.CompletedRequests), "count"},
		{"Successful Requests", strconv.Itoa(stats.SuccessfulReqs), "count"},
		{"Failed Requests", strconv.Itoa(stats.FailedRequests), "count"},
		{"Current RPS", fmt.Sprintf("%.2f", stats.CurrentRPS), "rps"},
		{"Avg Response Time", stats.AvgResponseTime.String(), "duration"},
		{"P50 Response Time", stats.RecentPercentiles.P50.String(), "duration"},
		{"P95 Response Time", stats.RecentPercentiles.P95.String(), "duration"},
		{"P99 Response Time", stats.RecentPercentiles.P99.String(), "duration"},
	}

	for _, row := range rows {
		writer.Write(row)
	}

	// Write status codes
	writer.Write([]string{"", "", ""}) // Empty row
	writer.Write([]string{"Status Code", "Count", "count"})
	for code, count := range stats.StatusCodes {
		writer.Write([]string{strconv.Itoa(code), strconv.Itoa(count), "count"})
	}
}

// writeJSONResponse writes a JSON response
func (s *Server) writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	response := APIResponse{
		Success: statusCode < 400,
		Data:    data,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// writeErrorResponse writes an error response
func (s *Server) writeErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	response := APIResponse{
		Success: false,
		Error:   message,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding error response: %v", err)
	}
}

// UpdateTestStatus updates the current test status
func (s *Server) UpdateTestStatus(status TestStatus) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.testStatus = status
}

// SetFinalResults sets the final test results
func (s *Server) SetFinalResults(results *metrics.MetricsSummary) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.finalResults = results
	s.testStatus.IsRunning = false
}

// GetPort returns the server port
func (s *Server) GetPort() int {
	return s.port
}

// IsRunning returns whether the server is running
func (s *Server) IsRunning() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.isRunning
}

// GetErrorSummary returns a summary of server errors
func (s *Server) GetErrorSummary() *errors.ErrorSummary {
	return s.errorCollector.GetSummary()
}

// SetLogger updates the logger instance
func (s *Server) SetLogger(log *logger.Logger) {
	s.logger = log
}
