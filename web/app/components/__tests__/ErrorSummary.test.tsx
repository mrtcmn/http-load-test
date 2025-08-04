import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorSummary } from '../ErrorSummary'

const mockStatusCodes = {
  200: 850,
  201: 100,
  404: 30,
  500: 20
}

const mockErrors = {
  'Connection timeout': 25,
  'DNS resolution failed': 15,
  'Connection refused': 10,
  'SSL handshake failed': 5,
  'Request timeout': 3
}

describe('ErrorSummary', () => {
  it('renders component title', () => {
    render(<ErrorSummary totalRequests={0} />)
    expect(screen.getByText('Error Analysis')).toBeInTheDocument()
    expect(screen.getByText('HTTP status codes and error categorization')).toBeInTheDocument()
  })

  it('shows no data message when no status codes provided', () => {
    render(<ErrorSummary totalRequests={0} />)
    expect(screen.getByText('No data available')).toBeInTheDocument()
    expect(screen.getByText('Start a test to see error analysis')).toBeInTheDocument()
  })

  it('displays summary stats correctly', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={1000} />)
    
    // Success count (200 + 201 = 950)
    expect(screen.getByText('950')).toBeInTheDocument()
    
    // Error count (404 + 500 = 50)
    expect(screen.getByText('50')).toBeInTheDocument()
    
    // Redirect count (should be 0 in this case)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('categorizes status codes correctly', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={1000} />)
    
    // Check that status codes are displayed with counts
    expect(screen.getByText('200 (850)')).toBeInTheDocument()
    expect(screen.getByText('201 (100)')).toBeInTheDocument()
    expect(screen.getByText('404 (30)')).toBeInTheDocument()
    expect(screen.getByText('500 (20)')).toBeInTheDocument()
  })

  it('calculates percentages correctly', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={1000} />)
    
    // 850/1000 = 85.0%
    expect(screen.getByText('85.0%')).toBeInTheDocument()
    // 100/1000 = 10.0%
    expect(screen.getByText('10.0%')).toBeInTheDocument()
    // 30/1000 = 3.0%
    expect(screen.getByText('3.0%')).toBeInTheDocument()
    // 20/1000 = 2.0%
    expect(screen.getByText('2.0%')).toBeInTheDocument()
  })

  it('displays error messages when provided', () => {
    render(<ErrorSummary 
      statusCodes={mockStatusCodes} 
      errors={mockErrors}
      totalRequests={1000} 
    />)
    
    expect(screen.getByText('Top Error Messages')).toBeInTheDocument()
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
    expect(screen.getByText('DNS resolution failed')).toBeInTheDocument()
    expect(screen.getByText('Connection refused')).toBeInTheDocument()
  })

  it('limits error messages to top 5', () => {
    const manyErrors = {
      'Error 1': 100,
      'Error 2': 90,
      'Error 3': 80,
      'Error 4': 70,
      'Error 5': 60,
      'Error 6': 50,
      'Error 7': 40
    }
    
    render(<ErrorSummary 
      statusCodes={mockStatusCodes} 
      errors={manyErrors}
      totalRequests={1000} 
    />)
    
    // Should show top 5 errors
    expect(screen.getByText('Error 1')).toBeInTheDocument()
    expect(screen.getByText('Error 2')).toBeInTheDocument()
    expect(screen.getByText('Error 3')).toBeInTheDocument()
    expect(screen.getByText('Error 4')).toBeInTheDocument()
    expect(screen.getByText('Error 5')).toBeInTheDocument()
    
    // Should not show 6th and 7th errors
    expect(screen.queryByText('Error 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Error 7')).not.toBeInTheDocument()
  })

  it('handles redirect status codes', () => {
    const statusCodesWithRedirects = {
      200: 800,
      301: 100,
      302: 50,
      404: 30,
      500: 20
    }
    
    render(<ErrorSummary 
      statusCodes={statusCodesWithRedirects} 
      totalRequests={1000} 
    />)
    
    // Redirect count (301 + 302 = 150)
    expect(screen.getByText('150')).toBeInTheDocument()
  })

  it('sorts status codes by count descending', () => {
    render(<ErrorSummary statusCodes={mockStatusCodes} totalRequests={1000} />)
    
    const statusElements = screen.getAllByText(/\d{3} \(\d+\)/)
    
    // Should be sorted: 200 (850), 201 (100), 404 (30), 500 (20)
    expect(statusElements[0]).toHaveTextContent('200 (850)')
    expect(statusElements[1]).toHaveTextContent('201 (100)')
    expect(statusElements[2]).toHaveTextContent('404 (30)')
    expect(statusElements[3]).toHaveTextContent('500 (20)')
  })
})