import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TeacherDashboard from './TeacherDashboard'
import useFetch from '../../hooks/useFetch'
import { TODAY_FULL_LABEL } from '../../utils/format'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { user: { id: 7, username: 'mira', role: 'teacher', fullName: 'Mira Dela Cruz' } },
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

// Monday 2026-11-02, 09:30 — inside the 09:00–10:00 slot, so a slot's clock
// state ("In session" / "Finished") is decided by the test, not by the wall.
const NOW = new Date(2026, 10, 2, 9, 30)
const TODAY = '2026-11-02'
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString()

const ASSIGNMENT_MATH = 41
const ASSIGNMENT_ENG = 42

const CLASSES = [
  {
    id: ASSIGNMENT_MATH,
    subject: 'Mathematics 7',
    subject_id: 3,
    section_id: 9,
    section: 'Grade 7 — Sampaguita',
  },
  {
    id: ASSIGNMENT_ENG,
    subject: 'English 7',
    subject_id: 5,
    section_id: 9,
    section: 'Grade 7 — Sampaguita',
  },
]

const SCHEDULES = [
  {
    id: 501,
    teacher_assignment: ASSIGNMENT_MATH,
    teacher_assignment_detail: {
      subject_name: 'Mathematics 7',
      section_id: 9,
      section_name: 'Grade 7 — Sampaguita',
      grade_level: 'Grade 7',
    },
    day_of_week: 1,
    start_time: '07:30:00',
    end_time: '08:30:00',
    room: 'Room 3',
  },
  {
    id: 502,
    teacher_assignment: ASSIGNMENT_ENG,
    teacher_assignment_detail: {
      subject_name: 'English 7',
      section_id: 9,
      section_name: 'Grade 7 — Sampaguita',
      grade_level: 'Grade 7',
    },
    day_of_week: 1,
    start_time: '09:00:00',
    end_time: '10:00:00',
    room: '',
  },
  {
    id: 503,
    teacher_assignment: ASSIGNMENT_MATH,
    teacher_assignment_detail: {
      subject_name: 'Mathematics 7',
      section_id: 9,
      section_name: 'Grade 7 — Sampaguita',
      grade_level: 'Grade 7',
    },
    day_of_week: 2,
    start_time: '13:00:00',
    end_time: '14:00:00',
    room: 'Room 3',
  },
]

const SESSIONS = [
  {
    id: 700,
    teacher_assignment: ASSIGNMENT_MATH,
    date: TODAY,
    schedule: 501,
    status: 'completed',
    status_display: 'Completed',
    records: [
      { status: 'present' },
      { status: 'present' },
      { status: 'absent' },
      { status: 'late' },
    ],
  },
]

const REQUIREMENTS = [
  {
    id: 801,
    title: 'Quarter 1 worksheet set',
    deadline: '2026-11-02T17:00:00',
    teacher_assignment: ASSIGNMENT_MATH,
    subject_name: 'Mathematics 7',
    section_name: 'Grade 7 — Sampaguita',
  },
  {
    id: 802,
    title: 'Speech performance task',
    deadline: '2026-11-03T23:00:00',
    teacher_assignment: ASSIGNMENT_ENG,
    subject_name: 'English 7',
    section_name: 'Grade 7 — Sampaguita',
  },
  {
    id: 803,
    title: 'Geometry journal',
    deadline: '2026-10-01T17:00:00',
    teacher_assignment: ASSIGNMENT_MATH,
    subject_name: 'Mathematics 7',
    section_name: 'Grade 7 — Sampaguita',
  },
]

const PENDING = [
  {
    id: 901,
    requirement: 801,
    requirement_title: 'Quarter 1 worksheet set',
    student_name: 'Juan Cruz',
    status: 'submitted',
    submitted_at: hoursAgo(3),
  },
  {
    id: 902,
    requirement: 803,
    requirement_title: 'Geometry journal',
    student_name: 'Liza Fernandez',
    status: 'submitted',
    submitted_at: hoursAgo(72),
  },
]

const NOTIFICATIONS = [
  { id: 1, title: 'Enrollment week', body: 'Lists close Friday.', is_read: false, created_at: hoursAgo(2) },
]

const ATTENDANCE = {
  total_records: 40,
  by_status: { present: 32, absent: 4, late: 3, excused: 1 },
  present_rate: 80,
}

