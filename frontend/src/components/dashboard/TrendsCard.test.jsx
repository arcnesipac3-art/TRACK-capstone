import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import TrendsCard from './TrendsCard'

const MONTHS = [
  { month: '2025-11', label: 'Nov 2025', collected: 0, payments: 0, enrollments: 0 },
  { month: '2025-12', label: 'Dec 2025', collected: 1500, payments: 3, enrollments: 2 },
  { month: '2026-01', label: 'Jan 2026', collected: 500, payments: 1, enrollments: 1 },
]

describe('TrendsCard', () => {
  it('draws one bar per month per series, with accessible summaries', () => {
    const { container } = render(<TrendsCard months={MONTHS} />)

    const charts = screen.getAllByRole('img')
    expect(charts).toHaveLength(2)
    // Three months -> three bars in each of the two charts.
    expect(container.querySelectorAll('svg rect')).toHaveLength(6)
    expect(charts[0]).toHaveAttribute(
      'aria-label',
      expect.stringContaining('peak ₱1,500.00 in Dec 2025'),
    )
    expect(charts[1]).toHaveAttribute(
      'aria-label',
      expect.stringContaining('peak 2 students in Dec 2025'),
    )

    // Totals line up with the fixture.
    expect(screen.getByText('₱2,000.00 collected')).toBeInTheDocument()
    expect(screen.getByText('3 new students')).toBeInTheDocument()
  })

  it('repeats every month in a screen-reader data table', () => {
    render(<TrendsCard months={MONTHS} />)

    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3) // header + months
    expect(within(table).getByRole('rowheader', { name: 'Dec 2025' })).toBeInTheDocument()
  })

  it('shows empty notes instead of charts when a series has no data', () => {
    const zero = MONTHS.map((m) => ({ ...m, collected: 0, payments: 0, enrollments: 0 }))
    render(<TrendsCard months={zero} />)

    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(
      screen.getByText('No completed payments in the last 12 months.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No new student accounts in the last 12 months.'),
    ).toBeInTheDocument()
  })

  it('delegates loading and error states to the Card', () => {
    const { rerender } = render(<TrendsCard months={[]} loading />)
    expect(screen.queryByText('Fee collection')).not.toBeInTheDocument()

    rerender(<TrendsCard months={[]} error={new Error('boom')} onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })
})
