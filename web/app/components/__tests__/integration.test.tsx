import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportControls } from '../ExportControls'
import { TestHistory } from '../TestHistory'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Download: () => <div data-testid="download-icon" />,
  FileText: () => <div data-testid="file-text-icon" />,
  Database: () => <div data-testid="database-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  History: () => <div data-testid="history-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  TrendingDown: () => <div data-testid="trending-down-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
  Eye: () => <div data-testid="eye-icon" />,
  Trash2: () => <div data-testid="trash-icon" />
}))

describe('Integration Tests', () => {
  it('renders ExportControls without errors', () => {
    render(<ExportControls />)
    expect(screen.getByText('Export Results')).toBeInTheDocument()
  })

  it('renders TestHistory without errors', () => {
    render(<TestHistory history={[]} />)
    expect(screen.getByText('Test History')).toBeInTheDocument()
  })
})