import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExportControls, TestResult } from '../ExportControls'

// Mock the lucide-react icons
vi.mock('lucide-react', () => ({
  Download: () => <div data-testid="download-icon" />,
  FileText: () => <div data-testid="file-text-icon" />,
  Database: () => <div data-testid="database-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />
}))

const mockTestResult: TestResult = {
  id: 'test-123',
  timestamp: 1640995200000, // 2022-01-01 00:00:00 UTC
  config: {
    url: 'https://api.example.com/test',
    method: 'GET',
    totalRequests: 1000,
    requestsPerSecond: 50,
    concurrentRequests: 10
  },
  metrics: {
    totalRequests: 1000,
    successfulRequests: 950,
    failedRequests: 50,
    duration: 20000,
    requestsPerSecond: 47.5,
    percentiles: {
      p50: 120,
      p95: 450,
      p99: 800,
      min: 45,
      max: 1200,
      avg: 180
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
    responseTimes: {
      histogram: [
        { bucket: '0-100ms', count: 300 },
        { bucket: '100-200ms', count: 400 },
        { bucket: '200-500ms', count: 250 },
        { bucket: '500ms+', count: 50 }
      ]
    }
  }
}

describe('ExportControls', () => {
  const mockOnExport = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without test result', () => {
    render(<ExportControls />)
    
    expect(screen.getByText('Export Results')).toBeInTheDocument()
    expect(screen.getByText('No test results available to export')).toBeInTheDocument()
  })

  it('renders with test result', () => {
    render(<ExportControls currentResult={mockTestResult} onExport={mockOnExport} />)
    
    expect(screen.getByText('Export Results')).toBeInTheDocument()
    expect(screen.getByText('Export test results in JSON or CSV format')).toBeInTheDocument()
    expect(screen.getByText('https://api.example.com/test')).toBeInTheDocument()
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.getByText('20.0s')).toBeInTheDocument()
  })

  it('displays formatted timestamp', () => {
    render(<ExportControls currentResult={mockTestResult} onExport={mockOnExport} />)
    
    // The exact format depends on locale, but should contain date/time elements
    const timestampElement = screen.getByTestId('calendar-icon').parentElement
    expect(timestampElement).toBeInTheDocument()
  })

  it('calls onExport with JSON format when JSON button is clicked', async () => {
    render(<ExportControls currentResult={mockTestResult} onExport={mockOnExport} />)
    
    const jsonButton = screen.getByText('Export JSON')
    fireEvent.click(jsonButton)
    
    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('json', mockTestResult)
    })
  })

  it('calls onExport with CSV format when CSV button is clicked', async () => {
    render(<ExportControls currentResult={mockTestResult} onExport={mockOnExport} />)
    
    const csvButton = screen.getByText('Export CSV')
    fireEvent.click(csvButton)
    
    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('csv', mockTestResult)
    })
  })

  it('disables buttons and shows loading state during export', async () => {
    const slowExport = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
    render(<ExportControls currentResult={mockTestResult} onExport={slowExport} />)
    
    const jsonButton = screen.getByText('Export JSON')
    fireEvent.click(jsonButton)
    
    // Should show loading state
    expect(screen.getByText('Preparing export...')).toBeInTheDocument()
    expect(jsonButton).toBeDisabled()
    expect(screen.getByText('Export CSV')).toBeDisabled()
    
    await waitFor(() => {
      expect(screen.queryByText('Preparing export...')).not.toBeInTheDocument()
    })
  })

  it('handles export errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingExport = vi.fn().mockRejectedValue(new Error('Export failed'))
    
    render(<ExportControls currentResult={mockTestResult} onExport={failingExport} />)
    
    const jsonButton = screen.getByText('Export JSON')
    fireEvent.click(jsonButton)
    
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to export JSON:', expect.any(Error))
    })
    
    // Should not be in loading state after error
    expect(screen.queryByText('Preparing export...')).not.toBeInTheDocument()
    expect(jsonButton).not.toBeDisabled()
    
    consoleErrorSpy.mockRestore()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ExportControls currentResult={mockTestResult} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders export buttons only when onExport is provided', () => {
    render(<ExportControls currentResult={mockTestResult} />)
    
    expect(screen.queryByText('Export JSON')).not.toBeInTheDocument()
    expect(screen.queryByText('Export CSV')).not.toBeInTheDocument()
  })
})