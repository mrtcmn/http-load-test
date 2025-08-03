import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { TestResult } from './ExportControls'
import { History, TrendingUp, TrendingDown, Minus, Eye, Trash2 } from 'lucide-react'

interface TestHistoryProps {
  history: TestResult[]
  onCompare?: (results: TestResult[]) => void
  onDelete?: (id: string) => void
  onView?: (result: TestResult) => void
  className?: string
}

interface ComparisonData {
  metric: string
  current: number | string
  previous: number | string
  change: number | null
  changeType: 'increase' | 'decrease' | 'neutral'
  unit?: string
}

export function TestHistory({ 
  history, 
  onCompare, 
  onDelete, 
  onView,
  className 
}: TestHistoryProps) {
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [showComparison, setShowComparison] = useState(false)

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.timestamp - a.timestamp)
  }, [history])

  const handleSelectResult = (id: string) => {
    const newSelected = new Set(selectedResults)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else if (newSelected.size < 2) {
      newSelected.add(id)
    }
    setSelectedResults(newSelected)
  }

  const handleCompare = () => {
    if (selectedResults.size === 2 && onCompare) {
      const results = Array.from(selectedResults).map(id => 
        history.find(r => r.id === id)!
      )
      onCompare(results)
      setShowComparison(true)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (duration: number) => {
    return `${(duration / 1000).toFixed(1)}s`
  }

  const getSuccessRate = (result: TestResult) => {
    return ((result.metrics.successfulRequests / result.metrics.totalRequests) * 100).toFixed(1)
  }

  const generateComparison = (current: TestResult, previous: TestResult): ComparisonData[] => {
    const calculateChange = (curr: number, prev: number) => {
      if (prev === 0) return null
      return ((curr - prev) / prev) * 100
    }

    const getChangeType = (change: number | null): 'increase' | 'decrease' | 'neutral' => {
      if (change === null || Math.abs(change) < 0.1) return 'neutral'
      return change > 0 ? 'increase' : 'decrease'
    }

    return [
      {
        metric: 'Total Requests',
        current: current.metrics.totalRequests,
        previous: previous.metrics.totalRequests,
        change: calculateChange(current.metrics.totalRequests, previous.metrics.totalRequests),
        changeType: getChangeType(calculateChange(current.metrics.totalRequests, previous.metrics.totalRequests))
      },
      {
        metric: 'Success Rate',
        current: `${getSuccessRate(current)}%`,
        previous: `${getSuccessRate(previous)}%`,
        change: calculateChange(parseFloat(getSuccessRate(current)), parseFloat(getSuccessRate(previous))),
        changeType: getChangeType(calculateChange(parseFloat(getSuccessRate(current)), parseFloat(getSuccessRate(previous)))),
        unit: '%'
      },
      {
        metric: 'Requests/sec',
        current: current.metrics.requestsPerSecond.toFixed(1),
        previous: previous.metrics.requestsPerSecond.toFixed(1),
        change: calculateChange(current.metrics.requestsPerSecond, previous.metrics.requestsPerSecond),
        changeType: getChangeType(calculateChange(current.metrics.requestsPerSecond, previous.metrics.requestsPerSecond)),
        unit: 'req/s'
      },
      {
        metric: 'P95 Response Time',
        current: current.metrics.percentiles.p95,
        previous: previous.metrics.percentiles.p95,
        change: calculateChange(current.metrics.percentiles.p95, previous.metrics.percentiles.p95),
        changeType: getChangeType(calculateChange(current.metrics.percentiles.p95, previous.metrics.percentiles.p95)),
        unit: 'ms'
      },
      {
        metric: 'P99 Response Time',
        current: current.metrics.percentiles.p99,
        previous: previous.metrics.percentiles.p99,
        change: calculateChange(current.metrics.percentiles.p99, previous.metrics.percentiles.p99),
        changeType: getChangeType(calculateChange(current.metrics.percentiles.p99, previous.metrics.percentiles.p99)),
        unit: 'ms'
      }
    ]
  }

  const renderChangeIcon = (changeType: 'increase' | 'decrease' | 'neutral') => {
    switch (changeType) {
      case 'increase':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'decrease':
        return <TrendingDown className="h-4 w-4 text-red-500" />
      default:
        return <Minus className="h-4 w-4 text-gray-500" />
    }
  }

  if (history.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Test History
          </CardTitle>
          <CardDescription>
            No previous test results available
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Test History
          </CardTitle>
          <CardDescription>
            View and compare previous test results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Comparison Controls */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedResults.size > 0 && (
                  <span>{selectedResults.size} result{selectedResults.size > 1 ? 's' : ''} selected</span>
                )}
              </div>
              <div className="flex gap-2">
                {selectedResults.size === 2 && (
                  <Button onClick={handleCompare} size="sm">
                    Compare Results
                  </Button>
                )}
                {selectedResults.size > 0 && (
                  <Button 
                    onClick={() => setSelectedResults(new Set())} 
                    variant="outline" 
                    size="sm"
                  >
                    Clear Selection
                  </Button>
                )}
              </div>
            </div>

            {/* History List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sortedHistory.map((result) => (
                <div
                  key={result.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedResults.has(result.id) 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => handleSelectResult(result.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{result.config.url}</span>
                        <span className="text-xs text-muted-foreground">
                          {result.config.method}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTimestamp(result.timestamp)}
                      </div>
                      <div className="grid grid-cols-4 gap-4 mt-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Requests:</span>{' '}
                          {result.metrics.totalRequests.toLocaleString()}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Success:</span>{' '}
                          {getSuccessRate(result)}%
                        </div>
                        <div>
                          <span className="text-muted-foreground">RPS:</span>{' '}
                          {result.metrics.requestsPerSecond.toFixed(1)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>{' '}
                          {formatDuration(result.metrics.duration)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {onView && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            onView(result)
                          }}
                          variant="ghost"
                          size="sm"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(result.id)
                          }}
                          variant="ghost"
                          size="sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison View */}
      {showComparison && selectedResults.size === 2 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Test Comparison</CardTitle>
            <CardDescription>
              Comparing selected test results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const [id1, id2] = Array.from(selectedResults)
              const result1 = history.find(r => r.id === id1)!
              const result2 = history.find(r => r.id === id2)!
              const [newer, older] = result1.timestamp > result2.timestamp ? [result1, result2] : [result2, result1]
              const comparison = generateComparison(newer, older)

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Newer Test</div>
                      <div className="text-muted-foreground">{formatTimestamp(newer.timestamp)}</div>
                    </div>
                    <div>
                      <div className="font-medium">Older Test</div>
                      <div className="text-muted-foreground">{formatTimestamp(older.timestamp)}</div>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3">Metric</th>
                          <th className="text-right p-3">Newer</th>
                          <th className="text-right p-3">Older</th>
                          <th className="text-center p-3">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3 font-medium">{item.metric}</td>
                            <td className="p-3 text-right">{item.current}{item.unit && ` ${item.unit}`}</td>
                            <td className="p-3 text-right">{item.previous}{item.unit && ` ${item.unit}`}</td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {renderChangeIcon(item.changeType)}
                                {item.change !== null && (
                                  <span className={`text-xs ${
                                    item.changeType === 'increase' ? 'text-green-600' :
                                    item.changeType === 'decrease' ? 'text-red-600' :
                                    'text-gray-600'
                                  }`}>
                                    {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Button 
                    onClick={() => setShowComparison(false)} 
                    variant="outline" 
                    size="sm"
                  >
                    Close Comparison
                  </Button>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}