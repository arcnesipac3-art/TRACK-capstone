import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeacherClassWorkspace from './TeacherClassWorkspace'
import useFetch from '../hooks/useFetch'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))

// The three reused modules are the body of their own activity. They have their
// own suites; here the workspace is only checked for handing them the class it
// is scoped to, so stubs that print their props are the honest test surface.
vi.mock('./RequirementsPage', () => ({
  default: ({ scope, assignmentId, embedded }) => (
    <p data-testid="requirements-body">
      {`scope:${scope} assignment:${assignmentId} embedded:${String(embedded)}`}
    </p>
  ),
}))
vi.mock('./SubmissionsPage', () => ({
  default: ({ mode, assignmentId, embedded, requirementIds }) => (
    <p data-testid="submissions-body">
      {`mode:${mode} assignment:${assignmentId} embedded:${String(embedded)} requirements:${String(
        requirementIds
      )}`}
    </p>
  ),
}))
vi.mock('./AttendancePage', () => ({
  default: ({ mode, assignmentId, embedded }) => (
    <p data-testid="attendance-body">
      {`mode:${mode} assignment:${assignmentId} embedded:${String(embedded)}`}
    </p>
  ),
}))

const DAY = 86400000
const FROM_NOW = (days) => new Date(Date.now() + days * DAY).toISOString()

const SAMPAGUITA = {
  id: 40,
  name: 'Sampaguita',
  grade_level_name: 'Grade 7',
  school_year: 1,
  school_year_label: '2026-2027',
  adviser_name: 'Ana Cruz',
}
const GUMAMELA = {
  id: 41,
  name: 'Gumamela',
  grade_level_name: 'Grade 8',
  school_year: 1,
  school_year_label: '2026-2027',
  adviser_name: null,
}

const SCIENCE = {
  id: 500,
  subject: 9,
  subject_name: 'Science',
  section: 40,
  section_name: 'Grade 7 — Sampaguita (2026-2027)',
}
const ENGLISH = {
  id: 501,
  subject: 10,
  subject_name: 'English',
  section: 40,
  section_name: 'Grade 7 — Sampaguita (2026-2027)',
}
const MATH = {
  id: 502,
  subject: 11,
  subject_name: 'Mathematics',
  section: 41,
  section_name: 'Grade 8 — Gumamela (2026-2027)',
}

const STUDENTS = [
  { id: 11, section: 40, lrn: '1357-0001', user: { full_name: 'Sofia Cruz' } },
  { id: 12, section: 40, lrn: '1357-0002', user: { full_name: 'Miguel Torres' } },
  { id: 13, section: 41, lrn: '1357-0003', user: { full_name: 'Pat Liwanag' } },
]

const REQUIREMENTS = [
  {
    id: 700,
    teacher_assignment: 500,
    title: 'Quarter 1 Portfolio',
    requirement_type: 'project',
    deadline: FROM_NOW(3),
  },
  {
    id: 701,
    teacher_assignment: 500,
    title: 'Lab sheet',
    requirement_type: 'assignment',
    deadline: FROM_NOW(-2),
  },
  // Another subject in the same room: its work must never join this class.
  {
    id: 702,
    teacher_assignment: 501,
    title: 'Reading log',
    requirement_type: 'activity',
    deadline: FROM_NOW(5),
  },
]

const SUBMISSIONS = [
  { id: 900, requirement: 700, student: 11, status: 'submitted' },
  { id: 901, requirement: 701, student: 11, status: 'verified' },
  { id: 902, requirement: 701, student: 12, status: 'not_submitted' },
  { id: 903, requirement: 702, student: 11, status: 'submitted' },
]

