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
    attendance_today: {
      total_records: 8,
      by_status: { present: 6, absent: 1, late: 1, excused: 0 },
      present_rate: 75,
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

// GET /enrollment/dashboard/ — the registrar's figures, requested only when
// the administrator holds enrollment.view.
const ENROLLMENT_PAYLOAD = {
  total_applications: 40,
  submitted: 6,
  under_review: 4,
  resubmitted: 1,
  awaiting_corrections: 2,
  accepted: 20,
  waitlisted: 0,
  rejected: 3,
  enrolled: 15,
  drafts: 5,
  pending_documents: 7,
  confirmed_enrollments: 15,
  by_grade: [],
  open_periods: 1,
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

const IDLE = { data: null, loading: false, error: null }

/**
 * Wire the mocked useFetch: `/dashboard/` and `/enrollment/dashboard/` get
 * their own state, every other consumer (the notifications card) gets an idle
 * list. Returns the dashboard reload spy so error tests can assert the retry.
 */
function mockFetch({
  dashboard = IDLE,
  enrollment = IDLE,
  notifications = { data: [], ...IDLE },
} = {}) {
  const reload = vi.fn()
  useFetch.mockImplementation((path) => {
    if (path === '/notifications/') return { ...notifications, reload: vi.fn() }
    if (path === '/enrollment/dashboard/') return { ...enrollment, reload: vi.fn() }
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

/** KPI tile element by its label. */
function kpiCard(label) {
  return [...document.querySelectorAll('.kpi-grid .stat-card')].find(
    (el) => el.querySelector('.stat-label')?.textContent === label
  )
}

/** Card element by its <h2> heading. */
function panel(title) {
  return screen.getByText(title).closest('section')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user = SUPER_USER
  mockAuth.can = () => true
})

describe('AdminDashboard — header', () => {
  it('shows a real greeting, subtle role chip, date and school year', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
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
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const link = screen.getByRole('link', { name: /notifications/i })
    expect(link).toHaveAttribute('href', '/notifications')
    expect(link).toHaveAccessibleName('Notifications, 3 unread')
    expect(within(link).getByText('3')).toBeInTheDocument()
  })
})

describe('AdminDashboard — key metrics', () => {
  it('prioritizes students, teachers, attendance and requirements completion', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, data: ENROLLMENT_PAYLOAD },
    })
    renderDash()

    const students = kpiCard('Students')
    expect(within(students).getByText('1,234')).toBeInTheDocument()
    expect(within(students).getByText('of 1,369 accounts in the directory')).toBeInTheDocument()

    expect(within(kpiCard('Teachers')).getByText('42')).toBeInTheDocument()

    // Attendance keeps the server-computed rate; the tile is never a guess.
    const attendance = kpiCard('Attendance present')
    expect(within(attendance).getByText('80%')).toBeInTheDocument()
    expect(within(attendance).getByText('10 records · 8 today')).toBeInTheDocument()

    // 5 verified of 12 recorded submissions.
    const requirements = kpiCard('Requirements verified')
    expect(within(requirements).getByText('42%')).toBeInTheDocument()
    expect(within(requirements).getByText('5 of 12 submissions')).toBeInTheDocument()

    expect(document.querySelectorAll('.kpi-grid .stat-card')).toHaveLength(5)
  })

  it('links each metric to the screen that owns it', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, data: ENROLLMENT_PAYLOAD },
    })
    renderDash()

    expect(kpiCard('Students')).toHaveAttribute('href', '/admin/students')
    expect(kpiCard('Teachers')).toHaveAttribute('href', '/admin/teachers')
    expect(kpiCard('Attendance present')).toHaveAttribute('href', '/admin/attendance')
    expect(kpiCard('Requirements verified')).toHaveAttribute('href', '/admin/requirements')
    expect(kpiCard('Applications in review')).toHaveAttribute(
      'href',
      '/admin/enrollment/applications'
    )
  })

  it('sends the enrollment shortcut to the registrar overview, not a bare group', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, data: ENROLLMENT_PAYLOAD },
    })
    renderDash()

    // /admin/enrollment is a sidebar group with no page of its own.
    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/admin/enrollment')
    expect(hrefs).toContain('/admin/enrollment/overview')
  })

  it('sends people management to the role directories, never an all-users screen', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, data: ENROLLMENT_PAYLOAD },
    })
    renderDash()

    // TRACK has no "all users" page: every account link names its role.
    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/admin/users')
    expect(hrefs).toContain('/admin/students')
    expect(hrefs).toContain('/admin/teachers')
  })

  it('adds the registrar queue only for enrollment staff, using real statuses', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, data: ENROLLMENT_PAYLOAD },
    })
    renderDash()

    const tile = kpiCard('Applications in review')
    expect(within(tile).getByText('4')).toBeInTheDocument()
    expect(within(tile).getByText('6 submitted · 2 awaiting corrections')).toBeInTheDocument()
  })

  it('reports an enrollment failure instead of showing zero applications', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, error: new Error('Enrollment unavailable') },
    })
    renderDash()

    const tile = kpiCard('Applications in review')
    expect(within(tile).getByText('Unavailable')).toBeInTheDocument()
    expect(within(tile).getByText('Enrollment figures could not be loaded.')).toBeInTheDocument()
    expect(within(tile).queryByText('0')).not.toBeInTheDocument()
  })

  it('shows organisation figures as a compact strip, not as cards', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const facts = document.querySelector('.fact-strip')
    expect(facts).not.toBeNull()
    expect(within(facts).getByText('6 sections · 10 subjects · 4 grade levels')).toBeInTheDocument()
    expect(
      within(facts).getByText('5 departments · 5 active · 2 super administrators')
    ).toBeInTheDocument()
  })

  it('never shows a fabricated completion rate without submissions', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: {
          role: 'admin',
          is_super_admin: false,
          unread_notifications: 0,
          blocks: {
            requirements: {
              total_requirements: 5,
              active_requirements: 3,
              total_submissions: 0,
              submission_status: { none: 0, submitted: 0, verified: 0, returned: 0, overdue: 0 },
            },
          },
        },
      },
    })
    renderDash()

    const tile = kpiCard('Requirements verified')
    expect(within(tile).getByText('—')).toBeInTheDocument()
    expect(within(tile).getByText('No submissions yet')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('keeps every figure the previous ten stat cards carried', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      enrollment: { ...IDLE, data: ENROLLMENT_PAYLOAD },
    })
    renderDash()

    // Students / teachers / parents · sections, subjects, grade levels ·
    // active requirements · the three fee totals · departments · announcements.
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('89 · 7%')).toBeInTheDocument()
    expect(screen.getByText('6 sections · 10 subjects · 4 grade levels')).toBeInTheDocument()
    expect(screen.getByText('3 of 5 active')).toBeInTheDocument()
    expect(screen.getByText('₱125,000.00')).toBeInTheDocument()
    expect(screen.getByText('₱75,000.00')).toBeInTheDocument()
    expect(screen.getByText('₱50,000.00')).toBeInTheDocument()
    expect(screen.getByText('5 departments · 5 active · 2 super administrators')).toBeInTheDocument()
    expect(screen.getByText('4 published')).toBeInTheDocument()
    expect(
      screen.getByText(/12 submissions recorded in total\. · 2 with nothing submitted yet\./)
    ).toBeInTheDocument()
    expect(screen.getByText('1,369 user accounts in total.')).toBeInTheDocument()
  })
})

