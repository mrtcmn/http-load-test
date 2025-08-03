package shutdown

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"http-load-test/internal/logger"
)

// ShutdownFunc represents a function to be called during shutdown
type ShutdownFunc func(ctx context.Context) error

// Hook represents a shutdown hook with metadata
type Hook struct {
	Name     string
	Priority int // Lower numbers execute first
	Timeout  time.Duration
	Func     ShutdownFunc
}

// Manager manages graceful shutdown of the application
type Manager struct {
	hooks       []Hook
	mutex       sync.RWMutex
	logger      *logger.Logger
	signalChan  chan os.Signal
	shutdownCtx context.Context
	cancel      context.CancelFunc
	isShutdown  bool
}

// NewManager creates a new shutdown manager
func NewManager(log *logger.Logger) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	return &Manager{
		hooks:       make([]Hook, 0),
		logger:      log,
		signalChan:  make(chan os.Signal, 1),
		shutdownCtx: ctx,
		cancel:      cancel,
	}
}

// AddHook adds a shutdown hook
func (m *Manager) AddHook(name string, priority int, timeout time.Duration, fn ShutdownFunc) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	hook := Hook{
		Name:     name,
		Priority: priority,
		Timeout:  timeout,
		Func:     fn,
	}

	// Insert hook in priority order (lower priority numbers first)
	inserted := false
	for i, existingHook := range m.hooks {
		if hook.Priority < existingHook.Priority {
			// Insert at position i
			m.hooks = append(m.hooks[:i], append([]Hook{hook}, m.hooks[i:]...)...)
			inserted = true
			break
		}
	}

	if !inserted {
		m.hooks = append(m.hooks, hook)
	}

	m.logger.Debug("Added shutdown hook: %s (priority: %d, timeout: %v)", name, priority, timeout)
}

// RemoveHook removes a shutdown hook by name
func (m *Manager) RemoveHook(name string) bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	for i, hook := range m.hooks {
		if hook.Name == name {
			m.hooks = append(m.hooks[:i], m.hooks[i+1:]...)
			m.logger.Debug("Removed shutdown hook: %s", name)
			return true
		}
	}

	return false
}

// Start starts listening for shutdown signals
func (m *Manager) Start() {
	// Register signal handlers
	signal.Notify(m.signalChan,
		syscall.SIGINT,  // Ctrl+C
		syscall.SIGTERM, // Termination signal
		syscall.SIGQUIT, // Quit signal
	)

	go m.handleSignals()
	m.logger.Info("Shutdown manager started, listening for signals")
}

// Stop stops the shutdown manager
func (m *Manager) Stop() {
	signal.Stop(m.signalChan)
	close(m.signalChan)
	m.cancel()
}

// Shutdown initiates graceful shutdown
func (m *Manager) Shutdown(reason string) error {
	m.mutex.Lock()
	if m.isShutdown {
		m.mutex.Unlock()
		return fmt.Errorf("shutdown already in progress")
	}
	m.isShutdown = true
	m.mutex.Unlock()

	m.logger.Info("Initiating graceful shutdown: %s", reason)

	// Cancel the shutdown context to signal all components
	m.cancel()

	// Execute shutdown hooks
	return m.executeHooks()
}

// IsShutdown returns whether shutdown has been initiated
func (m *Manager) IsShutdown() bool {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return m.isShutdown
}

// Context returns the shutdown context
func (m *Manager) Context() context.Context {
	return m.shutdownCtx
}

// handleSignals handles OS signals
func (m *Manager) handleSignals() {
	for sig := range m.signalChan {
		m.logger.Info("Received signal: %v", sig)

		reason := fmt.Sprintf("received signal: %v", sig)
		if err := m.Shutdown(reason); err != nil {
			m.logger.Error("Error during shutdown: %v", err)
			os.Exit(1)
		}

		// Exit after successful shutdown
		os.Exit(0)
	}
}

// executeHooks executes all shutdown hooks in priority order
func (m *Manager) executeHooks() error {
	m.mutex.RLock()
	hooks := make([]Hook, len(m.hooks))
	copy(hooks, m.hooks)
	m.mutex.RUnlock()

	var errors []error

	for _, hook := range hooks {
		m.logger.Info("Executing shutdown hook: %s", hook.Name)

		// Create context with timeout for this hook
		ctx, cancel := context.WithTimeout(context.Background(), hook.Timeout)

		// Execute hook in a goroutine to handle timeout
		done := make(chan error, 1)
		go func() {
			done <- hook.Func(ctx)
		}()

		select {
		case err := <-done:
			cancel()
			if err != nil {
				m.logger.Error("Shutdown hook '%s' failed: %v", hook.Name, err)
				errors = append(errors, fmt.Errorf("hook '%s': %w", hook.Name, err))
			} else {
				m.logger.Info("Shutdown hook '%s' completed successfully", hook.Name)
			}
		case <-ctx.Done():
			cancel()
			err := fmt.Errorf("hook '%s' timed out after %v", hook.Name, hook.Timeout)
			m.logger.Error(err.Error())
			errors = append(errors, err)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("shutdown completed with %d errors: %v", len(errors), errors)
	}

	m.logger.Info("Graceful shutdown completed successfully")
	return nil
}

// WaitForShutdown blocks until shutdown is initiated
func (m *Manager) WaitForShutdown() {
	<-m.shutdownCtx.Done()
}

// AddDefaultHooks adds common shutdown hooks
func (m *Manager) AddDefaultHooks() {
	// Add a hook to log shutdown completion
	m.AddHook("logger-flush", 1000, 5*time.Second, func(ctx context.Context) error {
		m.logger.Info("Flushing logs before shutdown")
		// In a real implementation, you might flush log buffers here
		return nil
	})
}

// Priority constants for common hooks
const (
	PriorityHighest = 0
	PriorityHigh    = 100
	PriorityNormal  = 500
	PriorityLow     = 800
	PriorityLowest  = 1000
)

// Common timeout durations
const (
	DefaultTimeout = 30 * time.Second
	QuickTimeout   = 5 * time.Second
	LongTimeout    = 60 * time.Second
)
