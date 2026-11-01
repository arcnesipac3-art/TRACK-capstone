import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contextPanelFor } from './registry'
import AdminContextPanel from './AdminContextPanel'
import AttendanceContextPanel from './AttendanceContextPanel'
import EnrollmentContextPanel from './EnrollmentContextPanel'
import PeopleContextPanel from './PeopleContextPanel'
import VerificationContextPanel from './VerificationContextPanel'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))
import useFetch from '../../hooks/useFetch'

// Panels read `can` / role through the auth context; the real AuthProvider is
// covered elsewhere, so this suite stubs the hook the same way the dashboard
// tests do.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { user: null, can: () => true } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const IDLE = { loading: false, error: null, reload: vi.fn() }

/** Route every useFetch call in the tree through a per-path fixture table. */
function mockRoutes(table) {
  useFetch.mockImplementation((path) => {
    const entry = table[path] ?? { data: [], ...IDLE }
    return { ...entry, reload: vi.fn() }
  })
}

beforeEach(() => {
  mockAuth.user = { id: 1, username: 'ada', fullName: 'Ada Admin', role: 'admin', permissions: [] }
  mockAuth.can = () => true
})

describe('contextPanelFor — route registry', () => {
  it('maps the staff modules that have genuine context', () => {
    expect(contextPanelFor('/admin/dashboard').title).toBe('Today at a glance')
    expect(contextPanelFor('/admin/enrollment/applications/7').title).toBe('Enrollment context')
    expect(contextPanelFor('/admin/attendance').title).toBe('Attendance context')
    expect(contextPanelFor('/teacher/attendance').title).toBe('Attendance context')
    expect(contextPanelFor('/admin/requirements').title).toBe('Verification context')
    expect(contextPanelFor('/teacher/review').title).toBe('Verification context')
    expect(contextPanelFor('/admin/students').title).toBe('Directory context')
  })

  it.each([
    '/admin/reports',
    '/admin/settings',
    '/admin/fees',
    '/announcements',
    '/notifications',
    '/student/dashboard',
    '/parent/dashboard',
    '/teacher/dashboard',
    '/teacher/classes',
  ])('hides the column on %s — no invented filler content', (path) => {
    expect(contextPanelFor(path)).toBeNull()
  })
})

describe('AdminContextPanel', () => {
  const dashboard = {
    data: {
      role: 'admin',
      unread_notifications: 2,
      blocks: {
        requirements: {
          awaiting_verification: 4,
          submission_status: { overdue: 1 },
        },
        attendance_today: {
          total_records: 8,
          by_status: { present: 6, absent: 1, late: 1, excused: 0 },
          present_rate: 75,
        },
        fees: { total_outstanding: 1500 },
      },
    },
    ...IDLE,
  }

  it('shows the active school year, the pending checklist and the shared feed', () => {
    mockRoutes({
      '/dashboard/': dashboard,
      '/enrollment/dashboard/': {
        data: { under_review: 3, awaiting_corrections: 0, pending_documents: 2 },
        ...IDLE,
      },
      '/school-years/': {
        data: [
          {
            id: 1,
            label: '2026–2027',
            start_date: '2026-08-03',
            end_date: '2027-04-30',
            section_count: 6,
            subject_count: 10,
          },
        ],
        ...IDLE,
      },
    })
    render(
      <MemoryRouter>
        <AdminContextPanel />
      </MemoryRouter>
    )

    expect(screen.getByText('2026–2027')).toBeInTheDocument()
    expect(screen.getByText('6 sections · 10 subjects')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Submissions to verify\s*4/ })).toHaveAttribute(
      'href',
      '/admin/requirements'
    )
    expect(screen.getByRole('link', { name: /Applications in review\s*3/ })).toHaveAttribute(
      'href',
      '/admin/enrollment/applications'
    )
    expect(screen.getByRole('link', { name: /Marked absent today\s*1/ })).toBeInTheDocument()
    // Notifications card reads the same fetch the shell shares.
    expect(screen.getByText('Recent notifications')).toBeInTheDocument()
  })

  it('reports inbox zero when nothing is pending', () => {
    mockRoutes({
      '/dashboard/': {
        data: { role: 'admin', blocks: { requirements: { awaiting_verification: 0, submission_status: {} } } },
        ...IDLE,
      },
      '/enrollment/dashboard/': {
        data: { under_review: 0, awaiting_corrections: 0, pending_documents: 0 },
        ...IDLE,
      },
      '/school-years/': { data: [], ...IDLE },
    })
    render(
      <MemoryRouter>
        <AdminContextPanel />
      </MemoryRouter>
    )

    expect(screen.getByText('Nothing pending')).toBeInTheDocument()
    expect(screen.getByText('No active school year')).toBeInTheDocument()
  })

  it('surfaces dashboard failures as an error with a retry, not zeros', async () => {
    mockRoutes({ '/dashboard/': { ...IDLE, error: new Error('Context down') } })
    render(
      <MemoryRouter>
        <AdminContextPanel />
      </MemoryRouter>
    )
    expect(screen.getByText('Context unavailable')).toBeInTheDocument()
    expect(screen.getByText('Context down')).toBeInTheDocument()
  })

  it('hides enrollment rows when the account lacks enrollment.view', () => {
    mockAuth.can = (key) => key !== 'enrollment.view'
    mockRoutes({
      '/dashboard/': dashboard,
      '/school-years/': { data: [], ...IDLE },
    })
    render(
      <MemoryRouter>
        <AdminContextPanel />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link', { name: /Applications in review/ })).not.toBeInTheDocument()
  })
})

