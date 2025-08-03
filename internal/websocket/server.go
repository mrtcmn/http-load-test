package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"http-load-test/internal/errors"
	"http-load-test/internal/logger"
	"http-load-test/internal/metrics"

	"github.com/gorilla/websocket"
)

// Connection represents a WebSocket connection with metadata
type Connection struct {
	conn     *websocket.Conn
	id       string
	lastPing time.Time
	send     chan []byte
}

// Server manages WebSocket connections and metrics broadcasting
type Server struct {
	connections    map[string]*Connection
	mutex          sync.RWMutex
	upgrader       websocket.Upgrader
	metrics        *metrics.MetricsCollector
	logger         *logger.Logger
	errorCollector *errors.ErrorCollector

	// Channels for connection management
	register   chan *Connection
	unregister chan *Connection
	broadcast  chan []byte

	// Configuration
	pingInterval time.Duration
	pongWait     time.Duration
	writeWait    time.Duration

	// State
	isRunning bool
}

// NewServer creates a new WebSocket server
func NewServer(metricsCollector *metrics.MetricsCollector, log *logger.Logger) *Server {
	if log == nil {
		log = logger.GetGlobalLogger().WithPrefix("websocket")
	}

	log.Debug("Creating WebSocket server")

	return &Server{
		connections: make(map[string]*Connection),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow connections from any origin for development
				// In production, this should be more restrictive
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		metrics:        metricsCollector,
		logger:         log,
		errorCollector: errors.NewErrorCollector(100), // Keep last 100 errors
		register:       make(chan *Connection),
		unregister:     make(chan *Connection),
		broadcast:      make(chan []byte),
		pingInterval:   54 * time.Second,
		pongWait:       60 * time.Second,
		writeWait:      10 * time.Second,
		isRunning:      false,
	}
}

// Start begins the WebSocket server hub
func (s *Server) Start() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.isRunning {
		return errors.NewWebSocketError("WS_ALREADY_RUNNING", "WebSocket server is already running")
	}

	s.logger.Info("Starting WebSocket server")
	s.isRunning = true
	go s.run()
	return nil
}

// run handles the main server loop for connection management
func (s *Server) run() {
	ticker := time.NewTicker(s.pingInterval)
	defer ticker.Stop()

	for {
		select {
		case conn := <-s.register:
			s.registerConnection(conn)

		case conn := <-s.unregister:
			s.unregisterConnection(conn)

		case message := <-s.broadcast:
			s.broadcastMessage(message)

		case <-ticker.C:
			s.pingConnections()
		}
	}
}

// registerConnection adds a new connection to the pool
func (s *Server) registerConnection(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.connections[conn.id] = conn
	s.logger.Info("WebSocket connection registered: %s (total: %d)", conn.id, len(s.connections))
}

// unregisterConnection removes a connection from the pool
func (s *Server) unregisterConnection(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if _, exists := s.connections[conn.id]; exists {
		delete(s.connections, conn.id)
		close(conn.send)
		if err := conn.conn.Close(); err != nil {
			s.logger.Warn("Error closing WebSocket connection %s: %v", conn.id, err)
		}
		s.logger.Info("WebSocket connection unregistered: %s (total: %d)", conn.id, len(s.connections))
	}
}

// broadcastMessage sends a message to all connected clients
func (s *Server) broadcastMessage(message []byte) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	for id, conn := range s.connections {
		select {
		case conn.send <- message:
		default:
			// Connection is blocked, remove it
			delete(s.connections, id)
			close(conn.send)
			if err := conn.conn.Close(); err != nil {
				s.logger.Warn("Error closing blocked WebSocket connection %s: %v", id, err)
			}
			s.logger.Warn("WebSocket connection removed due to blocking: %s", id)

			// Record the error
			loadTestErr := errors.NewWebSocketError("CONN_BLOCKED", "WebSocket connection blocked and removed").
				WithContext("connection_id", id)
			s.errorCollector.Add(loadTestErr)
		}
	}
}

// pingConnections sends ping messages to all connections
func (s *Server) pingConnections() {
	s.mutex.RLock()
	connections := make([]*Connection, 0, len(s.connections))
	for _, conn := range s.connections {
		connections = append(connections, conn)
	}
	s.mutex.RUnlock()

	for _, conn := range connections {
		select {
		case conn.send <- []byte(`{"type":"ping"}`):
			conn.lastPing = time.Now()
		default:
			// Connection is not responsive, it will be cleaned up
		}
	}
}

