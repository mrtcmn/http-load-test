package shutdown

import (
	"context"
	"fmt"
	"http-load-test/internal/logger"
	"sync"
	"testing"
	"time"
)

func TestManager_AddHook(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	// Add hooks with different priorities
	manager.AddHook("high", PriorityHigh, DefaultTimeout, func(ctx context.Context) error {
		return nil
	})

	manager.AddHook("low", PriorityLow, DefaultTimeout, func(ctx context.Context) error {
		return nil
	})

	manager.AddHook("normal", PriorityNormal, DefaultTimeout, func(ctx context.Context) error {
		return nil
	})

	// Check that hooks are ordered by priority
	if len(manager.hooks) != 3 {
		t.Errorf("Expected 3 hooks, got %d", len(manager.hooks))
	}

	// Should be ordered: high (100), normal (500), low (800)
	if manager.hooks[0].Name != "high" {
		t.Errorf("Expected first hook to be 'high', got '%s'", manager.hooks[0].Name)
	}

	if manager.hooks[1].Name != "normal" {
		t.Errorf("Expected second hook to be 'normal', got '%s'", manager.hooks[1].Name)
	}

	if manager.hooks[2].Name != "low" {
		t.Errorf("Expected third hook to be 'low', got '%s'", manager.hooks[2].Name)
	}
}

func TestManager_RemoveHook(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	manager.AddHook("test", PriorityNormal, DefaultTimeout, func(ctx context.Context) error {
		return nil
	})

	if len(manager.hooks) != 1 {
		t.Errorf("Expected 1 hook, got %d", len(manager.hooks))
	}

	// Remove the hook
	removed := manager.RemoveHook("test")
	if !removed {
		t.Error("Expected hook to be removed")
	}

	if len(manager.hooks) != 0 {
		t.Errorf("Expected 0 hooks after removal, got %d", len(manager.hooks))
	}

	// Try to remove non-existent hook
	removed = manager.RemoveHook("nonexistent")
	if removed {
		t.Error("Expected non-existent hook removal to return false")
	}
}

func TestManager_Shutdown(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	var executionOrder []string
	var mutex sync.Mutex

	// Add hooks that record execution order
	manager.AddHook("first", 1, DefaultTimeout, func(ctx context.Context) error {
		mutex.Lock()
		executionOrder = append(executionOrder, "first")
		mutex.Unlock()
		return nil
	})

	manager.AddHook("second", 2, DefaultTimeout, func(ctx context.Context) error {
		mutex.Lock()
		executionOrder = append(executionOrder, "second")
		mutex.Unlock()
		return nil
	})

	// Execute shutdown
	err := manager.Shutdown("test shutdown")
	if err != nil {
		t.Errorf("Expected no error, got: %v", err)
	}

	// Check execution order
	mutex.Lock()
	defer mutex.Unlock()

	if len(executionOrder) != 2 {
		t.Errorf("Expected 2 hooks to execute, got %d", len(executionOrder))
	}

	if executionOrder[0] != "first" {
		t.Errorf("Expected first hook to execute first, got '%s'", executionOrder[0])
	}

	if executionOrder[1] != "second" {
		t.Errorf("Expected second hook to execute second, got '%s'", executionOrder[1])
	}

	// Check that shutdown flag is set
	if !manager.IsShutdown() {
		t.Error("Expected shutdown flag to be set")
	}
}

func TestManager_ShutdownWithError(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	// Add a hook that returns an error
	manager.AddHook("error", PriorityNormal, DefaultTimeout, func(ctx context.Context) error {
		return fmt.Errorf("hook error")
	})

	// Add a hook that succeeds
	manager.AddHook("success", PriorityNormal+1, DefaultTimeout, func(ctx context.Context) error {
		return nil
	})

	// Execute shutdown
	err := manager.Shutdown("test shutdown")
	if err == nil {
		t.Error("Expected error from shutdown")
	}

	// Should still be marked as shutdown even with errors
	if !manager.IsShutdown() {
		t.Error("Expected shutdown flag to be set even with errors")
	}
}

func TestManager_ShutdownTimeout(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	// Add a hook that takes too long
	manager.AddHook("slow", PriorityNormal, 100*time.Millisecond, func(ctx context.Context) error {
		time.Sleep(200 * time.Millisecond) // Sleep longer than timeout
		return nil
	})

	// Execute shutdown
	start := time.Now()
	err := manager.Shutdown("test shutdown")
	duration := time.Since(start)

	// Should return error due to timeout
	if err == nil {
		t.Error("Expected timeout error from shutdown")
	}

	// Should not take much longer than the timeout
	if duration > 300*time.Millisecond {
		t.Errorf("Shutdown took too long: %v", duration)
	}
}

func TestManager_DoubleShutdown(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	// First shutdown should succeed
	err1 := manager.Shutdown("first shutdown")
	if err1 != nil {
		t.Errorf("First shutdown failed: %v", err1)
	}

	// Second shutdown should return error
	err2 := manager.Shutdown("second shutdown")
	if err2 == nil {
		t.Error("Expected error from second shutdown")
	}
}

func TestManager_Context(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)

	ctx := manager.Context()
	if ctx == nil {
		t.Error("Expected context to be non-nil")
	}

	// Context should not be cancelled initially
	select {
	case <-ctx.Done():
		t.Error("Context should not be cancelled initially")
	default:
		// Expected
	}

	// After shutdown, context should be cancelled
	manager.Shutdown("test")

	select {
	case <-ctx.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("Context should be cancelled after shutdown")
	}
}

func TestManager_AddDefaultHooks(t *testing.T) {
	log := logger.New(&logger.Config{
		Level:  logger.DEBUG,
		Output: &testWriter{},
		Prefix: "[test]",
	})

	manager := NewManager(log)
	manager.AddDefaultHooks()

	if len(manager.hooks) == 0 {
		t.Error("Expected default hooks to be added")
	}

	// Should have logger-flush hook
	found := false
	for _, hook := range manager.hooks {
		if hook.Name == "logger-flush" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected logger-flush hook to be added")
	}
}

// testWriter is a simple writer for testing
type testWriter struct {
	data []byte
}

func (w *testWriter) Write(p []byte) (n int, err error) {
	w.data = append(w.data, p...)
	return len(p), nil
}

func (w *testWriter) String() string {
	return string(w.data)
}
