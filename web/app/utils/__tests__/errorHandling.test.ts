import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    LoadTestFrontendError,
    FrontendErrorHandler,
    ErrorType,
    ErrorSeverity,
    globalErrorHandler
} from '../errorHandling'

describe('LoadTestFrontendError', () => {
    it('should create error with correct properties', () => {
        const error = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_FAILED',
            'Connection failed',
            {
                severity: ErrorSeverity.HIGH,
                context: { url: 'ws://localhost:8080' },
                recoverable: true
            }
        )

        expect(error.type).toBe(ErrorType.WEBSOCKET)
        expect(error.code).toBe('WS_CONNECTION_FAILED')
        expect(error.message).toBe('Connection failed')
        expect(error.severity).toBe(ErrorSeverity.HIGH)
        expect(error.recoverable).toBe(true)
        expect(error.context.url).toBe('ws://localhost:8080')
    })

    it('should generate appropriate user messages', () => {
        const error = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_FAILED',
            'Connection failed'
        )

        expect(error.userMessage).toContain('connect to the server')
    })

    it('should provide troubleshooting steps', () => {
        const error = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_FAILED',
            'Connection failed'
        )

        const steps = error.getTroubleshootingSteps()
        expect(Array.isArray(steps)).toBe(true)
        expect(steps.length).toBeGreaterThan(0)
        expect(steps[0]).toContain('internet connection')
    })

    it('should serialize to JSON correctly', () => {
        const originalError = new Error('Original error')
        const error = new LoadTestFrontendError(
            ErrorType.CHART,
            'CHART_RENDER_ERROR',
            'Chart failed',
            {
                context: { chartType: 'line' },
                originalError
            }
        )

        const json = error.toJSON()
        expect(json.type).toBe(ErrorType.CHART)
        expect(json.code).toBe('CHART_RENDER_ERROR')
        expect(json.context.chartType).toBe('line')
        expect(json.originalError?.message).toBe('Original error')
    })

    it('should determine recoverability correctly', () => {
        const recoverableError = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_LOST',
            'Connection lost'
        )
        expect(recoverableError.recoverable).toBe(true)

        const nonRecoverableError = new LoadTestFrontendError(
            ErrorType.VALIDATION,
            'VALIDATION_ERROR',
            'Invalid data'
        )
        expect(nonRecoverableError.recoverable).toBe(false)
    })
})

