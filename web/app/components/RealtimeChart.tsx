import React, { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts'
import { Activity, Wifi, WifiOff, RotateCcw } from 'lucide-react'
import { useRealtimeMetrics, MetricsHistory } from '../hooks/useRealtimeMetrics'

export interface RealtimeChartProps {
  wsUrl?: string
  maxHistoryPoints?: number
  updateInterval?: number
  showLegend?: boolean
  height?: number
}

interface ChartDataPoint {
  timestamp: number
  time: string
  responseTime: number
  requestsPerSecond: number
  errorRate: number
  activeConnections: number
}

export function RealtimeChart({ 
  wsUrl,
  maxHistoryPoints = 100,
  updateInterval = 1000,
  showLegend = true,
  height = 400
}: RealtimeChartProps) {
  const {
    currentMetrics,
    metricsHistory,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    clearHistory,
    connectionAttempts
  } = useRealtimeMetrics({
    wsUrl,
    maxHistoryPoints,
    updateInterval
  })

  // Transform metrics history into chart data
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!metricsHistory.timestamps.length) return []

    return metricsHistory.timestamps.map((timestamp, index) => ({
      timestamp,
      time: new Date(timestamp).toLocaleTimeString(),
      responseTime: metricsHistory.responseTimes[index] || 0,
      requestsPerSecond: metricsHistory.requestsPerSecond[index] || 0,
      errorRate: metricsHistory.errorRates[index] || 0,
      activeConnections: metricsHistory.activeConnections[index] || 0
    }))
  }, [metricsHistory])

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatRate = (rate: number) => `${rate.toFixed(1)}%`

  const getConnectionStatus = () => {
    if (isConnecting) return { text: 'Connecting...', color: 'text-yellow-600', icon: Activity }
    if (isConnected) return { text: 'Connected', color: 'text-green-600', icon: Wifi }
    return { text: 'Disconnected', color: 'text-red-600', icon: WifiOff }
  }

  const status = getConnectionStatus()
  const StatusIcon = status.icon

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Real-time Performance
            </CardTitle>
            <CardDescription>
              Live metrics streaming from load test execution
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-sm ${status.color}`}>
              <StatusIcon className="h-4 w-4" />
              {status.text}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearHistory}
              disabled={!chartData.length}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="text-sm text-red-800">
                Connection error: {error}
                {connectionAttempts > 0 && ` (Attempt ${connectionAttempts})`}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={connect}
                disabled={isConnecting}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Current Metrics Summary */}
        {currentMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {formatTime(currentMetrics.avgResponseTime)}
              </div>
              <div className="text-xs text-muted-foreground">Avg Response</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {currentMetrics.requestsPerSecond.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">Req/sec</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {formatRate(currentMetrics.errorRate)}
              </div>
              <div className="text-xs text-muted-foreground">Error Rate</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">
                {currentMetrics.activeConnections}
              </div>
              <div className="text-xs text-muted-foreground">Active Conn.</div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div style={{ height }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatTime}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    switch (name) {
                      case 'responseTime':
                        return [formatTime(value), 'Response Time']
                      case 'requestsPerSecond':
                        return [value.toFixed(1), 'Requests/sec']
                      case 'errorRate':
                        return [formatRate(value), 'Error Rate']
                      case 'activeConnections':
                        return [value, 'Active Connections']
                      default:
                        return [value, name]
                    }
                  }}
                  labelFormatter={(label) => `Time: ${label}`}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #ccc',
                    borderRadius: '4px'
                  }}
                />
                {showLegend && <Legend />}
                
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="responseTime"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Response Time"
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="requestsPerSecond"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Requests/sec"
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="errorRate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Error Rate (%)"
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="activeConnections"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="Active Connections"
                  connectNulls={false}
                />

                {/* Reference lines for better visualization */}
                {currentMetrics && (
                  <>
                    <ReferenceLine 
                      yAxisId="left"
                      y={currentMetrics.avgResponseTime} 
                      stroke="#3b82f6" 
                      strokeDasharray="5 5" 
                      strokeOpacity={0.5}
                    />
                    <ReferenceLine 
                      yAxisId="right"
                      y={5} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeOpacity={0.3}
                      label={{ value: "5% Error Threshold", position: "topRight" }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <div className="text-lg font-medium">
                  {isConnected ? 'Waiting for data...' : 'No connection'}
                </div>
                <div className="text-sm">
                  {isConnected 
                    ? 'Start a load test to see real-time metrics'
                    : 'Connect to WebSocket to receive live data'
                  }
                </div>
                {!isConnected && !isConnecting && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={connect}
                    className="mt-2"
                  >
                    <Wifi className="h-4 w-4 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Connection Info */}
        {(isConnecting || connectionAttempts > 0) && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isConnecting && 'Establishing connection...'}
            {connectionAttempts > 0 && !isConnecting && 
              `Reconnection attempts: ${connectionAttempts}`
            }
          </div>
        )}
      </CardContent>
    </Card>
  )
}