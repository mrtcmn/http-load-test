import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface PercentileMetricsProps {
  percentiles?: {
    p50: number
    p95: number
    p99: number
    min: number
    max: number
    avg: number
  }
}

export function PercentileMetrics({ percentiles }: PercentileMetricsProps) {
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const chartData = percentiles ? [
    { name: 'Min', value: percentiles.min, label: 'Minimum' },
    { name: 'P50', value: percentiles.p50, label: '50th Percentile' },
    { name: 'Avg', value: percentiles.avg, label: 'Average' },
    { name: 'P95', value: percentiles.p95, label: '95th Percentile' },
    { name: 'P99', value: percentiles.p99, label: '99th Percentile' },
    { name: 'Max', value: percentiles.max, label: 'Maximum' },
  ] : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Time Percentiles</CardTitle>
        <CardDescription>
          Distribution of response times across all requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        {percentiles ? (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {formatTime(percentiles.p50)}
                </div>
                <div className="text-sm text-muted-foreground">P50 (Median)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {formatTime(percentiles.p95)}
                </div>
                <div className="text-sm text-muted-foreground">P95</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {formatTime(percentiles.p99)}
                </div>
                <div className="text-sm text-muted-foreground">P99</div>
              </div>
            </div>

            {/* Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={formatTime} />
                  <Tooltip 
                    formatter={(value: number) => [formatTime(value), 'Response Time']}
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.name === label)
                      return item?.label || label
                    }}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Minimum:</span>
                <span className="text-sm font-medium">{formatTime(percentiles.min)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Maximum:</span>
                <span className="text-sm font-medium">{formatTime(percentiles.max)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Average:</span>
                <span className="text-sm font-medium">{formatTime(percentiles.avg)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Range:</span>
                <span className="text-sm font-medium">
                  {formatTime(percentiles.max - percentiles.min)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <div className="text-lg font-medium">No data available</div>
              <div className="text-sm">Start a test to see percentile metrics</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}