describe('AdminDashboard — shortcuts', () => {
  it('keeps five actions in the bar and folds the rest into a menu', async () => {
    const user = userEvent.setup()
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const bar = screen.getByRole('navigation', { name: 'Quick actions' })
    // Five visible shortcuts; the overflow sits behind a button, not a link.
    expect(within(bar).getAllByRole('link')).toHaveLength(5)

    expect(within(bar).getByRole('link', { name: 'Manage students' })).toHaveAttribute(
      'href',
      '/admin/students'
    )
    expect(within(bar).getByRole('link', { name: 'Manage enrollment' })).toBeInTheDocument()
    expect(within(bar).getByRole('link', { name: 'View attendance' })).toBeInTheDocument()
    expect(within(bar).getByRole('link', { name: 'Manage requirements' })).toBeInTheDocument()
    expect(within(bar).getByRole('link', { name: 'View reports' })).toBeInTheDocument()

    // The overflow stays out of the way until asked for.
    expect(within(bar).queryByRole('link', { name: 'Audit logs' })).not.toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'More actions' }))

    const menu = await screen.findByRole('menu', { name: 'More dashboard actions' })
    expect(within(menu).getByRole('menuitem', { name: 'Manage teachers' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Manage parents' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Fee management' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Audit logs' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'System settings' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Audit logs' })).toHaveAttribute(
      'href',
      '/admin/audit-logs'
    )
  })

  it('offers only the shortcuts the administrator is allowed to use', () => {
    mockAuth.can = (key) => key === 'fees.view'
    mockFetch({ dashboard: { ...IDLE, data: FINANCE_PAYLOAD } })
    renderDash()

    const bar = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(within(bar).getByRole('link', { name: 'Fee management' })).toBeInTheDocument()
    expect(within(bar).queryByRole('link', { name: 'Manage students' })).not.toBeInTheDocument()
    expect(within(bar).queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('renders no shortcut bar when the account carries no permissions', () => {
    mockAuth.can = () => false
    mockFetch({ dashboard: { ...IDLE, data: { ...SUPER_PAYLOAD, blocks: {} } } })
    renderDash()

    expect(screen.queryByRole('navigation', { name: 'Quick actions' })).toBeNull()
  })
})

describe('AdminDashboard — permission scope', () => {
  it('shows only authorized modules for a finance administrator', () => {
    mockAuth.user = {
      ...SUPER_USER,
      isSuperAdmin: false,
      departments: [{ id: 4, name: 'Finance / Fee Management', code: 'FINANCE' }],
    }
    mockAuth.can = (key) => key === 'fees.view'
    mockFetch({ dashboard: { ...IDLE, data: FINANCE_PAYLOAD } })
    renderDash()

    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('Finance / Fee Management')).toBeInTheDocument()
    expect(screen.getByText('₱125,000.00')).toBeInTheDocument()

    // No school-wide figures leak outside the finance blocks.
    expect(document.querySelector('.kpi-grid')).toBeNull()
    expect(screen.queryByText('Account distribution')).not.toBeInTheDocument()
    expect(screen.queryByText('Departments')).not.toBeInTheDocument()
    expect(screen.queryByText('Requirements overview')).not.toBeInTheDocument()
    expect(screen.queryByText('School attendance summary')).not.toBeInTheDocument()
  })
})

