package logger

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
)

// LogLevel represents the severity level of a log message
type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
	FATAL
)

// String returns the string representation of the log level
func (l LogLevel) String() string {
	switch l {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	case FATAL:
		return "FATAL"
	default:
		return "UNKNOWN"
	}
}

// Logger provides structured logging with different levels
type Logger struct {
	level      LogLevel
	output     io.Writer
	mutex      sync.Mutex
	prefix     string
	showCaller bool
}

// Config holds logger configuration
type Config struct {
	Level      LogLevel
	Output     io.Writer
	Prefix     string
	ShowCaller bool
}

// DefaultConfig returns a default logger configuration
func DefaultConfig() *Config {
	return &Config{
		Level:      INFO,
		Output:     os.Stdout,
		Prefix:     "[http-load-test]",
		ShowCaller: false,
	}
}

// New creates a new logger with the given configuration
func New(config *Config) *Logger {
	if config == nil {
		config = DefaultConfig()
	}

	return &Logger{
		level:      config.Level,
		output:     config.Output,
		prefix:     config.Prefix,
		showCaller: config.ShowCaller,
	}
}

// SetLevel sets the minimum log level
func (l *Logger) SetLevel(level LogLevel) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	l.level = level
}

// GetLevel returns the current log level
func (l *Logger) GetLevel() LogLevel {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	return l.level
}

// SetOutput sets the output writer
func (l *Logger) SetOutput(output io.Writer) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	l.output = output
}

// Debug logs a debug message
func (l *Logger) Debug(msg string, args ...interface{}) {
	l.log(DEBUG, msg, args...)
}

// Info logs an info message
func (l *Logger) Info(msg string, args ...interface{}) {
	l.log(INFO, msg, args...)
}

// Warn logs a warning message
func (l *Logger) Warn(msg string, args ...interface{}) {
	l.log(WARN, msg, args...)
}

// Error logs an error message
func (l *Logger) Error(msg string, args ...interface{}) {
	l.log(ERROR, msg, args...)
}

// Fatal logs a fatal message and exits the program
func (l *Logger) Fatal(msg string, args ...interface{}) {
	l.log(FATAL, msg, args...)
	os.Exit(1)
}

// log is the internal logging method
func (l *Logger) log(level LogLevel, msg string, args ...interface{}) {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	// Check if we should log this level
	if level < l.level {
		return
	}

	// Format the message
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}

	// Build the log entry
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logEntry := fmt.Sprintf("%s %s [%s] %s",
		timestamp,
		l.prefix,
		level.String(),
		msg)

	// Add caller information if enabled
	if l.showCaller {
		if caller := l.getCaller(); caller != "" {
			logEntry = fmt.Sprintf("%s (%s)", logEntry, caller)
		}
	}

	// Write to output
	fmt.Fprintln(l.output, logEntry)
}

// getCaller returns the caller information
func (l *Logger) getCaller() string {
	// Skip: getCaller, log, Debug/Info/Warn/Error/Fatal
	_, file, line, ok := runtime.Caller(3)
	if !ok {
		return ""
	}

	// Get just the filename, not the full path
	parts := strings.Split(file, "/")
	filename := parts[len(parts)-1]

	return fmt.Sprintf("%s:%d", filename, line)
}

// WithPrefix creates a new logger with an additional prefix
func (l *Logger) WithPrefix(prefix string) *Logger {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	newPrefix := l.prefix
	if prefix != "" {
		newPrefix = fmt.Sprintf("%s[%s]", l.prefix, prefix)
	}

	return &Logger{
		level:      l.level,
		output:     l.output,
		prefix:     newPrefix,
		showCaller: l.showCaller,
	}
}

// Global logger instance
var globalLogger *Logger
var globalMutex sync.RWMutex

// init initializes the global logger
func init() {
	globalLogger = New(DefaultConfig())
}

// SetGlobalLogger sets the global logger instance
func SetGlobalLogger(logger *Logger) {
	globalMutex.Lock()
	defer globalMutex.Unlock()
	globalLogger = logger
}

// GetGlobalLogger returns the global logger instance
func GetGlobalLogger() *Logger {
	globalMutex.RLock()
	defer globalMutex.RUnlock()
	return globalLogger
}

// Global logging functions
func Debug(msg string, args ...interface{}) {
	GetGlobalLogger().Debug(msg, args...)
}

func Info(msg string, args ...interface{}) {
	GetGlobalLogger().Info(msg, args...)
}

func Warn(msg string, args ...interface{}) {
	GetGlobalLogger().Warn(msg, args...)
}

func Error(msg string, args ...interface{}) {
	GetGlobalLogger().Error(msg, args...)
}

func Fatal(msg string, args ...interface{}) {
	GetGlobalLogger().Fatal(msg, args...)
}

// SetLevel sets the global logger level
func SetLevel(level LogLevel) {
	GetGlobalLogger().SetLevel(level)
}

// SetOutput sets the global logger output
func SetOutput(output io.Writer) {
	GetGlobalLogger().SetOutput(output)
}

// ParseLogLevel parses a string into a LogLevel
func ParseLogLevel(level string) (LogLevel, error) {
	switch strings.ToUpper(level) {
	case "DEBUG":
		return DEBUG, nil
	case "INFO":
		return INFO, nil
	case "WARN", "WARNING":
		return WARN, nil
	case "ERROR":
		return ERROR, nil
	case "FATAL":
		return FATAL, nil
	default:
		return INFO, fmt.Errorf("invalid log level: %s", level)
	}
}