const SESSIONS = [
  {
    id: 800,
    teacher_assignment: 500,
    date: '2026-10-28',
    status: 'completed',
    records: [
      { id: 1, student: 11, status: 'present', notes: '' },
      { id: 2, student: 12, status: 'absent', notes: '' },
    ],
  },
  {
    id: 801,
    teacher_assignment: 500,
    date: '2026-10-30',
    status: 'in_progress',
    records: [{ id: 3, student: 11, status: 'late', notes: '' }],
  },
  {
    id: 802,
    teacher_assignment: 501,
    date: '2026-10-29',
    status: 'completed',
    records: [
      { id: 4, student: 11, status: 'present', notes: '' },
      { id: 5, student: 12, status: 'present', notes: '' },
    ],
  },
]

const SCHEDULES = [
  {
    id: 70,
    teacher_assignment: 500,
    day_of_week: 1,
    day_of_week_display: 'Monday',
    start_time: '07:30:00',
    end_time: '08:30:00',
    room: 'Room 3',
  },
  {
    id: 71,
    teacher_assignment: 501,
    day_of_week: 3,
    day_of_week_display: 'Wednesday',
    start_time: '09:00:00',
    end_time: '10:00:00',
    room: '',
  },
]

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

function mockBackend({
  assignments = LOADED([SCIENCE, ENGLISH, MATH]),
  sections = LOADED([SAMPAGUITA, GUMAMELA]),
  students = LOADED(STUDENTS),
  requirements = LOADED(REQUIREMENTS),
  submissions = LOADED(SUBMISSIONS),
  sessions = LOADED(SESSIONS),
  schedules = LOADED(SCHEDULES),
  schoolYears = LOADED([{ id: 1, label: '2026-2027', is_active: true }]),
} = {}) {
  useFetch.mockImplementation((path) => {
    const reload = vi.fn()
    if (path === '/teacher-assignments/') return { ...assignments, reload }
    if (path === '/sections/') return { ...sections, reload }
    if (path === '/students/') return { ...students, reload }
    if (path === '/requirements/') return { ...requirements, reload }
    if (path === '/submissions/') return { ...submissions, reload }
    if (path === '/attendance/sessions/') return { ...sessions, reload }
    if (path === '/schedules/') return { ...schedules, reload }
    if (path === '/school-years/') return { ...schoolYears, reload }
    return { ...IDLE, reload }
  })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderWorkspace(entry = '/teacher/classes/500') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/teacher/classes" element={<div>My Classes hub</div>} />
        <Route path="/teacher/classes/:assignmentId/*" element={<TeacherClassWorkspace />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  )
}

const panel = () => document.querySelector('[role="tabpanel"]')
const tabs = () => screen.getAllByRole('tab')
// A tab's accessible name carries its pending count, so match on the label.
const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })
const activityLink = (name) => screen.getByRole('link', { name })

