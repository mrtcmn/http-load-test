import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorSummary } from '../ErrorSummary'

const mockStatusCodes = {
  200: 950,
  404: 30,
  500: 20,
}

const mockErrors = {
  'Connection timeout': 25,
  'DNS resolution failed': 15,
  'Connection refused': 10,
}

describe('ErrorSummary', () => {
  it('should render component title and description', () => {
    render(<ErrorSummary totalRequests={1000} />)
    expect(screen.getByText('Error Summary')).toBeInTheDocument()
    expect(screen.getByText('Breakdown of HTTP status codes and error types')).toBeInTheDocument()
  })

  it('should display HTTP status codes when provided', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={1000} />)
    
    expect(screen.getByText('200 - Success')).toBeInTheDocument()
    expect(screen.getByText('404 - Client Error')).toBeInTheDocument()
    expect(screen.getByText('500 - Server Error')).toBeInTheDocument()
  })

  it('should display status code counts and percentages', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={1000} />)
    
    expect(screen.getByText('950')).toBeInTheDocument()
    expect(screen.getByText('95.0%')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('3.0%')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('2.0%')).toBeInTheDocument()
  })

  it('should display error details when provided', () => {
    render(<ErrorSummary errors={mockErrors} totalRequests={1000} />)
    
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
    expect(screen.getByText('DNS resolution failed')).toBeInTheDocument()
    expect(screen.getByText('Connection refused')).toBeInTheDocument()
  })

  it('should display error counts and percentages', () => {
    render(<ErrorSummary errors={mockErrors} totalRequests={1000} />)
    
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('2.5%')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('1.5%')).toBeInTheDocument()
  })

  it('should show no data messages when no status codes or errors', () => {
    render(<ErrorSummary totalRequests={0} />)
    
    expect(screen.getByText('No status codes recorded')).toBeInTheDocument()
    expect(screen.getByText('No errors recorded')).toBeInTheDocument()
  })

  it('should calculate successful and failed request counts', () => {
    render(<ErrorSummary errors={mockErrors} totalRequests={1000} />)
    
    // Total errors = 25 + 15 + 10 = 50
    // Successful = 1000 - 50 = 950
    expect(screen.getByText('950')).toBeInTheDocument() // Successful
    expect(screen.getByText('50')).toBeInTheDocument()  // Failed
  })

  it('should limit error display to top 5 errors', () => {
    const manyErrors = {
      'Error 1': 100,
      'Error 2': 90,
      'Error 3': 80,
      'Error 4': 70,
      'Error 5': 60,
      'Error 6': 50,
      'Error 7': 40,
    }
    
    render(<ErrorSummary errors={manyErrors} totalRequests={1000} />)
    
    // Should show first 5 errors
    expect(screen.getByText('Error 1')).toBeInTheDocument()
    expect(screen.getByText('Error 5')).toBeInTheDocument()
    
    // Should show "and X more" message
    expect(screen.getByText('... and 2 more error types')).toBeInTheDocument()
  })

  it('should handle zero total requests gracefully', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={0} />)
    
    // Should show 0.0% for all percentages
    const percentages = screen.getAllByText('0.0%')
    expect(percentages.length).toBeGreaterThan(0)
  })
})