describe('AdminDashboard — content panels', () => {
  it('summarizes submissions with a labelled stack and percentages', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const stack = screen.getByRole('img', {
      name: /Not submitted: 2, Awaiting verification: 4, Verified: 5, Returned for revision: 1/,
    })
    expect(stack.className).toContain('status-stack')
    expect(screen.getByText('5 · 42%')).toBeInTheDocument()
    expect(screen.getByText(/12 submissions recorded in total\./)).toBeInTheDocument()
    // The deadline status the old "Active requirements" card carried.
    expect(screen.getByText('3 of 5 active')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open requirements' })).toBeInTheDocument()
  })

  it('groups recent activity with actor and relative time', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    expect(screen.getByText('Created account for Juan Cruz')).toBeInTheDocument()
    expect(screen.getByText(/Account management · Ada Admin/)).toBeInTheDocument()
    expect(screen.getByText('Recorded payment for Grade 7 Sampaguita')).toBeInTheDocument()
    expect(screen.getByText(/Finance · Fin Officer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View audit log' })).toBeInTheDocument()
  })

  it('lists announcements with audience, date and the pinned flag', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const card = panel('Latest announcements')
    expect(within(card).getByText('Enrollment week')).toBeInTheDocument()
    expect(
      within(card).getByText(`Everyone · ${formatDate('2026-10-01T08:00:00+08:00')}`)
    ).toBeInTheDocument()
    // The payload orders pinned items first, so the single pinned row is marked.
    expect(within(card).getByText('Pinned')).toBeInTheDocument()
    expect(within(card).getByText('4 published')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'View all' })).toBeInTheDocument()
  })

  it('marks no announcement as pinned when none are pinned', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: {
          ...SUPER_PAYLOAD,
          blocks: {
            ...SUPER_PAYLOAD.blocks,
            announcements: {
              total: 2,
              pinned: 0,
              latest: [
                { id: 5, title: 'Class picture day', audience: 'students', published_at: null },
              ],
            },
          },
        },
      },
    })
    renderDash()

    const card = panel('Latest announcements')
    expect(within(card).queryByText('Pinned')).not.toBeInTheDocument()
    expect(within(card).getByText('2 published')).toBeInTheDocument()
  })

  it('groups every fee figure in one finance card with its collection rate', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const card = panel('Finance summary')
    expect(within(card).getByText('Fees assessed')).toBeInTheDocument()
    expect(within(card).getByText('₱125,000.00')).toBeInTheDocument()
    expect(within(card).getByText('₱75,000.00')).toBeInTheDocument()
    expect(within(card).getByText('₱50,000.00')).toBeInTheDocument()
    expect(within(card).getByText('60% collected')).toBeInTheDocument()
    expect(
      within(card).getByRole('img', { name: 'Collected 75000 of 125000 assessed' })
    ).toBeInTheDocument()
    expect(within(card).getByText('School year 2026-2027 · 60% of assessed fees collected.'))
    expect(within(card).getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/admin/fees'
    )
  })

  it('breaks down account distribution from the real counts', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const card = panel('Account distribution')
    expect(within(card).getByText('1,234 · 90%')).toBeInTheDocument()
    expect(within(card).getByText('89 · 7%')).toBeInTheDocument()
    // 1369 − 1234 − 42 − 89 = 4 administrators (User has exactly four roles).
    expect(within(card).getByText('4 · 0%')).toBeInTheDocument()
    expect(within(card).getByText('1,369 user accounts in total.')).toBeInTheDocument()
  })
})

