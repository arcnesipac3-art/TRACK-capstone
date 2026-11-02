import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AttendancePage from './AttendancePage'
import api, { ApiError, pageFrom } from '../services/api'
import { isoDay, shiftDay } from '../utils/attendance'

/**
 * The attendance module, driven by a fake server that behaves like the real
 * one: it filters, sorts, counts and pages on the query string it is handed.
 *
 * That shape is the point. Every screen here asks for one page instead of
 * crawling the API (`api.list`'s thousand-row crawl is asserted absent), so a
 * test that only checked "rows appear" would still pass after a regression back
 * to the crawl. The mocks below answer the same `?page_size= / ?date_after= /
 * ?status=` questions the backend answers, which is what makes the assertions
 * about scalability honest.
 */

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      get: vi.fn(),
      list: vi.fn(),
      paged: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      ensureCsrf: vi.fn(),
    },
  }
})

/* ------------------------------------------------------------------ */
/* Fixtures — rows in the shapes the serializers actually return       */
/* ------------------------------------------------------------------ */

const TODAY = isoDay()
const YESTERDAY = shiftDay(TODAY, -1)
const TOMORROW = shiftDay(TODAY, 1)

const MATH = {
  id: 7,
  teacher: 3,
  subject: 11,
  subject_name: 'Mathematics',
  section: 4,
  section_name: 'Grade 7 – Sampaguita',
}
const SCIENCE = {
  id: 8,
  teacher: 3,
  subject: 12,
  subject_name: 'Science',
  section: 5,
  section_name: 'Grade 7 – Gumamela',
}

const MARIAN = { id: 101, lrn: '123456789012', section: 4, user: { username: 'mariac', full_name: 'Maria Cruz' } }
const JUAN = { id: 102, lrn: '223344556677', section: 4, user: { username: 'juand', full_name: 'Juan Dela Cruz' } }
const ANNA = { id: 103, lrn: '334455667788', section: 4, user: { username: 'annar', full_name: 'Anna Reyes' } }
const ELENA = { id: 105, lrn: '556677889900', section: 5, user: { username: 'elenag', full_name: 'Elena Gonzales' } }
// A fourth learner in Maria's class, used when a test needs a register that
// one bulk save does not finish marking.
const PEDRO = { id: 104, lrn: '445566778899', section: 4, user: { username: 'pedros', full_name: 'Pedro Santos' } }

function sessionRows() {
  return [
    {
      id: 55,
      teacher_assignment: 7,
      date: TODAY,
      status: 'not_started',
      notes: '',
      start_time: '08:00',
      end_time: '09:00',
      room: 'Room 3',
      records: [{ id: 900, student: 101, status: 'present', notes: '' }],
    },
    {
      id: 56,
      teacher_assignment: 7,
      date: TODAY,
      status: 'in_progress',
      notes: 'Make-up class',
      start_time: '10:00',
      end_time: '11:00',
      room: 'Room 3',
      records: [
        { id: 901, student: 101, status: 'present', notes: '' },
        { id: 902, student: 102, status: 'absent', notes: 'Sick leave' },
      ],
    },
    {
      id: 57,
      teacher_assignment: 8,
      date: TODAY,
      status: 'completed',
      notes: '',
      start_time: '13:00',
      end_time: '14:00',
      room: 'Lab 1',
      records: [{ id: 903, student: 105, status: 'late', notes: '' }],
    },
    {
      id: 58,
      teacher_assignment: 7,
      date: YESTERDAY,
      status: 'in_progress',
      notes: '',
      start_time: '08:00',
      end_time: '09:00',
      room: 'Room 3',
      records: [{ id: 904, student: 101, status: 'late', notes: '' }],
    },
    {
      id: 59,
      teacher_assignment: 8,
      date: TOMORROW,
      status: 'not_started',
      notes: '',
      start_time: '09:00',
      end_time: '10:00',
      room: 'Lab 1',
      records: [],
    },
  ]
}

/* ------------------------------------------------------------------ */
/* The fake server                                                     */
/* ------------------------------------------------------------------ */

let nextRecordId = 1000

function openDb(overrides = {}) {
  return {
    assignments: overrides.assignments ?? [MATH, SCIENCE],
    schedules: overrides.schedules ?? [{ id: 41, subject_name: 'Mathematics' }],
    students: overrides.students ?? [MARIAN, JUAN, ANNA, ELENA],
    sessions: overrides.sessions ?? sessionRows(),
    dashboard: overrides.dashboard ?? { children: [] },
    bulkFail: overrides.bulkFail ?? null,
  }
}

function assignmentOf(state, session) {
  return state.assignments.find((a) => a.id === session.teacher_assignment) || MATH
}

function enrolledIn(state, session) {
  return state.students.filter((student) => student.section === assignmentOf(state, session).section)
}

