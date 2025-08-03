import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PercentileMetrics } from '../PercentileMetrics'

const mockPercentiles = {
  p50: 120,
  p95: 450,
  p99: 800,
  min: 45,
  max: 1200,
  avg: 180,
}

describe('PercentileMetrics', () => {
  it('should render component title and description', () => {
    render(<PercentileMetrics />)
    expect(screen.getByText('Response Time Percentiles')).toBeInTheDocument()
    expect(screen.getByText('Distribution of response times across all requests')).toBeInTheDocument()
  })

  it('should display all percentile metrics', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    expect(screen.getByText('P50 (Median)')).toBeInTheDocument()
    expect(screen.getByText('P95')).toBeInTheDocument()
    expect(screen.getByText('P99')).toBeInTheDocument()
    expect(screen.getByText('Average')).toBeInTheDocument()
    expect(screen.getByText('Minimum')).toBeInTheDocument()
    expect(screen.getByText('Maximum')).toBeInTheDocument()
  })

  it('should format time values correctly', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    // Check millisecond formatting (using getAllByText for values that appear multiple times)
    expect(screen.getByText('120ms')).toBeInTheDocument() // p50
    expect(screen.getByText('450ms')).toBeInTheDocument() // p95
    expect(screen.getByText('800ms')).toBeInTheDocument() // p99
    expect(screen.getAllByText('45ms')[0]).toBeInTheDocument()  // min (appears in range too)
    expect(screen.getByText('180ms')).toBeInTheDocument() // avg
  })

  it('should format large time values in seconds', () => {
    const largeTimePercentiles = {
      p50: 1500, // 1.5 seconds
      p95: 5000, // 5 seconds
      p99: 10000, // 10 seconds
      min: 100,
      max: 15000, // 15 seconds
      avg: 3000, // 3 seconds
    }
    
    render(<PercentileMetrics percentiles={largeTimePercentiles} />)
    
    expect(screen.getByText('1.50s')).toBeInTheDocument() // p50
    expect(screen.getByText('5.00s')).toBeInTheDocument() // p95
    expect(screen.getByText('10.00s')).toBeInTheDocument() // p99
    expect(screen.getByText('3.00s')).toBeInTheDocument() // avg
  })

  it('should display zero values when no percentiles provided', () => {
    render(<PercentileMetrics />)
    
    // Should display 0ms for all metrics (including range display, so 8 total)
    const zeroValues = screen.getAllByText('0ms')
    expect(zeroValues.length).toBeGreaterThanOrEqual(6) // At least 6 percentile metrics
  })

  it('should render response time range visualization', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    expect(screen.getByText('Response Time Range')).toBeInTheDocument()
  })
})