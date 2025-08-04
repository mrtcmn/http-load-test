import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

import '../globals.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div className="min-h-screen bg-background">
        <nav className="border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link to="/" className="text-xl font-bold">
                HTTP Load Test
              </Link>
              <div className="flex space-x-4">
                <Link
                  to="/"
                  className="text-sm font-medium transition-colors hover:text-primary"
                  activeProps={{
                    className: 'text-primary',
                  }}
                >
                  Dashboard
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">
          <Outlet />
        </main>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}