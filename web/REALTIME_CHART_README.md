# Real-time Chart Components

This document describes the implementation of real-time chart components for the HTTP load testing dashboard.

## Overview

The real-time chart system consists of three main components:

1. **useWebSocket Hook** - Manages WebSocket connections with automatic reconnection
2. **useRealtimeMetrics Hook** - Processes and manages real-time metrics data
3. **RealtimeChart Component** - Renders interactive charts with live data updates

## Components

### useWebSocket Hook

A robust WebSocket hook that handles connection management, automatic reconnection, and message processing.

**Features:**
- Automatic connection management
- Configurable reconnection attempts and intervals
- Message throttling and error handling
- Connection state tracking
- Manual connect/disconnect controls

**Usage:**
```typescript
const {
  isConnected,
  isConnecting,
  error,
  connect,
  disconnect,
  sendMessage,
  lastMessage,
  connectionAttempts
} = useWebSocket({
  url: 'ws://localhost:8080/ws/metrics',
  onMessage: (message) => console.log('Received:', message),
  onConnect: () => console.log('Connected'),
  onDisconnect: () => console.log('Disconnected'),
  reconnectAttempts: 5,
  reconnectInterval: 3000,
  autoConnect: true
})
```

### useRealtimeMetrics Hook

Processes WebSocket messages specifically for metrics data and maintains a rolling history.

**Features:**
- Metrics data processing and validation
- Rolling history with configurable max points
- Update throttling to prevent UI overload
- Automatic data cleanup on disconnect

**Usage:**
```typescript
const {
  currentMetrics,
  metricsHistory,
  isConnected,
  clearHistory
} = useRealtimeMetrics({
  wsUrl: 'ws://localhost:8080/ws/metrics',
  maxHistoryPoints: 100,
  updateInterval: 1000
})
```

### RealtimeChart Component

A comprehensive chart component that displays real-time metrics with multiple data series.

**Features:**
- Multi-series line chart with dual Y-axes
- Real-time data updates
- Interactive tooltips and legends
- Connection status indicators
- Manual controls (connect, disconnect, clear)
- Error handling and retry mechanisms
- Reference lines for thresholds
- Responsive design

**Usage:**
```tsx
<RealtimeChart 
  wsUrl="ws://localhost:8080/ws/metrics"
  maxHistoryPoints={100}
  updateInterval={1000}
  showLegend={true}
  height={400}
/>
```

## Data Format

The WebSocket server should send messages in the following format:

```json
{
  "type": "metrics",
  "timestamp": 1640995200000,
  "data": {
    "totalRequests": 1000,
    "successfulRequests": 950,
    "failedRequests": 50,
    "requestsPerSecond": 33.3,
    "avgResponseTime": 250,
    "currentResponseTime": 300,
    "errorRate": 5.0,
    "activeConnections": 8
  }
}
```

## Chart Metrics

The chart displays four key metrics:

1. **Response Time** (Left Y-axis, Blue line)
   - Average response time in milliseconds
   - Primary performance indicator

2. **Requests/Second** (Right Y-axis, Green line)
   - Current throughput rate
   - Shows load capacity

3. **Error Rate** (Right Y-axis, Red line)
   - Percentage of failed requests
   - Includes 5% threshold reference line

4. **Active Connections** (Right Y-axis, Purple line)
   - Number of concurrent connections
   - Shows connection pool usage

## Error Handling

The components include comprehensive error handling:

- **Connection Errors**: Display error messages with retry buttons
- **Message Parsing**: Graceful handling of malformed messages
- **Network Issues**: Automatic reconnection with exponential backoff
- **Data Validation**: Safe handling of missing or invalid data fields

## Testing

The implementation includes comprehensive tests:

- **Unit Tests**: Individual hook and component testing
- **Integration Tests**: Component interaction testing
- **Mock WebSocket**: Simulated WebSocket for testing
- **Error Scenarios**: Testing of error conditions and recovery

Run tests with:
```bash
npm test
```

## Performance Considerations

- **Update Throttling**: Prevents UI overload with configurable intervals
- **History Limits**: Automatic cleanup of old data points
- **Memory Management**: Efficient data structures and cleanup
- **Rendering Optimization**: React optimization patterns

## Browser Compatibility

- Modern browsers with WebSocket support
- Responsive design for mobile and desktop
- Graceful degradation for older browsers

## Configuration Options

### WebSocket Options
- `url`: WebSocket endpoint URL
- `reconnectAttempts`: Maximum reconnection attempts (default: 5)
- `reconnectInterval`: Time between reconnection attempts (default: 3000ms)
- `autoConnect`: Automatically connect on mount (default: true)

### Metrics Options
- `maxHistoryPoints`: Maximum data points to keep (default: 100)
- `updateInterval`: Minimum time between updates (default: 1000ms)

### Chart Options
- `height`: Chart height in pixels (default: 400)
- `showLegend`: Display chart legend (default: true)
- `wsUrl`: WebSocket URL override
- `maxHistoryPoints`: History limit override
- `updateInterval`: Update interval override

## Integration with MetricsDashboard

The RealtimeChart is integrated into the main MetricsDashboard component:

```tsx
import { RealtimeChart } from './RealtimeChart'

function MetricsDashboard() {
  return (
    <div>
      {/* Other dashboard components */}
      <RealtimeChart 
        maxHistoryPoints={100}
        updateInterval={1000}
        height={400}
      />
      {/* More components */}
    </div>
  )
}
```

## Demo

A demo component is available at `/demo` route that shows:
- Interactive simulation controls
- Real-time chart updates
- Feature explanations
- Usage examples

## Future Enhancements

Potential improvements for future versions:

1. **Multiple Chart Types**: Bar charts, area charts, scatter plots
2. **Data Export**: CSV/JSON export of historical data
3. **Zoom and Pan**: Chart interaction capabilities
4. **Custom Thresholds**: User-configurable reference lines
5. **Alert System**: Notifications for threshold breaches
6. **Data Persistence**: Local storage of historical data
7. **Multiple Endpoints**: Support for multiple WebSocket sources
8. **Custom Metrics**: User-defined metric calculations

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check server is running on correct port
   - Verify WebSocket endpoint URL
   - Check network connectivity

2. **No Data Displayed**
   - Verify WebSocket message format
   - Check browser console for errors
   - Ensure server is sending 'metrics' type messages

3. **Chart Not Updating**
   - Check update interval settings
   - Verify WebSocket connection status
   - Look for JavaScript errors in console

4. **Performance Issues**
   - Reduce maxHistoryPoints
   - Increase updateInterval
   - Check for memory leaks

### Debug Mode

Enable debug logging by setting:
```javascript
localStorage.setItem('debug', 'websocket,metrics')
```

This will log WebSocket events and metrics processing to the console.