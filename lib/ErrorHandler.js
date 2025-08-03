const EventEmitter = require('events');

/**
 * Error types for categorizing different kinds of errors
 */
const ErrorTypes = {
  BINARY_MANAGEMENT: 'binary_management',
  PROCESS_COMMUNICATION: 'process_communication',
  CONFIGURATION: 'configuration',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  VALIDATION: 'validation',
  SYSTEM: 'system',
  GO_PROCESS: 'go_process',
  UNKNOWN: 'unknown'
};

/**
 * Error codes for specific error conditions
 */
const ErrorCodes = {
  // Binary management errors
  BINARY_DOWNLOAD_FAILED: 'BINARY_DOWNLOAD_FAILED',
  BINARY_CHECKSUM_FAILED: 'BINARY_CHECKSUM_FAILED',
  BINARY_COMPILATION_FAILED: 'BINARY_COMPILATION_FAILED',
  BINARY_NOT_FOUND: 'BINARY_NOT_FOUND',
  BINARY_PERMISSION_DENIED: 'BINARY_PERMISSION_DENIED',
  
  // Process communication errors
  PROCESS_START_FAILED: 'PROCESS_START_FAILED',
  PROCESS_CRASHED: 'PROCESS_CRASHED',
  PROCESS_TIMEOUT: 'PROCESS_TIMEOUT',
  PROCESS_COMMUNICATION_FAILED: 'PROCESS_COMMUNICATION_FAILED',
  PROCESS_UNEXPECTED_EXIT: 'PROCESS_UNEXPECTED_EXIT',
  
  // Configuration errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  MISSING_REQUIRED_PARAM: 'MISSING_REQUIRED_PARAM',
  INVALID_URL: 'INVALID_URL',
  INVALID_METHOD: 'INVALID_METHOD',
  
  // Network errors
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_RESOLUTION_FAILED: 'DNS_RESOLUTION_FAILED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  PORT_UNAVAILABLE: 'PORT_UNAVAILABLE',
  
  // System errors
  INSUFFICIENT_MEMORY: 'INSUFFICIENT_MEMORY',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // Validation errors
  INVALID_FUNCTION: 'INVALID_FUNCTION',
  INVALID_HEADERS: 'INVALID_HEADERS',
  INVALID_DATA: 'INVALID_DATA',
  
  // Generic errors
  TIMEOUT: 'TIMEOUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Enhanced error class with categorization and context
 */
class LoadTestError extends Error {
  constructor(type, code, message, originalError = null, context = {}) {
    super(message);
    this.name = 'LoadTestError';
    this.type = type;
    this.code = code;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = this.isRecoverable();
    
    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LoadTestError);
    }
  }

  /**
   * Determine if this error is recoverable
   */
  isRecoverable() {
    const recoverableTypes = [
      ErrorTypes.NETWORK,
      ErrorTypes.TIMEOUT,
      ErrorTypes.PROCESS_COMMUNICATION
    ];
    
    const recoverableCodes = [
      ErrorCodes.NETWORK_TIMEOUT,
      ErrorCodes.CONNECTION_REFUSED,
      ErrorCodes.PROCESS_COMMUNICATION_FAILED,
      ErrorCodes.TIMEOUT
    ];
    
    return recoverableTypes.includes(this.type) || recoverableCodes.includes(this.code);
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage() {
    const userMessages = {
      [ErrorCodes.BINARY_DOWNLOAD_FAILED]: 'Failed to download the required binary. Please check your internet connection and try again.',
      [ErrorCodes.BINARY_NOT_FOUND]: 'The required binary is not available. Please run npm install to set up the package.',
      [ErrorCodes.PROCESS_START_FAILED]: 'Failed to start the load testing engine. Please try again.',
      [ErrorCodes.INVALID_CONFIG]: 'Invalid configuration provided. Please check your test parameters.',
      [ErrorCodes.INVALID_URL]: 'Invalid URL provided. Please provide a valid HTTP/HTTPS URL.',
      [ErrorCodes.CONNECTION_REFUSED]: 'Connection to the target server was refused. Please check if the server is running.',
      [ErrorCodes.NETWORK_TIMEOUT]: 'Network request timed out. Please check your connection or increase the timeout.',
      [ErrorCodes.DNS_RESOLUTION_FAILED]: 'Failed to resolve the hostname. Please check the URL and your DNS settings.',
      [ErrorCodes.PORT_UNAVAILABLE]: 'Unable to find an available port for the web server. Please try again.',
      [ErrorCodes.PROCESS_CRASHED]: 'The load testing process crashed unexpectedly. Please try again.',
      [ErrorCodes.TIMEOUT]: 'Operation timed out. Please try again or increase the timeout value.'
    };
    
    return userMessages[this.code] || this.message;
  }

  /**
   * Get troubleshooting suggestions
   */
  getTroubleshootingSteps() {
    const troubleshooting = {
      [ErrorCodes.BINARY_DOWNLOAD_FAILED]: [
        'Check your internet connection',
        'Verify that GitHub is accessible from your network',
        'Try running the installation again',
        'If the problem persists, try compiling from source with Go installed'
      ],
      [ErrorCodes.BINARY_NOT_FOUND]: [
        'Run "npm install" to reinstall the package',
        'Check if the binary was blocked by antivirus software',
        'Ensure you have proper file system permissions'
      ],
      [ErrorCodes.PROCESS_START_FAILED]: [
        'Check if the binary has execute permissions',
        'Verify that the binary is not corrupted',
        'Try reinstalling the package',
        'Check system resources (memory, disk space)'
      ],
      [ErrorCodes.INVALID_CONFIG]: [
        'Verify all required configuration parameters are provided',
        'Check that URL is a valid HTTP/HTTPS endpoint',
        'Ensure numeric values are within valid ranges',
        'Validate custom functions syntax'
      ],
      [ErrorCodes.CONNECTION_REFUSED]: [
        'Verify the target server is running and accessible',
        'Check if the port is correct',
        'Ensure no firewall is blocking the connection',
        'Try accessing the URL in a browser first'
      ],
      [ErrorCodes.NETWORK_TIMEOUT]: [
        'Increase the timeout value in your configuration',
        'Check your network connection stability',
        'Verify the target server is responding normally',
        'Consider reducing the request rate'
      ]
    };
    
    return troubleshooting[this.code] || [
      'Check the error details for more information',
      'Try running the test again',
      'If the problem persists, please report it as an issue'
    ];
  }

  /**
   * Convert to JSON for logging/reporting
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.message,
      userMessage: this.getUserMessage(),
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : null
    };
  }
}

/**
 * Error handler class for managing and categorizing errors
 */
class ErrorHandler extends EventEmitter {
  constructor() {
    super();
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.retryAttempts = new Map();
    this.maxRetries = 3;
  }

  /**
   * Categorize and wrap a generic error
   */
  categorizeError(error, context = {}) {
    if (error instanceof LoadTestError) {
      return error;
    }

    let type = ErrorTypes.UNKNOWN;
    let code = ErrorCodes.UNKNOWN_ERROR;
    
    const errorMessage = error.message || error.toString();
    const errorMessageLower = errorMessage.toLowerCase();

    // Categorize based on error message patterns
    if (errorMessageLower.includes('enoent') || errorMessageLower.includes('not found')) {
      if (context.operation === 'binary') {
        type = ErrorTypes.BINARY_MANAGEMENT;
        code = ErrorCodes.BINARY_NOT_FOUND;
      } else {
        type = ErrorTypes.SYSTEM;
        code = ErrorCodes.FILE_SYSTEM_ERROR;
      }
    } else if (errorMessageLower.includes('eacces') || errorMessageLower.includes('permission denied')) {
      type = ErrorTypes.SYSTEM;
      code = ErrorCodes.PERMISSION_DENIED;
    } else if (errorMessageLower.includes('econnrefused') || errorMessageLower.includes('connection refused')) {
      type = ErrorTypes.NETWORK;
      code = ErrorCodes.CONNECTION_REFUSED;
    } else if (errorMessageLower.includes('timeout') || errorMessageLower.includes('etimedout')) {
      type = ErrorTypes.TIMEOUT;
      code = ErrorCodes.TIMEOUT;
    } else if (errorMessageLower.includes('enotfound') || errorMessageLower.includes('dns')) {
      type = ErrorTypes.NETWORK;
      code = ErrorCodes.DNS_RESOLUTION_FAILED;
    } else if (errorMessageLower.includes('eaddrinuse') || errorMessageLower.includes('address already in use')) {
      type = ErrorTypes.NETWORK;
      code = ErrorCodes.PORT_UNAVAILABLE;
    } else if (errorMessageLower.includes('spawn') || errorMessageLower.includes('process')) {
      type = ErrorTypes.GO_PROCESS;
      code = ErrorCodes.PROCESS_START_FAILED;
    } else if (errorMessageLower.includes('checksum') || errorMessageLower.includes('verification')) {
      type = ErrorTypes.BINARY_MANAGEMENT;
      code = ErrorCodes.BINARY_CHECKSUM_FAILED;
    }

    return new LoadTestError(type, code, errorMessage, error, context);
  }

  /**
   * Handle an error with optional retry logic
   */
  async handleError(error, context = {}, retryKey = null) {
    const categorizedError = this.categorizeError(error, context);
    
    // Add to history
    this.addToHistory(categorizedError);
    
    // Emit error event
    this.emit('error', categorizedError);
    
    // Check if we should retry
    if (retryKey && categorizedError.recoverable) {
      const attempts = this.retryAttempts.get(retryKey) || 0;
      
      if (attempts < this.maxRetries) {
        this.retryAttempts.set(retryKey, attempts + 1);
        this.emit('retry', { error: categorizedError, attempt: attempts + 1, maxRetries: this.maxRetries });
        return { shouldRetry: true, attempt: attempts + 1 };
      } else {
        this.retryAttempts.delete(retryKey);
        this.emit('max_retries_exceeded', { error: categorizedError, attempts });
      }
    }
    
    return { shouldRetry: false, error: categorizedError };
  }

  /**
   * Add error to history
   */
  addToHistory(error) {
    this.errorHistory.push(error);
    
    // Maintain history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      total: this.errorHistory.length,
      byType: {},
      byCode: {},
      recoverable: 0,
      recent: this.errorHistory.slice(-10)
    };
    
    this.errorHistory.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;
      if (error.recoverable) {
        stats.recoverable++;
      }
    });
    
    return stats;
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
    this.retryAttempts.clear();
  }

  /**
   * Create specific error types
   */
  createBinaryError(code, message, originalError = null, context = {}) {
    return new LoadTestError(ErrorTypes.BINARY_MANAGEMENT, code, message, originalError, context);
  }

  createProcessError(code, message, originalError = null, context = {}) {
    return new LoadTestError(ErrorTypes.PROCESS_COMMUNICATION, code, message, originalError, context);
  }

  createConfigError(code, message, originalError = null, context = {}) {
    return new LoadTestError(ErrorTypes.CONFIGURATION, code, message, originalError, context);
  }

  createNetworkError(code, message, originalError = null, context = {}) {
    return new LoadTestError(ErrorTypes.NETWORK, code, message, originalError, context);
  }

  createValidationError(code, message, originalError = null, context = {}) {
    return new LoadTestError(ErrorTypes.VALIDATION, code, message, originalError, context);
  }
}

module.exports = {
  ErrorHandler,
  LoadTestError,
  ErrorTypes,
  ErrorCodes
};