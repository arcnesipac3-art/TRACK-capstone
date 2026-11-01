import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ParentDashboard from './ParentDashboard'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const CHILDREN = [
  {
    student_id: 11,
    name: 'Sofia Cruz',
    section: 'Grade 7 — Sampaguita (2026-2027)',
    total_requirements: 6,
    overdue: 4,
    awaiting_verification: 1,
    verified: 1,
  },
  {
    student_id: 12,
    name: 'Miguel Torres',
    section: 'Grade 8 — Gumamela (2026-2027)',
    total_requirements: 3,
    overdue: 1,
    awaiting_verification: 1,
    verified: 1,
  },
]

const RECORD = (id, date, status) => ({
  id,
  status,
  session_detail: {
    date,
    section_name: 'Grade 7 — Sampaguita (2026-2027)',
    subject_name: 'Mathematics',
  },
})

const ANNOUNCEMENTS = [
  {
    id: 1,
    title: 'Parent-Teacher Conference',
    body: 'x'.repeat(200),
    published_at: '2026-10-17T08:00:00+08:00',
    is_pinned: true,
  },
  {
    id: 2,
    title: 'Buwan ng Wika',
    body: 'Filipino week activities start Monday.',
    published_at: '2026-10-16T08:00:00+08:00',
    is_pinned: false,
  },
]

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

/**
 * Wire every useFetch call site on this screen. The attendance path records the
 * params it was asked for, so child switching is observable; the paths owned by
 * shared children (notifications, requirements, submissions) stay idle.
 */
function mockFetch({
  dashboard = LOADED({ children: CHILDREN }),
  attendance = LOADED([RECORD(1, '2026-10-26', 'present')]),
  announcements = LOADED(ANNOUNCEMENTS),
} = {}) {
  const attendanceParams = []
  useFetch.mockImplementation((path, options = {}) => {
    if (path === '/dashboard/') return { ...dashboard, reload: vi.fn() }
    if (path === '/attendance/records/') {
      attendanceParams.push(options.params)
      return { ...attendance, reload: vi.fn() }
    }
    if (path === '/announcements/') return { ...announcements, reload: vi.fn() }
    return { ...LOADED([]), reload: vi.fn() }
  })
  return { attendanceParams }
}

/** The card panel element behind a panel heading. */
function panel(title) {
  return screen.getByRole('heading', { level: 2, name: title }).closest('section')
}

const body = (element) => element.querySelector('.card-body')

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user = { fullName: 'Rosa Cruz' }
})

describe('ParentDashboard — child scoping', () => {
  it('sits the selector in a tight stack and names the child on each panel', () => {
    const tracker = mockFetch()
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    const selector = document.querySelector('.child-selector')
    expect(selector.parentElement.className).toBe('stack stack-xs')
    // The old -8px inline margin pulled the panels back over the chips.
    expect(selector.parentElement.getAttribute('style')).toBeNull()

    screen.getByRole('heading', { level: 2, name: 'Requirements · Sofia Cruz' })
    screen.getByRole('heading', { level: 2, name: 'Recent attendance · Sofia Cruz' })
    expect(tracker.attendanceParams).toEqual([{ student: 11 }])
  })

  it('re-scopes every panel and the attendance request when the other child is picked', async () => {
    const user = userEvent.setup()
    const tracker = mockFetch()
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    await user.click(screen.getByRole('tab', { name: /Miguel Torres/ }))

    screen.getByRole('heading', { level: 2, name: 'Requirements · Miguel Torres' })
    screen.getByRole('heading', { level: 2, name: 'Attendance · Miguel Torres' })
    expect(tracker.attendanceParams.at(-1)).toEqual({ student: 12 })
  })

  it('explains which child is shown when there is nothing to switch between', () => {
    mockFetch({ dashboard: LOADED({ children: [CHILDREN[0]] }) })
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    expect(document.querySelector('.child-selector')).toBeNull()
    expect(screen.getByText(/Showing records for/)).toBeInTheDocument()
  })

  it('says so when no child is linked yet', () => {
    mockFetch({ dashboard: LOADED({ children: [] }) })
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    expect(screen.getByText('No linked children yet')).toBeInTheDocument()
    expect(document.querySelector('.child-selector')).toBeNull()
  })
})

describe('ParentDashboard — announcements', () => {
  it('lists announcements on the shared activity feed, edge-to-edge', () => {
    mockFetch()
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    const feed = panel('Announcements')
    expect(body(feed).className).toContain('flush')

    const items = feed.querySelectorAll('.activity-item')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Parent-Teacher Conference')).toBeInTheDocument()
    expect(within(items[0]).getByText('Pinned')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Pinned')).not.toBeInTheDocument()

    // Long bodies are clamped rather than left to run down the column.
    expect(items[0].querySelector('.ai-body').textContent).toMatch(/…$/)
  })

  it('keeps the body padding for the empty state instead of a flush edge', () => {
    mockFetch({ announcements: LOADED([]) })
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    const feed = panel('Announcements')
    expect(body(feed).className).not.toContain('flush')
    expect(within(feed).getByText('No announcements')).toBeInTheDocument()
  })

  it('reports a failed feed request instead of calling it empty', () => {
    mockFetch({ announcements: { ...IDLE, error: new Error('Feed unavailable') } })
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    const feed = panel('Announcements')
    expect(within(feed).getByText('Feed unavailable')).toBeInTheDocument()
    expect(within(feed).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(feed).queryByText('No announcements')).not.toBeInTheDocument()
  })
})

describe('ParentDashboard — attendance panel', () => {
  it('runs the record table to the card edge', () => {
    mockFetch({
      attendance: LOADED([RECORD(1, '2026-10-26', 'present'), RECORD(2, '2026-10-23', 'absent')]),
    })
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    const recent = panel('Recent attendance · Sofia Cruz')
    expect(body(recent).className).toContain('flush')
    expect(within(recent).getAllByRole('row').slice(1)).toHaveLength(2)
  })

  it('pads the body back around the empty state when nothing is recorded', () => {
    mockFetch({ attendance: LOADED([]) })
    render(<MemoryRouter><ParentDashboard /></MemoryRouter>)

    const recent = panel('Recent attendance · Sofia Cruz')
    expect(body(recent).className).not.toContain('flush')
    expect(within(recent).getByText('Attendance records for this child will appear here.')).toBeInTheDocument()
  })
})
