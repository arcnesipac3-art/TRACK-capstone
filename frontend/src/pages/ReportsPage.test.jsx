import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from './ReportsPage'
import useFetch from '../hooks/useFetch'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))

// The screen reads `reports.export`, `users.view`, `students.view` and
// `fees.view` off the signed-in administrator, so tests swap `can` per case.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null, can: () => true } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const FULL_BLOCKS = {
  accounts: {
    total_users: 11,
    total_students: 6,
    total_teachers: 2,
    total_parents: 1,
  },
  attendance: {
    by_status: { present: 25, absent: 4, late: 6, excused: 3 },
    present_rate: 65.8,
  },
  requirements: {
    total_requirements: 9,
    total_submissions: 9,
    awaiting_verification: 2,
    submission_status: { none: 0, submitted: 4, verified: 4, returned: 1 },
  },
}

/** The page runs two useFetch calls — keyed by request path. */
function mockFetches({ blocks = FULL_BLOCKS, months = [] } = {}) {
  useFetch.mockImplementation((path) => {
    if (path === '/dashboard/') {
      return { data: { role: 'admin', blocks }, loading: false, error: null, reload: vi.fn() }
    }
    return { data: { months }, loading: false, error: null, reload: vi.fn() }
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>
  )
}

describe('ReportsPage', () => {
  beforeEach(() => {
    useFetch.mockReset()
    mockAuth.can = () => true
  })

  it('leads with one headline tile per module the payload actually returned', () => {
    mockFetches()
    const { container } = renderPage()

    const tiles = container.querySelectorAll('.kpi-grid .stat-card')
    expect(tiles).toHaveLength(3)
    // Summed from the rows the backend sent, never estimated.
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('65.8% present across every status')).toBeInTheDocument()
    // Singular where the count is one, plural everywhere else.
    expect(
      screen.getByText('6 students · 2 teachers · 1 parent'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('9 submissions · 2 awaiting verification'),
    ).toBeInTheDocument()
  })

  it('drops the headline strip when only one module is reportable', () => {
    mockFetches({ blocks: { accounts: FULL_BLOCKS.accounts } })
    const { container } = renderPage()

    expect(container.querySelector('.kpi-grid')).toBeNull()
    // The account figures are still on the page, just not as a lone tile.
    // (The CSV button is labelled "Accounts" too, hence the heading role.)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Accounts' }),
    ).toBeInTheDocument()
  })

  it('withholds every export when reports.export is missing, and says why', () => {
    mockFetches()
    mockAuth.can = (key) => key !== 'reports.export'
    renderPage()

    expect(screen.queryByRole('button', { name: /accounts/i })).not.toBeInTheDocument()
    expect(screen.getByText('Exports')).toBeInTheDocument()
    expect(
      screen.getByText(/requires the/i),
    ).toBeInTheDocument()
  })

  it('routes the fee-report shortcut through the shared link button', () => {
    mockFetches()
    renderPage()

    const link = screen.getByRole('link', { name: /open fee reports/i })
    expect(link).toHaveAttribute('href', '/admin/fees')
    expect(link).toHaveClass('btn', 'btn-secondary', 'btn-sm')
  })

  it('keeps the twelve-month trends and their screen-reader table', () => {
    mockFetches({
      months: [
        { month: '2026-01', label: 'Jan 2026', collected: 1000, payments: 2, enrollments: 1 },
        { month: '2026-02', label: 'Feb 2026', collected: 2500, payments: 5, enrollments: 3 },
      ],
    })
    const { container } = renderPage()

    expect(container.querySelectorAll('.trend-chart svg')).toHaveLength(2)
    expect(screen.getByText('₱3,500.00 collected')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /monthly trends/i })).toBeInTheDocument()
  })
})
