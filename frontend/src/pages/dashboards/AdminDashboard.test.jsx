import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminDashboard from './AdminDashboard'
import useFetch from '../../hooks/useFetch'
import { TODAY_FULL_LABEL, formatDate } from '../../utils/format'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

// The dashboard reads the signed-in administrator through the auth context.
// Tests swap `user` / `can` per case — a super administrator holds every
// key, a finance administrator only `fees.view`.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    user: null,
    can: () => true,
  },
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const SUPER_USER = {
  id: 1,
  username: 'ada',
  role: 'admin',
  fullName: 'Ada Admin',
  isSuperAdmin: true,
  departments: [{ id: 1, name: 'Super Administration', code: 'SYSADMIN' }],
  permissions: [],
}

const SUPER_PAYLOAD = {
  role: 'admin',
  is_super_admin: true,
  unread_notifications: 3,
  blocks: {
    accounts: {
      total_users: 1369,
      total_students: 1234,
      total_teachers: 42,
      total_parents: 89,
    },
    structure: {
      total_sections: 6,
      total_grade_levels: 4,
      total_subjects: 10,
      active_school_year: '2026-2027',
    },
    requirements: {
      total_requirements: 5,
      active_requirements: 3,
      total_submissions: 12,
      submission_status: {
        none: 2,
        submitted: 4,
        verified: 5,
        returned: 1,
        overdue: 0,
      },
    },
    attendance: {
      total_records: 10,
      by_status: { present: 8, absent: 1, late: 1, excused: 0 },
      present_rate: 80,
    },
    fees: {
      total_assessed: 125000,
      total_collected: 75000,
      total_outstanding: 50000,
      active_school_year: '2026-2027',
    },
    announcements: {
      total: 4,
      pinned: 1,
      latest: [
        {
          id: 1,
          title: 'Enrollment week',
          audience: 'all',
          published_at: '2026-10-01T08:00:00+08:00',
        },
      ],
    },
    audit: {
      recent_activity: [
        {
          id: 1,
          action: 'user.created',
          description: 'Created account for Juan Cruz',
          actor: 'Ada Admin',
          timestamp: '2026-10-23T01:00:00+08:00',
        },
        {
          id: 2,
          action: 'fee_payment.recorded',
          description: 'Recorded payment for Grade 7 Sampaguita',
          actor: 'Fin Officer',
          timestamp: '2026-10-22T08:00:00+08:00',
        },
      ],
    },
    departments: { total: 5, active: 5, super_admins: 2 },
  },
}

const FINANCE_PAYLOAD = {
  role: 'admin',
  is_super_admin: false,
  departments: [{ id: 4, name: 'Finance / Fee Management', code: 'FINANCE' }],
  unread_notifications: 0,
  blocks: {
    fees: {
      total_assessed: 125000,
      total_collected: 75000,
      total_outstanding: 50000,
      active_school_year: '2026-2027',
    },
  },
}

/**
 * Wire the mocked useFetch: `/dashboard/` gets the given state, every other
 * consumer (the notifications card) gets an idle list. Returns the dashboard
 * reload spy so error tests can assert the retry path.
 */
function mockFetch({
  dashboard = { data: null, loading: false, error: null },
  notifications = { data: [], loading: false, error: null },
} = {}) {
  const reload = vi.fn()
  useFetch.mockImplementation((path) => {
    if (path === '/notifications/') return { ...notifications, reload: vi.fn() }
    return { ...dashboard, reload }
  })
  return reload
}

function renderDash() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  )
}

/** Stat card element by its label (row labels elsewhere can repeat words). */
function statCard(label) {
  return [...document.querySelectorAll('.stat-grid .stat-card')].find(
    (el) => el.querySelector('.stat-label')?.textContent === label
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user = SUPER_USER
  mockAuth.can = () => true
})

