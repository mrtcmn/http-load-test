import { useState, useCallback, useRef } from 'react'
import { useWebSocket, WebSocketMessage, ConnectionHealth } from './useWebSocket'
import { LoadTestFrontendError, globalErrorHandler } from '../utils/errorHandling'

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
  error: LoadTestFrontendError | null
  connectionHealth: ConnectionHealth
  reconnect: () => void
  clearData: () => void
  getMetricsHealth: () => MetricsHealth
}

export interface MetricsHealth {
  isReceivingData: boolean
  lastDataReceived: number | null
  dataPointsCount: number
  averageUpdateInterval: number | null
  missedUpdates: number
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
  const lastDataReceivedRef = useRef<number | null>(null)
  const updateIntervalsRef = useRef<number[]>([])
  const missedUpdatesRef = useRef(0)
  const expectedUpdateInterval = 1000 // Expected update every 1 second

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    try {
      if (message.type === 'metrics_update' || message.type === 'metrics') {
        const data = message.data
        const now = Date.now()

        // Track update intervals for health monitoring
        if (lastDataReceivedRef.current) {
          const interval = now - lastDataReceivedRef.current
          updateIntervalsRef.current.push(interval)
          
          // Keep only recent intervals for average calculation
          if (updateIntervalsRef.current.length > 10) {
            updateIntervalsRef.current.shift()
          }

          // Check for missed updates
          if (interval > expectedUpdateInterval * 2) {
            missedUpdatesRef.current++
          }
        }

        lastDataReceivedRef.current = now

        // Validate data structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid metrics data structure')
        }

        // Create new data point with validation
        const newDataPoint: RealtimeDataPoint = {
          timestamp: message.timestamp || now,
          responseTime: Math.max(0, Number(data.averageResponseTime) || 0),
          requestsPerSecond: Math.max(0, Number(data.currentRps) || 0),
          successRate: Math.min(100, Math.max(0, Number(data.successRate) || 100)),
          activeRequests: Math.max(0, Number(data.activeRequests) || 0),
        }

        // Validate data point values
        if (isNaN(newDataPoint.responseTime) || isNaN(newDataPoint.requestsPerSecond)) {
          throw new Error('Invalid numeric values in metrics data')
        }

        // Update data points array
        dataPointsRef.current = [...dataPointsRef.current, newDataPoint]

        // Keep only the most recent data points
        if (dataPointsRef.current.length > maxDataPoints) {
          dataPointsRef.current = dataPointsRef.current.slice(-maxDataPoints)
        }

        // Update metrics state with validation
        setMetrics({
          currentRps: Math.max(0, Number(data.currentRps) || 0),
          currentSuccessRate: Math.min(100, Math.max(0, Number(data.successRate) || 100)),
          activeRequests: Math.max(0, Number(data.activeRequests) || 0),
          totalRequests: Math.max(0, Number(data.totalRequests) || 0),
          dataPoints: [...dataPointsRef.current],
          percentiles: {
            p50: Math.max(0, Number(data.percentiles?.p50) || 0),
            p95: Math.max(0, Number(data.percentiles?.p95) || 0),
            p99: Math.max(0, Number(data.percentiles?.p99) || 0),
          },
        })
      } else if (message.type === 'error') {
        // Handle server-side errors
        const serverError = globalErrorHandler.createDataError(
          'SERVER_ERROR',
          message.data?.message || 'Server reported an error',
          { serverError: message.data }
        )
        globalErrorHandler.handleError(serverError)
      }
    } catch (error) {
      const parseError = globalErrorHandler.createDataError(
        'METRICS_PARSE_ERROR',
        'Failed to process metrics data',
        { 
          message, 
          error: error instanceof Error ? error.message : String(error)
        }
      )
      globalErrorHandler.handleError(parseError)
    }
  }, [maxDataPoints])

  const handleConnect = useCallback(() => {
    console.log('WebSocket connected for real-time metrics')
    // Reset health tracking on reconnect
    lastDataReceivedRef.current = null
    updateIntervalsRef.current = []
    missedUpdatesRef.current = 0
  }, [])

  const handleDisconnect = useCallback(() => {
    console.log('WebSocket disconnected for real-time metrics')
  }, [])

  const handleError = useCallback((error: LoadTestFrontendError) => {
    console.error('WebSocket error for real-time metrics:', error.toJSON())
  }, [])

  const clearData = useCallback(() => {
    dataPointsRef.current = []
    lastDataReceivedRef.current = null
    updateIntervalsRef.current = []
    missedUpdatesRef.current = 0
    setMetrics(initialMetrics)
  }, [])

  const getMetricsHealth = useCallback((): MetricsHealth => {
    const averageInterval = updateIntervalsRef.current.length > 0
      ? updateIntervalsRef.current.reduce((sum, interval) => sum + interval, 0) / updateIntervalsRef.current.length
      : null

    const isReceivingData = lastDataReceivedRef.current 
      ? (Date.now() - lastDataReceivedRef.current) < (expectedUpdateInterval * 3)
      : false

    return {
      isReceivingData,
      lastDataReceived: lastDataReceivedRef.current,
      dataPointsCount: dataPointsRef.current.length,
      averageUpdateInterval: averageInterval,
      missedUpdates: missedUpdatesRef.current
    }
  }, [])

  const { 
    isConnected, 
    isConnecting, 
    error, 
    reconnect, 
    getConnectionHealth 
  } = useWebSocket({
    url: websocketUrl,
    onMessage: handleWebSocketMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10, // Increased for metrics
    heartbeatInterval: 30000,
    connectionTimeout: 15000,
  })

  return {
    metrics,
    isConnected,
    isConnecting,
    error,
    connectionHealth: getConnectionHealth(),
    reconnect,
    clearData,
    getMetricsHealth,
  }
}