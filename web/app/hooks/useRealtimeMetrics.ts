import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebSocket, WebSocketMessage } from './useWebSocket'

export interface RealtimeMetrics {
  timestamp: number
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  requestsPerSecond: number
  avgResponseTime: number
  currentResponseTime: number
  errorRate: number
  activeConnections: number
}

export interface MetricsHistory {
  timestamps: number[]
  responseTimes: number[]
  requestsPerSecond: number[]
  errorRates: number[]
  activeConnections: number[]
}

export interface UseRealtimeMetricsOptions {
  wsUrl?: string
  maxHistoryPoints?: number
  updateInterval?: number
}

export interface UseRealtimeMetricsReturn {
  currentMetrics: RealtimeMetrics | null
  metricsHistory: MetricsHistory
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
  clearHistory: () => void
  connectionAttempts: number
}

const DEFAULT_WS_URL = 'ws://localhost:8080/ws/metrics'
const DEFAULT_MAX_HISTORY = 100
const DEFAULT_UPDATE_INTERVAL = 1000

export function useRealtimeMetrics(options: UseRealtimeMetricsOptions = {}): UseRealtimeMetricsReturn {
  const {
    wsUrl = DEFAULT_WS_URL,
    maxHistoryPoints = DEFAULT_MAX_HISTORY,
    updateInterval = DEFAULT_UPDATE_INTERVAL
  } = options

  const [currentMetrics, setCurrentMetrics] = useState<RealtimeMetrics | null>(null)
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory>({
    timestamps: [],
    responseTimes: [],
    requestsPerSecond: [],
    errorRates: [],
    activeConnections: []
  })

  const lastUpdateRef = useRef<number>(0)

  const handleMessage = useCallback((message: WebSocketMessage) => {
    const now = Date.now()
    
    // Throttle updates to prevent overwhelming the UI
    if (now - lastUpdateRef.current < updateInterval) {
      return
    }
    lastUpdateRef.current = now

    if (message.type === 'metrics') {
      const metrics: RealtimeMetrics = {
        timestamp: message.timestamp || now,
        totalRequests: message.data.totalRequests || 0,
        successfulRequests: message.data.successfulRequests || 0,
        failedRequests: message.data.failedRequests || 0,
        requestsPerSecond: message.data.requestsPerSecond || 0,
        avgResponseTime: message.data.avgResponseTime || 0,
        currentResponseTime: message.data.currentResponseTime || 0,
        errorRate: message.data.errorRate || 0,
        activeConnections: message.data.activeConnections || 0
      }

      setCurrentMetrics(metrics)

      // Update history
      setMetricsHistory(prev => {
        const newHistory = {
          timestamps: [...prev.timestamps, metrics.timestamp],
          responseTimes: [...prev.responseTimes, metrics.avgResponseTime],
          requestsPerSecond: [...prev.requestsPerSecond, metrics.requestsPerSecond],
          errorRates: [...prev.errorRates, metrics.errorRate],
          activeConnections: [...prev.activeConnections, metrics.activeConnections]
        }

        // Trim history to max points
        if (newHistory.timestamps.length > maxHistoryPoints) {
          const excess = newHistory.timestamps.length - maxHistoryPoints
          newHistory.timestamps = newHistory.timestamps.slice(excess)
          newHistory.responseTimes = newHistory.responseTimes.slice(excess)
          newHistory.requestsPerSecond = newHistory.requestsPerSecond.slice(excess)
          newHistory.errorRates = newHistory.errorRates.slice(excess)
          newHistory.activeConnections = newHistory.activeConnections.slice(excess)
        }

        return newHistory
      })
    }
  }, [updateInterval, maxHistoryPoints])

  const clearHistory = useCallback(() => {
    setMetricsHistory({
      timestamps: [],
      responseTimes: [],
      requestsPerSecond: [],
      errorRates: [],
      activeConnections: []
    })
  }, [])

  const {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    connectionAttempts
  } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onConnect: () => {
      console.log('Connected to metrics WebSocket')
    },
    onDisconnect: () => {
      console.log('Disconnected from metrics WebSocket')
    },
    onError: (error) => {
      console.error('WebSocket error:', error)
    },
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    autoConnect: true
  })

  // Clear current metrics when disconnected
  useEffect(() => {
    if (!isConnected) {
      setCurrentMetrics(null)
    }
  }, [isConnected])

  return {
    currentMetrics,
    metricsHistory,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    clearHistory,
    connectionAttempts
  }
}