describe('EnrollmentContextPanel', () => {
  it('lists the real pipeline counts and reminders', () => {
    mockRoutes({
      '/enrollment/dashboard/': {
        data: {
          total_applications: 40,
          submitted: 5,
          under_review: 8,
          resubmitted: 2,
          awaiting_corrections: 3,
          waitlisted: 1,
          accepted: 12,
          enrolled: 9,
          drafts: 4,
          pending_documents: 6,
          open_periods: 1,
        },
        ...IDLE,
      },
    })
    render(
      <MemoryRouter>
        <EnrollmentContextPanel />
      </MemoryRouter>
    )

    expect(screen.getByText('In review')).toBeInTheDocument()
    expect(screen.getAllByText('8').length).toBeGreaterThan(0)
    expect(screen.getByText('Drafts in progress')).toBeInTheDocument()
    expect(screen.getByText('Periods open now')).toBeInTheDocument()
  })

  it('surfaces failures honestly', () => {
    mockRoutes({ '/enrollment/dashboard/': { ...IDLE, error: new Error('boom') } })
    render(
      <MemoryRouter>
        <EnrollmentContextPanel />
      </MemoryRouter>
    )
    expect(screen.getByText('Enrollment context unavailable')).toBeInTheDocument()
  })
})

describe('AttendanceContextPanel', () => {
  it('summarises today for an administrator', () => {
    mockRoutes({
      '/dashboard/': {
        data: {
          role: 'admin',
          blocks: {
            attendance: { total_records: 90, by_status: { absent: 4 }, present_rate: 88 },
            attendance_today: {
              total_records: 8,
              by_status: { present: 6, absent: 1, late: 1, excused: 0 },
              present_rate: 75,
            },
          },
        },
        ...IDLE,
      },
    })
    render(
      <MemoryRouter>
        <AttendanceContextPanel />
      </MemoryRouter>
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0)
    expect(screen.getByText('School year to date')).toBeInTheDocument()
    expect(screen.getByText('90')).toBeInTheDocument()
  })

  it('says so when nothing is recorded today', () => {
    mockRoutes({
      '/dashboard/': {
        data: { role: 'admin', blocks: { attendance: { total_records: 0, by_status: {} }, attendance_today: { total_records: 0, by_status: {}, present_rate: null } } },
        ...IDLE,
      },
    })
    render(
      <MemoryRouter>
        <AttendanceContextPanel />
      </MemoryRouter>
    )
    expect(screen.getByText('No attendance today')).toBeInTheDocument()
  })

  it('uses the teacher-scoped summary on the teacher route', () => {
    mockRoutes({
      '/dashboard/': {
        data: { role: 'teacher', attendance: { total_records: 30, by_status: { present: 27, absent: 2, late: 1, excused: 0 }, present_rate: 90 } },
        ...IDLE,
      },
    })
    render(
      <MemoryRouter>
        <AttendanceContextPanel />
      </MemoryRouter>
    )
    expect(screen.getByText('Attendance (term)')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.queryByText('School year to date')).not.toBeInTheDocument()
  })
})