describe('AdminDashboard — header', () => {
  it('shows a real greeting, subtle role chip, date and school year', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    expect(screen.getByRole('heading', { name: 'Welcome back, Ada' })).toBeInTheDocument()
    expect(
      screen.getByText("Here's what's happening at your school today.")
    ).toBeInTheDocument()

    // The old oversized warning-style badge is gone — subtle chips only.
    expect(document.querySelector('.badge-red')).toBeNull()
    expect(screen.getByText('Super Administrator')).toBeInTheDocument()
    expect(screen.getByText('Super Administration')).toBeInTheDocument()

    expect(screen.getByText(TODAY_FULL_LABEL)).toBeInTheDocument()
    expect(screen.getByText('School year 2026-2027')).toBeInTheDocument()
  })

  it('links the notification shortcut to /notifications with the unread count', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    const link = screen.getByRole('link', { name: /notifications/i })
    expect(link).toHaveAttribute('href', '/notifications')
    expect(link).toHaveAccessibleName('Notifications, 3 unread')
    expect(within(link).getByText('3')).toBeInTheDocument()
  })
})

describe('AdminDashboard — statistics', () => {
  it('renders permission-scoped cards from server-computed totals', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    const studentsCard = statCard('Students')
    expect(studentsCard).toBeTruthy()
    expect(within(studentsCard).getByText('1,234')).toBeInTheDocument()

    // Financial figures are the backend's, formatted in Philippine pesos.
    const assessedCard = statCard('Fees assessed')
    expect(within(assessedCard).getByText('₱125,000.00')).toBeInTheDocument()
    const collectedCard = statCard('Fees collected')
    expect(within(collectedCard).getByText('₱75,000.00')).toBeInTheDocument()
    expect(within(collectedCard).getByText('60% of assessed')).toBeInTheDocument()

    const outstandingCard = statCard('Outstanding balance')
    expect(within(outstandingCard).getByText('₱50,000.00')).toBeInTheDocument()
    expect(outstandingCard.className).toContain('tone-amber')

    expect(screen.getByText('10 subjects · 4 grade levels')).toBeInTheDocument()
    expect(screen.getByText('5 active · 2 super administrators')).toBeInTheDocument()
    expect(screen.getByText('1 pinned')).toBeInTheDocument()
    expect(document.querySelectorAll('.stat-grid .stat-card')).toHaveLength(10)
    expect(document.querySelectorAll('.quick-action')).toHaveLength(10)
  })

  it('shows only authorized modules for a finance administrator', () => {
    mockAuth.user = {
      ...SUPER_USER,
      isSuperAdmin: false,
      departments: [{ id: 4, name: 'Finance / Fee Management', code: 'FINANCE' }],
    }
    mockAuth.can = (key) => key === 'fees.view'
    mockFetch({ dashboard: { data: FINANCE_PAYLOAD, loading: false, error: null } })
    renderDash()

    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('Finance / Fee Management')).toBeInTheDocument()
    expect(screen.getByText('₱125,000.00')).toBeInTheDocument()

    // No school-wide figures leak outside the finance blocks.
    expect(screen.queryByText('Students')).not.toBeInTheDocument()
    expect(screen.queryByText('Account distribution')).not.toBeInTheDocument()
    expect(screen.queryByText('Departments')).not.toBeInTheDocument()

    // Only the fee shortcut is offered.
    expect(screen.getByRole('link', { name: 'Fee management' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Audit logs' })).not.toBeInTheDocument()
    expect(screen.queryByText('Requirements overview')).not.toBeInTheDocument()
  })
})

describe('AdminDashboard — content panels', () => {
  it('summarizes submissions with a labelled stack and percentages', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    const stack = screen.getByRole('img', {
      name: /Not submitted: 2, Awaiting verification: 4, Verified: 5, Returned for revision: 1/,
    })
    expect(stack.className).toContain('status-stack')
    expect(screen.getByText('5 · 42%')).toBeInTheDocument()
    expect(screen.getByText(/12 submissions recorded in total\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open requirements' })).toBeInTheDocument()
  })

  it('groups recent activity with actor and relative time', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    expect(screen.getByText('Created account for Juan Cruz')).toBeInTheDocument()
    expect(screen.getByText(/Account management · Ada Admin/)).toBeInTheDocument()
    expect(screen.getByText('Recorded payment for Grade 7 Sampaguita')).toBeInTheDocument()
    expect(screen.getByText(/Finance · Fin Officer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View audit log' })).toBeInTheDocument()
  })

  it('lists the latest announcement with audience and publication date', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    expect(screen.getByText('Enrollment week')).toBeInTheDocument()
    expect(
      screen.getByText(`Everyone · ${formatDate('2026-10-01T08:00:00+08:00')}`)
    ).toBeInTheDocument()
    const card = screen.getByText('Latest announcements').closest('section')
    expect(within(card).getByRole('link', { name: 'View all' })).toBeInTheDocument()
  })

  it('breaks down account distribution from the real counts', () => {
    mockFetch({ dashboard: { data: SUPER_PAYLOAD, loading: false, error: null } })
    renderDash()

    const card = screen.getByText('Account distribution').closest('section')
    expect(within(card).getByText('Students')).toBeInTheDocument()
    expect(within(card).getByText('1,234 · 90%')).toBeInTheDocument()
    // 1369 − 1234 − 42 − 89 = 4 administrators (User has exactly four roles).
    expect(within(card).getByText('4 · 0%')).toBeInTheDocument()
    expect(within(card).getByText('1,369 user accounts in total.')).toBeInTheDocument()
  })
})

describe('AdminDashboard — loading, errors and empty states', () => {
  it('announces a loading state with a skeleton layout', () => {
    mockFetch({ dashboard: { data: null, loading: true, error: null } })
    renderDash()

    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard…')
    expect(document.querySelector('.skeleton-hero')).not.toBeNull()
    expect(document.querySelectorAll('.stat-grid .skeleton')).toHaveLength(6)
  })

  it('shows a retryable error when the summary request fails', async () => {
    const user = userEvent.setup()
    const reload = mockFetch({
      dashboard: { data: null, loading: false, error: new Error('Network down') },
    })
    renderDash()

    expect(screen.getByText('Could not load the dashboard')).toBeInTheDocument()
    expect(screen.getByText('Network down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('explains when the account carries no granted modules', () => {
    mockAuth.can = () => false
    mockFetch({
      dashboard: {
        data: { role: 'admin', is_super_admin: false, unread_notifications: 0, blocks: {} },
        loading: false,
        error: null,
      },
    })
    renderDash()

    expect(screen.getByText('No modules granted yet')).toBeInTheDocument()
    expect(document.querySelector('.quick-actions')).toBeNull()
    // Notifications are role-neutral and still shown.
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
  })

  it('offers a create shortcut when no requirements exist yet', () => {
    mockAuth.can = (key) =>
      ['requirements.view', 'requirements.manage'].includes(key)
    mockFetch({
      dashboard: {
        data: {
          role: 'admin',
          is_super_admin: false,
          unread_notifications: 0,
          blocks: {
            requirements: {
              total_requirements: 0,
              active_requirements: 0,
              total_submissions: 0,
              submission_status: { none: 0, submitted: 0, verified: 0, returned: 0, overdue: 0 },
            },
          },
        },
        loading: false,
        error: null,
      },
    })
    renderDash()

    expect(screen.getByText('No requirements yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a requirement' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open requirements' })).toBeInTheDocument()
  })

  it('shows an honest empty attendance state, never a fabricated rate', () => {
    mockFetch({
      dashboard: {
        data: {
          role: 'admin',
          is_super_admin: false,
          unread_notifications: 0,
          blocks: {
            attendance: {
              total_records: 0,
              by_status: { present: 0, absent: 0, late: 0, excused: 0 },
              present_rate: null,
            },
          },
        },
        loading: false,
        error: null,
      },
    })
    renderDash()

    expect(screen.getByText('No attendance recorded yet')).toBeInTheDocument()
    expect(screen.queryByText(/% present/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open attendance' })).toBeInTheDocument()
  })

  it('surfaces notification request failures as an error, not an empty state', () => {
    mockFetch({
      dashboard: { data: SUPER_PAYLOAD, loading: false, error: null },
      notifications: { data: null, loading: false, error: new Error('Notifications unavailable') },
    })
    renderDash()

    expect(screen.getByText('Notifications unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument()
  })
})