describe('AdminDashboard — today at school', () => {
  it("shows today's figures as a strip in the attendance card", () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    const strip = document.querySelector('.att-today')
    expect(strip).not.toBeNull()
    expect(strip).toHaveTextContent('Today')
    expect(strip).toHaveTextContent('6 present')
    expect(strip).toHaveTextContent('1 absent')
    expect(strip).toHaveTextContent('1 late')
    // Only non-zero statuses are shown — no "0 excused" noise.
    expect(strip.textContent).not.toContain('excused')

    // The rows underneath are all-time, and the card says so.
    expect(screen.getByText('All recorded sessions')).toBeInTheDocument()
  })

  it('links the attendance card to the attendance screen', () => {
    mockFetch({ dashboard: { ...IDLE, data: SUPER_PAYLOAD } })
    renderDash()

    expect(within(panel('School attendance summary')).getByRole('link', {
      name: 'Manage',
    })).toHaveAttribute('href', '/admin/attendance')
  })

  it('says so honestly when the school day has no records yet', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: {
          role: 'admin',
          is_super_admin: false,
          unread_notifications: 0,
          blocks: {
            attendance: {
              total_records: 10,
              by_status: { present: 8, absent: 1, late: 1, excused: 0 },
              present_rate: 80,
            },
            attendance_today: {
              total_records: 0,
              by_status: { present: 0, absent: 0, late: 0, excused: 0 },
              present_rate: null,
            },
          },
        },
      },
    })
    renderDash()

    expect(screen.getByText('No attendance recorded today yet.')).toBeInTheDocument()
    expect(document.querySelector('.att-today')).toBeNull()
    // The metric tile stays on the all-time figures it actually has.
    expect(within(kpiCard('Attendance present')).getByText('80%')).toBeInTheDocument()
    expect(within(kpiCard('Attendance present')).getByText('10 records')).toBeInTheDocument()
  })

  it('never shows a today strip without the attendance permission', () => {
    mockAuth.can = (key) => key === 'fees.view'
    mockFetch({ dashboard: { ...IDLE, data: FINANCE_PAYLOAD } })
    renderDash()

    expect(document.querySelector('.att-today')).toBeNull()
    expect(screen.queryByText('No attendance recorded today yet.')).not.toBeInTheDocument()
  })
})

