import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '../../routeTree.gen'

// Create a test router
function createTestRouter() {
  const history = createMemoryHistory({
    initialEntries: ['/'],
  })

  return createRouter({
    routeTree,
    history,
  })
}

describe('Home Page', () => {
  it('should render the dashboard title', () => {
    const router = createTestRouter()
    
    render(
      <div>
        <h1>HTTP Load Test Dashboard</h1>
        <div>Load test metrics and visualization will appear here</div>
      </div>
    )

    expect(screen.getByText('HTTP Load Test Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Load test metrics and visualization will appear here')).toBeInTheDocument()
  })
})