// react-router commits the navigation in a transition, so the url is read back
// through waitFor rather than asserted on the line after the click.
async function expectPath(path) {
  await waitFor(() => {
    expect(screen.getByTestId('location').textContent).toBe(path)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TeacherClassWorkspace — class header', () => {
  it('names the subject, section, year, adviser and roster the route points at', () => {
    mockBackend()
    renderWorkspace()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Science')
    expect(
      within(document.querySelector('.cw-hero')).getByText(
        'Grade 7 — Sampaguita · SY 2026-2027 · Adviser Ana Cruz · 2 students'
      )
    ).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/teacher/classes/500')
  })

  it('trails back to the hub and to the room this class is in', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/500/students')

    const trail = screen.getByRole('navigation', { name: 'Class trail' })
    const links = within(trail).getAllByRole('link')
    expect(links[0]).toHaveTextContent('My Classes')
    expect(links[0]).toHaveAttribute('href', '/teacher/classes')
    expect(links[1]).toHaveAttribute('href', '/teacher/classes?search=Grade%207%20%E2%80%94%20Sampaguita')
    expect(links[2]).toHaveAttribute('href', '/teacher/classes/500')
    expect(links).toHaveLength(3)
  })

  it('flags the school year the class belongs to', () => {
    mockBackend()
    renderWorkspace()
    expect(within(document.querySelector('.cw-hero')).getByText('Current school year')).toBeInTheDocument()

    mockBackend({ schoolYears: LOADED([{ id: 2, label: '2025-2026', is_active: true }]) })
    renderWorkspace('/teacher/classes/502')
    expect(screen.getByText('Outside the active SY 2025-2026')).toBeInTheDocument()
  })

  it('offers the other subjects taught to the same room', () => {
    mockBackend()
    renderWorkspace()

    const siblings = screen.getByRole('navigation', { name: 'Other subjects in this section' })
    expect(within(siblings).getByRole('link', { name: 'Open English for Grade 7 — Sampaguita' })).toHaveAttribute(
      'href',
      '/teacher/classes/501'
    )
    // English's pending submission is not Science's, so no badge on that chip.
    expect(within(siblings).getByText('English')).toBeInTheDocument()
    expect(within(siblings).queryByText('Mathematics')).toBeNull()
  })

  it('links the whole-school pending count without leaving the class', () => {
    mockBackend()
    renderWorkspace()

    expect(
      activityLink(/submissions across all your classes/)
    ).toHaveAttribute('href', '/teacher/review')
  })

  it('drops that link when nothing is waiting anywhere', () => {
    mockBackend({ submissions: LOADED([]) })
    renderWorkspace()

    expect(screen.queryByRole('link', { name: /across all your classes/ })).toBeNull()
  })
})

describe('TeacherClassWorkspace — activity tabs', () => {
  it('lists the six activities of this class, with what is waiting in each', () => {
    mockBackend()
    renderWorkspace()

    expect(screen.getByRole('tablist')).toHaveAccessibleName('Science class activities')
    expect(tabs().map((node) => node.textContent)).toEqual([
      'Class overview',
      'Students2',
      'Requirements2',
      'Submission review1',
      'Attendance1',
      'Grades1',
    ])
    expect(tab('Class overview')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Students')).toHaveAttribute('aria-controls', 'cw-panel-students')
  })

  it('moves between activities through the url, not the sidebar', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderWorkspace()

    await user.click(tab('Students'))
    await expectPath('/teacher/classes/500/students')
    expect(tab('Students')).toHaveAttribute('aria-selected', 'true')
    expect(panel()).toHaveAttribute('id', 'cw-panel-students')
    // The class header stays mounted, so the page never reloads its seven lists.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Science')
    expect(screen.queryByText('Loading this class…')).toBeNull()

    await user.click(tab('Submission review'))
    await expectPath('/teacher/classes/500/submissions')

    await user.click(tab('Class overview'))
    await expectPath('/teacher/classes/500')
  })

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderWorkspace('/teacher/classes/500/students')

    tab('Students').focus()
    await user.keyboard('{ArrowRight}')
    await expectPath('/teacher/classes/500/requirements')

    await user.keyboard('{ArrowLeft}')
    await expectPath('/teacher/classes/500/students')
  })

  it('falls back to the overview for an activity that has no screen', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/500/timetable')

    expect(screen.getByTestId('location').textContent).toBe('/teacher/classes/500')
    expect(tab('Class overview')).toHaveAttribute('aria-selected', 'true')
  })

  it('opens each reused module scoped to this class and embedded in the frame', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderWorkspace()

    await user.click(tab('Requirements'))
    expect(screen.getByTestId('requirements-body')).toHaveTextContent(
      'scope:teacher assignment:500 embedded:true'
    )

    await user.click(tab('Submission review'))
    expect(screen.getByTestId('submissions-body')).toHaveTextContent(
      'mode:review assignment:500 embedded:true requirements:700,701'
    )

    await user.click(tab('Attendance'))
    expect(screen.getByTestId('attendance-body')).toHaveTextContent(
      'mode:teacher assignment:500 embedded:true'
    )
  })
})

