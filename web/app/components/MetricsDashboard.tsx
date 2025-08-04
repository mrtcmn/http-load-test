import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PercentileMetrics } from './PercentileMetrics'
import { ErrorSummary } from './ErrorSummary'
import { RealtimeChart } from './RealtimeChart'

interface MetricsDashboardProps {
  isTestRunning?: boolean
  testResults?: TestResults
}

export interface TestResults {
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
  responseTimes: number[]
}

export function MetricsDashboard({ isTestRunning = false, testResults }: MetricsDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Load Test Dashboard</h1>
          <p className="text-muted-foreground">
            {isTestRunning ? 'Test in progress...' : 'Ready to start testing'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`h-3 w-3 rounded-full ${isTestRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium">
            {isTestRunning ? 'Running' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {testResults?.totalRequests?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {testResults?.successfulRequests || 0} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests/sec</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {testResults?.requestsPerSecond?.toFixed(1) || '0.0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Average throughput
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {testResults?.totalRequests 
                ? ((testResults.successfulRequests / testResults.totalRequests) * 100).toFixed(1)
                : '0.0'
              }%
            </div>
            <p className="text-xs text-muted-foreground">
              {testResults?.failedRequests || 0} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {testResults?.duration 
                ? `${(testResults.duration / 1000).toFixed(1)}s`
                : '0.0s'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Test duration
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Chart */}
      <RealtimeChart 
        maxHistoryPoints={100}
        updateInterval={1000}
        height={400}
      />

      {/* Detailed Metrics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PercentileMetrics percentiles={testResults?.percentiles} />
        <ErrorSummary 
          statusCodes={testResults?.statusCodes} 
          errors={testResults?.errors}
          totalRequests={testResults?.totalRequests || 0}
        />
      </div>
    </div>
  )
}