// HandleWebSocket handles WebSocket upgrade requests
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	s.logger.Debug("WebSocket upgrade request from %s", r.RemoteAddr)

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_UPGRADE_FAILED", "WebSocket upgrade failed").
			WithContext("remote_addr", r.RemoteAddr).
			WithContext("user_agent", r.UserAgent())
		s.errorCollector.Add(loadTestErr)
		s.logger.Error("WebSocket upgrade failed: %v", loadTestErr)
		return
	}

	// Generate unique connection ID
	connID := generateConnectionID()
	s.logger.Debug("Generated connection ID: %s", connID)

	// Create connection wrapper
	wsConn := &Connection{
		conn:     conn,
		id:       connID,
		lastPing: time.Now(),
		send:     make(chan []byte, 256),
	}

	// Register the connection
	select {
	case s.register <- wsConn:
		s.logger.Debug("Connection %s queued for registration", connID)
	default:
		s.logger.Error("Failed to queue connection %s for registration", connID)
		conn.Close()
		return
	}

	// Start goroutines for reading and writing
	go s.writePump(wsConn)
	go s.readPump(wsConn)
}

// readPump handles reading from the WebSocket connection
func (s *Server) readPump(conn *Connection) {
	defer func() {
		s.logger.Debug("Read pump for connection %s stopping", conn.id)
		select {
		case s.unregister <- conn:
		default:
			s.logger.Warn("Failed to unregister connection %s", conn.id)
		}
	}()

	conn.conn.SetReadDeadline(time.Now().Add(s.pongWait))
	conn.conn.SetPongHandler(func(string) error {
		s.logger.Debug("Received pong from connection %s", conn.id)
		conn.conn.SetReadDeadline(time.Now().Add(s.pongWait))
		return nil
	})

	for {
		_, _, err := conn.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_UNEXPECTED_CLOSE", "WebSocket unexpected close").
					WithContext("connection_id", conn.id)
				s.errorCollector.Add(loadTestErr)
				s.logger.Error("WebSocket unexpected close for connection %s: %v", conn.id, loadTestErr)
			} else {
				s.logger.Debug("WebSocket connection %s closed normally: %v", conn.id, err)
			}
			break
		}
		// We don't expect to receive messages from clients in this implementation
		s.logger.Debug("Received message from connection %s (ignoring)", conn.id)
	}
}

// writePump handles writing to the WebSocket connection
func (s *Server) writePump(conn *Connection) {
	ticker := time.NewTicker(s.pingInterval)
	defer func() {
		s.logger.Debug("Write pump for connection %s stopping", conn.id)
		ticker.Stop()
		if err := conn.conn.Close(); err != nil {
			s.logger.Warn("Error closing connection %s in write pump: %v", conn.id, err)
		}
	}()

	for {
		select {
		case message, ok := <-conn.send:
			conn.conn.SetWriteDeadline(time.Now().Add(s.writeWait))
			if !ok {
				// Channel closed, send close message
				s.logger.Debug("Send channel closed for connection %s", conn.id)
				if err := conn.conn.WriteMessage(websocket.CloseMessage, []byte{}); err != nil {
					s.logger.Warn("Error sending close message to connection %s: %v", conn.id, err)
				}
				return
			}

			w, err := conn.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_WRITE_FAILED", "Failed to get WebSocket writer").
					WithContext("connection_id", conn.id)
				s.errorCollector.Add(loadTestErr)
				s.logger.Error("Failed to get writer for connection %s: %v", conn.id, loadTestErr)
				return
			}

			if _, err := w.Write(message); err != nil {
				loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_MESSAGE_WRITE_FAILED", "Failed to write WebSocket message").
					WithContext("connection_id", conn.id)
				s.errorCollector.Add(loadTestErr)
				s.logger.Error("Failed to write message to connection %s: %v", conn.id, loadTestErr)
				w.Close()
				return
			}

			// Add queued messages to the current message
			n := len(conn.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-conn.send)
			}

			if err := w.Close(); err != nil {
				loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_WRITER_CLOSE_FAILED", "Failed to close WebSocket writer").
					WithContext("connection_id", conn.id)
				s.errorCollector.Add(loadTestErr)
				s.logger.Error("Failed to close writer for connection %s: %v", conn.id, loadTestErr)
				return
			}

		case <-ticker.C:
			conn.conn.SetWriteDeadline(time.Now().Add(s.writeWait))
			if err := conn.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				loadTestErr := errors.Wrap(err, errors.WebSocketError, "WS_PING_FAILED", "Failed to send WebSocket ping").
					WithContext("connection_id", conn.id)
				s.errorCollector.Add(loadTestErr)
				s.logger.Error("Failed to send ping to connection %s: %v", conn.id, loadTestErr)
				return
			}
			s.logger.Debug("Sent ping to connection %s", conn.id)
		}
	}
}

