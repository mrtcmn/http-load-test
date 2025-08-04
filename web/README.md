# HTTP Load Test Web Interface

This is the React frontend for the HTTP Load Test tool, built with:

- **React 18.3.1** with TypeScript
- **TanStack Router** for client-side routing (no SSR)
- **Tailwind CSS** for styling
- **shadcn/ui** components for UI elements
- **Vinxi** as the build tool (Vite-based)
- **Vitest** for testing

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build for production
npm run build

# Lint code
npm run lint
```

## Project Structure

```
app/
├── components/          # React components
│   ├── ui/             # shadcn/ui base components
│   └── __tests__/      # Component tests
├── routes/             # File-based routing
├── lib/                # Utility functions
├── test/               # Test setup
└── globals.css         # Global styles with Tailwind
```

## Features

- Real-time metrics dashboard
- Percentile analysis (P50, P95, P99)
- Export functionality (JSON/CSV)
- Responsive design
- Dark/light theme support
- WebSocket integration for live updates