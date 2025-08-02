package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

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
	connections map[string]*Connection
	mutex       sync.RWMutex
	upgrader    websocket.Upgrader
	metrics     *metrics.MetricsCollector

	// Channels for connection management
	register   chan *Connection
	unregister chan *Connection
	broadcast  chan []byte

	// Configuration
	pingInterval time.Duration
	pongWait     time.Duration
	writeWait    time.Duration
}

// NewServer creates a new WebSocket server
func NewServer(metricsCollector *metrics.MetricsCollector) *Server {
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
		metrics:      metricsCollector,
		register:     make(chan *Connection),
		unregister:   make(chan *Connection),
		broadcast:    make(chan []byte),
		pingInterval: 54 * time.Second,
		pongWait:     60 * time.Second,
		writeWait:    10 * time.Second,
	}
}

// Start begins the WebSocket server hub
func (s *Server) Start() {
	go s.run()
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
	log.Printf("WebSocket connection registered: %s (total: %d)", conn.id, len(s.connections))
}

// unregisterConnection removes a connection from the pool
func (s *Server) unregisterConnection(conn *Connection) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if _, exists := s.connections[conn.id]; exists {
		delete(s.connections, conn.id)
		close(conn.send)
		conn.conn.Close()
		log.Printf("WebSocket connection unregistered: %s (total: %d)", conn.id, len(s.connections))
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
			conn.conn.Close()
			log.Printf("WebSocket connection removed due to blocking: %s", id)
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
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Generate unique connection ID
	connID := generateConnectionID()

	// Create connection wrapper
	wsConn := &Connection{
		conn:     conn,
		id:       connID,
		lastPing: time.Now(),
		send:     make(chan []byte, 256),
	}

	// Register the connection
	s.register <- wsConn

	// Start goroutines for reading and writing
	go s.writePump(wsConn)
	go s.readPump(wsConn)
}

// readPump handles reading from the WebSocket connection
func (s *Server) readPump(conn *Connection) {
	defer func() {
		s.unregister <- conn
	}()

	conn.conn.SetReadDeadline(time.Now().Add(s.pongWait))
	conn.conn.SetPongHandler(func(string) error {
		conn.conn.SetReadDeadline(time.Now().Add(s.pongWait))
		return nil
	})

	for {
		_, _, err := conn.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
	}
}

// writePump handles writing to the WebSocket connection
func (s *Server) writePump(conn *Connection) {
	ticker := time.NewTicker(s.pingInterval)
	defer func() {
		ticker.Stop()
		conn.conn.Close()
	}()

	for {
		select {
		case message, ok := <-conn.send:
			conn.conn.SetWriteDeadline(time.Now().Add(s.writeWait))
			if !ok {
				conn.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := conn.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current message
			n := len(conn.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-conn.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			conn.conn.SetWriteDeadline(time.Now().Add(s.writeWait))
			if err := conn.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// BroadcastMetrics sends real-time metrics to all connected clients
func (s *Server) BroadcastMetrics() {
	if s.metrics == nil {
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
		log.Printf("Error marshaling metrics: %v", err)
		return
	}

	select {
	case s.broadcast <- data:
	default:
		// Broadcast channel is full, skip this update
		log.Printf("Broadcast channel full, skipping metrics update")
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
		log.Printf("Error marshaling test complete message: %v", err)
		return
	}

	select {
	case s.broadcast <- data:
	default:
		log.Printf("Broadcast channel full, skipping test complete message")
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
		log.Printf("Error marshaling error message: %v", err)
		return
	}

	select {
	case s.broadcast <- data:
	default:
		log.Printf("Broadcast channel full, skipping error message")
	}
}

// GetConnectionCount returns the number of active connections
func (s *Server) GetConnectionCount() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return len(s.connections)
}

// Close shuts down the WebSocket server
func (s *Server) Close() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	for _, conn := range s.connections {
		conn.conn.Close()
		close(conn.send)
	}

	close(s.register)
	close(s.unregister)
	close(s.broadcast)
}

// generateConnectionID creates a unique connection identifier
func generateConnectionID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
