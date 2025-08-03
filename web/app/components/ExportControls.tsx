import React, { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Download, FileText, Database, Calendar } from 'lucide-react'

export interface TestResult {
  id: string
  timestamp: number
  config: {
    url: string
    method: string
    totalRequests: number
    requestsPerSecond: number
    concurrentRequests: number
  }
  metrics: {
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
}

interface ExportControlsProps {
  currentResult?: TestResult
  onExport?: (format: 'json' | 'csv', data: TestResult) => void
  className?: string
}

export function ExportControls({ 
  currentResult, 
  onExport,
  className 
}: ExportControlsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (format: 'json' | 'csv') => {
    if (!currentResult || !onExport) return

    setIsExporting(true)
    try {
      await onExport(format, currentResult)
    } catch (error) {
      console.error(`Failed to export ${format.toUpperCase()}:`, error)
    } finally {
      setIsExporting(false)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (duration: number) => {
    return `${(duration / 1000).toFixed(1)}s`
  }

  if (!currentResult) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Results
          </CardTitle>
          <CardDescription>
            No test results available to export
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Results
        </CardTitle>
        <CardDescription>
          Export test results in JSON or CSV format
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Summary */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {formatTimestamp(currentResult.timestamp)}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">URL:</span> {currentResult.config.url}
            </div>
            <div>
              <span className="font-medium">Method:</span> {currentResult.config.method}
            </div>
            <div>
              <span className="font-medium">Total Requests:</span> {currentResult.metrics.totalRequests.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Duration:</span> {formatDuration(currentResult.metrics.duration)}
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => handleExport('json')}
            disabled={isExporting}
            variant="outline"
            className="flex-1"
          >
            <FileText className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <Button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            variant="outline"
            className="flex-1"
          >
            <Database className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {isExporting && (
          <div className="text-sm text-muted-foreground text-center">
            Preparing export...
          </div>
        )}
      </CardContent>
    </Card>
  )
}