describe('AdminDashboard — loading, errors and empty states', () => {
  it('announces a loading state with a skeleton layout', () => {
    mockFetch({ dashboard: { ...IDLE, loading: true } })
    renderDash()

    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard…')
    expect(document.querySelector('.skeleton-hero')).not.toBeNull()
    expect(document.querySelector('.skeleton-toolbar')).not.toBeNull()
    expect(document.querySelectorAll('.kpi-grid .skeleton')).toHaveLength(5)
    expect(document.querySelectorAll('.two-col .card')).toHaveLength(4)
  })

  it('shows a retryable error when the summary request fails', async () => {
    const user = userEvent.setup()
    const reload = mockFetch({
      dashboard: { ...IDLE, error: new Error('Network down') },
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
        ...IDLE,
        data: { role: 'admin', is_super_admin: false, unread_notifications: 0, blocks: {} },
      },
    })
    renderDash()

    expect(screen.getByText('No modules granted yet')).toBeInTheDocument()
    expect(document.querySelector('.kpi-grid')).toBeNull()
    expect(document.querySelector('.fact-strip')).toBeNull()
    // Notifications are role-neutral and still shown.
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
  })

  it('offers a create shortcut when no requirements exist yet', () => {
    mockAuth.can = (key) => ['requirements.view', 'requirements.manage'].includes(key)
    mockFetch({
      dashboard: {
        ...IDLE,
        data: {
          role: 'admin',
          is_super_admin: false,
          unread_notifications: 0,
          blocks: {
            requirements: {
              total_requirements: 0,
              active_requirements: 0,
              total_submissions: 0,
              submission_status: {
                none: 0,
                submitted: 0,
                verified: 0,
                returned: 0,
                overdue: 0,
              },
            },
          },
        },
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
        ...IDLE,
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
      },
    })
    renderDash()

    expect(screen.getByText('No attendance recorded yet')).toBeInTheDocument()
    expect(screen.queryByText(/% present/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open attendance' })).toBeInTheDocument()

    const tile = kpiCard('Attendance')
    expect(within(tile).getByText('—')).toBeInTheDocument()
    expect(within(tile).getByText('Nothing recorded yet')).toBeInTheDocument()
  })

  it('shows an empty finance card instead of a zeroed collection rate', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: {
          role: 'admin',
          is_super_admin: false,
          unread_notifications: 0,
          blocks: {
            fees: {
              total_assessed: 0,
              total_collected: 0,
              total_outstanding: 0,
              active_school_year: '2026-2027',
            },
          },
        },
      },
    })
    renderDash()

    expect(screen.getByText('No published assessments yet')).toBeInTheDocument()
    expect(screen.queryByText('0% collected')).not.toBeInTheDocument()
  })

  it('surfaces notification request failures as an error, not an empty state', () => {
    mockFetch({
      dashboard: { ...IDLE, data: SUPER_PAYLOAD },
      notifications: { ...IDLE, error: new Error('Notifications unavailable') },
    })
    renderDash()

    expect(screen.getByText('Notifications unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument()
  })
})