// BroadcastMetrics sends real-time metrics to all connected clients
func (s *Server) BroadcastMetrics() {
	if s.metrics == nil {
		s.logger.Warn("No metrics collector available for broadcast")
		return
	}

	stats := s.metrics.GetRealTimeStats()

	message := MetricsMessage{
		Type:      "metrics",
		Timestamp: time.Now(),
		Data:      stats,
	}

	data, err := json.Marshal(message)
	if err != nil {
		loadTestErr := errors.Wrap(err, errors.WebSocketError, "METRICS_MARSHAL_FAILED", "Failed to marshal metrics message")
		s.errorCollector.Add(loadTestErr)
		s.logger.Error("Error marshaling metrics: %v", loadTestErr)
		return
	}

	select {
	case s.broadcast <- data:
		s.logger.Debug("Metrics broadcast queued")
	default:
		// Broadcast channel is full, skip this update
		s.logger.Warn("Broadcast channel full, skipping metrics update")
		loadTestErr := errors.NewWebSocketError("BROADCAST_CHANNEL_FULL", "Broadcast channel is full, metrics update skipped")
		s.errorCollector.Add(loadTestErr)
	}
}

// BroadcastTestComplete sends test completion notification
func (s *Server) BroadcastTestComplete(summary metrics.MetricsSummary) {
	message := TestCompleteMessage{
		Type:      "test_complete",
		Timestamp: time.Now(),
		Summary:   summary,
	}

	data, err := json.Marshal(message)
	if err != nil {
		loadTestErr := errors.Wrap(err, errors.WebSocketError, "TEST_COMPLETE_MARSHAL_FAILED", "Failed to marshal test complete message")
		s.errorCollector.Add(loadTestErr)
		s.logger.Error("Error marshaling test complete message: %v", loadTestErr)
		return
	}

	select {
	case s.broadcast <- data:
		s.logger.Info("Test complete message broadcast queued")
	default:
		s.logger.Warn("Broadcast channel full, skipping test complete message")
		loadTestErr := errors.NewWebSocketError("BROADCAST_CHANNEL_FULL", "Broadcast channel is full, test complete message skipped")
		s.errorCollector.Add(loadTestErr)
	}
}

// BroadcastError sends error messages to all connected clients
func (s *Server) BroadcastError(errorMsg string) {
	message := ErrorMessage{
		Type:      "error",
		Timestamp: time.Now(),
		Error:     errorMsg,
	}

	data, err := json.Marshal(message)
	if err != nil {
		loadTestErr := errors.Wrap(err, errors.WebSocketError, "ERROR_MARSHAL_FAILED", "Failed to marshal error message")
		s.errorCollector.Add(loadTestErr)
		s.logger.Error("Error marshaling error message: %v", loadTestErr)
		return
	}

	select {
	case s.broadcast <- data:
		s.logger.Info("Error message broadcast queued: %s", errorMsg)
	default:
		s.logger.Warn("Broadcast channel full, skipping error message")
		loadTestErr := errors.NewWebSocketError("BROADCAST_CHANNEL_FULL", "Broadcast channel is full, error message skipped")
		s.errorCollector.Add(loadTestErr)
	}
}

// GetConnectionCount returns the number of active connections
func (s *Server) GetConnectionCount() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return len(s.connections)
}

// Close shuts down the WebSocket server
func (s *Server) Close() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if !s.isRunning {
		s.logger.Debug("WebSocket server is not running, nothing to close")
		return nil
	}

	s.logger.Info("Closing WebSocket server")
	s.isRunning = false

	// Close all connections
	for id, conn := range s.connections {
		s.logger.Debug("Closing WebSocket connection: %s", id)
		if err := conn.conn.Close(); err != nil {
			s.logger.Warn("Error closing WebSocket connection %s: %v", id, err)
		}
		close(conn.send)
	}

	// Close channels
	close(s.register)
	close(s.unregister)
	close(s.broadcast)

	s.logger.Info("WebSocket server closed successfully")
	return nil
}

// GetErrorSummary returns a summary of WebSocket errors
func (s *Server) GetErrorSummary() *errors.ErrorSummary {
	return s.errorCollector.GetSummary()
}

// IsRunning returns whether the WebSocket server is running
func (s *Server) IsRunning() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.isRunning
}

// SetLogger updates the logger instance
func (s *Server) SetLogger(log *logger.Logger) {
	s.logger = log
}

// generateConnectionID creates a unique connection identifier
func generateConnectionID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based ID if random fails
		return fmt.Sprintf("conn_%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}
