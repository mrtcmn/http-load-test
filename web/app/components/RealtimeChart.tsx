import React, { useState, useEffect, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'
import { ChartErrorBoundary } from './ErrorBoundary'
import { LoadTestFrontendError, globalErrorHandler } from '../utils/errorHandling'

export interface RealtimeDataPoint {
  timestamp: number
  responseTime: number
  requestsPerSecond: number
  successRate: number
  activeRequests: number
}

interface RealtimeChartProps {
  data: RealtimeDataPoint[]
  isConnected: boolean
  isConnecting: boolean
  error: LoadTestFrontendError | null
  onReconnect?: () => void
}

interface ChartHealth {
  hasData: boolean
  dataAge: number
  isStale: boolean
  lastUpdate: number | null
}

const chartConfig = {
  responseTime: {
    label: 'Response Time (ms)',
    color: 'hsl(var(--chart-1))',
  },
  requestsPerSecond: {
    label: 'Requests/sec',
    color: 'hsl(var(--chart-2))',
  },
  successRate: {
    label: 'Success Rate (%)',
    color: 'hsl(var(--chart-3))',
  },
  activeRequests: {
    label: 'Active Requests',
    color: 'hsl(var(--chart-4))',
  },
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  })
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    try {
      return (
        <ChartTooltip>
          <ChartTooltipContent>
            <div className="space-y-1">
              <p className="font-medium">{formatTimestamp(label)}</p>
              {payload.map((entry: any, index: number) => {
                const value = typeof entry.value === 'number' ? entry.value : 0
                const formattedValue = value.toFixed(entry.dataKey === 'successRate' ? 1 : 0)
                
                return (
                  <p key={index} style={{ color: entry.color }}>
                    {entry.name}: {formattedValue}
                    {entry.dataKey === 'responseTime' && 'ms'}
                    {entry.dataKey === 'successRate' && '%'}
                  </p>
                )
              })}
            </div>
          </ChartTooltipContent>
        </ChartTooltip>
      )
    } catch (error) {
      globalErrorHandler.handleError(
        new Error('Tooltip rendering failed'),
        { payload, label, error }
      )
      return null
    }
  }
  return null
}

