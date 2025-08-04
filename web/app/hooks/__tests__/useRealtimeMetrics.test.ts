import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRealtimeMetrics } from '../useRealtimeMetrics'

// Mock the useWebSocket hook
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn()
}))

import { useWebSocket } from '../useWebSocket'

const mockUseWebSocket = useWebSocket as any

describe('useRealtimeMetrics', () => {
  const mockWebSocketReturn = {
    isConnected: false,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    lastMessage: null,
    connectionAttempts: 0
  }

  beforeEach(() => {
    vi.clearAllTimers()
    vi.useFakeTimers()
    mockUseWebSocket.mockReturnValue(mockWebSocketReturn)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useRealtimeMetrics())

    expect(result.current.currentMetrics).toBe(null)
    expect(result.current.metricsHistory).toEqual({
      timestamps: [],
      responseTimes: [],
      requestsPerSecond: [],
      errorRates: [],
      activeConnections: []
    })
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('should process metrics messages correctly', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturn
    })

    const { result } = renderHook(() => useRealtimeMetrics())

    const testMessage = {
      type: 'metrics',
      timestamp: 1000,
      data: {
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        requestsPerSecond: 10.5,
        avgResponseTime: 250,
        currentResponseTime: 300,
        errorRate: 5.0,
        activeConnections: 8
      }
    }

    act(() => {
      onMessageCallback(testMessage)
    })

    expect(result.current.currentMetrics).toEqual({
      timestamp: 1000,
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      requestsPerSecond: 10.5,
      avgResponseTime: 250,
      currentResponseTime: 300,
      errorRate: 5.0,
      activeConnections: 8
    })

    expect(result.current.metricsHistory.timestamps).toEqual([1000])
    expect(result.current.metricsHistory.responseTimes).toEqual([250])
    expect(result.current.metricsHistory.requestsPerSecond).toEqual([10.5])
    expect(result.current.metricsHistory.errorRates).toEqual([5.0])
    expect(result.current.metricsHistory.activeConnections).toEqual([8])
  })

  it('should ignore non-metrics messages', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturn
    })

    const { result } = renderHook(() => useRealtimeMetrics())

    const testMessage = {
      type: 'other',
      timestamp: 1000,
      data: { someData: 'value' }
    }

    act(() => {
      onMessageCallback(testMessage)
    })

    expect(result.current.currentMetrics).toBe(null)
    expect(result.current.metricsHistory.timestamps).toEqual([])
  })

  it('should limit history to maxHistoryPoints', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturn
    })

    const { result } = renderHook(() => 
      useRealtimeMetrics({ maxHistoryPoints: 3 })
    )

    // Add 5 data points
    for (let i = 1; i <= 5; i++) {
      const testMessage = {
        type: 'metrics',
        timestamp: i * 1000,
        data: {
          totalRequests: i * 10,
          avgResponseTime: i * 100,
          requestsPerSecond: i * 2,
          errorRate: i,
          activeConnections: i
        }
      }

      act(() => {
        onMessageCallback(testMessage)
      })
    }

    // Should only keep the last 3 points
    expect(result.current.metricsHistory.timestamps).toEqual([3000, 4000, 5000])
    expect(result.current.metricsHistory.responseTimes).toEqual([300, 400, 500])
    expect(result.current.metricsHistory.requestsPerSecond).toEqual([6, 8, 10])
    expect(result.current.metricsHistory.errorRates).toEqual([3, 4, 5])
    expect(result.current.metricsHistory.activeConnections).toEqual([3, 4, 5])
  })

  it('should throttle updates based on updateInterval', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturn
    })

    const { result } = renderHook(() => 
      useRealtimeMetrics({ updateInterval: 1000 })
    )

    const testMessage1 = {
      type: 'metrics',
      timestamp: 1000,
      data: { totalRequests: 10, avgResponseTime: 100 }
    }

    const testMessage2 = {
      type: 'metrics',
      timestamp: 1500,
      data: { totalRequests: 20, avgResponseTime: 200 }
    }

    // First message should be processed
    act(() => {
      onMessageCallback(testMessage1)
    })

    expect(result.current.currentMetrics?.totalRequests).toBe(10)

    // Second message should be throttled (within 1000ms)
    act(() => {
      onMessageCallback(testMessage2)
    })

    expect(result.current.currentMetrics?.totalRequests).toBe(10) // Still the first value

    // Advance time and try again
    act(() => {
      vi.advanceTimersByTime(1000)
      onMessageCallback(testMessage2)
    })

    expect(result.current.currentMetrics?.totalRequests).toBe(20) // Now updated
  })

  it('should clear history when clearHistory is called', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturn
    })

    const { result } = renderHook(() => useRealtimeMetrics())

    // Add some data
    const testMessage = {
      type: 'metrics',
      timestamp: 1000,
      data: { totalRequests: 10, avgResponseTime: 100 }
    }

    act(() => {
      onMessageCallback(testMessage)
    })

    expect(result.current.metricsHistory.timestamps).toEqual([1000])

    // Clear history
    act(() => {
      result.current.clearHistory()
    })

    expect(result.current.metricsHistory).toEqual({
      timestamps: [],
      responseTimes: [],
      requestsPerSecond: [],
      errorRates: [],
      activeConnections: []
    })
  })

  it('should clear current metrics when disconnected', () => {
    let onMessageCallback: any

    const mockWebSocketReturnConnected = {
      ...mockWebSocketReturn,
      isConnected: true
    }

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturnConnected
    })

    const { result, rerender } = renderHook(() => useRealtimeMetrics())

    // Add some data
    const testMessage = {
      type: 'metrics',
      timestamp: 1000,
      data: { totalRequests: 10, avgResponseTime: 100 }
    }

    act(() => {
      onMessageCallback(testMessage)
    })

    expect(result.current.currentMetrics).not.toBe(null)

    // Simulate disconnection
    mockUseWebSocket.mockReturnValue({
      ...mockWebSocketReturn,
      isConnected: false
    })

    rerender()

    expect(result.current.currentMetrics).toBe(null)
  })

  it('should handle missing data fields gracefully', () => {
    let onMessageCallback: any

    mockUseWebSocket.mockImplementation((options: any) => {
      onMessageCallback = options.onMessage
      return mockWebSocketReturn
    })

    const { result } = renderHook(() => useRealtimeMetrics())

    const testMessage = {
      type: 'metrics',
      timestamp: 1000,
      data: {
        totalRequests: 100
        // Missing other fields
      }
    }

    act(() => {
      onMessageCallback(testMessage)
    })

    expect(result.current.currentMetrics).toEqual({
      timestamp: 1000,
      totalRequests: 100,
      successfulRequests: 0,
      failedRequests: 0,
      requestsPerSecond: 0,
      avgResponseTime: 0,
      currentResponseTime: 0,
      errorRate: 0,
      activeConnections: 0
    })
  })
})