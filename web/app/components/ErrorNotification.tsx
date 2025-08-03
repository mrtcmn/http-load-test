import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { LoadTestFrontendError, ErrorSeverity, useErrorHandler } from '../utils/errorHandling'

interface ErrorNotificationProps {
  error: LoadTestFrontendError
  onDismiss?: () => void
  onRetry?: () => void
  autoHide?: boolean
  autoHideDelay?: number
}

export function ErrorNotification({
  error,
  onDismiss,
  onRetry,
  autoHide = false,
  autoHideDelay = 5000
}: ErrorNotificationProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (autoHide && error.severity === ErrorSeverity.LOW) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        onDismiss?.()
      }, autoHideDelay)

      return () => clearTimeout(timer)
    }
  }, [autoHide, autoHideDelay, error.severity, onDismiss])

  if (!isVisible) {
    return null
  }

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'border-red-500 bg-red-50 text-red-900'
      case ErrorSeverity.HIGH:
        return 'border-orange-500 bg-orange-50 text-orange-900'
      case ErrorSeverity.MEDIUM:
        return 'border-yellow-500 bg-yellow-50 text-yellow-900'
      case ErrorSeverity.LOW:
        return 'border-blue-500 bg-blue-50 text-blue-900'
      default:
        return 'border-gray-500 bg-gray-50 text-gray-900'
    }
  }

  const getSeverityIcon = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case ErrorSeverity.HIGH:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case ErrorSeverity.MEDIUM:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  return (
    <Card className={`border-l-4 ${getSeverityColor(error.severity)}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {getSeverityIcon(error.severity)}
          {error.type.toUpperCase()} Error
          <span className="ml-auto text-xs font-normal opacity-75">
            {new Date(error.timestamp).toLocaleTimeString()}
          </span>
        </CardTitle>
        <CardDescription className="text-sm">
          {error.userMessage}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Troubleshooting steps */}
        <div>
          <h4 className="text-xs font-medium mb-1 opacity-75">Quick fixes:</h4>
          <ul className="text-xs space-y-1 opacity-75">
            {error.getTroubleshootingSteps().slice(0, 2).map((step, index) => (
              <li key={index} className="flex items-start gap-1">
                <span className="mt-1">•</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {error.recoverable && onRetry && (
            <Button
              onClick={onRetry}
              size="sm"
              variant="outline"
              className="text-xs h-7"
            >
              Retry
            </Button>
          )}
          
          <Button
            onClick={() => setShowDetails(!showDetails)}
            size="sm"
            variant="ghost"
            className="text-xs h-7"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </Button>
          
          <Button
            onClick={() => {
              setIsVisible(false)
              onDismiss?.()
            }}
            size="sm"
            variant="ghost"
            className="text-xs h-7 ml-auto"
          >
            Dismiss
          </Button>
        </div>

        {/* Error details */}
        {showDetails && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium mb-2">
              Technical Details
            </summary>
            <div className="bg-muted p-2 rounded text-xs font-mono space-y-1">
              <div><strong>Code:</strong> {error.code}</div>
              <div><strong>Type:</strong> {error.type}</div>
              <div><strong>Severity:</strong> {error.severity}</div>
              <div><strong>Recoverable:</strong> {error.recoverable ? 'Yes' : 'No'}</div>
              {error.context && Object.keys(error.context).length > 0 && (
                <div><strong>Context:</strong> {JSON.stringify(error.context, null, 2)}</div>
              )}
              {error.originalError && (
                <div><strong>Original:</strong> {error.originalError.message}</div>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Error notification container that manages multiple errors
 */
export function ErrorNotificationContainer() {
  const [errors, setErrors] = useState<LoadTestFrontendError[]>([])
  const { onError } = useErrorHandler()

  useEffect(() => {
    const unsubscribe = onError((error) => {
      setErrors(prev => {
        // Avoid duplicate errors
        const isDuplicate = prev.some(e => 
          e.code === error.code && 
          e.message === error.message &&
          (Date.now() - e.timestamp) < 5000 // Within 5 seconds
        )
        
        if (isDuplicate) {
          return prev
        }
        
        // Add new error and limit to 5 most recent
        return [...prev, error].slice(-5)
      })
    })

    return unsubscribe
  }, [onError])

  const handleDismiss = (errorToRemove: LoadTestFrontendError) => {
    setErrors(prev => prev.filter(error => error !== errorToRemove))
  }

  const handleRetry = (error: LoadTestFrontendError) => {
    // Implement retry logic based on error type
    switch (error.type) {
      case 'websocket':
        // Trigger WebSocket reconnection
        window.location.reload()
        break
      case 'network':
        // Retry network request
        window.location.reload()
        break
      default:
        // Generic retry - reload page
        window.location.reload()
    }
  }

  if (errors.length === 0) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {errors.map((error, index) => (
        <ErrorNotification
          key={`${error.timestamp}-${index}`}
          error={error}
          onDismiss={() => handleDismiss(error)}
          onRetry={() => handleRetry(error)}
          autoHide={error.severity === ErrorSeverity.LOW}
        />
      ))}
    </div>
  )
}