/** A `?brief=1` row: annotations, no roster. */
function sessionRow(state, session) {
  const assignment = assignmentOf(state, session)
  const marks = session.records
  const tally = (status) => marks.filter((mark) => mark.status === status).length
  return {
    id: session.id,
    teacher_assignment: session.teacher_assignment,
    subject: assignment.subject,
    section: assignment.section,
    section_id: assignment.section,
    subject_name: assignment.subject_name,
    section_name: assignment.section_name,
    date: session.date,
    status: session.status,
    notes: session.notes,
    start_time: session.start_time,
    end_time: session.end_time,
    room: session.room,
    enrolled: enrolledIn(state, session).length,
    record_count: marks.length,
    present_count: tally('present'),
    absent_count: tally('absent'),
    late_count: tally('late'),
    excused_count: tally('excused'),
  }
}

/** The nested detail a session's own route returns. */
function sessionDetail(state, session) {
  return {
    ...sessionRow(state, session),
    created_at: `${session.date}T01:00:00Z`,
    records: session.records.map((mark) => {
      const student = state.students.find((s) => s.id === mark.student)
      return {
        id: mark.id,
        session: session.id,
        student: mark.student,
        student_name: student?.user?.full_name || '—',
        status: mark.status,
        notes: mark.notes,
      }
    }),
  }
}

function recordRow(state, mark, session) {
  return {
    id: mark.id,
    session: session.id,
    student: mark.student,
    status: mark.status,
    notes: mark.notes,
    session_detail: {
      id: session.id,
      date: session.date,
      subject_name: assignmentOf(state, session).subject_name,
      section_name: assignmentOf(state, session).section_name,
    },
  }
}

function allMarks(state) {
  return state.sessions.flatMap((session) => session.records.map((mark) => [mark, session]))
}

function matches(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(needle)
}

function sortedSessions(list, ordering) {
  const sign = ordering === 'date' ? 1 : -1
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return sign * (a.date < b.date ? -1 : 1)
    return b.id - a.id
  })
}

function sessionsMatching(state, params) {
  const today = isoDay()
  let list = state.sessions.slice()
  if (params.date) list = list.filter((s) => s.date === params.date)
  if (params.date_after) list = list.filter((s) => s.date >= params.date_after)
  if (params.date_before) list = list.filter((s) => s.date <= params.date_before)
  if (params.teacher_assignment) {
    list = list.filter((s) => String(s.teacher_assignment) === String(params.teacher_assignment))
  }
  if (params.section) {
    list = list.filter((s) => String(assignmentOf(state, s).section) === String(params.section))
  }
  if (params.subject) {
    list = list.filter((s) => String(assignmentOf(state, s).subject) === String(params.subject))
  }
  if (params.status === 'outstanding') list = list.filter((s) => s.status !== 'completed')
  else if (params.status === 'missed') {
    list = list.filter((s) => s.status !== 'completed' && s.date < today)
  } else if (params.status) list = list.filter((s) => s.status === params.status)
  if (params.search) {
    const needle = String(params.search).toLowerCase()
    list = list.filter((s) => {
      const assignment = assignmentOf(state, s)
      const names = `${assignment.subject_name} ${assignment.section_name} ${s.notes}`
      const learners = enrolledIn(state, s).map((student) => student.user.full_name)
      return matches(names, needle) || learners.some((name) => matches(name, needle))
    })
  }
  return sortedSessions(list, params.ordering)
}

function recordsMatching(state, params) {
  let list = allMarks(state)
  if (params.student) {
    list = list.filter(([mark]) => String(mark.student) === String(params.student))
  }
  if (params.session) {
    list = list.filter(([, session]) => String(session.id) === String(params.session))
  }
  if (params.status) list = list.filter(([mark]) => mark.status === params.status)
  if (params.date) list = list.filter(([, session]) => session.date === params.date)
  if (params.date_after) list = list.filter(([, session]) => session.date >= params.date_after)
  if (params.date_before) list = list.filter(([, session]) => session.date <= params.date_before)
  if (params.teacher_assignment) {
    list = list.filter(([, session]) => String(session.teacher_assignment) === String(params.teacher_assignment))
  }
  if (params.search) {
    const needle = String(params.search).toLowerCase()
    list = list.filter(([mark]) => {
      const student = state.students.find((s) => s.id === mark.student)
      return matches(student?.user?.full_name, needle) || matches(student?.lrn, needle)
    })
  }
  const sign = params.ordering === 'date' ? 1 : -1
  return [...list].sort((a, b) => {
    if (a[1].date !== b[1].date) return sign * (a[1].date < b[1].date ? -1 : 1)
    return a[0].id - b[0].id
  })
}

function studentsMatching(state, params) {
  let list = state.students.slice()
  if (params.section) list = list.filter((s) => String(s.section) === String(params.section))
  if (params.search) {
    const needle = String(params.search).toLowerCase()
    list = list.filter(
      (s) => matches(s.user?.full_name, needle) || matches(s.user?.username, needle) || matches(s.lrn, needle)
    )
  }
  return list
}