describe('FrontendErrorHandler', () => {
    let errorHandler: FrontendErrorHandler

    beforeEach(() => {
        errorHandler = new FrontendErrorHandler()
    })

    it('should categorize WebSocket errors correctly', () => {
        const wsError = new Error('WebSocket connection failed')
        const categorized = errorHandler.handleError(wsError)

        expect(categorized.type).toBe(ErrorType.WEBSOCKET)
        expect(categorized.code).toBe('WS_CONNECTION_FAILED')
    })

    it('should categorize network errors correctly', () => {
        const networkError = new Error('fetch failed')
        const categorized = errorHandler.handleError(networkError)

        expect(categorized.type).toBe(ErrorType.NETWORK)
        expect(categorized.code).toBe('NETWORK_REQUEST_FAILED')
    })

    it('should categorize chart errors correctly', () => {
        const chartError = new Error('chart render failed')
        const categorized = errorHandler.handleError(chartError)

        expect(categorized.type).toBe(ErrorType.CHART)
        expect(categorized.code).toBe('CHART_RENDER_ERROR')
    })

    it('should categorize data processing errors correctly', () => {
        const parseError = new Error('JSON parse error')
        const categorized = errorHandler.handleError(parseError)

        expect(categorized.type).toBe(ErrorType.DATA_PROCESSING)
        expect(categorized.code).toBe('DATA_PARSE_ERROR')
    })

    it('should track error statistics', () => {
        const error1 = new LoadTestFrontendError(ErrorType.WEBSOCKET, 'WS_ERROR', 'Error 1')
        const error2 = new LoadTestFrontendError(ErrorType.CHART, 'CHART_ERROR', 'Error 2')
        const error3 = new LoadTestFrontendError(ErrorType.WEBSOCKET, 'WS_ERROR', 'Error 3')

        errorHandler.handleError(error1)
        errorHandler.handleError(error2)
        errorHandler.handleError(error3)

        const stats = errorHandler.getErrorStats()
        expect(stats.total).toBe(3)
        expect(stats.byType[ErrorType.WEBSOCKET]).toBe(2)
        expect(stats.byType[ErrorType.CHART]).toBe(1)
        expect(stats.recent).toHaveLength(3)
    })

    it('should handle error listeners', () => {
        const listener = vi.fn()
        const unsubscribe = errorHandler.onError(listener)

        const error = new LoadTestFrontendError(ErrorType.WEBSOCKET, 'WS_ERROR', 'Test error')
        errorHandler.handleError(error)

        expect(listener).toHaveBeenCalledWith(error)

        unsubscribe()
        errorHandler.handleError(error)
        expect(listener).toHaveBeenCalledTimes(1) // Should not be called again
    })

    it('should manage retry logic', () => {
        const recoverableError = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_LOST',
            'Connection lost'
        )

        expect(errorHandler.shouldRetry('test-operation', recoverableError)).toBe(true)
        expect(errorHandler.shouldRetry('test-operation', recoverableError)).toBe(true)
        expect(errorHandler.shouldRetry('test-operation', recoverableError)).toBe(true)
        expect(errorHandler.shouldRetry('test-operation', recoverableError)).toBe(false) // Max retries reached

        errorHandler.resetRetryCount('test-operation')
        expect(errorHandler.shouldRetry('test-operation', recoverableError)).toBe(true)
    })

    it('should not retry non-recoverable errors', () => {
        const nonRecoverableError = new LoadTestFrontendError(
            ErrorType.VALIDATION,
            'VALIDATION_ERROR',
            'Invalid data'
        )

        expect(errorHandler.shouldRetry('test-operation', nonRecoverableError)).toBe(false)
    })

    it('should clear errors', () => {
        const error = new LoadTestFrontendError(ErrorType.WEBSOCKET, 'WS_ERROR', 'Test error')
        errorHandler.handleError(error)

        expect(errorHandler.getErrorStats().total).toBe(1)

        errorHandler.clearErrors()
        expect(errorHandler.getErrorStats().total).toBe(0)
    })

    it('should create specific error types', () => {
        const wsError = errorHandler.createWebSocketError('WS_TEST', 'WebSocket test error')
        expect(wsError.type).toBe(ErrorType.WEBSOCKET)

        const networkError = errorHandler.createNetworkError('NET_TEST', 'Network test error')
        expect(networkError.type).toBe(ErrorType.NETWORK)

        const chartError = errorHandler.createChartError('CHART_TEST', 'Chart test error')
        expect(chartError.type).toBe(ErrorType.CHART)

        const dataError = errorHandler.createDataError('DATA_TEST', 'Data test error')
        expect(dataError.type).toBe(ErrorType.DATA_PROCESSING)
    })
})

describe('Global Error Handler', () => {
    it('should be available globally', () => {
        expect(globalErrorHandler).toBeInstanceOf(FrontendErrorHandler)
    })

    it('should handle errors through global instance', () => {
        const error = new Error('Global test error')
        const handled = globalErrorHandler.handleError(error)

        expect(handled).toBeInstanceOf(LoadTestFrontendError)
        expect(globalErrorHandler.getErrorStats().total).toBeGreaterThan(0)
    })
})

describe('Error Severity and Recovery', () => {
    it('should assign appropriate severity levels', () => {
        const criticalError = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_FAILED',
            'Critical connection failure',
            { severity: ErrorSeverity.CRITICAL }
        )
        expect(criticalError.severity).toBe(ErrorSeverity.CRITICAL)

        const lowError = new LoadTestFrontendError(
            ErrorType.CHART,
            'CHART_RENDER_ERROR',
            'Minor chart issue',
            { severity: ErrorSeverity.LOW }
        )
        expect(lowError.severity).toBe(ErrorSeverity.LOW)
    })

    it('should provide context-aware troubleshooting', () => {
        const wsError = new LoadTestFrontendError(
            ErrorType.WEBSOCKET,
            'WS_CONNECTION_FAILED',
            'Connection failed'
        )
        const wsSteps = wsError.getTroubleshootingSteps()
        expect(wsSteps.some(step => step.includes('connection'))).toBe(true)

        const chartError = new LoadTestFrontendError(
            ErrorType.CHART,
            'CHART_RENDER_ERROR',
            'Chart failed'
        )
        const chartSteps = chartError.getTroubleshootingSteps()
        expect(chartSteps.some(step => step.includes('browser'))).toBe(true)
    })
})