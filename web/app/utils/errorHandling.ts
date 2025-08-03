/**
 * Error types for frontend error categorization
 */
export enum ErrorType {
  WEBSOCKET = 'websocket',
  NETWORK = 'network',
  CHART = 'chart',
  DATA_PROCESSING = 'data_processing',
  VALIDATION = 'validation',
  STORAGE = 'storage',
  UNKNOWN = 'unknown'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Enhanced error class for frontend errors
 */
export class LoadTestFrontendError extends Error {
  public readonly type: ErrorType
  public readonly severity: ErrorSeverity
  public readonly code: string
  public readonly context: Record<string, any>
  public readonly timestamp: number
  public readonly recoverable: boolean
  public readonly userMessage: string
  public readonly originalError?: Error

  constructor(
    type: ErrorType,
    code: string,
    message: string,
    options: {
      severity?: ErrorSeverity
      context?: Record<string, any>
      recoverable?: boolean
      userMessage?: string
      originalError?: Error
    } = {}
  ) {
    super(message)
    this.name = 'LoadTestFrontendError'
    this.type = type
    this.code = code
    this.severity = options.severity || ErrorSeverity.MEDIUM
    this.context = options.context || {}
    this.timestamp = Date.now()
    this.recoverable = options.recoverable ?? this.isRecoverableByDefault()
    this.userMessage = options.userMessage || this.generateUserMessage()
    this.originalError = options.originalError

    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LoadTestFrontendError)
    }
  }

  private isRecoverableByDefault(): boolean {
    const recoverableTypes = [ErrorType.WEBSOCKET, ErrorType.NETWORK, ErrorType.CHART]
    return recoverableTypes.includes(this.type)
  }

  private generateUserMessage(): string {
    const messages: Record<string, string> = {
      'WS_CONNECTION_FAILED': 'Unable to connect to the server. Please check your connection.',
      'WS_CONNECTION_LOST': 'Connection to the server was lost. Attempting to reconnect...',
      'WS_RECONNECT_FAILED': 'Failed to reconnect to the server after multiple attempts.',
      'CHART_RENDER_ERROR': 'Unable to display the chart. The data may be corrupted.',
      'DATA_PARSE_ERROR': 'Received invalid data from the server.',
      'NETWORK_REQUEST_FAILED': 'Network request failed. Please try again.',
      'STORAGE_QUOTA_EXCEEDED': 'Browser storage is full. Please clear some data.',
      'VALIDATION_ERROR': 'Invalid data provided.',
      'UNKNOWN_ERROR': 'An unexpected error occurred.'
    }

    return messages[this.code] || this.message
  }

  /**
   * Get troubleshooting suggestions for this error
   */
  getTroubleshootingSteps(): string[] {
    const troubleshooting: Record<string, string[]> = {
      'WS_CONNECTION_FAILED': [
        'Check your internet connection',
        'Verify the server is running',
        'Check if a firewall is blocking the connection',
        'Try refreshing the page'
      ],
      'WS_CONNECTION_LOST': [
        'Wait for automatic reconnection',
        'Check your network stability',
        'Refresh the page if reconnection fails'
      ],
      'WS_RECONNECT_FAILED': [
        'Refresh the page to restart the connection',
        'Check if the server is still running',
        'Verify your network connection'
      ],
      'CHART_RENDER_ERROR': [
        'Try refreshing the page',
        'Check if your browser supports the required features',
        'Clear browser cache and cookies'
      ],
      'DATA_PARSE_ERROR': [
        'Refresh the page to get fresh data',
        'Check if the server is sending valid data',
        'Report this issue if it persists'
      ],
      'NETWORK_REQUEST_FAILED': [
        'Check your internet connection',
        'Try the request again',
        'Verify the server is accessible'
      ],
      'STORAGE_QUOTA_EXCEEDED': [
        'Clear browser data and cache',
        'Remove old test results',
        'Use incognito/private browsing mode'
      ]
    }

    return troubleshooting[this.code] || [
      'Try refreshing the page',
      'Check your internet connection',
      'Report this issue if it persists'
    ]
  }

  /**
   * Convert error to JSON for logging/reporting
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    }
  }
}

/**
 * Error handler class for managing frontend errors
 */
export class FrontendErrorHandler {
  private errors: LoadTestFrontendError[] = []
  private maxErrors = 100
  private listeners: Array<(error: LoadTestFrontendError) => void> = []
  private retryAttempts = new Map<string, number>()
  private maxRetries = 3

