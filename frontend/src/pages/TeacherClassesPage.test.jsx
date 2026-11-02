import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeacherClassesPage from './TeacherClassesPage'
import useFetch from '../hooks/useFetch'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'teacher', fullName: 'Teresa Reyes', permissions: [] },
    loading: false,
    signOut: vi.fn(),
  }),
}))

const DAY = 86400000
const FROM_NOW = (days) => new Date(Date.now() + days * DAY).toISOString()

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
  section_name: 'Grade 8 — Gumamela (2025-2026)',
}

const SECTIONS = [
  {
    id: 40,
    name: 'Sampaguita',
    grade_level_name: 'Grade 7',
    school_year: 1,
    school_year_label: '2026-2027',
    adviser_name: 'Ana Cruz',
  },
  {
    id: 41,
    name: 'Gumamela',
    grade_level_name: 'Grade 8',
    school_year: 2,
    school_year_label: '2025-2026',
    adviser_name: null,
  },
]

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
    teacher_assignment: 501,
    title: 'Reading log',
    requirement_type: 'activity',
    deadline: FROM_NOW(-2),
  },
]

const PENDING = [
  { id: 900, requirement: 700, status: 'submitted' },
  { id: 901, requirement: 700, status: 'submitted' },
]

// Two subjects of the same room, so the card has one attendance roll-up for
// the section rather than one per assignment.
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
    teacher_assignment: 501,
    date: '2026-10-30',
    status: 'in_progress',
    records: [{ id: 3, student: 11, status: 'late', notes: '' }],
  },
]

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

function mockBackend({
  assignments = LOADED([SCIENCE, ENGLISH, MATH]),
  sections = LOADED(SECTIONS),
  students = LOADED(STUDENTS),
  requirements = LOADED(REQUIREMENTS),
  submissions = LOADED(PENDING),
  sessions = LOADED(SESSIONS),
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
    if (path === '/school-years/') return { ...schoolYears, reload }
    return { ...IDLE, reload }
  })
}

function renderPage(entry = '/teacher/classes') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <TeacherClassesPage />
    </MemoryRouter>
  )
}

// One card per section room, not one per assignment.
const cards = () => document.querySelectorAll('.class-card')
const cardFor = (section) =>
  [...cards()].find((card) => card.querySelector('.class-card-subject').textContent === section)
const subjectRow = (card, subject) =>
  [...card.querySelectorAll('.subject-row')].find(
    (row) => row.querySelector('.subject-name').textContent === subject
  )
const kpiValue = (label) => {
  const strip = document.querySelector('.kpi-grid')
  return within(strip).getByText(label).closest('.stat-card').querySelector('.stat-value')
    .textContent
}
const hero = () => within(document.querySelector('.tc-hero'))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TeacherClassesPage — welcome band and totals', () => {
  it('greets the teacher with the live school year', () => {
    mockBackend()
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Teresa/)
    expect(hero().getByText('SY 2026-2027')).toBeInTheDocument()
    expect(
      screen.getByText(/You teach 3 subject assignments across 2 sections in SY 2026-2027/)
    ).toBeInTheDocument()
  })

  it('counts assignments, sections, students and pending work without double counting', () => {
    mockBackend()
    renderPage()

    expect(kpiValue('Subject assignments')).toBe('3')
    expect(kpiValue('Assigned sections')).toBe('2')
    expect(kpiValue('Students')).toBe('3')
    expect(kpiValue('Pending submissions')).toBe('2')
  })

  it('counts the shared roster once when two subjects teach one section', () => {
    mockBackend({ assignments: LOADED([SCIENCE, ENGLISH]) })
    renderPage()

    expect(kpiValue('Subject assignments')).toBe('2')
    expect(kpiValue('Assigned sections')).toBe('1')
    expect(kpiValue('Students')).toBe('2')
    expect(cards()).toHaveLength(1)
  })

  it('links the pending metric to the screen that clears it', () => {
    mockBackend()
    renderPage()

    expect(screen.getByText('Pending submissions').closest('a')).toHaveAttribute(
      'href',
      '/teacher/review'
    )
  })

  it('says so when nothing is waiting', () => {
    mockBackend({ submissions: LOADED([]) })
    renderPage()

    expect(screen.getByText('Nothing awaiting verification')).toBeInTheDocument()
    expect(kpiValue('Pending submissions')).toBe('0')
  })
})