function paginate(rows, params, build) {
  const pageSize = Number(params.page_size) || 20
  const page = Number(params.page) || 1
  const start = (page - 1) * pageSize
  return { count: rows.length, next: null, previous: null, results: rows.slice(start, start + pageSize).map(build) }
}

function page(state, path, params) {
  if (path === '/attendance/sessions/') {
    return paginate(sessionsMatching(state, params), params, (s) => sessionRow(state, s))
  }
  if (path === '/attendance/records/') {
    return paginate(recordsMatching(state, params), params, ([mark, session]) => recordRow(state, mark, session))
  }
  if (path === '/students/') {
    return paginate(studentsMatching(state, params), params, (student) => student)
  }
  throw new ApiError(`The fake server has no list route for ${path}`, 404)
}

function applyBulk(state, sessionId, records) {
  const session = state.sessions.find((s) => s.id === sessionId)
  if (!session) throw new ApiError('Not found.', 404)
  let created = 0
  let updated = 0
  let unchanged = 0
  records.forEach((entry) => {
    const existing = session.records.find((mark) => mark.student === entry.student)
    if (!existing) {
      session.records.push({ id: nextRecordId++, student: entry.student, status: entry.status, notes: entry.notes || '' })
      created += 1
    } else if (existing.status !== entry.status || (existing.notes || '') !== (entry.notes || '')) {
      existing.status = entry.status
      existing.notes = entry.notes || ''
      updated += 1
    } else unchanged += 1
  })
  const enrolled = enrolledIn(state, session).length
  if (enrolled > 0 && session.records.length >= enrolled) session.status = 'completed'
  else if (session.records.length) session.status = 'in_progress'
  return { created, updated, unchanged, session: sessionDetail(state, session) }
}

function installServer(state) {
  api.list.mockImplementation(async (path) => {
    if (path === '/teacher-assignments/') return state.assignments
    if (path === '/schedules/') return state.schedules
    return []
  })

  api.get.mockImplementation(async (path) => {
    if (path === '/dashboard/') return state.dashboard
    const detail = /^\/attendance\/sessions\/(\d+)\/$/.exec(path)
    if (detail) {
      const session = state.sessions.find((s) => s.id === Number(detail[1]))
      if (session) return sessionDetail(state, session)
    }
    throw new ApiError('Not found.', 404)
  })

  api.paged.mockImplementation(async (path, options = {}) => {
    const params = options.params || {}
    return pageFrom(page(state, path, params), params)
  })

  api.post.mockImplementation(async (path, body) => {
    if (path === '/attendance/generate/') return { created: 0, detail: 'Sessions generated.' }
    const bulk = /^\/attendance\/sessions\/(\d+)\/records\/$/.exec(path)
    if (bulk) {
      if (state.bulkFail) throw new ApiError('Rejected.', 400, state.bulkFail)
      return applyBulk(state, Number(bulk[1]), body.records)
    }
    throw new ApiError(`The fake server has no handler for POST ${path}`, 404)
  })

  api.patch.mockImplementation(async (path, body) => {
    const edit = /^\/attendance\/sessions\/(\d+)\/$/.exec(path)
    if (edit) {
      const session = state.sessions.find((s) => s.id === Number(edit[1]))
      if (session) {
        session.date = body.date
        session.notes = body.notes
        return sessionDetail(state, session)
      }
    }
    throw new ApiError('Not found.', 404)
  })

  api.put.mockImplementation(async () => {
    throw new ApiError('Not allowed.', 405)
  })
  api.delete.mockImplementation(async () => {
    throw new ApiError('Not allowed.', 405)
  })
}

/* ------------------------------------------------------------------ */
/* Mount + query helpers                                               */
/* ------------------------------------------------------------------ */

function mount(mode, { route = '/attendance', props = {}, overrides = {} } = {}) {
  const state = openDb(overrides)
  installServer(state)
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <AttendancePage mode={mode} {...props} />
    </MemoryRouter>
  )
  return { state, ...utils }
}

const mountTeacher = (options = {}) => mount('teacher', options)

/** The params of the last read of `path` asking for that page size. */
function listParams(path, pageSize) {
  const calls = api.paged.mock.calls.filter(
    ([called, options]) => called === path && Number(options?.params?.page_size) === pageSize
  )
  return calls.length ? calls[calls.length - 1][1].params : null
}

function readCount(path) {
  return api.paged.mock.calls.filter(([called]) => called === path).length
}

const bulkCalls = () => api.post.mock.calls.filter(([path]) => path.endsWith('/records/'))

function statValue(label) {
  return screen.getByText(label).closest('.stat-card').querySelector('.stat-value').textContent
}

function dayCard(statusLabel) {
  const card = screen.getAllByRole('article').find((el) => within(el).queryByText(statusLabel))
  if (!card) throw new Error(`No session card is labelled ${statusLabel}`)
  return card
}

async function openSession(statusLabel) {
  fireEvent.click(within(dayCard(statusLabel)).getByRole('button'))
  return screen.findByRole('heading', { name: /Take attendance|Session details/ })
}

