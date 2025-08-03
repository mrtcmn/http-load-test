import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface ErrorSummaryProps {
  statusCodes?: Record<number, number>
  errors?: Record<string, number>
  totalRequests: number
}

export function ErrorSummary({ statusCodes = {}, errors = {}, totalRequests }: ErrorSummaryProps) {
  const getStatusCodeColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-green-600'
    if (code >= 300 && code < 400) return 'text-blue-600'
    if (code >= 400 && code < 500) return 'text-orange-600'
    if (code >= 500) return 'text-red-600'
    return 'text-gray-600'
  }

  const getStatusCodeLabel = (code: number) => {
    if (code >= 200 && code < 300) return 'Success'
    if (code >= 300 && code < 400) return 'Redirect'
    if (code >= 400 && code < 500) return 'Client Error'
    if (code >= 500) return 'Server Error'
    return 'Unknown'
  }

  const statusCodeEntries = Object.entries(statusCodes)
    .map(([code, count]) => ({ code: parseInt(code), count }))
    .sort((a, b) => b.count - a.count)

  const errorEntries = Object.entries(errors)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)

  const calculatePercentage = (count: number) => {
    return totalRequests > 0 ? ((count / totalRequests) * 100).toFixed(1) : '0.0'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Summary</CardTitle>
        <CardDescription>
          Breakdown of HTTP status codes and error types
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Codes */}
        <div>
          <h4 className="text-sm font-semibold mb-3">HTTP Status Codes</h4>
          {statusCodeEntries.length > 0 ? (
            <div className="space-y-2">
              {statusCodeEntries.map(({ code, count }) => (
                <div key={code} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full bg-current ${getStatusCodeColor(code)}`} />
                    <span className="text-sm">
                      {code} - {getStatusCodeLabel(code)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${getStatusCodeColor(code)}`}>
                      {count.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {calculatePercentage(count)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No status codes recorded</div>
          )}
        </div>

        {/* Error Details */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Error Details</h4>
          {errorEntries.length > 0 ? (
            <div className="space-y-2">
              {errorEntries.slice(0, 5).map(({ error, count }) => (
                <div key={error} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm truncate max-w-48" title={error}>
                      {error}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-600">
                      {count.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {calculatePercentage(count)}%
                    </div>
                  </div>
                </div>
              ))}
              {errorEntries.length > 5 && (
                <div className="text-xs text-muted-foreground text-center pt-2">
                  ... and {errorEntries.length - 5} more error types
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No errors recorded</div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="pt-4 border-t">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-green-600">
                {totalRequests - Object.values(errors).reduce((sum, count) => sum + count, 0)}
              </div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">
                {Object.values(errors).reduce((sum, count) => sum + count, 0)}
              </div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}