describe('TeacherClassesPage — section cards', () => {
  it('renders one card per section, holding every subject taught there', () => {
    mockBackend()
    renderPage()

    expect(cards()).toHaveLength(2)
    expect(cardFor('Grade 7 — Sampaguita')).toBeInTheDocument()
    expect(cardFor('Grade 8 — Gumamela')).toBeInTheDocument()
    expect(
      within(cardFor('Grade 7 — Sampaguita')).getByText('2 subjects · 2 students · Adviser Ana Cruz')
    ).toBeInTheDocument()
  })

  it('carries the year, roster and workload a teacher needs', () => {
    mockBackend()
    renderPage()
    const sampaguita = cardFor('Grade 7 — Sampaguita')

    expect(within(sampaguita).getByText('SY 2026-2027')).toBeInTheDocument()
    const stats = sampaguita.querySelectorAll('.class-card-stats dd')
    // Two students in the room, one requirement per subject and the two
    // pending submissions all belong to this section.
    expect([...stats].map((node) => node.textContent)).toEqual(['2', '2', '2'])
    expect(within(sampaguita).getByText('Needs review')).toBeInTheDocument()
  })

  it('names the subject a shared deadline belongs to', () => {
    mockBackend()
    renderPage()

    // English's only deadline has closed, so the room's next one is Science's.
    expect(
      within(cardFor('Grade 7 — Sampaguita')).getByText(/Science: .* — Quarter 1 Portfolio/)
    ).toBeInTheDocument()
  })

  it('merges the attendance of the room instead of listing it per subject', () => {
    mockBackend()
    renderPage()
    const sampaguita = cardFor('Grade 7 — Sampaguita')

    expect(within(sampaguita).getByText('33.3% present across 2 sessions')).toBeInTheDocument()
    expect(within(sampaguita).getByText('1 session still missing marks')).toBeInTheDocument()
  })

  it('says when a room has posted nothing at all', () => {
    mockBackend({ sessions: LOADED([]) })
    renderPage()

    expect(
      within(cardFor('Grade 8 — Gumamela')).getByText(
        'Nothing posted and no attendance recorded yet'
      )
    ).toBeInTheDocument()
    // The room has one subject and it has posted nothing, so both say so.
    expect(
      within(cardFor('Grade 8 — Gumamela')).getAllByText('No requirements yet')
    ).toHaveLength(2)
  })

  it('links each subject to its own class workspace', () => {
    mockBackend()
    renderPage()
    const sampaguita = cardFor('Grade 7 — Sampaguita')

    expect(within(subjectRow(sampaguita, 'Science')).getByRole('link')).toHaveAttribute(
      'href',
      '/teacher/classes/500'
    )
    expect(
      within(subjectRow(sampaguita, 'Science')).getByRole('link')
    ).toHaveAccessibleName('Open Science for Grade 7 — Sampaguita')
    expect(within(subjectRow(sampaguita, 'English')).getByRole('link')).toHaveAttribute(
      'href',
      '/teacher/classes/501'
    )
  })

  it('opens straight into a room that teaches one subject only', () => {
    mockBackend()
    renderPage()

    expect(
      within(cardFor('Grade 8 — Gumamela')).getByRole('link', {
        name: 'Open Mathematics class workspace',
      })
    ).toHaveAttribute('href', '/teacher/classes/502')
    // Several subjects share the other room, so the card asks for a choice.
    expect(
      within(cardFor('Grade 7 — Sampaguita')).getByText(
        '2 subjects in this room — open one below'
      )
    ).toBeInTheDocument()
  })
})

