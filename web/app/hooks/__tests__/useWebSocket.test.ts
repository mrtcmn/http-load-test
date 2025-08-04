import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWebSocket } from '../useWebSocket'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
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
        data: JSON.stringify(data)
      })
      this.onmessage(event)
    }
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }
}

// Mock global WebSocket
global.WebSocket = MockWebSocket as any

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => 
      useWebSocket({ url: 'ws://localhost:8080', autoConnect: false })
    )

    expect(result.current.isConnected).toBe(false)
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.lastMessage).toBe(null)
    expect(result.current.connectionAttempts).toBe(0)
  })

  it('should auto-connect when autoConnect is true', async () => {
    const onConnect = vi.fn()
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        onConnect,
        autoConnect: true 
      })
    )

    expect(result.current.isConnecting).toBe(true)

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    expect(result.current.isConnected).toBe(true)
    expect(result.current.isConnecting).toBe(false)
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('should handle incoming messages', async () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        onMessage,
        autoConnect: true 
      })
    )

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    const testMessage = { type: 'test', data: { value: 123 }, timestamp: Date.now() }
    
    // Simulate message
    act(() => {
      const ws = (global.WebSocket as any).mock.instances[0]
      ws.simulateMessage(testMessage)
    })

    expect(onMessage).toHaveBeenCalledWith(testMessage)
    expect(result.current.lastMessage).toEqual(testMessage)
  })

  it('should handle connection errors', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        onError,
        autoConnect: true 
      })
    )

    // Wait for connection attempt
    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    // Simulate error
    act(() => {
      const ws = (global.WebSocket as any).mock.instances[0]
      ws.simulateError()
    })

    expect(onError).toHaveBeenCalled()
    expect(result.current.error).toBe('WebSocket connection error')
  })

  it('should attempt reconnection on disconnect', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        autoConnect: true,
        reconnectAttempts: 2,
        reconnectInterval: 1000
      })
    )

    // Wait for initial connection
    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    expect(result.current.isConnected).toBe(true)

    // Simulate disconnect
    act(() => {
      const ws = (global.WebSocket as any).mock.instances[0]
      ws.close()
    })

    expect(result.current.isConnected).toBe(false)
    expect(result.current.connectionAttempts).toBe(1)

    // Wait for reconnection attempt
    await act(async () => {
      vi.advanceTimersByTime(1020)
    })

    expect(result.current.connectionAttempts).toBe(1)
  })

  it('should send messages when connected', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        autoConnect: true 
      })
    )

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    const testMessage = { type: 'test', data: 'hello' }
    const mockSend = vi.fn()
    
    // Mock the send method
    const ws = (global.WebSocket as any).mock.instances[0]
    ws.send = mockSend

    act(() => {
      result.current.sendMessage(testMessage)
    })

    expect(mockSend).toHaveBeenCalledWith(JSON.stringify(testMessage))
  })

  it('should not send messages when disconnected', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        autoConnect: false 
      })
    )

    act(() => {
      result.current.sendMessage({ test: 'message' })
    })

    expect(consoleSpy).toHaveBeenCalledWith('WebSocket is not connected')
    consoleSpy.mockRestore()
  })

  it('should disconnect properly', async () => {
    const onDisconnect = vi.fn()
    const { result } = renderHook(() => 
      useWebSocket({ 
        url: 'ws://localhost:8080', 
        onDisconnect,
        autoConnect: true 
      })
    )

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    expect(result.current.isConnected).toBe(true)

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.isConnected).toBe(false)
    expect(result.current.connectionAttempts).toBe(0)
    expect(onDisconnect).toHaveBeenCalled()
  })
})