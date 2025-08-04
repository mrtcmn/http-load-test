import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MetricsDashboard } from '../MetricsDashboard'

// Mock the RealtimeChart component
vi.mock('../RealtimeChart', () => ({
  RealtimeChart: () => <div data-testid="realtime-chart">Mocked RealtimeChart</div>
}))

// Mock Recharts for other components
vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => <div data-testid="legend" />
}))

describe('Integration: MetricsDashboard with RealtimeChart', () => {
  it('should render MetricsDashboard with RealtimeChart component', () => {
    render(<MetricsDashboard />)

    // Check that the main dashboard elements are present
    expect(screen.getByText('Load Test Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Ready to start testing')).toBeInTheDocument()
    
    // Check that the RealtimeChart is rendered
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument()
    expect(screen.getByText('Mocked RealtimeChart')).toBeInTheDocument()
  })

  it('should render with test results', () => {
    const testResults = {
      totalRequests: 1000,
      successfulRequests: 950,
      failedRequests: 50,
      duration: 30000,
      requestsPerSecond: 33.3,
      percentiles: {
        p50: 100,
        p95: 250,
        p99: 500,
        min: 50,
        max: 1000,
        avg: 150
      },
      statusCodes: {
        200: 950,
        500: 50
      },
      errors: {
        'Connection timeout': 30,
        'Server error': 20
      },
      responseTimes: [100, 150, 200, 250, 300]
    }

    render(<MetricsDashboard testResults={testResults} isTestRunning={true} />)

    // Check that test results are displayed
    expect(screen.getByText('1,000')).toBeInTheDocument() // Total requests
    expect(screen.getByText('33.3')).toBeInTheDocument() // Requests per second
    expect(screen.getByText('95.0%')).toBeInTheDocument() // Success rate
    expect(screen.getByText('30.0s')).toBeInTheDocument() // Duration
    
    // Check that the RealtimeChart is still rendered
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument()
  })

  it('should show running state correctly', () => {
    render(<MetricsDashboard isTestRunning={true} />)

    expect(screen.getByText('Test in progress...')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})