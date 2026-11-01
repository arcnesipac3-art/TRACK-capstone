import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AttendancePage from './AttendancePage'
import useFetch from '../hooks/useFetch'
import api from '../services/api'
import { formatDate } from '../utils/format'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    list: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ensureCsrf: vi.fn(),
  },
  api: {},
  API_BASE: '/api',
  ApiError: class ApiError extends Error {},
}))

const ASSIGNMENTS = [
  {
    id: 7,
    teacher: 3,
    subject: 11,
    section: 4,
    subject_name: 'Mathematics',
    section_name: 'Grade 7 – Sampaguita',
  },
]

const STUDENTS = [
  {
    id: 101,
    lrn: '123456789012',
    section: 4,
    user: { username: 'mariac', full_name: 'Maria Cruz' },
  },
  {
    id: 102,
    lrn: '223344556677',
    section: 4,
    user: { username: 'juand', full_name: 'Juan Dela Cruz' },
  },
  {
    id: 103,
    lrn: '334455667788',
    section: 4,
    user: { username: 'annar', full_name: 'Anna Reyes' },
  },
  // Enrolled in another section: must never show up on this sheet.
  {
    id: 104,
    lrn: '445566778899',
    section: 9,
    user: { username: 'pedros', full_name: 'Pedro Santos' },
  },
]

// Use today's date so sessions appear in "Today's Sessions" → "Take attendance" button.
const TODAY = new Date().toISOString().split('T')[0]

const SESSIONS = [
  {
    id: 55,
    teacher_assignment: 7,
    subject_name: 'Mathematics',
    section_name: 'Grade 7 – Sampaguita',
    date: TODAY,
    notes: '',
    created_at: `${TODAY}T01:00:00Z`,
    records: [
      { id: 900, session: 55, student: 101, status: 'present', notes: '' },
    ],
  },
  {
    id: 56,
    teacher_assignment: 7,
    subject_name: 'Mathematics',
    section_name: 'Grade 7 – Sampaguita',
    date: TODAY,
    notes: 'Make-up class',
    created_at: `${TODAY}T02:00:00Z`,
    records: [],
  },
]

/* A second class (Science, section 5) so the history class and subject
   filters have more than one option to narrow between. */
const HISTORY_ASSIGNMENTS = [
  ASSIGNMENTS[0],
  {
    id: 8,
    teacher: 3,
    subject: 12,
    section: 5,
    subject_name: 'Science',
    section_name: 'Grade 7 – Gumamela',
  },
]

const HISTORY_STUDENTS = [
  ...STUDENTS,
  {
    id: 105,
    lrn: '556677889900',
    section: 5,
    user: { username: 'elenag', full_name: 'Elena Gonzales' },
  },
]

const HISTORY_SESSIONS = [
  {
    id: 55,
    teacher_assignment: 7,
    subject_name: 'Mathematics',
    section_name: 'Grade 7 – Sampaguita',
    date: '2026-10-16',
    notes: '',
    created_at: '2026-10-16T01:00:00Z',
    records: [
      { id: 900, session: 55, student: 101, status: 'present', notes: '' },
      { id: 901, session: 55, student: 102, status: 'absent', notes: 'Sick leave' },
    ],
  },
  {
    id: 56,
    teacher_assignment: 7,
    subject_name: 'Mathematics',
    section_name: 'Grade 7 – Sampaguita',
    date: '2026-10-17',
    notes: 'Make-up class',
    created_at: '2026-10-17T01:00:00Z',
    records: [],
  },
  {
    id: 57,
    teacher_assignment: 8,
    subject_name: 'Science',
    section_name: 'Grade 7 – Gumamela',
    date: '2026-10-15',
    notes: '',
    created_at: '2026-10-15T01:00:00Z',
    records: [
      { id: 902, session: 57, student: 105, status: 'late', notes: '' },
    ],
  },
]

const HISTORY_OPTS = {
  sessions: HISTORY_SESSIONS,
  assignments: HISTORY_ASSIGNMENTS,
  students: HISTORY_STUDENTS,
}

