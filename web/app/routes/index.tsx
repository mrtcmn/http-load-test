import { createFileRoute } from '@tanstack/react-router'
import { MetricsDashboard } from '../components/MetricsDashboard'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  // Mock data for demonstration
  const mockMetrics = {
    totalRequests: 1000,
    successfulRequests: 950,
    failedRequests: 50,
    duration: 30000, // 30 seconds
    requestsPerSecond: 33.3,
    percentiles: {
      p50: 120,
      p95: 450,
      p99: 800,
      min: 45,
      max: 1200,
      avg: 180,
    },
    statusCodes: {
      200: 950,
      404: 30,
      500: 20,
    },
    errors: {
      'Connection timeout': 25,
      'DNS resolution failed': 15,
      'Connection refused': 10,
    },
    responseTimes: {
      histogram: [
        { bucket: '0-100ms', count: 300 },
        { bucket: '100-200ms', count: 400 },
        { bucket: '200-500ms', count: 250 },
        { bucket: '500ms+', count: 50 },
      ],
    },
  }

  const mockTestConfig = {
    url: 'https://api.example.com/test',
    method: 'GET',
    totalRequests: 1000,
    requestsPerSecond: 50,
    concurrentRequests: 10,
  }

  return (
    <MetricsDashboard 
      metrics={mockMetrics} 
      isRunning={false} 
      testConfig={mockTestConfig}
    />
  )
}