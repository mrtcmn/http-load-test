import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RealtimeChart } from '../RealtimeChart'

// Mock the hooks
vi.mock('../../hooks/useRealtimeMetrics', () => ({
  useRealtimeMetrics: vi.fn()
}))

// Mock Recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: ({ name }: any) => <div data-testid={`line-${name}`}>{name}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => <div data-testid="legend" />,
  ReferenceLine: ({ label }: any) => <div data-testid="reference-line">{label?.value}</div>
}))

import { useRealtimeMetrics } from '../../hooks/useRealtimeMetrics'

const mockUseRealtimeMetrics = useRealtimeMetrics as any

describe('RealtimeChart', () => {
  const mockMetricsReturn = {
    currentMetrics: null,
    metricsHistory: {
      timestamps: [],
      responseTimes: [],
      requestsPerSecond: [],
      errorRates: [],
      activeConnections: []
    },
    isConnected: false,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    clearHistory: vi.fn(),
    connectionAttempts: 0
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRealtimeMetrics.mockReturnValue(mockMetricsReturn)
  })

  it('should render with default state', () => {
    render(<RealtimeChart />)

    expect(screen.getByText('Real-time Performance')).toBeInTheDocument()
    expect(screen.getByText('Live metrics streaming from load test execution')).toBeInTheDocument()
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText('No connection')).toBeInTheDocument()
  })

  it('should show connecting state', () => {
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnecting: true
    })

    render(<RealtimeChart />)

    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('should show connected state', () => {
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true
    })

    render(<RealtimeChart />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Waiting for data...')).toBeInTheDocument()
  })

  it('should display current metrics when available', () => {
    const currentMetrics = {
      timestamp: Date.now(),
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      requestsPerSecond: 10.5,
      avgResponseTime: 250,
      currentResponseTime: 300,
      errorRate: 5.0,
      activeConnections: 8
    }

    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true,
      currentMetrics
    })

    render(<RealtimeChart />)

    expect(screen.getByText('250ms')).toBeInTheDocument() // Avg Response
    expect(screen.getByText('10.5')).toBeInTheDocument() // Req/sec
    expect(screen.getByText('5.0%')).toBeInTheDocument() // Error Rate
    expect(screen.getByText('8')).toBeInTheDocument() // Active Conn.
  })

  it('should render chart when data is available', () => {
    const metricsHistory = {
      timestamps: [1000, 2000, 3000],
      responseTimes: [100, 200, 150],
      requestsPerSecond: [5, 10, 8],
      errorRates: [1, 2, 1.5],
      activeConnections: [3, 5, 4]
    }

    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true,
      metricsHistory
    })

    render(<RealtimeChart />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    expect(screen.getByTestId('line-Response Time')).toBeInTheDocument()
    expect(screen.getByTestId('line-Requests/sec')).toBeInTheDocument()
    expect(screen.getByTestId('line-Error Rate (%)')).toBeInTheDocument()
    expect(screen.getByTestId('line-Active Connections')).toBeInTheDocument()
  })

  it('should show error message when there is an error', () => {
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      error: 'Connection failed',
      connectionAttempts: 2
    })

    render(<RealtimeChart />)

    expect(screen.getByText('Connection error: Connection failed (Attempt 2)')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('should call connect when retry button is clicked', () => {
    const mockConnect = vi.fn()
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      error: 'Connection failed',
      connect: mockConnect
    })

    render(<RealtimeChart />)

    const retryButton = screen.getByText('Retry')
    fireEvent.click(retryButton)

    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('should call clearHistory when clear button is clicked', () => {
    const mockClearHistory = vi.fn()
    const metricsHistory = {
      timestamps: [1000, 2000],
      responseTimes: [100, 200],
      requestsPerSecond: [5, 10],
      errorRates: [1, 2],
      activeConnections: [3, 5]
    }

    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true,
      metricsHistory,
      clearHistory: mockClearHistory
    })

    render(<RealtimeChart />)

    const clearButton = screen.getByText('Clear')
    fireEvent.click(clearButton)

    expect(mockClearHistory).toHaveBeenCalledOnce()
  })

  it('should disable clear button when no data', () => {
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true
    })

    render(<RealtimeChart />)

    const clearButton = screen.getByText('Clear')
    expect(clearButton).toBeDisabled()
  })

  it('should call connect when connect button is clicked in no connection state', () => {
    const mockConnect = vi.fn()
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      connect: mockConnect
    })

    render(<RealtimeChart />)

    const connectButton = screen.getByText('Connect')
    fireEvent.click(connectButton)

    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('should show connection attempts when reconnecting', () => {
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      connectionAttempts: 3
    })

    render(<RealtimeChart />)

    expect(screen.getByText('Reconnection attempts: 3')).toBeInTheDocument()
  })

  it('should show establishing connection message when connecting', () => {
    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnecting: true
    })

    render(<RealtimeChart />)

    expect(screen.getByText('Establishing connection...')).toBeInTheDocument()
  })

  it('should pass correct options to useRealtimeMetrics', () => {
    const wsUrl = 'ws://custom:8080/metrics'
    const maxHistoryPoints = 50
    const updateInterval = 500

    render(
      <RealtimeChart 
        wsUrl={wsUrl}
        maxHistoryPoints={maxHistoryPoints}
        updateInterval={updateInterval}
      />
    )

    expect(mockUseRealtimeMetrics).toHaveBeenCalledWith({
      wsUrl,
      maxHistoryPoints,
      updateInterval
    })
  })

  it('should format time correctly', () => {
    const currentMetrics = {
      timestamp: Date.now(),
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      requestsPerSecond: 10.5,
      avgResponseTime: 1500, // 1.5 seconds
      currentResponseTime: 300,
      errorRate: 5.0,
      activeConnections: 8
    }

    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true,
      currentMetrics
    })

    render(<RealtimeChart />)

    expect(screen.getByText('1.50s')).toBeInTheDocument() // Should format as seconds
  })

  it('should show legend when showLegend is true', () => {
    const metricsHistory = {
      timestamps: [1000],
      responseTimes: [100],
      requestsPerSecond: [5],
      errorRates: [1],
      activeConnections: [3]
    }

    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true,
      metricsHistory
    })

    render(<RealtimeChart showLegend={true} />)

    expect(screen.getByTestId('legend')).toBeInTheDocument()
  })

  it('should not show legend when showLegend is false', () => {
    const metricsHistory = {
      timestamps: [1000],
      responseTimes: [100],
      requestsPerSecond: [5],
      errorRates: [1],
      activeConnections: [3]
    }

    mockUseRealtimeMetrics.mockReturnValue({
      ...mockMetricsReturn,
      isConnected: true,
      metricsHistory
    })

    render(<RealtimeChart showLegend={false} />)

    expect(screen.queryByTestId('legend')).not.toBeInTheDocument()
  })
})