function payload(overrides = {}) {
  return {
    role: 'teacher',
    teacher_name: 'Mira Dela Cruz',
    assigned_classes: CLASSES.length,
    classes: CLASSES,
    total_requirements: 6,
    pending_verification: 2,
    submission_status: {
      not_submitted: 3,
      submitted: 2,
      verified: 8,
      returned: 1,
      overdue: 2,
      none: 1,
    },
    upcoming_deadlines: [
      {
        id: 801,
        title: 'Quarter 1 worksheet set',
        subject: 'Mathematics 7',
        section: 'Grade 7 — Sampaguita',
        deadline: '2026-11-02T17:00:00',
        is_overdue: false,
      },
      {
        id: 802,
        title: 'Speech performance task',
        subject: 'English 7',
        section: 'Grade 7 — Sampaguita',
        deadline: '2026-11-03T23:00:00',
        is_overdue: false,
      },
    ],
    recent_activity: [
      {
        id: 901,
        requirement_title: 'Quarter 1 worksheet set',
        student_name: 'Juan Cruz',
        status: 'submitted',
        submitted_at: hoursAgo(3),
        updated_at: hoursAgo(3),
      },
      {
        id: 902,
        requirement_title: 'Geometry journal',
        student_name: 'Liza Fernandez',
        status: 'verified',
        submitted_at: hoursAgo(72),
        updated_at: hoursAgo(24),
      },
    ],
    attendance: ATTENDANCE,
    ...overrides,
  }
}

const IDLE = { data: null, loading: false, error: null }

/** Route each mocked useFetch call to the fixture for its endpoint. */
function mockFetch({
  dashboard = { ...IDLE, data: payload() },
  schedules = { ...IDLE, data: SCHEDULES },
  sessions = { ...IDLE, data: SESSIONS },
  requirements = { ...IDLE, data: REQUIREMENTS },
  submissions = { ...IDLE, data: PENDING },
  schoolYears = { ...IDLE, data: [{ id: 1, label: '2026-2027', is_active: true }] },
  notifications = { ...IDLE, data: NOTIFICATIONS },
} = {}) {
  const reloads = {}
  useFetch.mockImplementation((path) => {
    const key = {
      '/dashboard/': 'dashboard',
      '/schedules/': 'schedules',
      '/attendance/sessions/': 'sessions',
      '/requirements/': 'requirements',
      '/submissions/': 'submissions',
      '/school-years/': 'schoolYears',
      '/notifications/': 'notifications',
    }[path]
    const reload = (reloads[key] ||= vi.fn())
    const state =
      key === 'dashboard' ? dashboard :
      key === 'schedules' ? schedules :
      key === 'sessions' ? sessions :
      key === 'requirements' ? requirements :
      key === 'submissions' ? submissions :
      key === 'schoolYears' ? schoolYears :
      notifications
    return { ...state, reload }
  })
  return reloads
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TeacherDashboard />
    </MemoryRouter>
  )
}

/** KPI tile element by its label. */
function kpiCard(label) {
  return [...document.querySelectorAll('.kpi-grid .stat-card')].find(
    (el) => el.querySelector('.stat-label')?.textContent === label
  )
}

/** The <section class="card"> whose heading is `title`. */
function panel(title) {
  return screen.getByText(title).closest('section')
}

/** Grid item carrying a panel, so span classes can be asserted. */
function gridItem(title) {
  const card = panel(title)
  return card.classList.contains('dt-7') || card.classList.contains('dt-12')
    ? card
    : card.closest('.dt-5')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW })
  mockAuth.user = { id: 7, username: 'mira', role: 'teacher', fullName: 'Mira Dela Cruz' }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TeacherDashboard — request budget', () => {
  it('reads the aggregate plus the four lists the class workspace already uses', () => {
    mockFetch()
    renderPage()

    const paths = useFetch.mock.calls.map(([path]) => path)
    expect(paths).toEqual([
      '/dashboard/',
      '/schedules/',
      '/attendance/sessions/',
      '/requirements/',
      '/submissions/',
      '/school-years/',
      '/notifications/',
    ])
    // One call per endpoint, no per-widget or per-class repeats.
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('asks for the pending queue and the active school year at the server', () => {
    mockFetch()
    renderPage()

    const options = (path) =>
      useFetch.mock.calls.find(([p]) => p === path)?.[1]
    expect(options('/submissions/')).toMatchObject({ list: true, params: { status: 'submitted' } })
    expect(options('/school-years/')).toMatchObject({ params: { is_active: true } })
    // No invented endpoint: nothing per-day is requested from the server.
    expect(useFetch.mock.calls.map(([p]) => p)).not.toContain('/attendance/records/')
  })
})

