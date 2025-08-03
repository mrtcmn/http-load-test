import { TestResult } from '../components/ExportControls'

export interface ExportOptions {
  filename?: string
  includeConfig?: boolean
  includeRawData?: boolean
}

/**
 * Converts test result data to CSV format
 */
export function convertToCSV(result: TestResult, options: ExportOptions = {}): string {
  const { includeConfig = true, includeRawData = true } = options
  
  const lines: string[] = []
  
  // Header information
  lines.push('# HTTP Load Test Results')
  lines.push(`# Generated: ${new Date(result.timestamp).toISOString()}`)
  lines.push(`# Test ID: ${result.id}`)
  lines.push('')
  
  if (includeConfig) {
    // Configuration section
    lines.push('## Test Configuration')
    lines.push('Parameter,Value')
    lines.push(`URL,"${result.config.url}"`)
    lines.push(`Method,${result.config.method}`)
    lines.push(`Total Requests,${result.config.totalRequests}`)
    lines.push(`Requests Per Second,${result.config.requestsPerSecond}`)
    lines.push(`Concurrent Requests,${result.config.concurrentRequests}`)
    lines.push('')
  }
  
  // Summary metrics
  lines.push('## Summary Metrics')
  lines.push('Metric,Value')
  lines.push(`Total Requests,${result.metrics.totalRequests}`)
  lines.push(`Successful Requests,${result.metrics.successfulRequests}`)
  lines.push(`Failed Requests,${result.metrics.failedRequests}`)
  lines.push(`Success Rate,${((result.metrics.successfulRequests / result.metrics.totalRequests) * 100).toFixed(2)}%`)
  lines.push(`Duration (ms),${result.metrics.duration}`)
  lines.push(`Requests Per Second,${result.metrics.requestsPerSecond.toFixed(2)}`)
  lines.push('')
  
  // Percentile metrics
  lines.push('## Response Time Percentiles (ms)')
  lines.push('Percentile,Value')
  lines.push(`P50,${result.metrics.percentiles.p50}`)
  lines.push(`P95,${result.metrics.percentiles.p95}`)
  lines.push(`P99,${result.metrics.percentiles.p99}`)
  lines.push(`Min,${result.metrics.percentiles.min}`)
  lines.push(`Max,${result.metrics.percentiles.max}`)
  lines.push(`Average,${result.metrics.percentiles.avg}`)
  lines.push('')
  
  // Status codes
  lines.push('## HTTP Status Codes')
  lines.push('Status Code,Count,Percentage')
  Object.entries(result.metrics.statusCodes).forEach(([code, count]) => {
    const percentage = ((count / result.metrics.totalRequests) * 100).toFixed(2)
    lines.push(`${code},${count},${percentage}%`)
  })
  lines.push('')
  
  // Errors
  if (Object.keys(result.metrics.errors).length > 0) {
    lines.push('## Errors')
    lines.push('Error Type,Count,Percentage')
    Object.entries(result.metrics.errors).forEach(([error, count]) => {
      const percentage = ((count / result.metrics.totalRequests) * 100).toFixed(2)
      lines.push(`"${error}",${count},${percentage}%`)
    })
    lines.push('')
  }
  
  if (includeRawData) {
    // Response time histogram
    lines.push('## Response Time Distribution')
    lines.push('Bucket,Count')
    result.metrics.responseTimes.histogram.forEach(({ bucket, count }) => {
      lines.push(`"${bucket}",${count}`)
    })
  }
  
  return lines.join('\n')
}

/**
 * Converts test result data to JSON format
 */
export function convertToJSON(result: TestResult, options: ExportOptions = {}): string {
  const { includeConfig = true, includeRawData = true } = options
  
  const exportData: any = {
    exportInfo: {
      generatedAt: new Date().toISOString(),
      testId: result.id,
      testTimestamp: new Date(result.timestamp).toISOString(),
      version: '1.0.0'
    }
  }
  
  if (includeConfig) {
    exportData.configuration = result.config
  }
  
  exportData.metrics = {
    summary: {
      totalRequests: result.metrics.totalRequests,
      successfulRequests: result.metrics.successfulRequests,
      failedRequests: result.metrics.failedRequests,
      successRate: (result.metrics.successfulRequests / result.metrics.totalRequests) * 100,
      duration: result.metrics.duration,
      requestsPerSecond: result.metrics.requestsPerSecond
    },
    percentiles: result.metrics.percentiles,
    statusCodes: result.metrics.statusCodes,
    errors: result.metrics.errors
  }
  
  if (includeRawData) {
    exportData.metrics.responseTimes = result.metrics.responseTimes
  }
  
  return JSON.stringify(exportData, null, 2)
}

/**
 * Downloads data as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  // Clean up the URL object
  URL.revokeObjectURL(url)
}

/**
 * Generates a filename for export based on test result
 */
export function generateFilename(result: TestResult, format: 'json' | 'csv'): string {
  const timestamp = new Date(result.timestamp).toISOString().replace(/[:.]/g, '-')
  const url = new URL(result.config.url)
  const hostname = url.hostname.replace(/[^a-zA-Z0-9]/g, '-')
  
  return `load-test-${hostname}-${timestamp}.${format}`
}

/**
 * Main export function that handles the complete export process
 */
export async function exportTestResult(
  result: TestResult, 
  format: 'json' | 'csv',
  options: ExportOptions = {}
): Promise<void> {
  try {
    let content: string
    let mimeType: string
    
    if (format === 'json') {
      content = convertToJSON(result, options)
      mimeType = 'application/json'
    } else {
      content = convertToCSV(result, options)
      mimeType = 'text/csv'
    }
    
    const filename = options.filename || generateFilename(result, format)
    downloadFile(content, filename, mimeType)
  } catch (error) {
    console.error(`Failed to export ${format.toUpperCase()}:`, error)
    throw new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}