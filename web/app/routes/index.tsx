import { createFileRoute } from '@tanstack/react-router'
import { MetricsDashboard, type TestResults } from '@/components/MetricsDashboard'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

// Mock data for demonstration - in real implementation this would come from WebSocket or API
const mockTestResults: TestResults = {
  totalRequests: 1500,
  successfulRequests: 1425,
  failedRequests: 75,
  duration: 45000,
  requestsPerSecond: 33.3,
  percentiles: {
    p50: 125,
    p95: 450,
    p99: 750,
    min: 45,
    max: 1100,
    avg: 180
  },
  statusCodes: {
    200: 1350,
    201: 75,
    404: 45,
    500: 30
  },
  errors: {
    'Connection timeout': 25,
    'DNS resolution failed': 20,
    'Connection refused': 15,
    'SSL handshake failed': 10,
    'Request timeout': 5
  },
  responseTimes: []
}

function HomeComponent() {
  // In a real implementation, you would manage test state here
  // const [isTestRunning, setIsTestRunning] = useState(false)
  // const [testResults, setTestResults] = useState<TestResults | undefined>()
  
  return (
    <MetricsDashboard 
      isTestRunning={false}
      testResults={mockTestResults}
    />
  )
}