describe('TeacherClassWorkspace — overview', () => {
  it('puts what is waiting on this class first, and links each item to its activity', () => {
    mockBackend()
    renderWorkspace()

    const attention = within(document.querySelector('.cw-attention-list'))
    expect(
      attention.getByText(/1 submission in this class is handed in and waiting for your verification/)
    ).toBeInTheDocument()
    expect(
      attention.getByText(/1 session for this class has students without a mark yet/)
    ).toBeInTheDocument()
    expect(
      attention.getByText(/1 piece of work is still missing from 1 closed deadline/)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Verify now/ })).toHaveAttribute(
      'href',
      '/teacher/classes/500/submissions'
    )
    expect(screen.getByRole('link', { name: /Open attendance/ })).toHaveAttribute(
      'href',
      '/teacher/classes/500/attendance'
    )
    expect(screen.getByRole('link', { name: /See who is missing work/ })).toHaveAttribute(
      'href',
      '/teacher/classes/500/grades'
    )
  })

  it('reports the class on four numbers that each open their own activity', () => {
    mockBackend()
    renderWorkspace()
    const grid = document.querySelector('.kpi-grid')
    const value = (label) =>
      within(grid).getByText(label).closest('.stat-card').querySelector('.stat-value').textContent

    expect(value('Requirements')).toBe('2')
    expect(value('Awaiting verification')).toBe('1')
    expect(value('Students')).toBe('2')
    expect(value('Attendance')).toBe('33.3%')
    expect(
      [...grid.querySelectorAll('.stat-card')].map((card) => card.getAttribute('href'))
    ).toEqual([
      '/teacher/classes/500/requirements',
      '/teacher/classes/500/submissions',
      '/teacher/classes/500/students',
      '/teacher/classes/500/attendance',
    ])
  })

  it('says so when this class has nothing waiting', () => {
    mockBackend({
      requirements: LOADED([{ id: 700, teacher_assignment: 500, title: 'Portfolio', requirement_type: 'project', deadline: FROM_NOW(3) }]),
      submissions: LOADED([]),
      sessions: LOADED([]),
      schedules: LOADED([]),
    })
    renderWorkspace()

    expect(screen.getByText('Nothing is waiting on you in this class right now.')).toBeInTheDocument()
  })

  it('lists the timetable of this assignment only', () => {
    mockBackend()
    renderWorkspace()

    const schedule = within(document.querySelector('.cw-schedule'))
    expect(schedule.getByText('Monday')).toBeInTheDocument()
    expect(schedule.getByText('Room 3')).toBeInTheDocument()
    expect(schedule.queryByText('Wednesday')).toBeNull()
  })

  it('explains a class with no period scheduled', () => {
    mockBackend({ schedules: LOADED([]) })
    renderWorkspace()

    expect(
      screen.getByText(/No period is scheduled for Science with this section/)
    ).toBeInTheDocument()
  })

  it('splits the deadlines of this class into open and closed', () => {
    mockBackend()
    renderWorkspace()

    const groups = [...document.querySelectorAll('.cw-group')]
    expect(groups.map((group) => group.querySelector('.cw-group-title').textContent)).toEqual([
      'Still open1',
      'Deadlines closed1',
    ])
    expect(within(groups[0]).getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(within(groups[0]).getByText('1/2 handed in')).toBeInTheDocument()
    expect(within(groups[0]).getByText('1 awaiting')).toBeInTheDocument()
    expect(within(groups[1]).getByText('Lab sheet')).toBeInTheDocument()
    expect(within(groups[1]).getByText('1 missing')).toBeInTheDocument()
    expect(within(groups[1]).getByRole('link', { name: 'Review submissions for Lab sheet' })).toHaveAttribute(
      'href',
      '/teacher/classes/500/submissions'
    )
    // English's requirement is not this class's.
    expect(screen.queryByText('Reading log')).toBeNull()
  })

  it('rolls up only this class’s attendance sessions', () => {
    mockBackend()
    renderWorkspace()
    const card = [...document.querySelectorAll('.card')].find((node) =>
      node.querySelector('h2')?.textContent === 'Attendance for this class'
    )

    expect(
      within(card).getByText('Present')
    ).toBeInTheDocument()
    expect(within(card).getByText('Late')).toBeInTheDocument()
    expect(within(card).getAllByRole('img').map((node) => node.getAttribute('aria-label'))).toEqual([
      'Present: 1 of 3',
      'Late: 1 of 3',
      'Absent: 1 of 3',
      'Excused: 0 of 3',
    ])
    expect(within(card).getByText('1 of 2 marked · 0 present')).toBeInTheDocument()
    expect(within(card).getByText('2 of 2 marked · 1 present')).toBeInTheDocument()
    expect(within(card).getAllByText('Needs marks')).toHaveLength(1)
    expect(within(card).getAllByText('Complete')).toHaveLength(1)
    // English's own session is not this class's, so it is not in the list.
    expect(within(card).queryAllByText('2 of 2 marked · 2 present')).toHaveLength(0)
  })
})

