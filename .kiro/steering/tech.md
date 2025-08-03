# Technology Stack

## Backend (Go)
- **Language**: Go 1.24.5
- **Key Libraries**:
  - `github.com/dop251/goja` - JavaScript runtime for custom validation functions
  - `github.com/gorilla/websocket` - WebSocket support for real-time metrics
- **Architecture**: Clean architecture with internal packages for separation of concerns

## Frontend (React/TypeScript)
- **Framework**: React 18.3.1 with TypeScript 5.6.3
- **Routing**: TanStack Router with file-based routing
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query for server state
- **Build Tool**: Vinxi (Vite-based)
- **Testing**: Vitest with React Testing Library

## Legacy JavaScript API
- **Runtime**: Node.js >=14.0.0
- **HTTP Client**: Axios for request execution
- **Utilities**: Lodash for data manipulation
- **Event System**: Node.js EventEmitter for test lifecycle events

## Build System & Commands

### Go Backend
```bash
# Build for current platform
make build

# Build for all platforms
make build-all

# Run tests
make test

# Development build
make build-dev

# Install dependencies
make deps
```

### Web Frontend
```bash
# Development server
cd web && npm run dev

# Production build
cd web && npm run build

# Run tests
cd web && npm test

# Watch tests
cd web && npm run test:watch
```

### NPM Package
```bash
# Build everything
npm run build

# Build web only
npm run build:web

# Development web server
npm run dev:web
```

## Development Patterns
- Use structured error handling with custom error types
- Implement context-based cancellation for Go routines
- Follow React hooks patterns for state management
- Use TypeScript strict mode for type safety
- Implement comprehensive test coverage for critical paths