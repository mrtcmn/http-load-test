package stdin

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"

	"http-load-test/internal/logger"
)

// MessageType represents the type of stdin message
type MessageType string

const (
	MessageTypeShutdown  MessageType = "shutdown"
	MessageTypeStartTest MessageType = "start_test"
	MessageTypeStopTest  MessageType = "stop_test"
)

// Message represents a JSON message received from stdin
type Message struct {
	Type MessageType `json:"type"`
	Data interface{} `json:"data,omitempty"`
}

// Handler represents a function that handles stdin messages
type Handler func(ctx context.Context, msg Message) error

// StdinReader manages reading and processing stdin messages
type StdinReader struct {
	handlers map[MessageType]Handler
	logger   *logger.Logger
	reader   io.Reader
	running  bool
	mutex    sync.RWMutex
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewStdinReader creates a new stdin reader
func NewStdinReader(reader io.Reader, log *logger.Logger) *StdinReader {
	if log == nil {
		log = logger.GetGlobalLogger().WithPrefix("stdin")
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &StdinReader{
		handlers: make(map[MessageType]Handler),
		logger:   log,
		reader:   reader,
		running:  false,
		ctx:      ctx,
		cancel:   cancel,
	}
}

// RegisterHandler registers a handler for a specific message type
func (sr *StdinReader) RegisterHandler(msgType MessageType, handler Handler) {
	sr.mutex.Lock()
	defer sr.mutex.Unlock()

	sr.handlers[msgType] = handler
	sr.logger.Debug("Registered handler for message type: %s", msgType)
}

// Start begins reading from stdin
func (sr *StdinReader) Start() error {
	sr.mutex.Lock()
	if sr.running {
		sr.mutex.Unlock()
		return fmt.Errorf("stdin reader is already running")
	}
	sr.running = true
	sr.mutex.Unlock()

	sr.logger.Info("Starting stdin reader")

	go sr.readLoop()
	return nil
}

// Stop stops reading from stdin
func (sr *StdinReader) Stop() error {
	sr.mutex.Lock()
	defer sr.mutex.Unlock()

	if !sr.running {
		return nil
	}

	sr.logger.Info("Stopping stdin reader")
	sr.cancel()
	sr.running = false
	return nil
}

// IsRunning returns whether the stdin reader is currently running
func (sr *StdinReader) IsRunning() bool {
	sr.mutex.RLock()
	defer sr.mutex.RUnlock()
	return sr.running
}

// readLoop continuously reads from stdin and processes messages
func (sr *StdinReader) readLoop() {
	defer func() {
		sr.mutex.Lock()
		sr.running = false
		sr.mutex.Unlock()
		sr.logger.Debug("Stdin read loop stopped")
	}()

	scanner := bufio.NewScanner(sr.reader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024) // 64KB initial, 1MB max

	for scanner.Scan() {
		select {
		case <-sr.ctx.Done():
			sr.logger.Debug("Stdin reader context cancelled")
			return
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		sr.logger.Debug("Received stdin message: %s", line)

		if err := sr.processMessage(line); err != nil {
			sr.logger.Error("Failed to process stdin message: %v", err)
		}
	}

	if err := scanner.Err(); err != nil {
		sr.logger.Error("Error reading from stdin: %v", err)
	}
}

// processMessage parses and handles a single message
func (sr *StdinReader) processMessage(line string) error {
	var msg Message
	if err := json.Unmarshal([]byte(line), &msg); err != nil {
		return fmt.Errorf("failed to parse JSON message: %w", err)
	}

	sr.mutex.RLock()
	handler, exists := sr.handlers[msg.Type]
	sr.mutex.RUnlock()

	if !exists {
		sr.logger.Warn("No handler registered for message type: %s", msg.Type)
		return nil
	}

	sr.logger.Debug("Processing message type: %s", msg.Type)

	// Create a timeout context for message handling
	ctx, cancel := context.WithTimeout(sr.ctx, 10*time.Second)
	defer cancel()

	if err := handler(ctx, msg); err != nil {
		return fmt.Errorf("handler failed for message type %s: %w", msg.Type, err)
	}

	sr.logger.Debug("Successfully processed message type: %s", msg.Type)
	return nil
}
