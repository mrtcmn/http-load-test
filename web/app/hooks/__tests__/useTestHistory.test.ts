import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTestHistory, generateTestResultId, createMockTestResult } from '../useTestHistory'
import { TestResult } from '../../components/ExportControls'

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
})

const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
  id: 'test-123',
  timestamp: Date.now(),
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
    statusCodes: { 200: 950, 404: 30, 500: 20 },
    errors: { 'Connection timeout': 25 },
    responseTimes: {
      histogram: [{ bucket: '0-100ms', count: 300 }]
    }
  },
  ...overrides
})

describe('useTestHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with empty history', () => {
    const { result } = renderHook(() => useTestHistory())
    
    expect(result.current.history).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('loads history from localStorage on mount', () => {
    const storedHistory = [createTestResult({ id: 'stored-test' })]
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedHistory))
    
    const { result } = renderHook(() => useTestHistory())
    
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('http-load-test-history')
    expect(result.current.history).toEqual(storedHistory)
  })

  it('handles invalid localStorage data gracefully', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLocalStorage.getItem.mockReturnValue('invalid json')
    
    const { result } = renderHook(() => useTestHistory())
    
    expect(result.current.history).toEqual([])
    expect(result.current.error).toBe('Failed to load test history')
    expect(consoleErrorSpy).toHaveBeenCalled()
    
    consoleErrorSpy.mockRestore()
  })

  it('filters out invalid test results from localStorage', () => {
    const validResult = createTestResult({ id: 'valid' })
    const invalidResult = { id: 'invalid', incomplete: true }
    const storedData = [validResult, invalidResult]
    
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData))
    
    const { result } = renderHook(() => useTestHistory())
    
    expect(result.current.history).toEqual([validResult])
  })

  it('adds new test result', () => {
    const { result } = renderHook(() => useTestHistory())
    const newResult = createTestResult({ id: 'new-test' })
    
    act(() => {
      result.current.addResult(newResult)
    })
    
    expect(result.current.history).toContain(newResult)
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'http-load-test-history',
      JSON.stringify([newResult])
    )
  })

  it('replaces existing result with same ID', () => {
    const { result } = renderHook(() => useTestHistory())
    const originalResult = createTestResult({ id: 'same-id', timestamp: 1000 })
    const updatedResult = createTestResult({ id: 'same-id', timestamp: 2000 })
    
    act(() => {
      result.current.addResult(originalResult)
    })
    
    act(() => {
      result.current.addResult(updatedResult)
    })
    
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0]).toEqual(updatedResult)
  })

  it('limits history to maximum items', () => {
    const { result } = renderHook(() => useTestHistory())
    
    // Add 52 results (more than the 50 limit)
    act(() => {
      for (let i = 0; i < 52; i++) {
        result.current.addResult(createTestResult({ id: `test-${i}` }))
      }
    })
    
    expect(result.current.history).toHaveLength(50)
    // Should keep the most recent ones
    expect(result.current.history[0].id).toBe('test-51')
    expect(result.current.history[49].id).toBe('test-2')
  })

  it('rejects invalid test results', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useTestHistory())
    const invalidResult = { id: 'invalid' } as any
    
    act(() => {
      result.current.addResult(invalidResult)
    })
    
    expect(result.current.history).toHaveLength(0)
    expect(result.current.error).toBe('Invalid test result format')
    expect(consoleErrorSpy).toHaveBeenCalled()
    
    consoleErrorSpy.mockRestore()
  })

  it('removes test result by ID', () => {
    const { result } = renderHook(() => useTestHistory())
    const result1 = createTestResult({ id: 'test-1' })
    const result2 = createTestResult({ id: 'test-2' })
    
    act(() => {
      result.current.addResult(result1)
      result.current.addResult(result2)
    })
    
    act(() => {
      result.current.removeResult('test-1')
    })
    
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].id).toBe('test-2')
  })

  it('clears all history', () => {
    const { result } = renderHook(() => useTestHistory())
    const testResult = createTestResult()
    
    act(() => {
      result.current.addResult(testResult)
    })
    
    act(() => {
      result.current.clearHistory()
    })
    
    expect(result.current.history).toHaveLength(0)
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('http-load-test-history')
  })

  it('gets result by ID', () => {
    const { result } = renderHook(() => useTestHistory())
    const testResult = createTestResult({ id: 'find-me' })
    
    act(() => {
      result.current.addResult(testResult)
    })
    
    const found = result.current.getResult('find-me')
    expect(found).toEqual(testResult)
    
    const notFound = result.current.getResult('not-found')
    expect(notFound).toBeUndefined()
  })

  it('handles localStorage save errors', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLocalStorage.setItem.mockImplementation(() => {
      throw new Error('Storage full')
    })
    
    const { result } = renderHook(() => useTestHistory())
    const testResult = createTestResult()
    
    act(() => {
      result.current.addResult(testResult)
    })
    
    expect(result.current.error).toBe('Failed to save test history')
    expect(consoleErrorSpy).toHaveBeenCalled()
    
    consoleErrorSpy.mockRestore()
  })

  it('handles localStorage clear errors', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLocalStorage.removeItem.mockImplementation(() => {
      throw new Error('Clear failed')
    })
    
    const { result } = renderHook(() => useTestHistory())
    
    act(() => {
      result.current.clearHistory()
    })
    
    expect(result.current.error).toBe('Failed to clear test history')
    expect(consoleErrorSpy).toHaveBeenCalled()
    
    consoleErrorSpy.mockRestore()
  })
})

describe('generateTestResultId', () => {
  it('generates ID from config and timestamp', () => {
    const config = {
      url: 'https://api.example.com/test',
      method: 'POST',
      totalRequests: 100,
      requestsPerSecond: 10,
      concurrentRequests: 5
    }
    const timestamp = 1640995200000
    
    const id = generateTestResultId(config, timestamp)
    
    expect(id).toBe('apiexamplecom-post-1640995200000')
  })

  it('sanitizes hostname in ID', () => {
    const config = {
      url: 'https://api-test.example-site.com:8080/path',
      method: 'GET',
      totalRequests: 100,
      requestsPerSecond: 10,
      concurrentRequests: 5
    }
    
    const id = generateTestResultId(config)
    
    expect(id).toContain('apitestexamplesitecom')
    expect(id).not.toContain('-')
    expect(id).not.toContain(':')
  })

  it('uses current timestamp when not provided', () => {
    const config = {
      url: 'https://api.example.com',
      method: 'GET',
      totalRequests: 100,
      requestsPerSecond: 10,
      concurrentRequests: 5
    }
    
    const before = Date.now()
    const id = generateTestResultId(config)
    const after = Date.now()
    
    const timestamp = parseInt(id.split('-').pop()!)
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })
})

describe('createMockTestResult', () => {
  it('creates valid mock test result', () => {
    const mock = createMockTestResult()
    
    expect(mock.id).toBeDefined()
    expect(mock.timestamp).toBeDefined()
    expect(mock.config).toBeDefined()
    expect(mock.metrics).toBeDefined()
    expect(mock.config.url).toBe('https://api.example.com/test')
    expect(mock.metrics.totalRequests).toBe(1000)
  })

  it('applies overrides', () => {
    const overrides = {
      config: { url: 'https://custom.com' },
      metrics: { totalRequests: 500 }
    }
    
    const mock = createMockTestResult(overrides)
    
    expect(mock.config.url).toBe('https://custom.com')
    expect(mock.metrics.totalRequests).toBe(500)
    // Should preserve other default values
    expect(mock.config.method).toBe('GET')
  })
})