function mockBackend({
  sessions = SESSIONS,
  assignments = ASSIGNMENTS,
  students = STUDENTS,
  records = [],
  children = [],
} = {}) {
  useFetch.mockImplementation((path, options = {}) => {
    const idle = { data: null, loading: false, error: null, reload: vi.fn() }
    if (path === '/attendance/sessions/') {
      return { data: sessions, loading: false, error: null, reload: vi.fn() }
    }
    if (path === '/teacher-assignments/') {
      return { data: assignments, loading: false, error: null, reload: vi.fn() }
    }
    if (path === '/students/') {
      return { data: students, loading: false, error: null, reload: vi.fn() }
    }
    if (path === '/dashboard/') {
      return { data: { children }, loading: false, error: null, reload: vi.fn() }
    }
    if (path === '/attendance/records/') {
      // Student history: mirrors the real hook staying idle until enabled.
      return { ...idle, data: options.enabled ? records : null }
    }
    return idle
  })
}

function renderTeacher(options) {
  mockBackend(options)
  return render(<AttendancePage mode="teacher" />)
}

function renderStudent(options) {
  mockBackend(options)
  return render(<AttendancePage mode="student" />)
}

function renderParent(options) {
  mockBackend(options)
  return render(<AttendancePage mode="parent" />)
}

/** Switch the teacher page to the Attendance history tab. */
async function openHistory(user) {
  await user.click(screen.getByRole('tab', { name: 'Attendance history' }))
}

/**
 * Open the attendance sheet for a session by clicking its "Take attendance"
 * button. Sessions must have today's date to appear in Today's Sessions.
 */
function openSheet(index = 0) {
  const buttons = screen.getAllByRole('button', { name: /take attendance for/i })
  fireEvent.click(buttons[index])
}

function rowFor(name) {
  return screen.getByText(name).closest('tr')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Teacher attendance — session list', () => {
  it('renders sessions with data-driven completion and section headings', () => {
    renderTeacher()

    expect(
      screen.getByRole('heading', { name: 'Attendance sessions' })
    ).toBeInTheDocument()

    // Sessions are grouped under Today's Sessions since we use today's date.
    expect(screen.getByText("Today's Sessions (2)")).toBeInTheDocument()

    // Completion comes from records vs. enrolled students — never hardcoded.
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('0/3')).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.className === 'att-completion' && el.title === '1 of 3 students marked')
    ).toBeInTheDocument()
    expect(screen.queryByText('Complete')).not.toBeInTheDocument()

    // Two sessions in today's list — roster stays out of the list view.
    expect(screen.getAllByRole('button', { name: /take attendance for/i })).toHaveLength(2)
    expect(screen.queryByText('Maria Cruz')).not.toBeInTheDocument()
  })

  it('asks StatusBadge only for tones the badge layer defines', () => {
    // 'gray' is not one of the five tones StatusBadge can render, so the
    // not-started chips used to ship as an undefined `.badge-gray` and lose
    // their styling. The grouped session tables are where that lived.
    const VALID = /^badge badge-(amber|blue|green|red|neutral)$/
    const dated = (id, date, extra) => ({
      id,
      teacher_assignment: 7,
      subject_name: 'Mathematics',
      section_name: 'Grade 7 – Sampaguita',
      date,
      notes: '',
      created_at: `${date}T01:00:00Z`,
      records: [],
      ...extra,
    })

    renderTeacher({
      ...HISTORY_OPTS,
      sessions: [
        dated(60, '2026-10-16', { status: 'completed', status_display: 'Completed' }),
        dated(61, '2026-10-17', { status: 'in_progress', status_display: 'In Progress' }),
        dated(62, '2026-10-18'),
      ],
    })

    const badges = [...document.querySelectorAll('.badge')]
    expect(badges.length).toBeGreaterThan(0)
    expect(badges.filter((b) => !VALID.test(b.className))).toEqual([])
    expect(document.querySelectorAll('.badge-gray')).toHaveLength(0)

    // Each server status still reaches the chip that shows it.
    expect(
      badges.find((b) => b.textContent === 'Completed')?.className
    ).toBe('badge badge-green')
    expect(
      badges.find((b) => b.textContent === 'In Progress')?.className
    ).toBe('badge badge-blue')
    expect(
      badges.find((b) => b.textContent === 'Not Started')?.className
    ).toBe('badge badge-neutral')
  })

  it('filters sessions by class', async () => {
    const user = userEvent.setup()
    renderTeacher()

    await user.selectOptions(screen.getByLabelText(/filter by class/i), '7')
    expect(screen.getAllByRole('button', { name: /take attendance for/i })).toHaveLength(2)

    await user.selectOptions(screen.getByLabelText(/filter by class/i), '')
    expect(screen.getAllByRole('button', { name: /take attendance for/i })).toHaveLength(2)
  })

  it('shows no sessions match when date filter eliminates all', async () => {
    renderTeacher()

    fireEvent.change(screen.getByLabelText(/filter by date/i), {
      target: { value: '2020-01-01' },
    })
    expect(screen.getByText('No sessions match your filters')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /take attendance for/i })).not.toBeInTheDocument()
  })

  it('shows a past session under Recent History with a Details button', () => {
    const pastSession = [
      {
        id: 58,
        teacher_assignment: 7,
        subject_name: 'Mathematics',
        section_name: 'Grade 7 – Sampaguita',
        date: '2026-10-16',
        notes: 'Make-up class',
        created_at: '2026-10-16T01:00:00Z',
        records: [],
      },
    ]
    renderTeacher({ sessions: pastSession })

    expect(screen.getByText('Recent History (1)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /view session details for/i })
    ).toBeInTheDocument()
    // "Take attendance" is only shown for today/upcoming sessions.
    expect(screen.queryByRole('button', { name: /take attendance for/i })).not.toBeInTheDocument()
  })
})