describe('TeacherDashboard — header', () => {
  it('greets the teacher by name with the date, class load and school year', () => {
    mockFetch()
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Good morning, Mira' })).toBeInTheDocument()
    expect(screen.getByText('Teacher')).toBeInTheDocument()
    expect(screen.getByText(TODAY_FULL_LABEL)).toBeInTheDocument()
    expect(screen.getByText('2 assigned classes')).toBeInTheDocument()
    expect(screen.getByText('School year 2026-2027')).toBeInTheDocument()
    // Compact chips, not a banner.
    expect(document.querySelector('.dash-hero')).not.toBeNull()
    expect(document.querySelector('.tc-hero')).toBeNull()
  })

  it('leads with what is actually waiting on the teacher', () => {
    mockFetch()
    renderPage()

    expect(
      screen.getByText('2 submissions awaiting your verification · 2 classes today.')
    ).toBeInTheDocument()
  })

  it('says so when nothing waits and no class is timetabled', () => {
    mockFetch({
      dashboard: { ...IDLE, data: payload({ pending_verification: 0 }) },
      submissions: { ...IDLE, data: [] },
      schedules: { ...IDLE, data: [{ ...SCHEDULES[0], day_of_week: 4 }] },
    })
    renderPage()

    expect(
      screen.getByText('Nothing awaits your verification, and no class is timetabled for today.')
    ).toBeInTheDocument()
  })

  it('marks an absent school year instead of leaving the chip blank', () => {
    mockFetch({ schoolYears: { ...IDLE, data: [] } })
    renderPage()

    expect(screen.getByText('No active school year')).toBeInTheDocument()
  })
})

describe('TeacherDashboard — quick actions', () => {
  it('offers exactly the four shortcuts, with the first as the primary action', () => {
    mockFetch()
    renderPage()

    const bar = screen.getByRole('navigation', { name: 'Quick actions' })
    const links = within(bar).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/teacher/requirements',
      '/teacher/attendance',
      '/teacher/review',
      '/teacher/classes',
    ])
    expect(within(bar).getByRole('link', { name: 'Create new requirement' })).toHaveClass(
      'is-primary'
    )
    expect(bar.querySelectorAll('.qa-icon')).toHaveLength(4)
  })
})

describe('TeacherDashboard — key metrics', () => {
  it('shows four tiles, each linked to the screen that owns the figure', () => {
    mockFetch()
    renderPage()

    expect(document.querySelectorAll('.kpi-grid .stat-card')).toHaveLength(4)
    expect(kpiCard('Assigned classes')).toHaveAttribute('href', '/teacher/classes')
    expect(kpiCard('Active requirements')).toHaveAttribute('href', '/teacher/requirements')
    expect(kpiCard('Pending submissions')).toHaveAttribute('href', '/teacher/review')
    expect(kpiCard('Attendance rate')).toHaveAttribute('href', '/teacher/attendance')

    expect(within(kpiCard('Assigned classes')).getByText('2')).toBeInTheDocument()
    expect(within(kpiCard('Assigned classes')).getByText('1 section taught')).toBeInTheDocument()
    // Two requirements still in the future; the third already closed.
    expect(within(kpiCard('Active requirements')).getByText('2')).toBeInTheDocument()
    expect(within(kpiCard('Active requirements')).getByText('6 posted in total')).toBeInTheDocument()
    expect(within(kpiCard('Pending submissions')).getByText('2')).toBeInTheDocument()
    expect(within(kpiCard('Attendance rate')).getByText('80%')).toBeInTheDocument()
    expect(
      within(kpiCard('Attendance rate')).getByText('40 records across your classes')
    ).toBeInTheDocument()
  })

  it('shows an em dash rather than 0% when no attendance exists', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: payload({
          attendance: { total_records: 0, by_status: { present: 0, absent: 0, late: 0, excused: 0 }, present_rate: null },
        }),
      },
    })
    renderPage()

    const tile = kpiCard('Attendance rate')
    expect(within(tile).getByText('—')).toBeInTheDocument()
    expect(within(tile).getByText('No attendance recorded yet')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('shows an em dash for a class load the server did not send', () => {
    mockFetch({
      dashboard: { ...IDLE, data: payload({ assigned_classes: null, classes: [] }) },
      schedules: { ...IDLE, data: [] },
      sessions: { ...IDLE, data: [] },
    })
    renderPage()

    expect(screen.getAllByText('—')).not.toHaveLength(0)
    expect(within(kpiCard('Assigned classes')).getByText('—')).toBeInTheDocument()
    expect(within(kpiCard('Assigned classes')).getByText('No subject assigned to you yet')).toBeInTheDocument()
  })

  it('never shows a fabricated requirement count when the list fails', () => {
    mockFetch({ requirements: { ...IDLE, error: new Error('boom'), data: null } })
    renderPage()

    const tile = kpiCard('Active requirements')
    expect(within(tile).getByText('—')).toBeInTheDocument()
    expect(within(tile).getByText('Requirements could not be loaded.')).toBeInTheDocument()
    expect(within(tile).queryByText('0')).not.toBeInTheDocument()
  })
})

