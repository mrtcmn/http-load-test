import { createFileRoute } from '@tanstack/react-router'
import { RealtimeChartDemo } from '@/components/RealtimeChartDemo'

export const Route = createFileRoute('/demo')({
  component: DemoComponent,
})

function DemoComponent() {
  return (
    <div className="container mx-auto py-6">
      <RealtimeChartDemo />
    </div>
  )
}