describe('Teacher attendance — record sheet', () => {
  it('opens a dedicated view with a compact roster table', () => {
    renderTeacher()
    openSheet(0)

    expect(screen.getByRole('heading', { name: 'Take attendance' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Attendance sessions' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /back to attendance sessions/i })
    ).toBeInTheDocument()

    // Roster table: name, identifier, four status radios and a notes action.
    expect(rowFor('Maria Cruz')).toBeInTheDocument()
    expect(rowFor('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('123456789012')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(12) // 3 students × 4 statuses
    expect(screen.getAllByRole('button', { name: /add note/i })).toHaveLength(3)

    // Students from other sections are never listed.
    expect(screen.queryByText('Pedro Santos')).not.toBeInTheDocument()

    // Summary reflects the stored records.
    expect(screen.getByText('3 students')).toBeInTheDocument()
    expect(screen.getByText('1 Present')).toBeInTheDocument()
    expect(screen.getByText('2 Unmarked')).toBeInTheDocument()
  })

  it('stages a status change, reports it as unsaved and saves with PATCH', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({ id: 900, status: 'absent', notes: '' })
    renderTeacher()
    openSheet(0)

    await user.click(within(rowFor('Maria Cruz')).getByText('Absent'))

    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByText('1 Absent')).toBeInTheDocument()
    expect(screen.getByText('0 Present')).toBeInTheDocument()

    const save = screen.getByRole('button', { name: /save attendance/i })
    expect(save).toBeEnabled()

    await user.click(save)

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/attendance/records/900/', {
        status: 'absent',
      })
    )
    expect(await screen.findByText(/all changes saved/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save attendance/i })).toBeDisabled()
  })

  it('stages unmarked students and saves them in one pass', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ id: 1, status: 'present', notes: '' })
    renderTeacher()
    openSheet(1) // session with no records yet

    await user.click(screen.getByRole('button', { name: /mark all present/i }))
    expect(screen.getByText('3 unsaved changes')).toBeInTheDocument()
    expect(screen.getByText('3 Present')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save attendance/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3))
    expect(api.post).toHaveBeenCalledWith('/attendance/records/', {
      session: 56,
      student: 101,
      status: 'present',
    })
    expect(api.post).toHaveBeenCalledWith('/attendance/records/', {
      session: 56,
      student: 103,
      status: 'present',
    })
    expect(await screen.findByText(/all changes saved/i)).toBeInTheDocument()
  })

  it('confirms before discarding unsaved changes', async () => {
    const user = userEvent.setup()
    renderTeacher()
    openSheet(0)

    await user.click(within(rowFor('Maria Cruz')).getByText('Absent'))
    await user.click(
      screen.getByRole('button', { name: /back to attendance sessions/i })
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    })
    expect(within(dialog).getByText(/1 unsaved change/)).toBeInTheDocument()

    // Cancelling keeps the teacher on the sheet.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Take attendance' })).toBeInTheDocument()

    // Confirming returns to the session list.
    await user.click(
      screen.getByRole('button', { name: /back to attendance sessions/i })
    )
    const again = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    })
    await user.click(within(again).getByRole('button', { name: 'Discard changes' }))

    expect(
      screen.getByRole('heading', { name: 'Attendance sessions' })
    ).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('returns to the list directly when nothing is unsaved', async () => {
    const user = userEvent.setup()
    renderTeacher()
    openSheet(0)

    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /save attendance/i })
    ).toBeDisabled()

    await user.click(
      screen.getByRole('button', { name: /back to attendance sessions/i })
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Attendance sessions' })
    ).toBeInTheDocument()
  })

  it('discards staged edits from the footer without leaving the sheet', async () => {
    const user = userEvent.setup()
    renderTeacher()
    openSheet(0)

    await user.click(within(rowFor('Maria Cruz')).getByText('Absent'))
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }))

    // Staged edits are gone but the teacher stays on the sheet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Take attendance' })
    ).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(
      within(rowFor('Maria Cruz')).getByRole('radio', { name: 'Present' })
    ).toBeChecked()
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('filters the roster from the search field', async () => {
    const user = userEvent.setup()
    renderTeacher()
    openSheet(0)

    await user.type(screen.getByLabelText(/search students/i), 'juan')

    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.queryByText('Maria Cruz')).not.toBeInTheDocument()
    expect(screen.getByText(/showing 1 of 3/i)).toBeInTheDocument()
  })

  it('records a note through the notes dialog', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({
      id: 900,
      status: 'present',
      notes: 'Doctors appointment',
    })
    renderTeacher()
    openSheet(0)

    const row = rowFor('Maria Cruz')
    await user.click(within(row).getByRole('button', { name: /add note/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Notes · Maria Cruz' })
    await user.type(
      within(dialog).getByLabelText(/note for maria cruz/i),
      'Doctors appointment'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    // The note is staged on the sheet, not written until Save attendance.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(within(rowFor('Maria Cruz')).getByText('Doctors appointment')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save attendance/i }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/attendance/records/900/', {
        notes: 'Doctors appointment',
      })
    )
  })

  it('exposes the status control to keyboard users as a radio group', async () => {
    const user = userEvent.setup()
    renderTeacher()
    openSheet(0)

    const row = rowFor('Maria Cruz')
    const radios = within(row).getAllByRole('radio')
    expect(radios.map((radio) => radio.value)).toEqual([
      'present',
      'absent',
      'late',
      'excused',
    ])

    // Tab order reaches the control after the toolbar actions.
    screen.getByLabelText(/search students/i).focus()
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(radios[0])
  })
})