describe('TeacherClassesPage — student list disclosure', () => {
  it('reveals the room roster with one control per card', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()
    const sampaguita = cardFor('Grade 7 — Sampaguita')

    const toggle = within(sampaguita).getByRole('button', { name: 'Students (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)

    expect(within(sampaguita).getByRole('button', { name: 'Hide students' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(within(sampaguita).getByText('Sofia Cruz')).toBeInTheDocument()
    expect(within(sampaguita).getByText('Miguel Torres')).toBeInTheDocument()
    expect(within(sampaguita).getByText('1357-0002')).toBeInTheDocument()
    // The roster is the section's, so both subjects show the same two names
    // rather than a copy per assignment.
    expect(sampaguita.querySelectorAll('.class-roster li')).toHaveLength(2)
  })

  it('keeps only the card the teacher last opened expanded', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    await user.click(
      within(cardFor('Grade 7 — Sampaguita')).getByRole('button', { name: 'Students (2)' })
    )
    await user.click(within(cardFor('Grade 8 — Gumamela')).getByRole('button', { name: 'Students (1)' }))

    expect(within(cardFor('Grade 7 — Sampaguita')).queryByText('Sofia Cruz')).toBeNull()
    expect(within(cardFor('Grade 8 — Gumamela')).getByText('Pat Liwanag')).toBeInTheDocument()
  })

  it('explains an empty roster instead of rendering a blank list', async () => {
    const user = userEvent.setup()
    mockBackend({ students: LOADED([]) })
    renderPage()

    await user.click(
      within(cardFor('Grade 7 — Sampaguita')).getByRole('button', { name: 'Students (0)' })
    )
    expect(
      within(cardFor('Grade 7 — Sampaguita')).getByText(
        'No students are enrolled in this section yet.'
      )
    ).toBeInTheDocument()
  })
})

describe('TeacherClassesPage — search and filters', () => {
  it('narrows the rooms and reports how many are left', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    expect(screen.getByText('2 classes')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search'), 'gumamela')

    expect(cards()).toHaveLength(1)
    expect(screen.getByText('1 of 2 classes')).toBeInTheDocument()
    expect(cardFor('Grade 8 — Gumamela')).toBeInTheDocument()
  })

  it('finds a room by a subject taught there or a student enrolled in it', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    await user.type(screen.getByLabelText('Search'), 'science')
    expect(cards()).toHaveLength(1)
    expect(cardFor('Grade 7 — Sampaguita')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search'))
    await user.type(screen.getByLabelText('Search'), 'pat')
    expect(cards()).toHaveLength(1)
    expect(cardFor('Grade 8 — Gumamela')).toBeInTheDocument()
  })

  it('starts from the search the workspace trail sent back', () => {
    mockBackend()
    renderPage('/teacher/classes?search=gumamela')

    expect(screen.getByLabelText('Search')).toHaveValue('gumamela')
    expect(cards()).toHaveLength(1)
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    await user.selectOptions(screen.getByLabelText('Status'), 'review')
    expect(cards()).toHaveLength(1)
    expect(cardFor('Grade 7 — Sampaguita')).toBeInTheDocument()
  })

  it('offers the school years and grade levels this teacher actually has', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    const year = screen.getByLabelText('School year')
    const grade = screen.getByLabelText('Grade level')
    expect(within(year).getByRole('option', { name: '2026-2027' })).toBeInTheDocument()
    expect(within(grade).getByRole('option', { name: 'Grade 8' })).toBeInTheDocument()

    await user.selectOptions(grade, 'grade 7')
    expect(cards()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /Clear filters/ }))
    expect(cards()).toHaveLength(2)
  })

  it('says when a search matches nothing', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    await user.type(screen.getByLabelText('Search'), 'astronomy')
    expect(cards()).toHaveLength(0)
    expect(screen.getByText('No classes match')).toBeInTheDocument()
  })

  it('sorts by the workload a teacher is working through', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderPage()

    const order = () =>
      [...cards()].map((card) => card.querySelector('.class-card-subject').textContent)

    await user.selectOptions(screen.getByLabelText('Sort by'), 'pending')
    expect(order()).toEqual(['Grade 7 — Sampaguita', 'Grade 8 — Gumamela'])

    await user.selectOptions(screen.getByLabelText('Sort by'), 'students')
    expect(order()).toEqual(['Grade 7 — Sampaguita', 'Grade 8 — Gumamela'])

    await user.selectOptions(screen.getByLabelText('Sort by'), 'section')
    expect(order()).toEqual(['Grade 7 — Sampaguita', 'Grade 8 — Gumamela'])  })
})

