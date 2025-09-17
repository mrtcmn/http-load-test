package stdin

import (
	"context"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"http-load-test/internal/logger"
)

func TestStdinReader_RegisterHandler(t *testing.T) {
	reader := strings.NewReader("")
	log := logger.New(&logger.Config{
		Level:      logger.DEBUG,
		Output:     io.Discard, // Disable output for tests
		Prefix:     "[test]",
		ShowCaller: false,
	})

	sr := NewStdinReader(reader, log)

	handler := func(ctx context.Context, msg Message) error {
		return nil
	}

	sr.RegisterHandler(MessageTypeShutdown, handler)

	// Check that handler was registered
	sr.mutex.RLock()
	_, exists := sr.handlers[MessageTypeShutdown]
	sr.mutex.RUnlock()

	if !exists {
		t.Error("Handler was not registered")
	}
}

func TestStdinReader_ProcessMessage(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		msgType     MessageType
		expectError bool
		expectCall  bool
	}{
		{
			name:        "valid shutdown message",
			input:       `{"type":"shutdown"}`,
			msgType:     MessageTypeShutdown,
			expectError: false,
			expectCall:  true,
		},
		{
			name:        "valid start_test message",
			input:       `{"type":"start_test"}`,
			msgType:     MessageTypeStartTest,
			expectError: false,
			expectCall:  true,
		},
		{
			name:        "valid stop_test message",
			input:       `{"type":"stop_test"}`,
			msgType:     MessageTypeStopTest,
			expectError: false,
			expectCall:  true,
		},
		{
			name:        "invalid JSON",
			input:       `{invalid json}`,
			msgType:     MessageTypeShutdown,
			expectError: true,
			expectCall:  false,
		},
		{
			name:        "unknown message type",
			input:       `{"type":"unknown"}`,
			msgType:     MessageTypeShutdown,
			expectError: false,
			expectCall:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := strings.NewReader("")
			log := logger.New(&logger.Config{
				Level:      logger.DEBUG,
				Output:     nil,
				Prefix:     "[test]",
				ShowCaller: false,
			})

			sr := NewStdinReader(reader, log)

			handlerCalled := false
			var receivedMsg Message
			handler := func(ctx context.Context, msg Message) error {
				handlerCalled = true
				receivedMsg = msg
				return nil
			}

			sr.RegisterHandler(tt.msgType, handler)

			err := sr.processMessage(tt.input)

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if tt.expectCall && !handlerCalled {
				t.Error("Expected handler to be called but it wasn't")
			}

			if !tt.expectCall && handlerCalled {
				t.Error("Expected handler not to be called but it was")
			}

			if handlerCalled && receivedMsg.Type != tt.msgType {
				t.Errorf("Expected message type %s, got %s", tt.msgType, receivedMsg.Type)
			}
		})
	}
}

func TestStdinReader_StartStop(t *testing.T) {
	reader := strings.NewReader("")
	log := logger.New(&logger.Config{
		Level:      logger.DEBUG,
		Output:     nil,
		Prefix:     "[test]",
		ShowCaller: false,
	})

	sr := NewStdinReader(reader, log)

	// Test initial state
	if sr.IsRunning() {
		t.Error("Reader should not be running initially")
	}

	// Test start
	err := sr.Start()
	if err != nil {
		t.Errorf("Unexpected error starting reader: %v", err)
	}

	// Give it a moment to start
	time.Sleep(10 * time.Millisecond)

	if !sr.IsRunning() {
		t.Error("Reader should be running after start")
	}

	// Test double start
	err = sr.Start()
	if err == nil {
		t.Error("Expected error when starting already running reader")
	}

	// Test stop
	err = sr.Stop()
	if err != nil {
		t.Errorf("Unexpected error stopping reader: %v", err)
	}

	if sr.IsRunning() {
		t.Error("Reader should not be running after stop")
	}

	// Test double stop
	err = sr.Stop()
	if err != nil {
		t.Errorf("Unexpected error stopping already stopped reader: %v", err)
	}
}

func TestStdinReader_RealTimeProcessing(t *testing.T) {
	// Create a pipe to simulate stdin
	input := `{"type":"shutdown"}
{"type":"start_test"}
{"type":"stop_test"}
`
	reader := strings.NewReader(input)

	log := logger.New(&logger.Config{
		Level:      logger.DEBUG,
		Output:     nil,
		Prefix:     "[test]",
		ShowCaller: false,
	})

	sr := NewStdinReader(reader, log)

	var processedMessages []MessageType
	var mu sync.Mutex

	handler := func(ctx context.Context, msg Message) error {
		mu.Lock()
		processedMessages = append(processedMessages, msg.Type)
		mu.Unlock()
		return nil
	}

	// Register handlers for all message types
	sr.RegisterHandler(MessageTypeShutdown, handler)
	sr.RegisterHandler(MessageTypeStartTest, handler)
	sr.RegisterHandler(MessageTypeStopTest, handler)

	// Start reading
	err := sr.Start()
	if err != nil {
		t.Fatalf("Failed to start reader: %v", err)
	}

	// Wait for processing to complete
	time.Sleep(100 * time.Millisecond)

	// Stop the reader
	sr.Stop()

	// Check results
	mu.Lock()
	expectedMessages := []MessageType{MessageTypeShutdown, MessageTypeStartTest, MessageTypeStopTest}
	mu.Unlock()

	if len(processedMessages) != len(expectedMessages) {
		t.Errorf("Expected %d messages, got %d", len(expectedMessages), len(processedMessages))
	}

	for i, expected := range expectedMessages {
		if i >= len(processedMessages) || processedMessages[i] != expected {
			t.Errorf("Expected message %d to be %s, got %s", i, expected, processedMessages[i])
		}
	}
}
