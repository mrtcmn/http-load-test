import { useState, useCallback, useRef } from 'react'
import { useWebSocket, WebSocketMessage } from './useWebSocket'

export interface RealtimeDataPoint {
  timestamp: number
  responseTime: number
  requestsPerSecond: number
  successRate: number
  activeRequests: number
}

export interface RealtimeMetrics {
  currentRps: number
  currentSuccessRate: number
  activeRequests: number
  totalRequests: number
  dataPoints: RealtimeDataPoint[]
  percentiles: {
    p50: number
    p95: number
    p99: number
  }
}

export interface UseRealtimeMetricsOptions {
  websocketUrl: string
  maxDataPoints?: number
}

export interface UseRealtimeMetricsReturn {
  metrics: RealtimeMetrics
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  reconnect: () => void
  clearData: () => void
}

const initialMetrics: RealtimeMetrics = {
  currentRps: 0,
  currentSuccessRate: 100,
  activeRequests: 0,
  totalRequests: 0,
  dataPoints: [],
  percentiles: {
    p50: 0,
    p95: 0,
    p99: 0,
  },
}

export function useRealtimeMetrics({
  websocketUrl,
  maxDataPoints = 100,
}: UseRealtimeMetricsOptions): UseRealtimeMetricsReturn {
  const [metrics, setMetrics] = useState<RealtimeMetrics>(initialMetrics)
  const dataPointsRef = useRef<RealtimeDataPoint[]>([])

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'metrics_update') {
      const data = message.data

      // Create new data point
      const newDataPoint: RealtimeDataPoint = {
        timestamp: message.timestamp,
        responseTime: data.averageResponseTime || 0,
        requestsPerSecond: data.currentRps || 0,
        successRate: data.successRate || 100,
        activeRequests: data.activeRequests || 0,
      }

      // Update data points array
      dataPointsRef.current = [...dataPointsRef.current, newDataPoint]

      // Keep only the most recent data points
      if (dataPointsRef.current.length > maxDataPoints) {
        dataPointsRef.current = dataPointsRef.current.slice(-maxDataPoints)
      }

      // Update metrics state
      setMetrics({
        currentRps: data.currentRps || 0,
        currentSuccessRate: data.successRate || 100,
        activeRequests: data.activeRequests || 0,
        totalRequests: data.totalRequests || 0,
        dataPoints: [...dataPointsRef.current],
        percentiles: {
          p50: data.percentiles?.p50 || 0,
          p95: data.percentiles?.p95 || 0,
          p99: data.percentiles?.p99 || 0,
        },
      })
    }
  }, [maxDataPoints])

  const handleConnect = useCallback(() => {
    console.log('WebSocket connected for real-time metrics')
  }, [])

  const handleDisconnect = useCallback(() => {
    console.log('WebSocket disconnected for real-time metrics')
  }, [])

  const handleError = useCallback((error: Event) => {
    console.error('WebSocket error for real-time metrics:', error)
  }, [])

  const clearData = useCallback(() => {
    dataPointsRef.current = []
    setMetrics(initialMetrics)
  }, [])

  const { isConnected, isConnecting, error, reconnect } = useWebSocket({
    url: websocketUrl,
    onMessage: handleWebSocketMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  })

  return {
    metrics,
    isConnected,
    isConnecting,
    error,
    reconnect,
    clearData,
  }
}