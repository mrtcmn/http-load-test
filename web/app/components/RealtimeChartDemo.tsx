import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RealtimeChart } from './RealtimeChart'
import { Play, Square, RotateCcw } from 'lucide-react'

export function RealtimeChartDemo() {
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationData, setSimulationData] = useState<any[]>([])

  // Simulate real-time data for demo purposes
  useEffect(() => {
    if (!isSimulating) return

    const interval = setInterval(() => {
      const timestamp = Date.now()
      const newData = {
        type: 'metrics',
        timestamp,
        data: {
          totalRequests: Math.floor(Math.random() * 1000) + 100,
          successfulRequests: Math.floor(Math.random() * 950) + 50,
          failedRequests: Math.floor(Math.random() * 50),
          requestsPerSecond: Math.random() * 50 + 10,
          avgResponseTime: Math.random() * 500 + 100,
          currentResponseTime: Math.random() * 800 + 50,
          errorRate: Math.random() * 10,
          activeConnections: Math.floor(Math.random() * 20) + 5
        }
      }

      setSimulationData(prev => [...prev, newData].slice(-100)) // Keep last 100 points
    }, 1000)

    return () => clearInterval(interval)
  }, [isSimulating])

  const startSimulation = () => {
    setIsSimulating(true)
  }

  const stopSimulation = () => {
    setIsSimulating(false)
  }

  const clearData = () => {
    setSimulationData([])
    setIsSimulating(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Real-time Chart Demo</CardTitle>
          <CardDescription>
            Interactive demonstration of the real-time metrics chart component
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button
              onClick={startSimulation}
              disabled={isSimulating}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Start Simulation
            </Button>
            <Button
              onClick={stopSimulation}
              disabled={!isSimulating}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button
              onClick={clearData}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Clear
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground mb-4">
            {isSimulating ? (
              <span className="text-green-600">● Simulating real-time data...</span>
            ) : (
              <span>Click "Start Simulation" to see the chart in action</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The actual RealtimeChart component */}
      <RealtimeChart 
        wsUrl="ws://localhost:8080/ws/metrics"
        maxHistoryPoints={50}
        updateInterval={500}
        height={350}
      />

      {/* Demo information */}
      <Card>
        <CardHeader>
          <CardTitle>Component Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2">Real-time Updates</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• WebSocket connection management</li>
                <li>• Automatic reconnection on disconnect</li>
                <li>• Throttled updates to prevent UI overload</li>
                <li>• Connection status indicators</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Chart Features</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Multiple metrics on dual Y-axes</li>
                <li>• Interactive tooltips and legends</li>
                <li>• Configurable history length</li>
                <li>• Reference lines for thresholds</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Error Handling</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Connection error display</li>
                <li>• Retry mechanisms</li>
                <li>• Graceful degradation</li>
                <li>• Clear error messages</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">User Controls</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Manual connect/disconnect</li>
                <li>• Clear history function</li>
                <li>• Configurable update intervals</li>
                <li>• Responsive design</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}