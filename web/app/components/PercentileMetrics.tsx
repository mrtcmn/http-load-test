import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface PercentileData {
  p50: number
  p95: number
  p99: number
  min: number
  max: number
  avg: number
}

interface PercentileMetricsProps {
  percentiles?: PercentileData
}

export function PercentileMetrics({ percentiles }: PercentileMetricsProps) {
  const formatTime = (timeMs: number) => {
    if (timeMs < 1000) {
      return `${timeMs.toFixed(0)}ms`
    } else if (timeMs < 60000) {
      return `${(timeMs / 1000).toFixed(2)}s`
    } else {
      return `${(timeMs / 60000).toFixed(2)}m`
    }
  }

  const percentileItems = [
    { label: 'P50 (Median)', value: percentiles?.p50 || 0, color: 'text-blue-600' },
    { label: 'P95', value: percentiles?.p95 || 0, color: 'text-orange-600' },
    { label: 'P99', value: percentiles?.p99 || 0, color: 'text-red-600' },
    { label: 'Average', value: percentiles?.avg || 0, color: 'text-green-600' },
    { label: 'Minimum', value: percentiles?.min || 0, color: 'text-gray-600' },
    { label: 'Maximum', value: percentiles?.max || 0, color: 'text-purple-600' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Time Percentiles</CardTitle>
        <CardDescription>
          Distribution of response times across all requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {percentileItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full bg-current ${item.color}`} />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <span className={`text-lg font-bold ${item.color}`}>
                {formatTime(item.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Visual representation */}
        <div className="mt-6 space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Response Time Range</div>
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-500"
              style={{ width: '100%' }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(percentiles?.min || 0)}</span>
            <span>{formatTime(percentiles?.max || 0)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}