export function RealtimeChart({
  data,
  isConnected,
  isConnecting,
  error,
  onReconnect,
}: RealtimeChartProps) {
  const [chartError, setChartError] = useState<LoadTestFrontendError | null>(null)
  const [lastDataUpdate, setLastDataUpdate] = useState<number | null>(null)

  // Track data updates
  useEffect(() => {
    if (data.length > 0) {
      setLastDataUpdate(Date.now())
    }
  }, [data])

  // Calculate chart health
  const chartHealth = useMemo((): ChartHealth => {
    const hasData = data.length > 0
    const lastUpdate = lastDataUpdate
    const dataAge = lastUpdate ? Date.now() - lastUpdate : 0
    const isStale = dataAge > 30000 // Consider stale after 30 seconds

    return {
      hasData,
      dataAge,
      isStale,
      lastUpdate
    }
  }, [data, lastDataUpdate])

  // Validate and sanitize data
  const sanitizedData = useMemo(() => {
    try {
      return data.map((point, index) => {
        // Validate data point structure
        if (!point || typeof point !== 'object') {
          throw new Error(`Invalid data point at index ${index}`)
        }

        // Sanitize numeric values
        const sanitized = {
          timestamp: Number(point.timestamp) || Date.now(),
          responseTime: Math.max(0, Number(point.responseTime) || 0),
          requestsPerSecond: Math.max(0, Number(point.requestsPerSecond) || 0),
          successRate: Math.min(100, Math.max(0, Number(point.successRate) || 0)),
          activeRequests: Math.max(0, Number(point.activeRequests) || 0)
        }

        // Check for invalid values
        if (Object.values(sanitized).some(val => isNaN(val))) {
          throw new Error(`Invalid numeric values in data point at index ${index}`)
        }

        return sanitized
      })
    } catch (error) {
      const chartError = globalErrorHandler.createChartError(
        'CHART_DATA_INVALID',
        'Chart data validation failed',
        { originalData: data, error }
      )
      setChartError(chartError)
      return []
    }
  }, [data])

  const connectionStatus = isConnecting
    ? 'Connecting...'
    : isConnected
    ? 'Connected'
    : 'Disconnected'

  const connectionColor = isConnecting
    ? 'text-yellow-500'
    : isConnected
    ? 'text-green-500'
    : 'text-red-500'

  const handleChartError = (error: Error, context: Record<string, any>) => {
    const chartError = globalErrorHandler.createChartError(
      'CHART_RENDER_ERROR',
      'Chart rendering failed',
      { ...context, error }
    )
    setChartError(chartError)
  }

  const renderChart = (
    chartType: string,
    dataKey: string,
    title: string,
    description: string,
    height = 300,
    yAxisId?: string,
    additionalLines?: Array<{ dataKey: string; yAxisId?: string }>
  ) => {
    try {
      return (
        <ChartErrorBoundary>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
                {chartType === 'responseTime' && (
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={`text-sm ${connectionColor}`}>{connectionStatus}</span>
                    {chartHealth.isStale && (
                      <span className="text-xs text-orange-500">
                        Data stale ({Math.round(chartHealth.dataAge / 1000)}s)
                      </span>
                    )}
                    {error && !isConnected && (
                      <Button
                        onClick={onReconnect}
                        size="sm"
                        variant="outline"
                        className="text-xs"
                      >
                        Reconnect
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sanitizedData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  <div className="text-center">
                    <div className="text-sm">No data available</div>
                    {chartError && (
                      <div className="text-xs mt-1 text-red-500">
                        {chartError.userMessage}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <ChartContainer config={chartConfig} className={`h-[${height}px]`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={sanitizedData} 
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      onError={(error) => handleChartError(error, { chartType, dataKey })}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={formatTimestamp}
                        className="text-xs"
                      />
                      <YAxis yAxisId={yAxisId || 'left'} className="text-xs" />
                      {additionalLines?.some(line => line.yAxisId === 'right') && (
                        <YAxis yAxisId="right" orientation="right" className="text-xs" />
                      )}
                      <Tooltip content={<CustomTooltip />} />
                      {additionalLines && <Legend />}
                      <Line
                        yAxisId={yAxisId || 'left'}
                        type="monotone"
                        dataKey={dataKey}
                        stroke={chartConfig[dataKey as keyof typeof chartConfig]?.color}
                        strokeWidth={2}
                        dot={false}
                        name={chartConfig[dataKey as keyof typeof chartConfig]?.label}
                      />
                      {additionalLines?.map((line, index) => (
                        <Line
                          key={index}
                          yAxisId={line.yAxisId || 'left'}
                          type="monotone"
                          dataKey={line.dataKey}
                          stroke={chartConfig[line.dataKey as keyof typeof chartConfig]?.color}
                          strokeWidth={2}
                          dot={false}
                          name={chartConfig[line.dataKey as keyof typeof chartConfig]?.label}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </ChartErrorBoundary>
      )
    } catch (error) {
      handleChartError(error as Error, { chartType, dataKey })
      return (
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <div className="text-sm">Chart rendering failed</div>
              <Button
                onClick={() => setChartError(null)}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }
  }

  return (
    <div className="space-y-4">
      {/* Response Time Chart */}
      {renderChart(
        'responseTime',
        'responseTime',
        'Response Time',
        'Real-time response time measurements',
        300
      )}

      {/* Requests Per Second Chart */}
      {renderChart(
        'requestsPerSecond',
        'requestsPerSecond',
        'Requests Per Second',
        'Current throughput over time',
        250
      )}

      {/* Combined Metrics Chart */}
      {renderChart(
        'combined',
        'successRate',
        'Combined Metrics',
        'Success rate and active requests over time',
        300,
        'left',
        [{ dataKey: 'activeRequests', yAxisId: 'right' }]
      )}

      {/* Error Display */}
      {(error || chartError) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-red-600 font-medium">
                  {error ? 'Connection Error' : 'Chart Error'}
                </p>
                <p className="text-xs text-red-500">
                  {error?.userMessage || chartError?.userMessage}
                </p>
                {(error || chartError) && process.env.NODE_ENV === 'development' && (
                  <details className="text-xs">
                    <summary className="cursor-pointer">Technical Details</summary>
                    <pre className="mt-1 p-2 bg-red-100 rounded text-xs">
                      {JSON.stringify((error || chartError)?.toJSON(), null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="flex gap-2">
                {chartError && (
                  <Button
                    onClick={() => setChartError(null)}
                    size="sm"
                    variant="outline"
                  >
                    Clear Error
                  </Button>
                )}
                {error && onReconnect && (
                  <Button
                    onClick={onReconnect}
                    size="sm"
                    variant="default"
                  >
                    Retry Connection
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart Health Status */}
      {!chartHealth.hasData && !error && !chartError && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-yellow-600">Waiting for data...</p>
              <p className="text-xs text-yellow-500 mt-1">
                Charts will appear once metrics data is received
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}