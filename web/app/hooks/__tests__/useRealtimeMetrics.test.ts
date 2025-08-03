import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRealtimeMetrics } from '../useRealtimeMetrics'

// Mock the useWebSocket hook
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn(),
}))

import { useWebSocket } from '../useWebSocket'

const mockUseWebSocket = useWebSocket as any

describe('useRealtimeMetrics', () => {
  const mockWebSocketUrl = 'ws://localhost:8080/metrics'
  
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWebSocket.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      error: null,
      sendMessage: vi.fn(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
    })
  })

  it('should initialize with default metrics', () => {
    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
      })
    )

    expect(result.current.metrics).toEqual({
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
    })
  })

  it('should configure WebSocket with correct parameters', () => {
    renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
        maxDataPoints: 50,
      })
    )

    expect(mockUseWebSocket).toHaveBeenCalledWith({
      url: mockWebSocketUrl,
      onMessage: expect.any(Function),
      onConnect: expect.any(Function),
      onDisconnect: expect.any(Function),
      onError: expect.any(Function),
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    })
  })

  it('should process metrics update messages', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation(({ onMessage }: any) => {
      onMessageCallback = onMessage
      return {
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: vi.fn(),
        reconnect: vi.fn(),
        disconnect: vi.fn(),
      }
    })

    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
      })
    )

    const mockMessage = {
      type: 'metrics_update',
      timestamp: 1234567890,
      data: {
        currentRps: 150,
        successRate: 95.5,
        activeRequests: 10,
        totalRequests: 1000,
        averageResponseTime: 250,
        percentiles: {
          p50: 200,
          p95: 400,
          p99: 600,
        },
      },
    }

    act(() => {
      onMessageCallback(mockMessage)
    })

    expect(result.current.metrics.currentRps).toBe(150)
    expect(result.current.metrics.currentSuccessRate).toBe(95.5)
    expect(result.current.metrics.activeRequests).toBe(10)
    expect(result.current.metrics.totalRequests).toBe(1000)
    expect(result.current.metrics.percentiles.p50).toBe(200)
    expect(result.current.metrics.percentiles.p95).toBe(400)
    expect(result.current.metrics.percentiles.p99).toBe(600)

    expect(result.current.metrics.dataPoints).toHaveLength(1)
    expect(result.current.metrics.dataPoints[0]).toEqual({
      timestamp: 1234567890,
      responseTime: 250,
      requestsPerSecond: 150,
      successRate: 95.5,
      activeRequests: 10,
    })
  })

  it('should ignore non-metrics messages', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation(({ onMessage }: any) => {
      onMessageCallback = onMessage
      return {
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: vi.fn(),
        reconnect: vi.fn(),
        disconnect: vi.fn(),
      }
    })

    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
      })
    )

    const mockMessage = {
      type: 'other_message',
      timestamp: 1234567890,
      data: { someData: 'value' },
    }

    act(() => {
      onMessageCallback(mockMessage)
    })

    // Metrics should remain unchanged
    expect(result.current.metrics.currentRps).toBe(0)
    expect(result.current.metrics.dataPoints).toHaveLength(0)
  })

  it('should limit data points to maxDataPoints', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation(({ onMessage }: any) => {
      onMessageCallback = onMessage
      return {
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: vi.fn(),
        reconnect: vi.fn(),
        disconnect: vi.fn(),
      }
    })

    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
        maxDataPoints: 3,
      })
    )

    // Add 5 data points
    for (let i = 0; i < 5; i++) {
      const mockMessage = {
        type: 'metrics_update',
        timestamp: 1234567890 + i * 1000,
        data: {
          currentRps: 100 + i,
          successRate: 95,
          activeRequests: 5,
          totalRequests: 100 * (i + 1),
          averageResponseTime: 200,
        },
      }

      act(() => {
        onMessageCallback(mockMessage)
      })
    }

    // Should only keep the last 3 data points
    expect(result.current.metrics.dataPoints).toHaveLength(3)
    expect(result.current.metrics.dataPoints[0].requestsPerSecond).toBe(102)
    expect(result.current.metrics.dataPoints[1].requestsPerSecond).toBe(103)
    expect(result.current.metrics.dataPoints[2].requestsPerSecond).toBe(104)
  })

  it('should handle missing data fields gracefully', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation(({ onMessage }: any) => {
      onMessageCallback = onMessage
      return {
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: vi.fn(),
        reconnect: vi.fn(),
        disconnect: vi.fn(),
      }
    })

    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
      })
    )

    const mockMessage = {
      type: 'metrics_update',
      timestamp: 1234567890,
      data: {
        // Missing most fields
        currentRps: 100,
      },
    }

    act(() => {
      onMessageCallback(mockMessage)
    })

    expect(result.current.metrics.currentRps).toBe(100)
    expect(result.current.metrics.currentSuccessRate).toBe(100) // Default
    expect(result.current.metrics.activeRequests).toBe(0) // Default
    expect(result.current.metrics.totalRequests).toBe(0) // Default
    expect(result.current.metrics.percentiles.p50).toBe(0) // Default

    expect(result.current.metrics.dataPoints[0]).toEqual({
      timestamp: 1234567890,
      responseTime: 0,
      requestsPerSecond: 100,
      successRate: 100,
      activeRequests: 0,
    })
  })

  it('should clear data when clearData is called', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation(({ onMessage }: any) => {
      onMessageCallback = onMessage
      return {
        isConnected: true,
        isConnecting: false,
        error: null,
        sendMessage: vi.fn(),
        reconnect: vi.fn(),
        disconnect: vi.fn(),
      }
    })

    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
      })
    )

    // Add some data
    const mockMessage = {
      type: 'metrics_update',
      timestamp: 1234567890,
      data: {
        currentRps: 150,
        successRate: 95,
        activeRequests: 10,
        totalRequests: 1000,
        averageResponseTime: 250,
      },
    }

    act(() => {
      onMessageCallback(mockMessage)
    })

    expect(result.current.metrics.dataPoints).toHaveLength(1)
    expect(result.current.metrics.currentRps).toBe(150)

    // Clear data
    act(() => {
      result.current.clearData()
    })

    expect(result.current.metrics.dataPoints).toHaveLength(0)
    expect(result.current.metrics.currentRps).toBe(0)
    expect(result.current.metrics.currentSuccessRate).toBe(100)
  })

  it('should expose WebSocket connection state', () => {
    mockUseWebSocket.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      error: 'Connection failed',
      sendMessage: vi.fn(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
    })

    const { result } = renderHook(() =>
      useRealtimeMetrics({
        websocketUrl: mockWebSocketUrl,
      })
    )

    expect(result.current.isConnected).toBe(true)
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.error).toBe('Connection failed')
    expect(typeof result.current.reconnect).toBe('function')
  })
})