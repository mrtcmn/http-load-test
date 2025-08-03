import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsDashboard } from '../MetricsDashboard'

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
})