describe('TeacherClassesPage — scenarios', () => {
  it('shows one card and one set of totals for a single assignment', () => {
    mockBackend({ assignments: LOADED([SCIENCE]) })
    renderPage()

    expect(cards()).toHaveLength(1)
    expect(kpiValue('Assigned sections')).toBe('1')
    expect(kpiValue('Students')).toBe('2')
  })

  it('tells a teacher with no assignment where it comes from', () => {
    mockBackend({
      assignments: LOADED([]),
      students: LOADED([]),
      requirements: LOADED([]),
      submissions: LOADED([]),
      sessions: LOADED([]),
    })
    renderPage()

    expect(screen.getByText('No classes assigned yet')).toBeInTheDocument()
    expect(
      screen.getByText(/No subject and section has been assigned to you yet/)
    ).toBeInTheDocument()
    expect(cards()).toHaveLength(0)
    expect(kpiValue('Students')).toBe('0')
    expect(screen.queryByLabelText('Search')).toBeNull()
  })

  it('says so when the school year is not flagged active', () => {
    mockBackend({ schoolYears: LOADED([]) })
    renderPage()

    expect(screen.getByText('No school year is active')).toBeInTheDocument()
    expect(screen.getByText(/You teach 3 subject assignments across 2 sections/)).toBeInTheDocument()
  })

  it('holds the layout with a skeleton and announces the load', () => {
    mockBackend({ assignments: { ...IDLE, loading: true } })
    renderPage()

    expect(screen.getByText('Loading your classes…')).toHaveAttribute('role', 'status')
    expect(cards()).toHaveLength(0)
    expect(screen.queryByLabelText('Search')).toBeNull()
  })

  it('reports the failure and retries it', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    useFetch.mockImplementation((path) => {
      const idle = { ...IDLE, reload: vi.fn() }
      if (path === '/teacher-assignments/')
        return { data: null, loading: false, error: new Error('Assignments unavailable'), reload }
      return idle
    })
    renderPage()

    expect(screen.getByText('My Classes')).toBeInTheDocument()
    expect(screen.getByText('Could not load your classes')).toBeInTheDocument()
    expect(screen.getByText('Assignments unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalled()
  })

  it('warns that the counts are short when a secondary list fails', () => {
    mockBackend({ students: { ...IDLE, error: new Error('Roster unavailable') } })
    renderPage()

    expect(
      screen.getByText(/Some class data did not load, so the counts above may be lower/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(cards()).toHaveLength(2)
    expect(kpiValue('Students')).toBe('0')
  })

  it('keeps the quick actions to the teacher’s own screens', () => {
    mockBackend()
    renderPage()

    const actions = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(
      within(actions).getByRole('link', { name: /Review 2 submissions/ })
    ).toHaveAttribute('href', '/teacher/review')
    expect(
      within(actions).getByRole('link', { name: /Attendance for every class/ })
    ).toHaveAttribute('href', '/teacher/attendance')
    expect(
      within(actions).getByRole('link', { name: /Requirements across classes/ })
    ).toHaveAttribute('href', '/teacher/requirements')
    expect(within(actions).getAllByRole('link')).toHaveLength(5)
  })
})