describe('TeacherDashboard — today’s teaching schedule', () => {
  it('lists each of today’s classes with time, status and an attendance action', () => {
    mockFetch()
    renderPage()

    const card = panel('Today’s teaching schedule')
    expect(within(card).getByText('2 classes today')).toBeInTheDocument()

    const slots = within(card)
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('dt-slot'))
    expect(slots).toHaveLength(2)

    // The 07:30 class has ended and its four marks are recorded; 09:00 is live.
    expect(within(slots[0]).getByText('7:30 AM – 8:30 AM')).toBeInTheDocument()
    expect(within(slots[0]).getByText('Mathematics 7')).toBeInTheDocument()
    expect(within(slots[0]).getByText('Grade 7 — Sampaguita')).toBeInTheDocument()
    expect(within(slots[0]).getByText('Room 3 · 4 marked · Completed')).toBeInTheDocument()
    expect(within(slots[0]).getByText('Finished')).toBeInTheDocument()
    expect(within(slots[1]).getByText('In session')).toBeInTheDocument()

    expect(within(slots[0]).getByRole('link', { name: 'View marks' })).toHaveAttribute(
      'href',
      `/teacher/attendance?class=${ASSIGNMENT_MATH}`
    )
    expect(within(slots[1]).getByRole('link', { name: 'Take attendance' })).toHaveAttribute(
      'href',
      `/teacher/attendance?class=${ASSIGNMENT_ENG}`
    )
  })

  it('flags a finished class whose attendance is still blank', () => {
    mockFetch({ sessions: { ...IDLE, data: [] } })
    renderPage()

    const card = panel('Today’s teaching schedule')
    const slots = within(card)
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('dt-slot'))
    expect(slots[0]).toHaveClass('is-attention')
    expect(within(slots[0]).getByText(/No attendance session is open/)).toBeInTheDocument()
    expect(within(slots[0]).getByRole('link', { name: 'Take attendance' })).toBeInTheDocument()
  })

  it('looks ahead a week for the next classes when today is clear', () => {
    mockFetch({
      schedules: { ...IDLE, data: [{ ...SCHEDULES[2], day_of_week: 3 }] },
    })
    renderPage()

    const card = panel('Today’s teaching schedule')
    expect(within(card).getByText('No classes scheduled today')).toBeInTheDocument()
    expect(within(card).getByText('Next classes')).toBeInTheDocument()
    expect(within(card).getByText('Wed, Nov 4')).toBeInTheDocument()
    expect(within(card).getByText('Mathematics 7 · Grade 7 — Sampaguita')).toBeInTheDocument()
    expect(within(card).getByText('1:00 PM – 2:00 PM')).toBeInTheDocument()
  })

  it('separates "no timetable" from "nothing today" from "no classes at all"', () => {
    mockFetch({
      dashboard: { ...IDLE, data: payload({ classes: [], assigned_classes: 0 }) },
      schedules: { ...IDLE, data: [] },
      sessions: { ...IDLE, data: [] },
    })
    renderPage()

    expect(screen.getByText('No classes assigned yet')).toBeInTheDocument()
    expect(
      screen.getByText('Your sections appear here once an administrator assigns a subject to you.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Next classes')).not.toBeInTheDocument()
  })

  it('says a timetable is missing while the teacher still holds classes', () => {
    mockFetch({ schedules: { ...IDLE, data: [] }, sessions: { ...IDLE, data: [] } })
    renderPage()

    expect(screen.getByText('No timetable on file')).toBeInTheDocument()
    expect(
      screen.getByText('A timetable is set on Class Schedules. Until then, attendance opens from each class.')
    ).toBeInTheDocument()
    expect(within(panel('Today’s teaching schedule')).getByRole('link', { name: 'My classes' })).toBeInTheDocument()
  })
})

