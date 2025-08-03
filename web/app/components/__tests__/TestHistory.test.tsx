import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TestHistory } from '../TestHistory'
import { TestResult } from '../ExportControls'

// Mock the lucide-react icons
vi.mock('lucide-react', () => ({
  History: () => <div data-testid="history-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  TrendingDown: () => <div data-testid="trending-down-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
  Eye: () => <div data-testid="eye-icon" />,
  Trash2: () => <div data-testid="trash-icon" />
}))

const createMockResult = (overrides: Partial<TestResult> = {}): TestResult => ({
  id: `test-${Date.now()}`,
  timestamp: Date.now(),
  config: {
    url: 'https://api.example.com/test',
    method: 'GET',
    totalRequests: 1000,
    requestsPerSecond: 50,
    concurrentRequests: 10,
    ...overrides.config
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
    statusCodes: { 200: 950, 404: 30, 500: 20 },
    errors: { 'Connection timeout': 25 },
    responseTimes: {
      histogram: [{ bucket: '0-100ms', count: 300 }]
    },
    ...overrides.metrics
  },
  ...overrides
})

describe('TestHistory', () => {
  const mockOnCompare = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnView = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no history', () => {
    render(<TestHistory history={[]} />)
    
    expect(screen.getByText('Test History')).toBeInTheDocument()
    expect(screen.getByText('No previous test results available')).toBeInTheDocument()
  })

  it('renders history items', () => {
    const history = [
      createMockResult({ id: 'test-1', config: { url: 'https://api1.com' } }),
      createMockResult({ id: 'test-2', config: { url: 'https://api2.com' } })
    ]
    
    render(<TestHistory history={history} />)
    
    expect(screen.getByText('https://api1.com')).toBeInTheDocument()
    expect(screen.getByText('https://api2.com')).toBeInTheDocument()
    expect(screen.getAllByText('GET')).toHaveLength(2)
  })

  it('sorts history by timestamp (newest first)', () => {
    const older = createMockResult({ 
      id: 'older', 
      timestamp: 1000,
      config: { url: 'https://older.com' }
    })
    const newer = createMockResult({ 
      id: 'newer', 
      timestamp: 2000,
      config: { url: 'https://newer.com' }
    })
    
    render(<TestHistory history={[older, newer]} />)
    
    const urls = screen.getAllByText(/https:\/\//)
    expect(urls[0]).toHaveTextContent('https://newer.com')
    expect(urls[1]).toHaveTextContent('https://older.com')
  })

  it('allows selecting results for comparison', () => {
    const history = [
      createMockResult({ id: 'test-1' }),
      createMockResult({ id: 'test-2' })
    ]
    
    render(<TestHistory history={history} />)
    
    const firstResult = screen.getAllByRole('generic')[0] // First result container
    fireEvent.click(firstResult)
    
    expect(screen.getByText('1 result selected')).toBeInTheDocument()
  })

  it('shows compare button when 2 results selected', () => {
    const history = [
      createMockResult({ id: 'test-1' }),
      createMockResult({ id: 'test-2' })
    ]
    
    render(<TestHistory history={history} onCompare={mockOnCompare} />)
    
    // Click first result
    const results = screen.getAllByText('https://api.example.com/test')
    fireEvent.click(results[0].closest('[role="generic"]') || results[0])
    
    expect(screen.getByText('1 result selected')).toBeInTheDocument()
    
    // Click second result
    fireEvent.click(results[1].closest('[role="generic"]') || results[1])
    
    expect(screen.getByText('2 results selected')).toBeInTheDocument()
    expect(screen.getByText('Compare Results')).toBeInTheDocument()
  })

  it('calls onCompare when compare button clicked', () => {
    const history = [
      createMockResult({ id: 'test-1' }),
      createMockResult({ id: 'test-2' })
    ]
    
    render(<TestHistory history={history} onCompare={mockOnCompare} />)
    
    // Select both results
    const results = screen.getAllByText('https://api.example.com/test')
    fireEvent.click(results[0].closest('[role="generic"]') || results[0])
    fireEvent.click(results[1].closest('[role="generic"]') || results[1])
    
    // Click compare
    fireEvent.click(screen.getByText('Compare Results'))
    
    expect(mockOnCompare).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'test-1' }),
      expect.objectContaining({ id: 'test-2' })
    ]))
  })

  it('shows comparison view after comparing', () => {
    const newer = createMockResult({ 
      id: 'newer', 
      timestamp: 2000,
      metrics: { 
        ...createMockResult().metrics,
        totalRequests: 1200,
        requestsPerSecond: 60
      }
    })
    const older = createMockResult({ 
      id: 'older', 
      timestamp: 1000,
      metrics: {
        ...createMockResult().metrics,
        totalRequests: 1000,
        requestsPerSecond: 50
      }
    })
    
    render(<TestHistory history={[newer, older]} onCompare={mockOnCompare} />)
    
    // Select both results
    const results = screen.getAllByText('https://api.example.com/test')
    fireEvent.click(results[0].closest('[role="generic"]') || results[0])
    fireEvent.click(results[1].closest('[role="generic"]') || results[1])
    
    // Click compare
    fireEvent.click(screen.getByText('Compare Results'))
    
    expect(screen.getByText('Test Comparison')).toBeInTheDocument()
    expect(screen.getByText('Newer Test')).toBeInTheDocument()
    expect(screen.getByText('Older Test')).toBeInTheDocument()
  })

  it('calls onDelete when delete button clicked', () => {
    const history = [createMockResult({ id: 'test-1' })]
    
    render(<TestHistory history={history} onDelete={mockOnDelete} />)
    
    const deleteButton = screen.getByTestId('trash-icon').closest('button')
    fireEvent.click(deleteButton!)
    
    expect(mockOnDelete).toHaveBeenCalledWith('test-1')
  })

  it('calls onView when view button clicked', () => {
    const history = [createMockResult({ id: 'test-1' })]
    
    render(<TestHistory history={history} onView={mockOnView} />)
    
    const viewButton = screen.getByTestId('eye-icon').closest('button')
    fireEvent.click(viewButton!)
    
    expect(mockOnView).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-1' }))
  })

  it('prevents event propagation on action buttons', () => {
    const history = [createMockResult({ id: 'test-1' })]
    
    render(<TestHistory history={history} onDelete={mockOnDelete} onView={mockOnView} />)
    
    const deleteButton = screen.getByTestId('trash-icon').closest('button')
    const viewButton = screen.getByTestId('eye-icon').closest('button')
    
    // Click buttons should not select the result
    fireEvent.click(deleteButton!)
    fireEvent.click(viewButton!)
    
    expect(screen.queryByText('1 result selected')).not.toBeInTheDocument()
  })

  it('clears selection when clear button clicked', () => {
    const history = [createMockResult({ id: 'test-1' })]
    
    render(<TestHistory history={history} />)
    
    // Select a result
    const result = screen.getByText('https://api.example.com/test')
    fireEvent.click(result.closest('[role="generic"]') || result)
    
    expect(screen.getByText('1 result selected')).toBeInTheDocument()
    
    // Clear selection
    fireEvent.click(screen.getByText('Clear Selection'))
    
    expect(screen.queryByText('1 result selected')).not.toBeInTheDocument()
  })

  it('limits selection to 2 results maximum', () => {
    const history = [
      createMockResult({ id: 'test-1' }),
      createMockResult({ id: 'test-2' }),
      createMockResult({ id: 'test-3' })
    ]
    
    render(<TestHistory history={history} />)
    
    const results = screen.getAllByText('https://api.example.com/test')
    
    // Select first two results
    fireEvent.click(results[0].closest('[role="generic"]') || results[0])
    fireEvent.click(results[1].closest('[role="generic"]') || results[1])
    
    expect(screen.getByText('2 results selected')).toBeInTheDocument()
    
    // Try to select third result - should not work
    fireEvent.click(results[2].closest('[role="generic"]') || results[2])
    
    expect(screen.getByText('2 results selected')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <TestHistory history={[]} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })
})