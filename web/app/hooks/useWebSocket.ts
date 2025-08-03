import { useEffect, useRef, useState, useCallback } from 'react'
import { LoadTestFrontendError, ErrorType, ErrorSeverity, globalErrorHandler } from '../utils/errorHandling'

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
  onError?: (error: LoadTestFrontendError) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
  heartbeatInterval?: number
  connectionTimeout?: number
}

export interface UseWebSocketReturn {
  isConnected: boolean
  isConnecting: boolean
  error: LoadTestFrontendError | null
  connectionAttempts: number
  lastConnected: number | null
  sendMessage: (message: any) => void
  reconnect: () => void
  disconnect: () => void
  getConnectionHealth: () => ConnectionHealth
}

export interface ConnectionHealth {
  isHealthy: boolean
  uptime: number | null
  reconnectAttempts: number
  lastError: LoadTestFrontendError | null
  messagesSent: number
  messagesReceived: number
}

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
  heartbeatInterval = 30000,
  connectionTimeout = 10000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<LoadTestFrontendError | null>(null)
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const [lastConnected, setLastConnected] = useState<number | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const messagesSentRef = useRef(0)
  const messagesReceivedRef = useRef(0)
  const lastErrorRef = useRef<LoadTestFrontendError | null>(null)

  const handleError = useCallback((error: Error | LoadTestFrontendError, context?: Record<string, any>) => {
    const frontendError = error instanceof LoadTestFrontendError 
      ? error 
      : globalErrorHandler.createWebSocketError(
          'WS_CONNECTION_ERROR',
          error.message,
          { ...context, url }
        )
    
    lastErrorRef.current = frontendError
    setError(frontendError)
    onError?.(frontendError)
    
    return frontendError
  }, [url, onError])

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current)
    }

    heartbeatTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
          messagesSentRef.current++
          startHeartbeat() // Schedule next heartbeat
        } catch (error) {
          handleError(new Error('Heartbeat failed'), { operation: 'heartbeat' })
        }
      }
    }, heartbeatInterval)
  }, [heartbeatInterval, handleError])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current)
      heartbeatTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Clear any existing timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
    }

    setIsConnecting(true)
    setError(null)
    setConnectionAttempts(prev => prev + 1)

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close()
          const timeoutError = globalErrorHandler.createWebSocketError(
            'WS_CONNECTION_TIMEOUT',
            `Connection timeout after ${connectionTimeout}ms`,
            { url, timeout: connectionTimeout }
          )
          handleError(timeoutError)
        }
      }, connectionTimeout)

      ws.onopen = () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }

        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setLastConnected(Date.now())
        reconnectAttemptsRef.current = 0
        
        // Reset error handler retry count
        globalErrorHandler.resetRetryCount(`websocket-${url}`)
        
        startHeartbeat()
        onConnect?.()
      }

      ws.onmessage = (event) => {
        messagesReceivedRef.current++
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          
          // Handle pong messages
          if (message.type === 'pong') {
            return // Heartbeat response, no need to forward
          }
          
          onMessage?.(message)
        } catch (err) {
          const parseError = globalErrorHandler.createDataError(
            'WS_MESSAGE_PARSE_ERROR',
            'Failed to parse WebSocket message',
            { rawMessage: event.data, error: err }
          )
          handleError(parseError)
        }
      }

      ws.onclose = (event) => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }

        setIsConnected(false)
        setIsConnecting(false)
        stopHeartbeat()
        onDisconnect?.()

        // Handle different close codes
        let closeError: LoadTestFrontendError | null = null
        
        if (event.code === 1006) {
          closeError = globalErrorHandler.createWebSocketError(
            'WS_CONNECTION_LOST',
            'Connection lost unexpectedly',
            { code: event.code, reason: event.reason, wasClean: event.wasClean }
          )
        } else if (event.code !== 1000 && event.code !== 1001) {
          closeError = globalErrorHandler.createWebSocketError(
            'WS_CONNECTION_CLOSED',
            `Connection closed with code ${event.code}: ${event.reason}`,
            { code: event.code, reason: event.reason, wasClean: event.wasClean }
          )
        }

        if (closeError) {
          handleError(closeError)
        }

        // Attempt to reconnect if enabled and within retry limits
        if (
          shouldReconnectRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current++
          
          const delay = Math.min(reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1), 30000)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          const maxRetriesError = globalErrorHandler.createWebSocketError(
            'WS_RECONNECT_FAILED',
            `Failed to reconnect after ${maxReconnectAttempts} attempts`,
            { maxAttempts: maxReconnectAttempts, url }
          )
          handleError(maxRetriesError)
        }
      }

      ws.onerror = (event) => {
        setIsConnecting(false)
        
        const connectionError = globalErrorHandler.createWebSocketError(
          'WS_CONNECTION_ERROR',
          'WebSocket connection error',
          { event, url, readyState: ws.readyState }
        )
        handleError(connectionError)
      }
    } catch (err) {
      setIsConnecting(false)
      const createError = globalErrorHandler.createWebSocketError(
        'WS_CREATE_FAILED',
        'Failed to create WebSocket connection',
        { url, error: err }
      )
      handleError(createError)
    }
  }, [url, onMessage, onConnect, onDisconnect, handleError, reconnectInterval, maxReconnectAttempts, connectionTimeout, startHeartbeat, stopHeartbeat])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    
    // Clear all timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }

    stopHeartbeat()

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect')
      wsRef.current = null
    }

    setIsConnected(false)
    setIsConnecting(false)
  }, [stopHeartbeat])

  const reconnect = useCallback(() => {
    disconnect()
    shouldReconnectRef.current = true
    reconnectAttemptsRef.current = 0
    setConnectionAttempts(0)
    setError(null)
    connect()
  }, [connect, disconnect])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message))
        messagesSentRef.current++
      } catch (error) {
        const sendError = globalErrorHandler.createWebSocketError(
          'WS_SEND_FAILED',
          'Failed to send WebSocket message',
          { message, error }
        )
        handleError(sendError)
      }
    } else {
      const notConnectedError = globalErrorHandler.createWebSocketError(
        'WS_NOT_CONNECTED',
        'WebSocket is not connected. Cannot send message.',
        { message, readyState: wsRef.current?.readyState }
      )
      handleError(notConnectedError)
    }
  }, [handleError])

  const getConnectionHealth = useCallback((): ConnectionHealth => {
    return {
      isHealthy: isConnected && !error,
      uptime: lastConnected ? Date.now() - lastConnected : null,
      reconnectAttempts: reconnectAttemptsRef.current,
      lastError: lastErrorRef.current,
      messagesSent: messagesSentRef.current,
      messagesReceived: messagesReceivedRef.current
    }
  }, [isConnected, error, lastConnected])

  useEffect(() => {
    connect()

    return () => {
      shouldReconnectRef.current = false
      
      // Clear all timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current)
      }
      
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    lastConnected,
    sendMessage,
    reconnect,
    disconnect,
    getConnectionHealth,
  }
}