describe('TeacherDashboard — attendance snapshot', () => {
  it('pairs this day’s marks with the all-time figures', () => {
    mockFetch()
    renderPage()

    const card = panel('Attendance snapshot')
    expect(within(card).getByText('Today')).toBeInTheDocument()
    expect(within(card).getByText('2 present')).toBeInTheDocument()
    expect(within(card).getByText('1 absent')).toBeInTheDocument()
    expect(within(card).getByText('1 late')).toBeInTheDocument()
    expect(within(card).getByText('All recorded sessions')).toBeInTheDocument()
    expect(within(card).getByText('Based on 40 attendance records so far.')).toBeInTheDocument()
  })

  it('says attendance will appear instead of showing an empty table', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: payload({
          attendance: { total_records: 0, by_status: { present: 0, absent: 0, late: 0, excused: 0 }, present_rate: null },
        }),
      },
      sessions: { ...IDLE, data: [] },
    })
    renderPage()

    const card = panel('Attendance snapshot')
    expect(within(card).getByText('Attendance data will appear after your first recorded session.')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Record attendance' })).toBeInTheDocument()
    expect(card.querySelectorAll('.progress-row')).toHaveLength(0)
  })

  it('keeps the all-time figures and names the gap when today’s fetch fails', () => {
    mockFetch({ sessions: { ...IDLE, error: new Error('offline'), data: null } })
    renderPage()

    expect(
      screen.getByText(
        'Today’s attendance marks could not be loaded, so the figures below are all-time only.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('Based on 40 attendance records so far.')).toBeInTheDocument()
  })
})

describe('TeacherDashboard — verification queue', () => {
  it('lists waiting submissions with the class, the wait and a direct review link', () => {
    mockFetch()
    renderPage()

    const card = panel('Requirements awaiting verification')
    expect(within(card).getByText('2 submissions waiting')).toBeInTheDocument()
    expect(within(card).getByText('Juan Cruz')).toBeInTheDocument()
    expect(within(card).getByText('Quarter 1 worksheet set')).toBeInTheDocument()
    expect(within(card).getByText(/Mathematics 7 · Grade 7 — Sampaguita · submitted 3 hrs ago/)).toBeInTheDocument()
    // Three days old and its deadline has closed — the row that needs attention.
    expect(within(card).getByText(/waiting 3 days/)).toBeInTheDocument()
    expect(within(card).getByText('Past deadline')).toBeInTheDocument()
    expect(within(card).getByText('Geometry journal')).toBeInTheDocument()

    const reviewLinks = within(card).getAllByRole('link', { name: 'Review' })
    expect(reviewLinks[0]).toHaveAttribute('href', `/teacher/review?class=${ASSIGNMENT_MATH}`)
    expect(reviewLinks[1]).toHaveAttribute('href', `/teacher/review?class=${ASSIGNMENT_MATH}`)
  })

  it('says you’re all caught up when nothing is waiting', () => {
    mockFetch({
      submissions: { ...IDLE, data: [] },
      dashboard: { ...IDLE, data: payload({ pending_verification: 0, recent_activity: [] }) },
    })
    renderPage()

    const card = panel('Requirements awaiting verification')
    expect(within(card).getByText('You’re all caught up')).toBeInTheDocument()
    expect(within(card).queryByText('0')).not.toBeInTheDocument()
  })

  it('offers the queue again when the submissions fetch fails', () => {
    const reloads = mockFetch({ submissions: { ...IDLE, error: new Error('nope'), data: null } })
    renderPage()

    const card = panel('Requirements awaiting verification')
    expect(within(card).getByText('nope')).toBeInTheDocument()
    within(card).getByRole('button', { name: 'Retry' }).click()
    expect(reloads.submissions).toHaveBeenCalled()
  })

  it('points at the rest of the queue instead of hiding it', () => {
    mockFetch({
      submissions: {
        ...IDLE,
        data: Array.from({ length: 8 }, (_, index) => ({
          id: 900 + index,
          requirement: 801,
          requirement_title: 'Quarter 1 worksheet set',
          student_name: `Student ${index + 1}`,
          status: 'submitted',
          submitted_at: hoursAgo(1),
        })),
      },
    })
    renderPage()

    const card = panel('Requirements awaiting verification')
    expect(within(card).getAllByRole('link', { name: 'Review' })).toHaveLength(6)
    expect(within(card).getByText('8 submissions waiting')).toBeInTheDocument()
    expect(within(card).getByText('2 more waiting in the review queue.')).toBeInTheDocument()
  })
})

