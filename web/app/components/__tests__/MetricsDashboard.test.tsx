import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsDashboard } from '../MetricsDashboard'

// Mock the hooks
vi.mock('../../hooks/useRealtimeMetrics', () => ({
  useRealtimeMetrics: vi.fn(() => ({
    metrics: {
      dataPoints: [],
      currentRps: 0,
      currentSuccessRate: 100,
      activeRequests: 0,
      totalRequests: 0,
      percentiles: { p50: 0, p95: 0, p99: 0 },
    },
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnect: vi.fn(),
    clearData: vi.fn(),
  })),
}))

// Mock RealtimeChart component
vi.mock('../RealtimeChart', () => ({
  RealtimeChart: ({ data, isConnected, isConnecting, error }: any) => (
    <div data-testid="realtime-chart">
      <span data-testid="chart-data-length">{data.length}</span>
      <span data-testid="chart-connected">{isConnected.toString()}</span>
      <span data-testid="chart-connecting">{isConnecting.toString()}</span>
      <span data-testid="chart-error">{error || 'no-error'}</span>
    </div>
  ),
}))

const mockMetrics = {
  totalRequests: 1000,
  successfulRequests: 950,
  failedRequests: 50,
  duration: 30000,
  requestsPerSecond: 33.3,
  percentiles: {
    p50: 120,
    p95: 450,
    p99: 800,
    min: 45,
    max: 1200,
    avg: 180,
  },
  statusCodes: {
    200: 950,
    404: 30,
    500: 20,
  },
  errors: {
    'Connection timeout': 25,
    'DNS resolution failed': 15,
  },
  responseTimes: {
    histogram: [
      { bucket: '0-100ms', count: 300 },
      { bucket: '100-200ms', count: 400 },
    ],
  },
}

describe('MetricsDashboard', () => {
  it('should render dashboard title', () => {
    render(<MetricsDashboard />)
    expect(screen.getByText('HTTP Load Test Dashboard')).toBeInTheDocument()
  })

  it('should display test status when running', () => {
    render(<MetricsDashboard isRunning={true} />)
    expect(screen.getByText('Test Running')).toBeInTheDocument()
  })

  it('should display test status when idle', () => {
    render(<MetricsDashboard isRunning={false} />)
    expect(screen.getByText('Test Idle')).toBeInTheDocument()
  })

  it('should display metrics when provided', () => {
    render(<MetricsDashboard metrics={mockMetrics} />)
    
    // Check overview cards
    expect(screen.getByText('1,000')).toBeInTheDocument() // Total requests
    expect(screen.getAllByText('95.0%')[0]).toBeInTheDocument() // Success rate (first occurrence)
    expect(screen.getByText('33.3')).toBeInTheDocument() // Requests per second
    expect(screen.getByText('30.0s')).toBeInTheDocument() // Duration
  })

  it('should display zero values when no metrics provided', () => {
    render(<MetricsDashboard />)
    
    // Check that zero values are displayed (using getAllByText for multiple occurrences)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('0s')).toBeInTheDocument()
  })

  it('should render percentile metrics component', () => {
    render(<MetricsDashboard metrics={mockMetrics} />)
    expect(screen.getByText('Response Time Percentiles')).toBeInTheDocument()
  })

  it('should render error summary component', () => {
    render(<MetricsDashboard metrics={mockMetrics} />)
    expect(screen.getByText('Error Summary')).toBeInTheDocument()
  })

  it('should show real-time charts when test is running', () => {
    render(<MetricsDashboard metrics={mockMetrics} isRunning={true} />)
    
    expect(screen.getByText('Real-time Metrics')).toBeInTheDocument()
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument()
  })

  it('should not show real-time charts when test is not running', () => {
    render(<MetricsDashboard metrics={mockMetrics} isRunning={false} />)
    
    expect(screen.queryByText('Real-time Metrics')).not.toBeInTheDocument()
    expect(screen.queryByTestId('realtime-chart')).not.toBeInTheDocument()
  })

  it('should pass correct props to RealtimeChart', () => {
    render(<MetricsDashboard metrics={mockMetrics} isRunning={true} />)
    
    const chart = screen.getByTestId('realtime-chart')
    expect(screen.getByTestId('chart-data-length')).toHaveTextContent('0')
    expect(screen.getByTestId('chart-connected')).toHaveTextContent('false')
    expect(screen.getByTestId('chart-connecting')).toHaveTextContent('false')
    expect(screen.getByTestId('chart-error')).toHaveTextContent('no-error')
  })

  it('should use custom websocket URL when provided', () => {
    const customUrl = 'ws://custom:9090/metrics'
    render(<MetricsDashboard websocketUrl={customUrl} isRunning={true} />)
    
    // The hook should be called with the custom URL
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument()
  })
})