  /**
   * Add error listener
   */
  onError(listener: (error: LoadTestFrontendError) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * Handle an error
   */
  handleError(error: Error | LoadTestFrontendError, context?: Record<string, any>): LoadTestFrontendError {
    let frontendError: LoadTestFrontendError

    if (error instanceof LoadTestFrontendError) {
      frontendError = error
    } else {
      frontendError = this.categorizeError(error, context)
    }

    // Add to error history
    this.addToHistory(frontendError)

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(frontendError)
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError)
      }
    })

    return frontendError
  }

  /**
   * Categorize a generic error
   */
  private categorizeError(error: Error, context?: Record<string, any>): LoadTestFrontendError {
    const message = error.message.toLowerCase()
    
    // WebSocket errors
    if (message.includes('websocket') || message.includes('connection')) {
      if (message.includes('failed') || message.includes('refused')) {
        return new LoadTestFrontendError(
          ErrorType.WEBSOCKET,
          'WS_CONNECTION_FAILED',
          error.message,
          { severity: ErrorSeverity.HIGH, context, originalError: error }
        )
      }
      if (message.includes('closed') || message.includes('lost')) {
        return new LoadTestFrontendError(
          ErrorType.WEBSOCKET,
          'WS_CONNECTION_LOST',
          error.message,
          { severity: ErrorSeverity.MEDIUM, context, originalError: error }
        )
      }
    }

    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
      return new LoadTestFrontendError(
        ErrorType.NETWORK,
        'NETWORK_REQUEST_FAILED',
        error.message,
        { severity: ErrorSeverity.MEDIUM, context, originalError: error }
      )
    }

    // Chart/rendering errors
    if (message.includes('chart') || message.includes('render') || message.includes('canvas')) {
      return new LoadTestFrontendError(
        ErrorType.CHART,
        'CHART_RENDER_ERROR',
        error.message,
        { severity: ErrorSeverity.LOW, context, originalError: error }
      )
    }

    // Data processing errors
    if (message.includes('json') || message.includes('parse') || message.includes('invalid')) {
      return new LoadTestFrontendError(
        ErrorType.DATA_PROCESSING,
        'DATA_PARSE_ERROR',
        error.message,
        { severity: ErrorSeverity.MEDIUM, context, originalError: error }
      )
    }

    // Storage errors
    if (message.includes('quota') || message.includes('storage') || message.includes('localstorage')) {
      return new LoadTestFrontendError(
        ErrorType.STORAGE,
        'STORAGE_QUOTA_EXCEEDED',
        error.message,
        { severity: ErrorSeverity.LOW, context, originalError: error }
      )
    }

    // Default to unknown error
    return new LoadTestFrontendError(
      ErrorType.UNKNOWN,
      'UNKNOWN_ERROR',
      error.message,
      { severity: ErrorSeverity.MEDIUM, context, originalError: error }
    )
  }

  /**
   * Add error to history
   */
  private addToHistory(error: LoadTestFrontendError): void {
    this.errors.push(error)
    
    // Maintain max errors limit
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number
    byType: Record<ErrorType, number>
    bySeverity: Record<ErrorSeverity, number>
    recent: LoadTestFrontendError[]
  } {
    const byType = {} as Record<ErrorType, number>
    const bySeverity = {} as Record<ErrorSeverity, number>

    this.errors.forEach(error => {
      byType[error.type] = (byType[error.type] || 0) + 1
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1
    })

    return {
      total: this.errors.length,
      byType,
      bySeverity,
      recent: this.errors.slice(-10)
    }
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.errors = []
    this.retryAttempts.clear()
  }

  /**
   * Check if operation should be retried
   */
  shouldRetry(operationKey: string, error: LoadTestFrontendError): boolean {
    if (!error.recoverable) {
      return false
    }

    const attempts = this.retryAttempts.get(operationKey) || 0
    if (attempts >= this.maxRetries) {
      return false
    }

    this.retryAttempts.set(operationKey, attempts + 1)
    return true
  }

  /**
   * Reset retry count for an operation
   */
  resetRetryCount(operationKey: string): void {
    this.retryAttempts.delete(operationKey)
  }

  /**
   * Create specific error types
   */
  createWebSocketError(code: string, message: string, context?: Record<string, any>): LoadTestFrontendError {
    return new LoadTestFrontendError(ErrorType.WEBSOCKET, code, message, { context })
  }

  createNetworkError(code: string, message: string, context?: Record<string, any>): LoadTestFrontendError {
    return new LoadTestFrontendError(ErrorType.NETWORK, code, message, { context })
  }

  createChartError(code: string, message: string, context?: Record<string, any>): LoadTestFrontendError {
    return new LoadTestFrontendError(ErrorType.CHART, code, message, { context })
  }

  createDataError(code: string, message: string, context?: Record<string, any>): LoadTestFrontendError {
    return new LoadTestFrontendError(ErrorType.DATA_PROCESSING, code, message, { context })
  }
}

// Global error handler instance
export const globalErrorHandler = new FrontendErrorHandler()

// Global error event listener
window.addEventListener('error', (event) => {
  globalErrorHandler.handleError(event.error, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  })
})

window.addEventListener('unhandledrejection', (event) => {
  globalErrorHandler.handleError(
    new Error(event.reason?.message || 'Unhandled promise rejection'),
    { reason: event.reason }
  )
})

/**
 * Hook for using error handling in React components
 */
export function useErrorHandler() {
  return {
    handleError: (error: Error, context?: Record<string, any>) => 
      globalErrorHandler.handleError(error, context),
    getErrorStats: () => globalErrorHandler.getErrorStats(),
    clearErrors: () => globalErrorHandler.clearErrors(),
    onError: (listener: (error: LoadTestFrontendError) => void) => 
      globalErrorHandler.onError(listener)
  }
}