describe('TeacherDashboard — submission overview', () => {
  it('counts only work actually handed in and splits it by status', () => {
    mockFetch()
    renderPage()

    const card = panel('Submission overview')
    expect(within(card).getByText('11')).toBeInTheDocument()
    expect(within(card).getByText('submissions handed in')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Awaiting verification: 2, Verified: 8, Returned for revision: 1' })).toBeInTheDocument()
    expect(within(card).getByText('8 · 73%')).toBeInTheDocument()
    expect(within(card).getByText('2 past their deadline without work on record.')).toBeInTheDocument()
    expect(within(card).getByText('4 requirements still showing nothing handed in.')).toBeInTheDocument()
  })

  it('says work will be counted as it arrives rather than showing zeros', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: payload({ submission_status: { not_submitted: 4, submitted: 0, verified: 0, returned: 0, overdue: 0, none: 0 } }),
      },
    })
    renderPage()

    const card = panel('Submission overview')
    expect(within(card).getByText('No submissions yet')).toBeInTheDocument()
    expect(within(card).queryByText('0%')).not.toBeInTheDocument()
  })
})

describe('TeacherDashboard — upcoming deadlines', () => {
  it('shows the next deadlines with remaining time and a link to the class', () => {
    mockFetch()
    renderPage()

    const card = panel('Upcoming deadlines')
    expect(within(card).getByText('2 next')).toBeInTheDocument()
    expect(within(card).getByText('Due today')).toBeInTheDocument()
    expect(within(card).getByText('Due tomorrow')).toBeInTheDocument()
    const opened = within(card).getAllByRole('link', { name: 'Open class' })
    expect(opened).toHaveLength(2)
    expect(opened[0]).toHaveAttribute('href', `/teacher/requirements?class=${ASSIGNMENT_MATH}`)
    expect(opened[1]).toHaveAttribute('href', `/teacher/requirements?class=${ASSIGNMENT_ENG}`)
  })

  it('drops a deadline that passed while the page sat open', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: payload({
          upcoming_deadlines: [
            { id: 803, title: 'Geometry journal', subject: 'Mathematics 7', section: 'Grade 7 — Sampaguita', deadline: '2026-10-01T17:00:00', is_overdue: true },
          ],
        }),
      },
    })
    renderPage()

    const card = panel('Upcoming deadlines')
    expect(within(card).getByText('No upcoming deadlines')).toBeInTheDocument()
    expect(within(card).queryByText('Geometry journal')).not.toBeInTheDocument()
  })
})

