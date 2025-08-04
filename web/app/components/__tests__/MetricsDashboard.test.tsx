import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsDashboard, type TestResults } from '../MetricsDashboard'

const mockTestResults: TestResults = {
  totalRequests: 1000,
  successfulRequests: 950,
  failedRequests: 50,
  duration: 30000,
  requestsPerSecond: 33.3,
  percentiles: {
    p50: 150,
    p95: 500,
    p99: 800,
    min: 50,
    max: 1200,
    avg: 200
  },
  statusCodes: {
    200: 950,
    404: 30,
    500: 20
  },
  errors: {
    'Connection timeout': 25,
    'DNS resolution failed': 15,
    'Connection refused': 10
  },
  responseTimes: [100, 150, 200, 250, 300]
}

describe('MetricsDashboard', () => {
  it('renders dashboard title', () => {
    render(<MetricsDashboard />)
    expect(screen.getByText('Load Test Dashboard')).toBeInTheDocument()
  })

  it('shows idle status when no test is running', () => {
    render(<MetricsDashboard isTestRunning={false} />)
    expect(screen.getByText('Ready to start testing')).toBeInTheDocument()
    expect(screen.getByText('Idle')).toBeInTheDocument()
  })

  it('shows running status when test is active', () => {
    render(<MetricsDashboard isTestRunning={true} />)
    expect(screen.getByText('Test in progress...')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('displays test results correctly', () => {
    render(<MetricsDashboard testResults={mockTestResults} />)
    
    // Check overview cards
    expect(screen.getByText('1,000')).toBeInTheDocument() // Total requests
    expect(screen.getByText('33.3')).toBeInTheDocument() // Requests per second
    expect(screen.getByText('95.0%')).toBeInTheDocument() // Success rate
    expect(screen.getByText('30.0s')).toBeInTheDocument() // Duration
  })

  it('shows zero values when no test results', () => {
    render(<MetricsDashboard />)
    
    expect(screen.getByText('0')).toBeInTheDocument() // Total requests
    expect(screen.getByText('0.0')).toBeInTheDocument() // Requests per second
    expect(screen.getByText('0.0%')).toBeInTheDocument() // Success rate
    expect(screen.getByText('0.0s')).toBeInTheDocument() // Duration
  })

  it('calculates success rate correctly', () => {
    const partialResults: TestResults = {
      ...mockTestResults,
      totalRequests: 100,
      successfulRequests: 85,
      failedRequests: 15
    }
    
    render(<MetricsDashboard testResults={partialResults} />)
    expect(screen.getByText('85.0%')).toBeInTheDocument()
  })

  it('formats large numbers with commas', () => {
    const largeResults: TestResults = {
      ...mockTestResults,
      totalRequests: 1234567,
      successfulRequests: 1234000
    }
    
    render(<MetricsDashboard testResults={largeResults} />)
    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })
})