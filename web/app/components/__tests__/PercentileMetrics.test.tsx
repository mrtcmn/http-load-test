import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PercentileMetrics } from '../PercentileMetrics'

const mockPercentiles = {
  p50: 150,
  p95: 500,
  p99: 800,
  min: 50,
  max: 1200,
  avg: 200
}

describe('PercentileMetrics', () => {
  it('renders component title', () => {
    render(<PercentileMetrics />)
    expect(screen.getByText('Response Time Percentiles')).toBeInTheDocument()
    expect(screen.getByText('Distribution of response times across all requests')).toBeInTheDocument()
  })

  it('shows no data message when percentiles are not provided', () => {
    render(<PercentileMetrics />)
    expect(screen.getByText('No data available')).toBeInTheDocument()
    expect(screen.getByText('Start a test to see percentile metrics')).toBeInTheDocument()
  })

  it('displays percentile values correctly', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    // Check key metrics display
    expect(screen.getByText('150ms')).toBeInTheDocument() // P50
    expect(screen.getByText('500ms')).toBeInTheDocument() // P95
    expect(screen.getByText('800ms')).toBeInTheDocument() // P99
  })

  it('displays additional stats correctly', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    // Check additional stats
    expect(screen.getByText('50ms')).toBeInTheDocument() // Minimum
    expect(screen.getByText('1.20s')).toBeInTheDocument() // Maximum (formatted as seconds)
    expect(screen.getByText('200ms')).toBeInTheDocument() // Average
  })

  it('calculates range correctly', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    // Range should be max - min = 1200 - 50 = 1150ms = 1.15s
    expect(screen.getByText('1.15s')).toBeInTheDocument()
  })

  it('formats time values correctly', () => {
    const percentiles = {
      p50: 50,      // Should show as 50ms
      p95: 1500,    // Should show as 1.50s
      p99: 2000,    // Should show as 2.00s
      min: 10,      // Should show as 10ms
      max: 5000,    // Should show as 5.00s
      avg: 750      // Should show as 750ms
    }
    
    render(<PercentileMetrics percentiles={percentiles} />)
    
    expect(screen.getByText('50ms')).toBeInTheDocument()
    expect(screen.getByText('1.50s')).toBeInTheDocument()
    expect(screen.getByText('2.00s')).toBeInTheDocument()
    expect(screen.getByText('10ms')).toBeInTheDocument()
    expect(screen.getByText('5.00s')).toBeInTheDocument()
    expect(screen.getByText('750ms')).toBeInTheDocument()
  })

  it('shows correct labels for percentiles', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    expect(screen.getByText('P50 (Median)')).toBeInTheDocument()
    expect(screen.getByText('P95')).toBeInTheDocument()
    expect(screen.getByText('P99')).toBeInTheDocument()
  })

  it('displays stat labels correctly', () => {
    render(<PercentileMetrics percentiles={mockPercentiles} />)
    
    expect(screen.getByText('Minimum:')).toBeInTheDocument()
    expect(screen.getByText('Maximum:')).toBeInTheDocument()
    expect(screen.getByText('Average:')).toBeInTheDocument()
    expect(screen.getByText('Range:')).toBeInTheDocument()
  })
})