describe('TeacherDashboard — recent notifications and activity', () => {
  it('keeps notifications compact with a route to all of them', () => {
    mockFetch()
    renderPage()

    const card = panel('Recent notifications')
    expect(within(card).getByText('Enrollment week')).toBeInTheDocument()
    expect(within(card).getByText('1 new')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/notifications')
  })

  it('feeds class activity newest-first with what happened', () => {
    mockFetch()
    renderPage()

    const card = panel('Recent class activity')
    expect(within(card).getByText('2 updates')).toBeInTheDocument()
    expect(within(card).getByText('Juan Cruz — Quarter 1 worksheet set')).toBeInTheDocument()
    expect(within(card).getByText('Awaiting verification · 3 hrs ago')).toBeInTheDocument()
    expect(within(card).getByText('Liza Fernandez — Geometry journal')).toBeInTheDocument()
    expect(within(card).getByText('Verified · yesterday')).toBeInTheDocument()
    expect(card.querySelectorAll('.dt-act-icon')).toHaveLength(2)
  })

  it('says activities will appear here when the term is quiet', () => {
    mockFetch({
      dashboard: { ...IDLE, data: payload({ recent_activity: [], pending_verification: 0 }) },
      submissions: { ...IDLE, data: [] },
    })
    renderPage()

    const card = panel('Recent class activity')
    expect(within(card).getByText('No class activity yet')).toBeInTheDocument()
    expect(
      within(card).getByText('Class activities will appear here as submissions and verifications move.')
    ).toBeInTheDocument()
  })
})

describe('TeacherDashboard — 12-column layout', () => {
  it('pairs a seven-column panel with a five-column one in each row', () => {
    mockFetch()
    renderPage()

    const items = [...document.querySelectorAll('.dt-grid > *')]
    expect(items.map((el) => el.className)).toEqual([
      'card dt-7',
      'dt-5',
      'card dt-7',
      'card dt-5',
      'card dt-7',
      'dt-5',
      'card dt-12',
    ])
    expect(gridItem('Attendance snapshot')).toHaveClass('dt-5')
    expect(gridItem('Recent notifications')).toHaveClass('dt-5')
  })
})

describe('TeacherDashboard — loading and failure', () => {
  it('reserves the real layout while the aggregate is in flight', () => {
    mockFetch({ dashboard: { data: null, loading: true, error: null } })
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading your dashboard…')
    expect(document.querySelectorAll('.dt-grid .card')).toHaveLength(7)
    expect(document.querySelectorAll('.kpi-grid .skeleton')).toHaveLength(4)
    expect(document.querySelector('.dt-skeleton-hero')).not.toBeNull()
    expect(document.querySelectorAll('.dt-skeleton-action')).toHaveLength(4)
    expect(screen.queryByRole('navigation', { name: 'Quick actions' })).toBeNull()
  })

  it('names the failure and retries the same request', () => {
    const reloads = mockFetch({ dashboard: { ...IDLE, error: new Error('Server unavailable') } })
    renderPage()

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Could not load your dashboard')).toBeInTheDocument()
    expect(within(alert).getByText('Server unavailable')).toBeInTheDocument()
    within(alert).getByRole('button', { name: /Try again/i }).click()
    expect(reloads.dashboard).toHaveBeenCalled()
  })
})

describe('TeacherDashboard — a first-term teacher', () => {
  it('renders every empty state without inventing a figure', () => {
    mockFetch({
      dashboard: {
        ...IDLE,
        data: payload({
          assigned_classes: 0,
          classes: [],
          total_requirements: 0,
          pending_verification: 0,
          submission_status: { not_submitted: 0, submitted: 0, verified: 0, returned: 0, overdue: 0, none: 0 },
          upcoming_deadlines: [],
          recent_activity: [],
          attendance: { total_records: 0, by_status: { present: 0, absent: 0, late: 0, excused: 0 }, present_rate: null },
        }),
      },
      schedules: { ...IDLE, data: [] },
      sessions: { ...IDLE, data: [] },
      requirements: { ...IDLE, data: [] },
      submissions: { ...IDLE, data: [] },
      notifications: { ...IDLE, data: [] },
    })
    renderPage()

    expect(screen.getByText('No classes assigned yet')).toBeInTheDocument()
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    expect(screen.getByText('No submissions yet')).toBeInTheDocument()
    expect(screen.getByText('No upcoming deadlines')).toBeInTheDocument()
    expect(screen.getByText('No class activity yet')).toBeInTheDocument()
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    expect(screen.getByText('Attendance data will appear after your first recorded session.')).toBeInTheDocument()

    // Zero records is not a rate, and a list of nothing is not a count of work.
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.dt-slot')).toHaveLength(0)
    expect(document.querySelectorAll('.empty-state .empty-icon')).toHaveLength(7)
  })
})
