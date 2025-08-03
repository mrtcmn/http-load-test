import React from 'react'
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'

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
  error: string | null
  onReconnect?: () => void
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
    return (
      <ChartTooltip>
        <ChartTooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{formatTimestamp(label)}</p>
            {payload.map((entry: any, index: number) => (
              <p key={index} style={{ color: entry.color }}>
                {entry.name}: {entry.value.toFixed(entry.dataKey === 'successRate' ? 1 : 0)}
                {entry.dataKey === 'responseTime' && 'ms'}
                {entry.dataKey === 'successRate' && '%'}
              </p>
            ))}
          </div>
        </ChartTooltipContent>
      </ChartTooltip>
    )
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

  return (
    <div className="space-y-4">
      {/* Response Time Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Response Time</CardTitle>
              <CardDescription>Real-time response time measurements</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm ${connectionColor}`}>{connectionStatus}</span>
              {error && !isConnected && (
                <button
                  onClick={onReconnect}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  className="text-xs"
                />
                <YAxis className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="responseTime"
                  stroke={chartConfig.responseTime.color}
                  strokeWidth={2}
                  dot={false}
                  name="Response Time (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Requests Per Second Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Requests Per Second</CardTitle>
          <CardDescription>Current throughput over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  className="text-xs"
                />
                <YAxis className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="requestsPerSecond"
                  stroke={chartConfig.requestsPerSecond.color}
                  strokeWidth={2}
                  dot={false}
                  name="Requests/sec"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Combined Metrics Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Combined Metrics</CardTitle>
          <CardDescription>Success rate and active requests over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  className="text-xs"
                />
                <YAxis yAxisId="left" className="text-xs" />
                <YAxis yAxisId="right" orientation="right" className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="successRate"
                  stroke={chartConfig.successRate.color}
                  strokeWidth={2}
                  dot={false}
                  name="Success Rate (%)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="activeRequests"
                  stroke={chartConfig.activeRequests.color}
                  strokeWidth={2}
                  dot={false}
                  name="Active Requests"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600">Connection Error</p>
                <p className="text-xs text-red-500">{error}</p>
              </div>
              <button
                onClick={onReconnect}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Retry Connection
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}