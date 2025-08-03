import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../useWebSocket'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 10)
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  // Helper methods for testing
  simulateMessage(data: any) {
    if (this.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(data),
      })
      this.onmessage(event)
    }
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }
}

// Mock global WebSocket
const originalWebSocket = global.WebSocket
beforeEach(() => {
  global.WebSocket = MockWebSocket as any
  vi.useFakeTimers()
})

afterEach(() => {
  global.WebSocket = originalWebSocket
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useWebSocket', () => {
  const mockUrl = 'ws://localhost:8080/test'
  const mockMessage = { type: 'test', data: { value: 123 }, timestamp: Date.now() }

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
      })
    )

    expect(result.current.isConnected).toBe(false)
    expect(result.current.isConnecting).toBe(true)
    expect(result.current.error).toBe(null)
  })

  it('should connect successfully', async () => {
    const onConnect = vi.fn()
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        onConnect,
      })
    )

    expect(result.current.isConnecting).toBe(true)

    // Fast-forward timers to simulate connection
    act(() => {
      vi.advanceTimersByTime(20)
    })

    expect(result.current.isConnected).toBe(true)
    expect(result.current.isConnecting).toBe(false)
    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  it('should handle incoming messages', async () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        onMessage,
      })
    )

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(20)
    })

    // Simulate receiving a message
    const mockWs = (global.WebSocket as any).mock.instances[0]
    act(() => {
      mockWs.simulateMessage(mockMessage)
    })

    expect(onMessage).toHaveBeenCalledWith(mockMessage)
  })

  it('should send messages when connected', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
      })
    )

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(20)
    })

    const mockWs = (global.WebSocket as any).mock.instances[0]
    const sendSpy = vi.spyOn(mockWs, 'send')

    act(() => {
      result.current.sendMessage({ test: 'data' })
    })

    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ test: 'data' }))
  })

  it('should not send messages when not connected', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
      })
    )

    // Try to send before connection
    act(() => {
      result.current.sendMessage({ test: 'data' })
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      'WebSocket is not connected. Cannot send message.'
    )

    consoleSpy.mockRestore()
  })

  it('should handle connection errors', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        onError,
      })
    )

    const mockWs = (global.WebSocket as any).mock.instances[0]
    
    act(() => {
      mockWs.simulateError()
    })

    expect(result.current.error).toBe('WebSocket connection error')
    expect(result.current.isConnecting).toBe(false)
    expect(onError).toHaveBeenCalled()
  })

  it('should handle disconnection and attempt reconnection', async () => {
    const onDisconnect = vi.fn()
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        onDisconnect,
        reconnectInterval: 1000,
      })
    )

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(20)
    })

    expect(result.current.isConnected).toBe(true)

    // Simulate disconnection
    const mockWs = (global.WebSocket as any).mock.instances[0]
    act(() => {
      mockWs.close()
    })

    expect(result.current.isConnected).toBe(false)
    expect(onDisconnect).toHaveBeenCalled()

    // Should attempt reconnection after interval
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should create a new WebSocket instance
    expect((global.WebSocket as any).mock.instances.length).toBe(2)
  })

  it('should stop reconnection attempts after max attempts', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        reconnectInterval: 1000,
        maxReconnectAttempts: 2,
      })
    )

    // Simulate multiple disconnections
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(20) // Connect
      })

      const mockWs = (global.WebSocket as any).mock.instances[i]
      act(() => {
        mockWs.close() // Disconnect
      })

      act(() => {
        vi.advanceTimersByTime(1000) // Wait for reconnection attempt
      })
    }

    // Should have stopped trying after 2 attempts
    expect((global.WebSocket as any).mock.instances.length).toBe(2)
  })

  it('should allow manual reconnection', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
      })
    )

    // Wait for initial connection
    act(() => {
      vi.advanceTimersByTime(20)
    })

    // Disconnect
    const mockWs = (global.WebSocket as any).mock.instances[0]
    act(() => {
      mockWs.close()
    })

    expect(result.current.isConnected).toBe(false)

    // Manual reconnection
    act(() => {
      result.current.reconnect()
    })

    act(() => {
      vi.advanceTimersByTime(20)
    })

    expect(result.current.isConnected).toBe(true)
    expect((global.WebSocket as any).mock.instances.length).toBe(2)
  })

  it('should disconnect cleanly', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
      })
    )

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(20)
    })

    const mockWs = (global.WebSocket as any).mock.instances[0]
    const closeSpy = vi.spyOn(mockWs, 'close')

    act(() => {
      result.current.disconnect()
    })

    expect(closeSpy).toHaveBeenCalled()
  })
})