describe('TeacherClassWorkspace — students', () => {
  it('shows the section roster with this class’s work and marks', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/500/students')

    expect(document.querySelector('table')).toBeInTheDocument()
    expect(
      within(screen.getByRole('row', { name: /Sofia Cruz/ })).getByText('1357-0001')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "See Sofia Cruz's record for Science" })).toHaveAttribute(
      'href',
      '/teacher/classes/500/grades'
    )
    // A student of another section is not on this roster.
    expect(screen.queryByText('Pat Liwanag')).toBeNull()
  })

  it('finds a student by name or LRN and says when none match', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderWorkspace('/teacher/classes/500/students')

    await user.type(screen.getByLabelText('Search'), 'miguel')
    expect(screen.queryByText('Sofia Cruz')).toBeNull()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search'))
    await user.type(screen.getByLabelText('Search'), '1357-0001')
    expect(screen.queryByText('Miguel Torres')).toBeNull()

    await user.clear(screen.getByLabelText('Search'))
    await user.type(screen.getByLabelText('Search'), 'nobody')
    expect(screen.getByText('No student matches')).toBeInTheDocument()
    expect(document.querySelectorAll('table tbody tr')).toHaveLength(0)
  })

  it('sorts the roster by what a teacher chases', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/500/students')

    const order = () =>
      [...document.querySelectorAll('table tbody tr')].map(
        (row) => row.querySelector('.cell-main').textContent
      )
    // Default is the name order, and the LRN rides inside the same cell.
    expect(order()).toEqual(['Miguel Torres1357-0002', 'Sofia Cruz1357-0001'])

    // Sofia has the one submission waiting; Miguel has the one gap.
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'awaiting' } })
    expect(order()[0]).toContain('Sofia Cruz')
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'missing' } })
    expect(order()[0]).toContain('Miguel Torres')
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'attendance' } })
    expect(order()[0]).toContain('Miguel Torres')
  })

  it('explains an empty section instead of a blank table', () => {
    mockBackend({ students: LOADED([]) })
    renderWorkspace('/teacher/classes/500/students')

    expect(screen.getByText('No student enrolled in this section')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search')).toBeNull()
  })
})

