import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import '../styles/globals.css'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools position="bottom-right" />
    </QueryClientProvider>
  )
}