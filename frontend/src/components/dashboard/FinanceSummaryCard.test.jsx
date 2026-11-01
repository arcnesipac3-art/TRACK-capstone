import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import FinanceSummaryCard from './FinanceSummaryCard'

function renderCard(props) {
  return render(
    <MemoryRouter>
      <FinanceSummaryCard {...props} />
    </MemoryRouter>
  )
}

describe('FinanceSummaryCard', () => {
  it('groups the fee figures and derives the collection rate from them', () => {
    renderCard({
      fees: {
        total_assessed: 125000,
        total_collected: 75000,
        total_outstanding: 50000,
        active_school_year: '2026-2027',
      },
    })

    expect(screen.getByText('₱125,000.00')).toBeInTheDocument()
    expect(screen.getByText('₱75,000.00')).toBeInTheDocument()
    expect(screen.getByText('₱50,000.00')).toBeInTheDocument()
    expect(screen.getByText('60% collected')).toBeInTheDocument()
    const track = screen.getByRole('img', { name: 'Collected 75000 of 125000 assessed' })
    expect(track.querySelector('.progress-fill')).toHaveStyle({ width: '60%' })
    expect(screen.getByText('School year 2026-2027 · 60% of assessed fees collected.'))
  })

  it('shows an empty state instead of a fabricated 0% rate', () => {
    renderCard({
      fees: {
        total_assessed: 0,
        total_collected: 0,
        total_outstanding: 0,
        active_school_year: '2026-2027',
      },
    })

    expect(screen.getByText('No published assessments yet')).toBeInTheDocument()
    expect(screen.queryByText(/collected/)).not.toBeInTheDocument()
    expect(document.querySelector('.fin-figures')).toBeNull()
  })

  it('treats a missing assessment total as nothing collected, not a divide by zero', () => {
    renderCard({ fees: { total_collected: 0, total_outstanding: 0 } })
    expect(screen.queryByText('NaN% collected')).not.toBeInTheDocument()
    expect(screen.getByText('No published assessments yet')).toBeInTheDocument()
  })

  it('renders the caller shortcut in the card header', () => {
    renderCard({
      fees: { total_assessed: 1000, total_collected: 1000, total_outstanding: 0 },
      action: <a className="btn btn-sm btn-ghost" href="/admin/fees">Manage</a>,
    })

    expect(screen.getByRole('link', { name: 'Manage' })).toBeInTheDocument()
    expect(screen.getByText('100% collected')).toBeInTheDocument()
    // Assessed and collected are the same figure here — nothing outstanding.
    expect(screen.getAllByText('₱1,000.00')).toHaveLength(2)
    expect(screen.getByText('₱0.00')).toBeInTheDocument()
  })
})
