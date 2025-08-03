import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { PercentileMetrics } from './PercentileMetrics'
import { ErrorSummary } from './ErrorSummary'

interface MetricsSummary {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  duration: number
  requestsPerSecond: number
  percentiles: {
    p50: number
    p95: number
    p99: number
    min: number
    max: number
    avg: number
  }
  statusCodes: Record<number, number>
  errors: Record<string, number>
  responseTimes: {
    histogram: Array<{ bucket: string; count: number }>
  }
}

interface MetricsDashboardProps {
  metrics?: MetricsSummary
  isRunning?: boolean
}

export function MetricsDashboard({ metrics, isRunning = false }: MetricsDashboardProps) {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">HTTP Load Test Dashboard</h1>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm text-muted-foreground">
            {isRunning ? 'Test Running' : 'Test Idle'}
          </span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalRequests?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {metrics?.totalRequests 
                ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)
                : 0}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requests/sec</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.requestsPerSecond?.toFixed(1) || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.duration ? `${(metrics.duration / 1000).toFixed(1)}s` : '0s'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PercentileMetrics percentiles={metrics?.percentiles} />
        <ErrorSummary 
          statusCodes={metrics?.statusCodes} 
          errors={metrics?.errors}
          totalRequests={metrics?.totalRequests || 0}
        />
      </div>
    </div>
  )
}