import { useState, useEffect, useCallback } from 'react'
import { TestResult } from '../components/ExportControls'

const STORAGE_KEY = 'http-load-test-history'
const MAX_HISTORY_ITEMS = 50

export interface UseTestHistoryReturn {
  history: TestResult[]
  addResult: (result: TestResult) => void
  removeResult: (id: string) => void
  clearHistory: () => void
  getResult: (id: string) => TestResult | undefined
  isLoading: boolean
  error: string | null
}

/**
 * Hook for managing test result history with local storage persistence
 */
export function useTestHistory(): UseTestHistoryReturn {
  const [history, setHistory] = useState<TestResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as TestResult[]
        // Validate the structure and filter out invalid entries
        const validResults = parsed.filter(isValidTestResult)
        setHistory(validResults)
      }
    } catch (err) {
      console.error('Failed to load test history from localStorage:', err)
      setError('Failed to load test history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
        setError(null)
      } catch (err) {
        console.error('Failed to save test history to localStorage:', err)
        setError('Failed to save test history')
      }
    }
  }, [history, isLoading])

  const addResult = useCallback((result: TestResult) => {
    if (!isValidTestResult(result)) {
      console.error('Invalid test result provided to addResult:', result)
      setError('Invalid test result format')
      return
    }

    setHistory(prev => {
      // Remove any existing result with the same ID
      const filtered = prev.filter(r => r.id !== result.id)
      
      // Add the new result at the beginning
      const updated = [result, ...filtered]
      
      // Keep only the most recent results
      return updated.slice(0, MAX_HISTORY_ITEMS)
    })
  }, [])

  const removeResult = useCallback((id: string) => {
    setHistory(prev => prev.filter(r => r.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    try {
      localStorage.removeItem(STORAGE_KEY)
      setError(null)
    } catch (err) {
      console.error('Failed to clear test history from localStorage:', err)
      setError('Failed to clear test history')
    }
  }, [])

  const getResult = useCallback((id: string): TestResult | undefined => {
    return history.find(r => r.id === id)
  }, [history])

  return {
    history,
    addResult,
    removeResult,
    clearHistory,
    getResult,
    isLoading,
    error
  }
}

/**
 * Validates that a test result has the required structure
 */
function isValidTestResult(result: any): result is TestResult {
  if (!result || typeof result !== 'object') return false
  
  // Check required top-level properties
  if (!result.id || !result.timestamp || !result.config || !result.metrics) {
    return false
  }

  // Check config structure
  const config = result.config
  if (!config.url || !config.method || 
      typeof config.totalRequests !== 'number' ||
      typeof config.requestsPerSecond !== 'number' ||
      typeof config.concurrentRequests !== 'number') {
    return false
  }

  // Check metrics structure
  const metrics = result.metrics
  if (typeof metrics.totalRequests !== 'number' ||
      typeof metrics.successfulRequests !== 'number' ||
      typeof metrics.failedRequests !== 'number' ||
      typeof metrics.duration !== 'number' ||
      typeof metrics.requestsPerSecond !== 'number') {
    return false
  }

  // Check percentiles structure
  const percentiles = metrics.percentiles
  if (!percentiles || 
      typeof percentiles.p50 !== 'number' ||
      typeof percentiles.p95 !== 'number' ||
      typeof percentiles.p99 !== 'number' ||
      typeof percentiles.min !== 'number' ||
      typeof percentiles.max !== 'number' ||
      typeof percentiles.avg !== 'number') {
    return false
  }

  // Check that statusCodes and errors are objects
  if (!metrics.statusCodes || typeof metrics.statusCodes !== 'object' ||
      !metrics.errors || typeof metrics.errors !== 'object') {
    return false
  }

  // Check responseTimes structure
  if (!metrics.responseTimes || !Array.isArray(metrics.responseTimes.histogram)) {
    return false
  }

  return true
}

/**
 * Creates a test result ID based on timestamp and configuration
 */
export function generateTestResultId(config: TestResult['config'], timestamp: number = Date.now()): string {
  const url = new URL(config.url)
  const hostname = url.hostname.replace(/[^a-zA-Z0-9]/g, '')
  return `${hostname}-${config.method.toLowerCase()}-${timestamp}`
}

/**
 * Creates a mock test result for testing purposes
 */
export function createMockTestResult(overrides: Partial<TestResult> = {}): TestResult {
  const timestamp = Date.now()
  const config = {
    url: 'https://api.example.com/test',
    method: 'GET',
    totalRequests: 1000,
    requestsPerSecond: 50,
    concurrentRequests: 10,
    ...overrides.config
  }

  return {
    id: generateTestResultId(config, timestamp),
    timestamp,
    config,
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
    },
    ...overrides
  }
}