import { useEffect, useRef, useState, useCallback } from 'react'

export interface WebSocketMessage {
  type: string
  data: any
  timestamp: number
}

export interface UseWebSocketOptions {
  url: string
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  reconnectAttempts?: number
  reconnectInterval?: number
  autoConnect?: boolean
}

export interface UseWebSocketReturn {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
  sendMessage: (message: any) => void
  lastMessage: WebSocketMessage | null
  connectionAttempts: number
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    autoConnect = true
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [connectionAttempts, setConnectionAttempts] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const shouldReconnectRef = useRef(true)

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setIsConnecting(false)
        setConnectionAttempts(0)
        setError(null)
        onConnect?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)
          onMessage?.(message)
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
          setError('Failed to parse message')
        }
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        setIsConnecting(false)
        wsRef.current = null
        onDisconnect?.()

        // Attempt reconnection if not manually closed and within retry limits
        if (shouldReconnectRef.current && connectionAttempts < reconnectAttempts) {
          setConnectionAttempts(prev => prev + 1)
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        }
      }

      ws.onerror = (event) => {
        setError('WebSocket connection error')
        setIsConnecting(false)
        onError?.(event)
      }
    } catch (err) {
      setError('Failed to create WebSocket connection')
      setIsConnecting(false)
    }
  }, [url, onMessage, onConnect, onDisconnect, onError, connectionAttempts, reconnectAttempts, reconnectInterval])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    clearReconnectTimeout()
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    setIsConnected(false)
    setIsConnecting(false)
    setConnectionAttempts(0)
  }, [clearReconnectTimeout])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }, [])

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      shouldReconnectRef.current = true
      connect()
    }

    return () => {
      shouldReconnectRef.current = false
      clearReconnectTimeout()
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [autoConnect, connect, clearReconnectTimeout])

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendMessage,
    lastMessage,
    connectionAttempts
  }
}