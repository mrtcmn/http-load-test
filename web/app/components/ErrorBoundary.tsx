import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { LoadTestFrontendError, ErrorType, ErrorSeverity, globalErrorHandler } from '../utils/errorHandling'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: LoadTestFrontendError, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: LoadTestFrontendError | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    // Convert to LoadTestFrontendError if needed
    const frontendError = error instanceof LoadTestFrontendError 
      ? error 
      : new LoadTestFrontendError(
          ErrorType.UNKNOWN,
          'COMPONENT_ERROR',
          error.message,
          {
            severity: ErrorSeverity.HIGH,
            originalError: error,
            context: { boundary: true }
          }
        )

    return {
      hasError: true,
      error: frontendError,
      errorInfo: null
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Handle the error through our error handler
    const frontendError = globalErrorHandler.handleError(error, {
      componentStack: errorInfo.componentStack,
      boundary: true
    })

    this.setState({
      error: frontendError,
      errorInfo
    })

    // Call the onError prop if provided
    this.props.onError?.(frontendError, errorInfo)

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error)
      console.error('Component stack:', errorInfo.componentStack)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                Something went wrong
              </CardTitle>
              <CardDescription>
                {this.state.error.userMessage}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details in development */}
              {process.env.NODE_ENV === 'development' && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Technical Details
                  </summary>
                  <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                    <div><strong>Type:</strong> {this.state.error.type}</div>
                    <div><strong>Code:</strong> {this.state.error.code}</div>
                    <div><strong>Severity:</strong> {this.state.error.severity}</div>
                    <div><strong>Message:</strong> {this.state.error.message}</div>
                    {this.state.error.context && Object.keys(this.state.error.context).length > 0 && (
                      <div><strong>Context:</strong> {JSON.stringify(this.state.error.context, null, 2)}</div>
                    )}
                  </div>
                </details>
              )}

              {/* Troubleshooting steps */}
              <div>
                <h4 className="text-sm font-medium mb-2">Try these steps:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {this.state.error.getTroubleshootingSteps().map((step, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-xs mt-1">•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {this.state.error.recoverable && (
                  <Button onClick={this.handleRetry} variant="outline" size="sm">
                    Try Again
                  </Button>
                )}
                <Button onClick={this.handleReload} size="sm">
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}

/**
 * Lightweight error boundary for specific components
 */
export function ChartErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center justify-center h-64 border border-dashed border-muted-foreground/25 rounded-lg">
          <div className="text-center space-y-2">
            <svg
              className="w-8 h-8 mx-auto text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 00-2-2m0 0V9a2 2 0 012-2h2a2 2 0 00-2-2"
              />
            </svg>
            <div className="text-sm text-muted-foreground">
              Chart could not be displayed
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}