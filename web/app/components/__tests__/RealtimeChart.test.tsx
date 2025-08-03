import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RealtimeChart, RealtimeDataPoint } from '../RealtimeChart'

// Mock Recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children, data }: any) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: ({ dataKey, name }: any) => (
    <div data-testid={`line-${dataKey}`} data-name={name} />
  ),
  XAxis: ({ dataKey, tickFormatter }: any) => (
    <div data-testid="x-axis" data-key={dataKey} />
  ),
  YAxis: ({ yAxisId }: any) => (
    <div data-testid={`y-axis-${yAxisId || 'default'}`} />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: any) => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Legend: () => <div data-testid="legend" />,
}))

const mockData: RealtimeDataPoint[] = [
  {
    timestamp: 1234567890000,
    responseTime: 120,
    requestsPerSecond: 50,
    successRate: 95.5,
    activeRequests: 10,
  },
  {
    timestamp: 1234567891000,
    responseTime: 150,
    requestsPerSecond: 55,
    successRate: 96.0,
    activeRequests: 12,
  },
  {
    timestamp: 1234567892000,
    responseTime: 110,
    requestsPerSecond: 48,
    successRate: 94.8,
    activeRequests: 8,
  },
]

describe('RealtimeChart', () => {
  const defaultProps = {
    data: mockData,
    isConnected: true,
    isConnecting: false,
    error: null,
    onReconnect: vi.fn(),
  }

  it('should render all chart sections', () => {
    render(<RealtimeChart {...defaultProps} />)

    expect(screen.getByText('Response Time')).toBeInTheDocument()
    expect(screen.getByText('Real-time response time measurements')).toBeInTheDocument()
    expect(screen.getByText('Requests Per Second')).toBeInTheDocument()
    expect(screen.getByText('Current throughput over time')).toBeInTheDocument()
    expect(screen.getByText('Combined Metrics')).toBeInTheDocument()
    expect(screen.getByText('Success rate and active requests over time')).toBeInTheDocument()
  })

  it('should display connection status when connected', () => {
    render(<RealtimeChart {...defaultProps} />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toHaveClass('text-green-500')
  })

  it('should display connection status when connecting', () => {
    render(
      <RealtimeChart
        {...defaultProps}
        isConnected={false}
        isConnecting={true}
      />
    )

    expect(screen.getByText('Connecting...')).toBeInTheDocument()
    expect(screen.getByText('Connecting...')).toHaveClass('text-yellow-500')
  })

  it('should display connection status when disconnected', () => {
    render(
      <RealtimeChart
        {...defaultProps}
        isConnected={false}
        isConnecting={false}
      />
    )

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText('Disconnected')).toHaveClass('text-red-500')
  })

  it('should render charts with correct data', () => {
    render(<RealtimeChart {...defaultProps} />)

    const charts = screen.getAllByTestId('line-chart')
    expect(charts).toHaveLength(3)

    // Check that data is passed to charts
    charts.forEach((chart) => {
      const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '[]')
      expect(chartData).toEqual(mockData)
    })
  })

  it('should render correct chart lines', () => {
    render(<RealtimeChart {...defaultProps} />)

    expect(screen.getByTestId('line-responseTime')).toBeInTheDocument()
    expect(screen.getByTestId('line-requestsPerSecond')).toBeInTheDocument()
    expect(screen.getByTestId('line-successRate')).toBeInTheDocument()
    expect(screen.getByTestId('line-activeRequests')).toBeInTheDocument()
  })

  it('should display error message when error occurs', () => {
    const errorMessage = 'Connection failed'
    render(
      <RealtimeChart
        {...defaultProps}
        isConnected={false}
        error={errorMessage}
      />
    )

    expect(screen.getByText('Connection Error')).toBeInTheDocument()
    expect(screen.getByText(errorMessage)).toBeInTheDocument()
    expect(screen.getByText('Retry Connection')).toBeInTheDocument()
  })

  it('should call onReconnect when reconnect button is clicked', () => {
    const onReconnect = vi.fn()
    render(
      <RealtimeChart
        {...defaultProps}
        isConnected={false}
        error="Connection failed"
        onReconnect={onReconnect}
      />
    )

    const reconnectButton = screen.getByText('Retry Connection')
    fireEvent.click(reconnectButton)

    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('should show reconnect button in header when disconnected with error', () => {
    const onReconnect = vi.fn()
    render(
      <RealtimeChart
        {...defaultProps}
        isConnected={false}
        error="Connection failed"
        onReconnect={onReconnect}
      />
    )

    const headerReconnectButton = screen.getByText('Reconnect')
    fireEvent.click(headerReconnectButton)

    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('should not show error section when no error', () => {
    render(<RealtimeChart {...defaultProps} />)

    expect(screen.queryByText('Connection Error')).not.toBeInTheDocument()
    expect(screen.queryByText('Retry Connection')).not.toBeInTheDocument()
  })

  it('should render with empty data', () => {
    render(<RealtimeChart {...defaultProps} data={[]} />)

    const charts = screen.getAllByTestId('line-chart')
    charts.forEach((chart) => {
      const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '[]')
      expect(chartData).toEqual([])
    })
  })

  it('should render responsive containers', () => {
    render(<RealtimeChart {...defaultProps} />)

    const containers = screen.getAllByTestId('responsive-container')
    expect(containers).toHaveLength(3) // One for each chart
  })

  it('should render chart axes', () => {
    render(<RealtimeChart {...defaultProps} />)

    // Should have X axes for all charts
    const xAxes = screen.getAllByTestId('x-axis')
    expect(xAxes).toHaveLength(3)

    // Should have Y axes (including dual axes for combined chart)
    expect(screen.getByTestId('y-axis-default')).toBeInTheDocument()
    expect(screen.getByTestId('y-axis-left')).toBeInTheDocument()
    expect(screen.getByTestId('y-axis-right')).toBeInTheDocument()
  })

  it('should render legend for combined metrics chart', () => {
    render(<RealtimeChart {...defaultProps} />)

    expect(screen.getByTestId('legend')).toBeInTheDocument()
  })

  it('should render connection indicator dots', () => {
    const { rerender } = render(<RealtimeChart {...defaultProps} />)

    // Connected state - green dot
    let dots = document.querySelectorAll('.bg-green-500')
    expect(dots).toHaveLength(1)

    // Disconnected state - red dot
    rerender(
      <RealtimeChart
        {...defaultProps}
        isConnected={false}
        isConnecting={false}
      />
    )

    dots = document.querySelectorAll('.bg-red-500')
    expect(dots).toHaveLength(1)
  })
})