async function openHistory() {
  fireEvent.click(screen.getByRole('tab', { name: 'Attendance history' }))
  return screen.findByRole('heading', { name: 'Saved sessions' })
}

async function typeInto(id, value) {
  fireEvent.change(document.getElementById(id), { target: { value } })
}

/* ------------------------------------------------------------------ */
/* Teacher — dashboard                                                 */
/* ------------------------------------------------------------------ */

describe('Teacher attendance — dashboard', () => {
  it('shows the four figures the server counts, not the rows it loaded', async () => {
    mountTeacher()
    await screen.findByText('Today’s sessions')

    await waitFor(() => expect(statValue("Today's Sessions")).toBe('3'))
    expect(statValue('Completed Sessions')).toBe('1')
    expect(statValue('Pending Sessions')).toBe('4')
    expect(statValue('Assigned Students')).toBe('4')
  })

  it('reads each figure as one filtered count, never as a crawl', async () => {
    mountTeacher()
    await waitFor(() => expect(statValue("Today's Sessions")).toBe('3'))

    const countReads = api.paged.mock.calls
      .filter(([path, options]) => path === '/attendance/sessions/' && Number(options.params.page_size) === 1)
      .map(([, options]) => options.params)
    expect(countReads).toHaveLength(3)
    expect(countReads.every((params) => params.brief === 1)).toBe(true)
    expect(countReads.map((params) => params.status || params.date)).toEqual([TODAY, 'completed', 'outstanding'])

    const studentCount = api.paged.mock.calls.filter(
      ([path, options]) => path === '/students/' && Number(options.params.page_size) === 1
    )
    expect(studentCount).toHaveLength(1)

    expect(api.list).not.toHaveBeenCalledWith('/attendance/sessions/', expect.anything())
    expect(api.list).not.toHaveBeenCalledWith('/attendance/records/', expect.anything())
  })

  it('scopes every figure to the class My Classes handed over', async () => {
    mountTeacher({ route: '/attendance?class=8' })
    await screen.findByText('Today’s sessions')

    await waitFor(() => expect(statValue('Completed Sessions')).toBe('1'))
    expect(statValue("Today's Sessions")).toBe('1')
    expect(statValue('Pending Sessions')).toBe('1')
    await waitFor(() => expect(statValue('Assigned Students')).toBe('1'))

    const countReads = api.paged.mock.calls
      .filter(([, options]) => Number(options?.params?.page_size) === 1)
      .map(([, options]) => options.params)
    expect(countReads.some((params) => params.teacher_assignment === '8' && params.section === '5')).toBe(true)
    expect(countReads[countReads.length - 1]).toMatchObject({ section: '5' })
  })

  it('offers two primary tabs and moves between them with the arrow keys', async () => {
    mountTeacher()
    await screen.findByText('Today’s sessions')

    expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sessions' }), { key: 'ArrowRight' })
    await openHistory()
    expect(screen.getByRole('tab', { name: 'Attendance history' })).toHaveAttribute('aria-selected', 'true')
  })

  it('generates the week’s sessions once from the timetable', async () => {
    mountTeacher()
    await screen.findByText("Today's Sessions")
    await waitFor(() => expect(api.post).toHaveBeenCalled())

    const generated = api.post.mock.calls.filter(([path]) => path === '/attendance/generate/')
    expect(generated).toHaveLength(1)
    expect(generated[0][1]).toEqual({ start_date: TODAY, end_date: shiftDay(TODAY, 7) })
  })

  it('says so when the teacher has no timetable to generate from', async () => {
    mountTeacher({ overrides: { schedules: [] } })
    await screen.findByText('No class schedules configured')

    expect(api.post.mock.calls.filter(([path]) => path === '/attendance/generate/')).toHaveLength(0)
    expect(screen.queryByRole('tab', { name: 'Sessions' })).not.toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/* Teacher — sessions board                                            */
/* ------------------------------------------------------------------ */

describe('Teacher attendance — sessions board', () => {
  it('asks for one day and the days after it, not the whole term', async () => {
    mountTeacher()
    await screen.findAllByRole('article')

    const day = listParams('/attendance/sessions/', 20)
    expect(day).toMatchObject({ brief: 1, date: TODAY, page: 1, page_size: 20 })
    const upcoming = listParams('/attendance/sessions/', 8)
    expect(upcoming).toMatchObject({ brief: 1, date_after: TOMORROW, page: 1, page_size: 8, ordering: 'date' })
  })

  it('gives every session card exactly one action', async () => {
    mountTeacher()
    await screen.findAllByRole('article')

    expect(screen.getAllByRole('article')).toHaveLength(3)
    for (const status of ['Not Started', 'In Progress', 'Completed']) {
      const card = dayCard(status)
      expect(within(card).getAllByRole('button')).toHaveLength(1)
      expect(within(card).getByRole('button')).toHaveTextContent(
        status === 'Not Started' ? 'Take attendance' : status === 'In Progress' ? 'Continue marking' : 'View session'
      )
    }
  })

  it('derives Missed for a day that passed unfinished', async () => {
    mountTeacher()
    await screen.findAllByRole('article')

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    const card = await waitFor(() => dayCard('Missed'))
    expect(within(card).getByRole('button')).toHaveTextContent('View details')
  })

  it('lists the days ahead as compact rows from the same read', async () => {
    const { container } = mountTeacher()
    await waitFor(() => {
      if (!container.querySelector('.att-upcoming-row')) throw new Error('the upcoming list has not landed')
    })

    const rows = container.querySelectorAll('.att-upcoming-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Science · Grade 7 – Gumamela')
    expect(within(rows[0]).getByRole('button')).toHaveTextContent('Take attendance')
  })

  it('pages the day on the server when it holds more sessions than one page', async () => {
    const crowded = Array.from({ length: 25 }, (_, index) => ({
      id: 200 + index,
      teacher_assignment: 7,
      date: TODAY,
      status: 'not_started',
      notes: '',
      start_time: '08:00',
      end_time: '09:00',
      room: 'Room 3',
      records: [],
    }))
    mountTeacher({ overrides: { sessions: crowded } })
    await screen.findByText('25 sessions on this day · page 1 of 2')

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).page).toBe(2))
  })

  it('sends search, class, subject and status to the server', async () => {
    mountTeacher()
    await screen.findAllByRole('article')

    fireEvent.change(document.getElementById('filter-subject'), { target: { value: '12' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).subject).toBe('12'))

    fireEvent.change(document.getElementById('filter-status'), { target: { value: 'missed' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).status).toBe('missed'))

    fireEvent.change(document.getElementById('filter-class'), { target: { value: '8' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).teacher_assignment).toBe('8'))

    await typeInto('board-search', 'Cruz')
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).search).toBe('Cruz'))
  })

  it('narrows the day to a chosen date and hands it back with the filter strip', async () => {
    mountTeacher()
    await screen.findAllByRole('article')

    fireEvent.change(document.getElementById('filter-date'), { target: { value: YESTERDAY } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).date).toBe(YESTERDAY))
    expect(await screen.findByRole('heading', { name: /Sessions on/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear session filters' }))
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).date).toBe(TODAY))
    await screen.findByRole('heading', { name: 'Today’s sessions' })
    expect(screen.queryByRole('button', { name: 'Clear session filters' })).not.toBeInTheDocument()
  })

  it('keeps a day with nothing scheduled honest', async () => {
    mountTeacher({ overrides: { sessions: [] } })
    await screen.findByText('Nothing scheduled for this day')
    expect(screen.getByText('No sessions on this day')).toBeInTheDocument()
    expect(screen.getByText('Nothing scheduled ahead')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/* Teacher — recording sheet                                           */
/* ------------------------------------------------------------------ */

describe('Teacher attendance — recording sheet', () => {
  it('loads the register of the session’s own section', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')

    await screen.findByText('Maria Cruz')
    expect(screen.queryByText('Elena Gonzales')).not.toBeInTheDocument()
    expect(listParams('/students/', 100)).toMatchObject({ section: 4, page: 1, page_size: 100 })
  })

  it('stages a mark without writing anything to the server', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-102-absent'))

    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(bulkCalls()).toHaveLength(0)
    expect(api.put).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('warns before the browser itself is closed on unsaved marks', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-102-absent'))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('saves every staged mark in one bulk request, keyed on the session', async () => {
    mountTeacher({ overrides: { students: [MARIAN, JUAN, ANNA, PEDRO, ELENA] } })
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-102-absent'))
    fireEvent.click(document.getElementById('att-103-late'))
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await waitFor(() => expect(bulkCalls()).toHaveLength(1))
    const [path, body] = bulkCalls()[0]
    expect(path).toBe('/attendance/sessions/55/records/')
    expect(body.records).toEqual([
      { student: 102, status: 'absent', notes: '' },
      { student: 103, status: 'late', notes: '' },
    ])
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(await screen.findByText('2 marks saved')).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('does not send the same batch twice', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-102-absent'))
    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await waitFor(() => expect(bulkCalls()).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))

    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    expect(bulkCalls()).toHaveLength(1)
  })

  it('keeps the drafts when the server rejects the batch', async () => {
    mountTeacher({ overrides: { bulkFail: { rejected: [{ error: 'Status is not valid.' }] } } })
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-102-absent'))
    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('1 entry rejected: Status is not valid.')
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(document.getElementById('att-102-absent')).toBeChecked()
  })

  it('confirms before a fully-marked register is finalized', async () => {
    const { state } = mountTeacher()
    await screen.findAllByRole('article')
    await openSession('In Progress')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-103-present'))
    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))

    const dialog = await screen.findByRole('dialog', { name: 'Finalize this session?' })
    expect(dialog).toHaveTextContent('Every one of the 3 enrolled learners is marked.')
    expect(bulkCalls()).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and finalize' }))
    await waitFor(() => expect(bulkCalls()).toHaveLength(1))
    expect(bulkCalls()[0][1].records).toEqual([{ student: 103, status: 'present', notes: '' }])
    expect(state.sessions.find((s) => s.id === 56).status).toBe('completed')
    expect(await screen.findByText('1 mark saved · session completed')).toBeInTheDocument()
  })

  it('asks before leaving with unsaved marks, and honours Cancel', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-102-absent'))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Attendance sessions' }))

    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Take attendance' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Attendance sessions' }))
    const again = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    fireEvent.click(within(again).getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('heading', { name: 'Today’s sessions' })).toBeInTheDocument()
  })

  it('marks the whole register present and reports the tally', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(screen.getByRole('button', { name: 'Mark all present' }))

    // Maria is already saved as present, so only the two learners who were
    // unmarked become drafts — the tally shows three, the draft count two.
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()
    expect(screen.getByText('3 Present')).toBeInTheDocument()
    expect(
      await screen.findByText('All 3 students marked present — select Save attendance to record.')
    ).toBeInTheDocument()
    expect(bulkCalls()).toHaveLength(0)
  })

  it('shows what a mark replaced', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(document.getElementById('att-101-absent'))
    expect(screen.getByText('was Present')).toBeInTheDocument()
  })

  it('searches the register without asking the server again', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    const before = readCount('/students/')
    await typeInto('att-student-search', 'Anna')

    expect(await screen.findByText('Anna Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Maria Cruz')).not.toBeInTheDocument()
    expect(screen.getByText(/showing 1 of 3/)).toBeInTheDocument()
    expect(readCount('/students/')).toBe(before)
  })

  it('paints a large register in windows instead of all at once', async () => {
    const crowd = Array.from({ length: 45 }, (_, index) => ({
      id: 300 + index,
      lrn: `9${String(index).padStart(11, '0')}`,
      section: 4,
      user: { username: `learner${index}`, full_name: `Learner ${index}` },
    }))
    mountTeacher({ overrides: { students: crowd } })
    await screen.findAllByRole('article')
    await openSession('Not Started')

    await screen.findByText('Learner 0')
    expect(screen.getByText('40 of 45 learners shown')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }))
    expect(await screen.findByText('Learner 44')).toBeInTheDocument()
    expect(screen.queryByText('40 of 45 learners shown')).not.toBeInTheDocument()
  })

  it('fetches the rest of a register the server still holds', async () => {
    const crowd = Array.from({ length: 130 }, (_, index) => ({
      id: 500 + index,
      lrn: `8${String(index).padStart(11, '0')}`,
      section: 4,
      user: { username: `pupil${index}`, full_name: `Pupil ${index}` },
    }))
    mountTeacher({ overrides: { students: crowd } })
    await screen.findAllByRole('article')
    await openSession('Not Started')

    expect(await screen.findByText('This section has 130 learners; the sheet holds the first 100.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load 30 more' }))

    await waitFor(() => expect(listParams('/students/', 100).page).toBe(2))
    // The register now holds every learner; the window still paints forty.
    expect(await screen.findByText('40 of 130 learners shown')).toBeInTheDocument()
    expect(screen.queryByText(/Load \d+ more/)).not.toBeInTheDocument()
  })

  it('keeps the status control a real radio group', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    const group = screen.getByRole('group', { name: 'Attendance status for Maria Cruz' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(document.getElementById('att-101-present')).toBeChecked()
  })

  it('records a note with the marks it is attached to', async () => {
    mountTeacher()
    await screen.findAllByRole('article')
    await openSession('Not Started')
    await screen.findByText('Maria Cruz')

    fireEvent.click(within(screen.getByText('Maria Cruz').closest('tr')).getByRole('button', { name: 'Add note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Notes · Maria Cruz' })
    fireEvent.change(within(dialog).getByLabelText('Note for Maria Cruz'), {
      target: { value: "Doctor's appointment" },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await waitFor(() => expect(bulkCalls()).toHaveLength(1))
    expect(bulkCalls()[0][1].records).toEqual([
      { student: 101, status: 'present', notes: "Doctor's appointment" },
    ])
  })
})

/* ------------------------------------------------------------------ */
/* Teacher — history                                                   */
/* ------------------------------------------------------------------ */

describe('Teacher attendance — history', () => {
  it('reads one server page and reports the server’s total', async () => {
    mountTeacher()
    await openHistory()

    expect(listParams('/attendance/sessions/', 20)).toMatchObject({
      brief: 1,
      page: 1,
      page_size: 20,
      ordering: '-date',
    })
    expect(await screen.findByText('Showing 5 of 5 sessions')).toBeInTheDocument()
    expect(api.list).not.toHaveBeenCalledWith('/attendance/sessions/', expect.anything())
  })

  it('sends sorting, date range, class, subject and status to the server', async () => {
    mountTeacher()
    await openHistory()
    await screen.findByText('Showing 5 of 5 sessions')

    fireEvent.change(document.getElementById('hist-sort'), { target: { value: 'date' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).ordering).toBe('date'))

    fireEvent.change(document.getElementById('hist-from'), { target: { value: YESTERDAY } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).date_after).toBe(YESTERDAY))

    fireEvent.change(document.getElementById('hist-to'), { target: { value: TODAY } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).date_before).toBe(TODAY))

    fireEvent.change(document.getElementById('hist-class'), { target: { value: '8' } })
    fireEvent.change(document.getElementById('hist-subject'), { target: { value: '12' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).subject).toBe('12'))
    expect(listParams('/attendance/sessions/', 20).teacher_assignment).toBe('8')

    fireEvent.change(document.getElementById('hist-status'), { target: { value: 'completed' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).status).toBe('completed'))
    expect(await screen.findByText('1 of your sessions match')).toBeInTheDocument()
  })

  it('pages history without ever holding more than one page', async () => {
    const years = Array.from({ length: 30 }, (_, index) => ({
      id: 400 + index,
      teacher_assignment: 7,
      date: `2025-${String((index % 12) + 1).padStart(2, '0')}-05`,
      status: 'completed',
      notes: '',
      start_time: '08:00',
      end_time: '09:00',
      room: 'Room 3',
      records: [],
    }))
    mountTeacher({ overrides: { sessions: years } })
    await openHistory()
    await screen.findByText('Showing 20 of 30 sessions')

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).page).toBe(2))
    expect(screen.getByText('Showing 10 of 30 sessions')).toBeInTheDocument()
  })

  it('respects the rows-per-page picker', async () => {
    mountTeacher({
      overrides: {
        sessions: Array.from({ length: 30 }, (_, index) => ({
          id: 450 + index,
          teacher_assignment: 7,
          date: '2025-09-05',
          status: 'not_started',
          notes: '',
          start_time: '08:00',
          end_time: '09:00',
          room: 'Room 3',
          records: [],
        })),
      },
    })
    await openHistory()
    await screen.findByText('Showing 20 of 30 sessions')

    fireEvent.change(document.getElementById('att-hist-page-size'), { target: { value: '50' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 50)).toMatchObject({ page: 1, page_size: 50 }))
    expect(await screen.findByText('Showing 30 of 30 sessions')).toBeInTheDocument()
  })

  it('inspects a session, then corrects its marks on one deliberate click', async () => {
    mountTeacher()
    await openHistory()
    await screen.findByText('Showing 5 of 5 sessions')

    // Newest-first puts tomorrow’s untaken session on top, so reach for the
    // finished one by its status cell rather than by row position.
    const finished = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Completed'))
    fireEvent.click(within(finished).getByRole('button', { name: /View session details for/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Completed')).toBeInTheDocument()
    expect(within(dialog).getByText('Elena Gonzales')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Correct marks' }))
    expect(await screen.findByRole('heading', { name: 'Session details' })).toBeInTheDocument()
    expect(await screen.findByText('Elena Gonzales')).toBeInTheDocument()
  })

  it('lets a teacher fix a session’s date and note, and nothing else', async () => {
    mountTeacher()
    await openHistory()
    await screen.findByText('Showing 5 of 5 sessions')

    fireEvent.click(screen.getAllByRole('button', { name: /View session details for/ })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fix date or note' }))

    const editor = await screen.findByRole('dialog', { name: 'Edit attendance session' })
    expect(within(editor).getByLabelText('Class and subject')).toBeDisabled()
    fireEvent.change(within(editor).getByLabelText(/Date/), { target: { value: YESTERDAY } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [path, body] = api.patch.mock.calls[0]
    expect(path).toMatch(/^\/attendance\/sessions\/\d+\/$/)
    expect(body).toEqual({ date: YESTERDAY, notes: expect.any(String) })
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('finds a learner through the server and reads their marks one page at a time', async () => {
    mountTeacher()
    await openHistory()
    await screen.findByText('Showing 5 of 5 sessions')

    fireEvent.click(screen.getByRole('tab', { name: 'By student' }))
    await screen.findByRole('heading', { name: 'Student history' })

    await typeInto('hist-student-search', 'Elena')
    const hit = await screen.findByRole('button', { name: /Elena Gonzales/ })
    expect(listParams('/students/', 8)).toMatchObject({ search: 'Elena', page_size: 8 })

    fireEvent.click(hit)
    await screen.findByText('Showing 1 of 1 records')
    expect(listParams('/attendance/records/', 20)).toMatchObject({ student: 105, ordering: '-date' })

    fireEvent.click(screen.getByRole('button', { name: /^View session of/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Late')).toBeInTheDocument()
  })

  it('says so when a learner has nothing recorded', async () => {
    mountTeacher({ overrides: { sessions: [] } })
    await openHistory()
    await screen.findByText('No attendance history yet')

    fireEvent.click(screen.getByRole('tab', { name: 'By student' }))
    await screen.findByRole('heading', { name: 'Student history' })
    expect(screen.getByText('Search for a student')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/* Teacher — inside a class workspace                                  */
/* ------------------------------------------------------------------ */

describe('Teacher attendance — inside a class workspace', () => {
  it('leaves the page furniture to the workspace and locks the class', async () => {
    mountTeacher({ props: { assignmentId: 7, embedded: true } })
    await screen.findAllByRole('article')

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(document.getElementById('filter-class')).toBeNull()
    expect(listParams('/attendance/sessions/', 20).teacher_assignment).toBe('7')

    await openHistory()
    expect(document.getElementById('hist-class')).toBeNull()
    expect(await screen.findByText('Showing 3 of 3 sessions')).toBeInTheDocument()
  })

  it('follows the workspace when it moves to another class', async () => {
    const first = mountTeacher({ props: { assignmentId: 7, embedded: true } })
    await screen.findAllByRole('article')
    expect(statValue("Today's Sessions")).toBe('2')

    first.unmount()
    const second = mountTeacher({ props: { assignmentId: 8, embedded: true } })
    await second.findByText("Today's Sessions")
    await waitFor(() => expect(statValue("Today's Sessions")).toBe('1'))
    expect(listParams('/attendance/sessions/', 20).teacher_assignment).toBe('8')
  })
})

/* ------------------------------------------------------------------ */
/* Student and parent                                                  */
/* ------------------------------------------------------------------ */

describe('Student and parent attendance', () => {
  it('gives the learner one page of records and a summary counted the same way', async () => {
    mount('student')
    await screen.findByText('Attendance records')

    expect(listParams('/attendance/records/', 20)).toMatchObject({ page: 1, page_size: 20, ordering: '-date' })
    expect(await screen.findByText('5 records')).toBeInTheDocument()
    expect(screen.getByText('Based on 5 attendance records so far.')).toBeInTheDocument()
    expect(api.list).not.toHaveBeenCalledWith('/attendance/records/', expect.anything())
  })

  it('sends the learner’s filters to the server and keeps the summary in step', async () => {
    mount('student')
    await screen.findByText('Attendance records')

    fireEvent.change(document.getElementById('att-status'), { target: { value: 'present' } })
    await waitFor(() => expect(listParams('/attendance/records/', 20).status).toBe('present'))
    const countReads = api.paged.mock.calls
      .filter(([path, options]) => path === '/attendance/records/' && Number(options.params.page_size) === 1)
      .map(([, options]) => options.params.status)
    expect(countReads).toEqual([undefined, 'present', 'absent', 'late', 'excused'])

    fireEvent.change(document.getElementById('att-sort'), { target: { value: 'date' } })
    await waitFor(() => expect(listParams('/attendance/records/', 20).ordering).toBe('date'))
  })

  it('reads the selected child’s records, never both children’s', async () => {
    mount('parent', {
      overrides: {
        dashboard: {
          children: [
            { student_id: 101, name: 'Maria Cruz', section: 'Grade 7 – Sampaguita' },
            { student_id: 105, name: 'Elena Gonzales', section: 'Grade 7 – Gumamela' },
          ],
        },
      },
    })
    await screen.findByText('Attendance records')

    expect(listParams('/attendance/records/', 20).student).toBe(101)
    fireEvent.click(screen.getByRole('tab', { name: /Elena Gonzales/ }))
    await waitFor(() => expect(listParams('/attendance/records/', 20).student).toBe(105))
    expect(await screen.findByText('1 record')).toBeInTheDocument()
  })

  it('is honest with a parent who has no linked child', async () => {
    mount('parent', { overrides: { dashboard: { children: [] } } })
    await screen.findByText('No linked children')
    expect(api.paged).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* Administrator                                                       */
/* ------------------------------------------------------------------ */

describe('Administrator attendance', () => {
  it('reads the school register as one server page', async () => {
    mount('admin')
    await screen.findByRole('heading', { name: 'Attendance sessions' })

    expect(listParams('/attendance/sessions/', 20)).toMatchObject({ brief: 1, page: 1, page_size: 20 })
    expect(await screen.findByText('Showing 5 of 5 sessions')).toBeInTheDocument()
    expect(api.list).not.toHaveBeenCalledWith('/attendance/sessions/', expect.anything())
  })

  it('filters and sorts school-wide history on the server', async () => {
    mount('admin')
    await screen.findByRole('heading', { name: 'Attendance sessions' })

    fireEvent.change(document.getElementById('admin-status'), { target: { value: 'missed' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).status).toBe('missed'))
    expect(await screen.findByText('1 sessions match')).toBeInTheDocument()

    fireEvent.change(document.getElementById('admin-sort'), { target: { value: 'date' } })
    await waitFor(() => expect(listParams('/attendance/sessions/', 20).ordering).toBe('date'))
  })

  it('opens a session to inspect it, with no way to destroy it', async () => {
    mount('admin')
    await screen.findByRole('heading', { name: 'Attendance sessions' })

    const finished = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Completed'))
    fireEvent.click(within(finished).getByRole('button', { name: /View session details for/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Completed')).toBeInTheDocument()
    expect(within(dialog).getByText('Elena Gonzales')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Correct marks' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })
})
