import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentDashboard from './StudentDashboard'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const SUMMARY = {
  section: 'Grade 7 — Sampaguita (2026-2027)',
  total_requirements: 6,
  overdue: 4,
  awaiting_verification: 1,
  verified: 1,
  returned: 1,
  attendance: {
    total_records: 10,
    by_status: { present: 8, absent: 1, late: 1, excused: 0 },
    present_rate: 80,
  },
}

const RECORD = (id, date, status) => ({
  id,
  status,
  session_detail: {
    date,
    section_name: 'Grade 7 — Sampaguita (2026-2027)',
    subject_name: 'Mathematics',
  },
})

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

function mockFetch({
  dashboard = LOADED(SUMMARY),
  attendance = LOADED([RECORD(1, '2026-10-26', 'present')]),
} = {}) {
  useFetch.mockImplementation((path) => {
    if (path === '/dashboard/') return { ...dashboard, reload: vi.fn() }
    if (path === '/attendance/records/') return { ...attendance, reload: vi.fn() }
    return { ...LOADED([]), reload: vi.fn() }
  })
}

function panel(title) {
  return screen.getByRole('heading', { level: 2, name: title }).closest('section')
}

function tile(label) {
  return [...document.querySelectorAll('.grid .stat-card')].find(
    (el) => el.querySelector('.stat-label')?.textContent === label,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user = { fullName: 'Sofia Cruz' }
})

describe('StudentDashboard', () => {
  it('links only the metric that has its own screen', () => {
    mockFetch()
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Sofia' })).toBeInTheDocument()

    const requirements = tile('Requirements')
    expect(requirements.tagName).toBe('A')
    expect(requirements).toHaveAttribute('href', '/student/requirements')

    // Overdue / awaiting / verified are slices of the same screen, so they
    // stay plain tiles rather than promising three separate destinations.
    expect(tile('Overdue').tagName).toBe('DIV')
    expect(tile('Awaiting check').tagName).toBe('DIV')
    expect(tile('Verified').tagName).toBe('DIV')

    expect(document.querySelectorAll('.grid .stat-card .stat-icon')).toHaveLength(4)
    expect(within(requirements).getByText('6')).toBeInTheDocument()
  })

  it('hosts the shared requirements explorer behind a button-styled shortcut', () => {
    mockFetch()
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    const requirements = panel('Your requirements')
    expect(within(requirements).getByLabelText('Status')).toBeInTheDocument()
    expect(within(requirements).getByLabelText('Sort by')).toBeInTheDocument()

    const viewAll = within(requirements).getByRole('link', { name: 'View all' })
    expect(viewAll).toHaveAttribute('href', '/student/requirements')
    // Same class list as the Button primitive it replaces.
    expect(viewAll.className).toBe('btn btn-ghost btn-sm')
  })

  it('caps the recent attendance rows and lets them reach the card edge', () => {
    mockFetch({ attendance: LOADED(Array.from({ length: 7 }, (_, i) => RECORD(i, '2026-10-26', 'present'))) })
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    const recent = panel('Recent attendance')
    expect(recent.querySelector('.card-body').className).toContain('flush')
    expect(within(recent).getAllByRole('row').slice(1)).toHaveLength(5)
  })

  it('pads the body back around the empty attendance state', () => {
    mockFetch({ attendance: LOADED([]) })
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    const recent = panel('Recent attendance')
    expect(recent.querySelector('.card-body').className).not.toContain('flush')
    expect(within(recent).getByText(/once teachers start recording it/)).toBeInTheDocument()
  })

  it('ties the returned-work note to the submissions screen', () => {
    mockFetch()
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    const status = panel('Submission status')
    const stack = status.querySelector('.card-body > .stack')
    expect(stack.className).toBe('stack stack-sm')
    // The gap replaces the hand-written margin the note used to carry.
    expect(stack.getAttribute('style')).toBeNull()

    const link = within(status).getByRole('link', { name: 'open my submissions' })
    expect(link).toHaveAttribute('href', '/student/submissions')
    expect(within(status).getAllByRole('img').length).toBeGreaterThan(0)
  })

  it('reports a failed summary instead of rendering an empty dashboard', async () => {
    const user = userEvent.setup()
    mockFetch({ dashboard: { ...IDLE, error: new Error('Service down') } })
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    expect(screen.getByText('Could not load your dashboard')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Your requirements' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(useFetch.mock.results.length).toBeGreaterThan(0)
  })

  it('announces loading before the figures arrive', () => {
    mockFetch({ dashboard: { ...IDLE, loading: true } })
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>)

    expect(screen.getByRole('status')).toHaveTextContent('Loading your dashboard')
    expect(document.querySelectorAll('.grid .skeleton')).toHaveLength(4)
  })
})