describe('TeacherClassWorkspace — grades', () => {
  it('reports verification states and states plainly that no score exists', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/500/grades')

    expect(
      screen.getByText(/reported the way TRACK records it: by verification state, not by a score/)
    ).toBeInTheDocument()
    expect(screen.getByText('How work is graded here')).toBeInTheDocument()

    const rows = [...document.querySelectorAll('.cw-matrix tbody tr')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Awaiting')
    expect(rows[0].textContent).toContain('Verified')
    expect(rows[0].textContent).toContain('50% · 1/2')
    expect(rows[1].textContent).toContain('Missing')
    expect(rows[1].textContent).toContain('0% · 0/1')
    expect(screen.getByText('1/2 in · 100% verified')).toBeInTheDocument()
  })

  it('links the grid to the review screen that clears it', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/500/grades')

    expect(screen.getByRole('link', { name: /Verify 1/ })).toHaveAttribute(
      'href',
      '/teacher/classes/500/submissions'
    )
  })

  it('prints the class record', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    mockBackend()
    renderWorkspace('/teacher/classes/500/grades')

    await user.click(screen.getByRole('button', { name: /Print class record/ }))
    expect(print).toHaveBeenCalled()
    print.mockRestore()
  })

  it('says when a class has nothing posted to report', () => {
    mockBackend({ requirements: LOADED([{ ...REQUIREMENTS[2] }]), submissions: LOADED([]) })
    renderWorkspace('/teacher/classes/500/grades')

    expect(
      screen.getByText(/Nothing has been posted to Science yet, so there is no work to report/)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to requirements/ })).toHaveAttribute(
      'href',
      '/teacher/classes/500/requirements'
    )
  })

  it('shows a class with work but no students enrolled', () => {
    mockBackend({ students: LOADED([]) })
    renderWorkspace('/teacher/classes/500/grades')

    expect(
      screen.getByText(/no student is enrolled in Grade 7 — Sampaguita \(2026-2027\), so nobody can hand work in yet/)
    ).toBeInTheDocument()
  })
})

describe('TeacherClassWorkspace — who may open a class', () => {
  it('refuses an assignment id that is not on this teacher’s list', () => {
    mockBackend()
    renderWorkspace('/teacher/classes/606')

    expect(screen.getByText('This class is not yours to open')).toBeInTheDocument()
    expect(
      screen.getByText(/Assignment 606 is not among the 3 classes this account can reach/)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to My Classes/ })).toHaveAttribute(
      'href',
      '/teacher/classes'
    )
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('refuses a class the teacher was not assigned, even from the same section', () => {
    mockBackend({ assignments: LOADED([SCIENCE]) })
    renderWorkspace('/teacher/classes/501')

    expect(screen.getByText('This class is not yours to open')).toBeInTheDocument()
    expect(
      screen.getByText(/Assignment 501 is not among the 1 class this account can reach/)
    ).toBeInTheDocument()
  })

  it('waits for the lists before refusing anything', () => {
    mockBackend({ assignments: { ...IDLE, loading: true } })
    renderWorkspace('/teacher/classes/606')

    expect(screen.getByText('Loading this class…')).toHaveAttribute('role', 'status')
    expect(screen.queryByText('This class is not yours to open')).toBeNull()
  })

  it('says plainly when the account has no assignment at all', () => {
    mockBackend({
      assignments: LOADED([]),
      students: LOADED([]),
      requirements: LOADED([]),
      submissions: LOADED([]),
      sessions: LOADED([]),
      schedules: LOADED([]),
    })
    renderWorkspace('/teacher/classes/500')

    expect(screen.getByText('This class is not yours to open')).toBeInTheDocument()
    expect(
      screen.getByText(/No subject and section is assigned to your account yet/)
    ).toBeInTheDocument()
  })
})

describe('TeacherClassWorkspace — failures', () => {
  it('reports a broken assignment list and retries it', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    useFetch.mockImplementation((path) => {
      const idle = { ...IDLE, reload: vi.fn() }
      if (path === '/teacher-assignments/')
        return { data: null, loading: false, error: new Error('Assignments unavailable'), reload }
      return idle
    })
    renderWorkspace()

    expect(screen.getByText('Could not load this class')).toBeInTheDocument()
    expect(screen.getByText('Assignments unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My Classes' })).toHaveAttribute('href', '/teacher/classes')
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalled()
  })

  it('warns that a secondary list is missing but keeps the class open', () => {
    mockBackend({ sessions: { ...IDLE, error: new Error('Sessions unavailable') } })
    renderWorkspace()

    expect(
      screen.getByText(/Some of this class’s data did not load, so the counts on this page may be lower/)
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Science')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