describe('Teacher attendance — history', () => {
  it('separates taking attendance from reviewing history', async () => {
    const user = userEvent.setup()
    renderTeacher()

    expect(screen.getByRole('tab', { name: 'Take attendance' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Attendance history' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
    expect(
      screen.getByRole('heading', { name: 'Attendance sessions' })
    ).toBeInTheDocument()

    await openHistory(user)

    expect(
      screen.getByRole('heading', { name: 'Saved sessions' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Attendance sessions' })
    ).not.toBeInTheDocument()
    // Session creation lives with the take-attendance list, not in history.
    expect(
      screen.queryByRole('button', { name: /new attendance session/i })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Students' })).toHaveAttribute(
      'aria-selected',
      'false'
    )

    await user.click(screen.getByRole('tab', { name: 'Take attendance' }))
    expect(
      screen.getByRole('heading', { name: 'Attendance sessions' })
    ).toBeInTheDocument()
  })

  it('lists saved sessions with counts and completion from persisted records', async () => {
    const user = userEvent.setup()
    renderTeacher(HISTORY_OPTS)
    await openHistory(user)

    const mathRow = rowFor(formatDate('2026-10-16'))
    expect(within(mathRow).getByText('Grade 7 – Sampaguita')).toBeInTheDocument()
    expect(within(mathRow).getByText('Mathematics')).toBeInTheDocument()

    const math = within(mathRow).getAllByRole('cell')
    expect(math[3]).toHaveTextContent('2') // students recorded
    expect(math[4]).toHaveTextContent('1') // present
    expect(math[5]).toHaveTextContent('1') // absent
    expect(math[6]).toHaveTextContent('0') // late
    expect(math[7]).toHaveTextContent('0') // excused
    expect(math[8]).toHaveTextContent('2/3') // 3 students enrolled in section 4
    expect(
      within(math[9]).getByRole('button', { name: /view session details/i })
    ).toBeInTheDocument()

    // Science session in section 5: one student, recorded late -> complete.
    const science = within(rowFor(formatDate('2026-10-15'))).getAllByRole('cell')
    expect(science[3]).toHaveTextContent('1')
    expect(science[6]).toHaveTextContent('1')
    expect(science[8]).toHaveTextContent('Complete')

    // A session with no records yet stays visible with honest zeros.
    const unsaved = within(rowFor(formatDate('2026-10-17'))).getAllByRole('cell')
    expect(unsaved[3]).toHaveTextContent('0')
    expect(unsaved[8]).toHaveTextContent('0/3')
  })

  it('filters history by date range, class and subject', async () => {
    const user = userEvent.setup()
    renderTeacher(HISTORY_OPTS)
    await openHistory(user)

    // Date range — only sessions from Oct 17 onward remain.
    fireEvent.change(screen.getByLabelText('History from date'), {
      target: { value: '2026-10-17' },
    })
    expect(screen.getByText('1 of 3 sessions')).toBeInTheDocument()
    expect(screen.getByText(formatDate('2026-10-17'))).toBeInTheDocument()
    expect(screen.queryByText(formatDate('2026-10-16'))).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear history filters/i }))

    // Class — only the Science class session.
    await user.selectOptions(screen.getByLabelText('History class filter'), '8')
    expect(screen.getByText('1 of 3 sessions')).toBeInTheDocument()
    expect(screen.getByText(formatDate('2026-10-15'))).toBeInTheDocument()
    expect(screen.queryByText(formatDate('2026-10-16'))).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear history filters/i }))

    // Subject — both Mathematics sessions, Science dropped.
    await user.selectOptions(
      screen.getByLabelText('History subject filter'),
      'Mathematics'
    )
    expect(screen.getByText('2 of 3 sessions')).toBeInTheDocument()
    expect(screen.queryByText(formatDate('2026-10-15'))).not.toBeInTheDocument()
  })

  it('paginates long session histories', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 17 }, (_, index) => ({
      id: 200 + index,
      teacher_assignment: 7,
      subject_name: 'Mathematics',
      section_name: 'Grade 7 – Sampaguita',
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      notes: '',
      created_at: '2026-09-01T01:00:00Z',
      records: [],
    }))
    renderTeacher({ sessions: many })
    await openHistory(user)

    expect(screen.getByText('Showing 1–15 of 17 sessions')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(16) // header + 15 rows
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText('Showing 16–17 of 17 sessions')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('opens a saved session and saves a correction explicitly', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({ id: 900, status: 'absent', notes: '' })
    renderTeacher(HISTORY_OPTS)
    await openHistory(user)

    const mathRow = rowFor(formatDate('2026-10-16'))
    await user.click(
      within(mathRow).getByRole('button', { name: /view session details/i })
    )

    // The sheet shows what was saved for this session.
    expect(
      screen.getByRole('heading', { name: 'Session details' })
    ).toBeInTheDocument()
    const maria = rowFor('Maria Cruz')
    expect(within(maria).getByRole('radio', { name: 'Present' })).toBeChecked()

    // A correction is staged, names what it replaces, and writes nothing yet.
    await user.click(within(maria).getByText('Absent'))
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(within(maria).getByText('was Present')).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /save attendance/i }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/attendance/records/900/', {
        status: 'absent',
      })
    )
    expect(await screen.findByText(/all changes saved/i)).toBeInTheDocument()

    // Back returns to the history view, not the take-attendance list.
    await user.click(screen.getByRole('button', { name: 'Back to History' }))
    expect(
      screen.getByRole('heading', { name: 'Saved sessions' })
    ).toBeInTheDocument()
  })

  it('searches a student and shows totals, rate and per-session records', async () => {
    const user = userEvent.setup()
    const studentRecords = [
      {
        id: 900,
        session: 55,
        student: 101,
        status: 'present',
        notes: 'Field trip',
        session_detail: {
          id: 55,
          date: '2026-10-16',
          subject_name: 'Mathematics',
          section_name: 'Grade 7 – Sampaguita',
        },
      },
      {
        id: 910,
        session: 57,
        student: 101,
        status: 'late',
        notes: '',
        session_detail: {
          id: 57,
          date: '2026-10-15',
          subject_name: 'Science',
          section_name: 'Grade 7 – Gumamela',
        },
      },
    ]
    renderTeacher({ ...HISTORY_OPTS, records: studentRecords })
    await openHistory(user)
    await user.click(screen.getByRole('tab', { name: 'Students' }))

    expect(
      screen.getByText('Search a student in one of your classes to review their records over time.')
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search students/i), 'maria')
    await user.click(screen.getByRole('button', { name: /maria cruz/i }))

    // History comes from the existing records endpoint, scoped to the student.
    expect(useFetch).toHaveBeenCalledWith(
      '/attendance/records/',
      expect.objectContaining({ params: { student: 101 } })
    )

    // Totals and rate come from the records the backend returned.
    expect(await screen.findByText('2 records')).toBeInTheDocument()
    expect(screen.getByText('1 Present')).toBeInTheDocument()
    expect(screen.getByText('1 Late')).toBeInTheDocument()
    expect(screen.getByText('0 Absent')).toBeInTheDocument()
    expect(screen.getByText('50% present')).toBeInTheDocument()

    const row = rowFor(formatDate('2026-10-16'))
    expect(within(row).getByText('Mathematics')).toBeInTheDocument()
    expect(within(row).getByText('Grade 7 – Sampaguita')).toBeInTheDocument()
    expect(within(row).getByText('Present')).toBeInTheDocument()
    expect(within(row).getByText('Field trip')).toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: /view session/i })
    ).toBeInTheDocument()

    const laterRow = rowFor(formatDate('2026-10-15'))
    expect(within(laterRow).getByText('Late')).toBeInTheDocument()
    expect(within(laterRow).getByText('Science')).toBeInTheDocument()
  })

  it("only searches students inside the teacher's assigned classes", async () => {
    const user = userEvent.setup()
    renderTeacher(HISTORY_OPTS)
    await openHistory(user)
    await user.click(screen.getByRole('tab', { name: 'Students' }))

    // Pedro Santos is enrolled in a section this teacher does not teach.
    await user.type(screen.getByLabelText(/search students/i), 'santos')
    expect(screen.getByText('No students found')).toBeInTheDocument()
    expect(screen.queryByText('Pedro Santos')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/search students/i), {
      target: { value: 'cruz' },
    })
    expect(
      screen.getByRole('button', { name: /juan dela cruz/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /maria cruz/i })).toBeInTheDocument()

    // The second class's student is searchable too.
    fireEvent.change(screen.getByLabelText(/search students/i), {
      target: { value: 'elena' },
    })
    expect(
      screen.getByRole('button', { name: /elena gonzales/i })
    ).toBeInTheDocument()
  })

  it('shows an empty state when the student has no records yet', async () => {
    const user = userEvent.setup()
    renderTeacher({ ...HISTORY_OPTS, records: [] })
    await openHistory(user)
    await user.click(screen.getByRole('tab', { name: 'Students' }))

    await user.type(screen.getByLabelText(/search students/i), 'anna')
    await user.click(screen.getByRole('button', { name: /anna reyes/i }))

    expect(await screen.findByText('0 records')).toBeInTheDocument()
    expect(screen.getByText('No records')).toBeInTheDocument()
    expect(screen.getByText('No attendance recorded')).toBeInTheDocument()
    expect(useFetch).toHaveBeenCalledWith(
      '/attendance/records/',
      expect.objectContaining({ params: { student: 103 } })
    )
  })

  it('shows an empty state when no sessions have been saved yet', async () => {
    const user = userEvent.setup()
    renderTeacher({ sessions: [] })
    await openHistory(user)

    expect(screen.getByText('No attendance history yet')).toBeInTheDocument()
    expect(screen.getByText('0 sessions')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/* Student & parent — the shared records table                           */
/* ------------------------------------------------------------------ */

const DAY = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d.toISOString().split('T')[0]
}

const VIEW_RECORDS = [
  {
    id: 1,
    status: 'present',
    notes: '',
    session_detail: { date: DAY(1), section_name: 'Grade 7 – Sampaguita', subject_name: 'Mathematics' },
  },
  {
    id: 2,
    status: 'absent',
    notes: 'Fever',
    session_detail: { date: DAY(3), section_name: 'Grade 7 – Sampaguita', subject_name: 'English' },
  },
  {
    id: 3,
    status: 'late',
    notes: '',
    session_detail: { date: DAY(6), section_name: 'Grade 7 – Sampaguita', subject_name: 'Science' },
  },
]

const PARENTS = [
  { student_id: 101, name: 'Maria Cruz', section: 'Grade 7 – Sampaguita' },
  { student_id: 102, name: 'Juan Dela Cruz', section: 'Grade 7 – Sampaguita' },
]

describe('Student/parent attendance — records table', () => {
  it('filters through one shared filter bar, not a bespoke card header', async () => {
    const user = userEvent.setup()
    renderStudent({ records: VIEW_RECORDS })

    const bar = document.querySelector('.filter-bar')
    expect(bar).not.toBeNull()
    expect(within(bar).getByLabelText('From')).toBeInTheDocument()
    expect(within(bar).getByLabelText('To')).toBeInTheDocument()
    expect(within(bar).getByLabelText('Status')).toBeInTheDocument()

    // The old hand-built header — a heading plus inline margins and gaps — is gone.
    expect(screen.queryByRole('heading', { name: 'Filter Records' })).toBeNull()
    expect(bar.querySelectorAll('[style]')).toHaveLength(0)

    await user.selectOptions(within(bar).getByLabelText('Status'), 'absent')
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1)
    expect(screen.getByText('Fever')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3 records')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Clear$/ }))
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(3)
    expect(screen.queryByText('Showing 1 of 3 records')).toBeNull()
  })

  it('narrows to a date window with the same two inputs', () => {
    renderStudent({ records: VIEW_RECORDS })

    fireEvent.change(screen.getByLabelText('From'), { target: { value: DAY(4) } })
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('To'), { target: { value: DAY(2) } })
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1)
    // The denominator is the whole fetched set, not the previous window.
    expect(screen.getByText('Showing 1 of 3 records')).toBeInTheDocument()
  })

  it('runs a populated table to the card edge and pads the empty state', () => {
    const { unmount } = renderStudent({ records: VIEW_RECORDS })
    const panel = screen.getByRole('heading', { name: 'Attendance records' }).closest('section')
    expect(panel.querySelector('.card-body').className).toContain('flush')
    unmount()

    renderStudent({ records: [] })
    const bare = screen.getByRole('heading', { name: 'Attendance records' }).closest('section')
    expect(bare.querySelector('.card-body').className).not.toContain('flush')
    expect(within(bare).getByText('No attendance records')).toBeInTheDocument()
  })

  it('says which half of a long list the table is showing', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      status: 'present',
      notes: '',
      session_detail: { date: DAY(1), section_name: 'Grade 7 – Sampaguita', subject_name: 'Mathematics' },
    }))
    renderStudent({ records: many })

    expect(screen.getByRole('heading', { name: 'Attendance records' })).toBeInTheDocument()
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(100)
    expect(screen.getByText(/Showing the first 100 of 120 records/)).toBeInTheDocument()
  })

  it('asks for the selected child and re-asks on switch', async () => {
    const user = userEvent.setup()
    renderParent({ records: VIEW_RECORDS, children: PARENTS })

    const tablist = screen.getByRole('tablist', { name: 'Select child' })
    expect(within(tablist).getAllByRole('tab')).toHaveLength(2)
    // The first child's records land in the same table the student sees.
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(3)

    await user.click(within(tablist).getByRole('tab', { name: /Juan Dela Cruz/ }))
    expect(useFetch.mock.calls.filter(([p]) => p === '/attendance/records/').pop()[1].params)
      .toEqual({ student: 102 })
  })

  it('explains a parent account with nothing linked to it', () => {
    renderParent({ children: [] })

    const panel = screen.getByText('No linked children').closest('section')
    expect(panel.className).toContain('card')
    expect(panel.querySelector('.card-body').className).not.toContain('flush')
    expect(screen.queryByLabelText('From')).toBeNull()
  })
})
