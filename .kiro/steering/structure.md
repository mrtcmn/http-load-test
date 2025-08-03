# Project Structure

## Root Level
- `cmd/` - Go application entry points
- `internal/` - Go internal packages (not importable by external packages)
- `web/` - React/TypeScript frontend application
- `example/` - Usage examples and test endpoints
- `utils/` - JavaScript utility functions
- `bin/` - Compiled binaries (generated)
- `.kiro/` - Kiro IDE configuration and steering rules

## Go Backend Structure (`internal/`)

### Core Packages
- `internal/client/` - HTTP client implementation with request execution
- `internal/config/` - Configuration parsing, validation, and JavaScript integration
- `internal/engine/` - Load test execution engine with worker pools and rate limiting
- `internal/metrics/` - Metrics collection, aggregation, and real-time statistics
- `internal/server/` - HTTP API server with static file serving
- `internal/websocket/` - WebSocket server for real-time metric streaming

### Package Responsibilities
- **client**: Handles individual HTTP request execution with timeout and error handling
- **config**: Manages test configuration with JSON parsing and JavaScript function validation
- **engine**: Orchestrates concurrent request execution with rate limiting and worker pools
- **metrics**: Collects and aggregates performance metrics with real-time capabilities
- **server**: Provides REST API endpoints and serves the web interface
- **websocket**: Streams real-time metrics to connected web clients

## Frontend Structure (`web/`)

### Application Structure
- `web/app/` - Main application code
  - `components/` - Reusable React components with shadcn/ui integration
  - `hooks/` - Custom React hooks for WebSocket and metrics
  - `routes/` - File-based routing with TanStack Router
  - `styles/` - Global CSS and Tailwind configuration
  - `utils/` - Frontend utility functions

### Component Organization
- `components/ui/` - Base UI components (button, card, chart)
- `components/__tests__/` - Component test files co-located with components
- `hooks/__tests__/` - Hook test files co-located with hooks

## Legacy JavaScript API
- `index.js` - Main HttpLoadTest class with EventEmitter pattern
- `constant.js` - Configuration parameter constants
- `utils/httpHelper.js` - Axios wrapper for HTTP requests
- `utlis.js` - Utility functions (note: typo in filename for backward compatibility)

## File Naming Conventions
- **Go**: snake_case for files, PascalCase for exported types
- **TypeScript/React**: PascalCase for components, camelCase for utilities
- **Tests**: `*_test.go` for Go, `*.test.ts(x)` for TypeScript
- **Configuration**: lowercase with extensions (`.config.js`, `.json`)

## Import Patterns
- Go packages use full module path: `http-load-test/internal/client`
- React components use relative imports for local files
- External dependencies imported at top of files
- Test files import from same directory or parent directories