describe('VerificationContextPanel', () => {
  it('shows the queue, overdue items and the next deadlines', () => {
    mockRoutes({
      '/submissions/': {
        data: {
          count: 7,
          results: [
            { id: 1, student_name: 'Juan Dela Cruz', requirement_title: 'Goodcon', submitted_at: '2026-10-30T08:00:00Z', status: 'submitted' },
          ],
        },
        ...IDLE,
      },
      '/requirements/': {
        data: [
          { id: 1, title: 'Report card', deadline: '2020-01-01', is_overdue: true, section_name: 'Grade 7 Sampaguita' },
          { id: 2, title: 'Certificate of Good Moral', deadline: '2099-12-31', is_overdue: false, section_name: 'Grade 7 Sampaguita' },
        ],
        ...IDLE,
      },
    })
    render(
      <MemoryRouter>
        <VerificationContextPanel />
      </MemoryRouter>
    )

    expect(screen.getByText('Submissions in queue')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('Overdue requirements')).toBeInTheDocument()
    expect(screen.getByText('Certificate of Good Moral')).toBeInTheDocument()
  })

  it('reports a clear queue', () => {
    mockRoutes({
      '/submissions/': { data: { count: 0, results: [] }, ...IDLE },
      '/requirements/': { data: [], ...IDLE },
    })
    render(
      <MemoryRouter>
        <VerificationContextPanel />
      </MemoryRouter>
    )
    expect(screen.getByText('Queue is clear')).toBeInTheDocument()
    expect(screen.getByText('No open deadlines on the horizon.')).toBeInTheDocument()
  })
})

describe('PeopleContextPanel', () => {
  it('headlines the directory count and filters account activity', () => {
    mockRoutes({
      '/dashboard/': {
        data: {
          role: 'admin',
          blocks: {
            accounts: { total_users: 1369, total_students: 1234, total_teachers: 42, total_parents: 89 },
            structure: { total_sections: 6, total_subjects: 10, active_school_year: '2026-2027' },
            audit: {
              recent_activity: [
                { id: 1, action: 'user.created', description: 'Created student account', actor: 'Ada', timestamp: '2026-10-30T08:00:00Z' },
                { id: 2, action: 'auth.login', description: 'Signed in', actor: 'Ada', timestamp: '2026-10-30T09:00:00Z' },
              ],
            },
          },
        },
        ...IDLE,
      },
    })
    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <PeopleContextPanel />
      </MemoryRouter>
    )

    // Headline figure plus the students row — both render the same count.
    expect(screen.getAllByText('1,234').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Students on record')).toBeInTheDocument()
    expect(screen.getByText('Created student account')).toBeInTheDocument()
    // Audit entries outside the account domain stay out of this panel.
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument()
  })

  it('degrades when the accounts block is missing', () => {
    mockRoutes({ '/dashboard/': { data: { role: 'admin', blocks: {} }, ...IDLE } })
    render(
      <MemoryRouter initialEntries={['/admin/teachers']}>
        <PeopleContextPanel />
      </MemoryRouter>
    )
    expect(screen.getByText('No school-wide figures')).toBeInTheDocument()
  })
})
