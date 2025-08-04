import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

interface ErrorSummaryProps {
  statusCodes?: Record<number, number>
  errors?: Record<string, number>
  totalRequests: number
}

export function ErrorSummary({ statusCodes, errors, totalRequests }: ErrorSummaryProps) {
  // Process status codes for visualization
  const statusCodeData = statusCodes ? Object.entries(statusCodes).map(([code, count]) => {
    const statusCode = parseInt(code)
    let category = 'Unknown'
    let color = '#6b7280'

    if (statusCode >= 200 && statusCode < 300) {
      category = 'Success (2xx)'
      color = '#10b981'
    } else if (statusCode >= 300 && statusCode < 400) {
      category = 'Redirect (3xx)'
      color = '#f59e0b'
    } else if (statusCode >= 400 && statusCode < 500) {
      category = 'Client Error (4xx)'
      color = '#f97316'
    } else if (statusCode >= 500) {
      category = 'Server Error (5xx)'
      color = '#ef4444'
    }

    return {
      name: `${code} (${count})`,
      value: count,
      percentage: totalRequests > 0 ? ((count / totalRequests) * 100).toFixed(1) : '0',
      category,
      color,
      statusCode
    }
  }).sort((a, b) => b.value - a.value) : []

  // Calculate summary stats
  const successCount = statusCodeData
    .filter(item => item.statusCode >= 200 && item.statusCode < 300)
    .reduce((sum, item) => sum + item.value, 0)
  
  const errorCount = statusCodeData
    .filter(item => item.statusCode >= 400)
    .reduce((sum, item) => sum + item.value, 0)

  const redirectCount = statusCodeData
    .filter(item => item.statusCode >= 300 && item.statusCode < 400)
    .reduce((sum, item) => sum + item.value, 0)

  // Process error messages
  const errorMessages = errors ? Object.entries(errors)
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) : [] // Show top 5 errors

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Analysis</CardTitle>
        <CardDescription>
          HTTP status codes and error categorization
        </CardDescription>
      </CardHeader>
      <CardContent>
        {statusCodeData.length > 0 ? (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-lg font-bold text-green-600">{successCount}</div>
                  <div className="text-sm text-muted-foreground">Success</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="text-lg font-bold text-orange-600">{redirectCount}</div>
                  <div className="text-sm text-muted-foreground">Redirects</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-lg font-bold text-red-600">{errorCount}</div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
              </div>
            </div>

            {/* Status Code Distribution Chart */}
            {statusCodeData.length > 1 && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCodeData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percentage }) => `${name} (${percentage}%)`}
                    >
                      {statusCodeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `${value} requests (${((value / totalRequests) * 100).toFixed(1)}%)`,
                        'Count'
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Status Code Breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Status Code Breakdown</h4>
              <div className="space-y-1">
                {statusCodeData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-1">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Error Messages */}
            {errorMessages.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <h4 className="text-sm font-medium">Top Error Messages</h4>
                <div className="space-y-2">
                  {errorMessages.map((error, index) => (
                    <div key={index} className="flex items-start justify-between py-2 px-3 bg-red-50 rounded-md">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-red-800 truncate">
                          {error.message}
                        </div>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {error.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <div className="text-lg font-medium">No data available</div>
              <div className="text-sm">Start a test to see error analysis</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}