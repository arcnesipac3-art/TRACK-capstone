import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClassTimetablePage from './ClassTimetablePage'
import api from '../services/api'

/**
 * The read-only timetable on the teacher's, the learner's and the parent's side.
 *
 * What a screen owns and `utils/schedules.test.js` cannot prove: that the rows
 * the server chose are the rows drawn, that nothing on this screen can write,
 * that a filter is a re-render rather than a second crawl, and that a failed
 * read never presents a reassuring zero.
 */

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(async () => ({})),
    list: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { api, default: api, ApiError: class ApiError extends Error {} }
})

/* ------------------------------------------------------------------ */
/* Fixtures — rows in the shape ClassScheduleSerializer returns        */
/* ------------------------------------------------------------------ */

function detail(overrides = {}) {
  return {
    id: 1,
    teacher_id: 3,
    teacher_name: 'Ana Cruz',
    subject_name: 'Mathematics',
    section_id: 4,
    section_name: 'Grade 7 - Sampaguita',
    grade_level: 'Grade 7',
    ...overrides,
  }
}

function schedule(overrides = {}) {
  return {
    id: 1,
    teacher_assignment: 1,
    day_of_week: 1,
    day_of_week_display: 'Monday',
    start_time: '07:00:00',
    end_time: '08:00:00',
    room: 'Room 101',
    teacher_assignment_detail: detail(),
    ...overrides,
  }
}

const MATH_MONDAY = schedule()

const SCIENCE_TUESDAY = schedule({
  id: 2,
  teacher_assignment: 2,
  day_of_week: 2,
  day_of_week_display: 'Tuesday',
  start_time: '08:00:00',
  end_time: '09:00:00',
  room: 'Room 102',
  teacher_assignment_detail: detail({
    id: 2,
    subject_name: 'Science',
    section_id: 5,
    section_name: 'Grade 7 - Gumamela',
  }),
})

function serve({
  schedules = [MATH_MONDAY, SCIENCE_TUESDAY],
  children = [{ student_id: 11, name: 'Sara Student', section: 'Grade 7 - Sampaguita' }],
} = {}) {
  api.list.mockImplementation(async (path) => (path === '/schedules/' ? schedules : []))
  api.get.mockImplementation(async (path) => (path === '/dashboard/' ? { children } : {}))
}

function renderPage(scope = 'teacher') {
  return render(<ClassTimetablePage scope={scope} />, {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  })
}

const grid = () => screen.getByRole('region', { name: 'Weekly timetable' })

const figure = (label) => screen.getByText(label).closest('.stat-card')

const scheduleReads = () =>
  api.list.mock.calls.filter(([path]) => path === '/schedules/').length

/** The `child` the most recent read asked for. */
const lastReadParams = () => {
  const calls = api.list.mock.calls.filter(([path]) => path === '/schedules/')
  return calls[calls.length - 1]?.[1]?.params
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('the read-only timetable', () => {
  it('draws the rows the server chose, from one read', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(within(grid()).getByText('Mathematics')).toBeInTheDocument()
    expect(within(grid()).getByText('Science')).toBeInTheDocument()
    expect(scheduleReads()).toBe(1)
  })

  it('counts the week off those rows without a second request', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY, schedule({ id: 3, teacher_assignment: 3 })] })
    renderPage()

    expect(await screen.findByText('Class periods')).toBeInTheDocument()
    expect(figure('Class periods')).toHaveTextContent('3')
    expect(figure('Subjects')).toHaveTextContent('2')
    expect(figure('Sections taught')).toHaveTextContent('2')
    expect(scheduleReads()).toBe(1)
  })

  it('offers no way to write', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(screen.queryByRole('button', { name: /Add Schedule/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Schedule actions' })).toHaveLength(0)

    await userEvent.click(within(grid()).getByRole('button', { name: /Mathematics/ }))
    const details = await screen.findByRole('dialog', { name: 'Schedule details' })
    expect(within(details).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('narrows the grid with a filter instead of a second crawl', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.selectOptions(screen.getByLabelText('Filter by subject'), 'Science')

    expect(within(grid()).getByText('Science')).toBeInTheDocument()
    expect(within(grid()).queryByText('Mathematics')).not.toBeInTheDocument()
    expect(scheduleReads()).toBe(1)
  })

  it('offers a teacher the filters that carry more than one value', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(screen.getByLabelText('Filter by section')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by subject')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by day')).toBeInTheDocument()
    // Every row on this screen is theirs already.
    expect(screen.queryByLabelText('Filter by teacher')).not.toBeInTheDocument()
  })

  it('says so when the timetable is still empty', async () => {
    serve({ schedules: [] })
    renderPage()

    expect(await screen.findByText('No classes on your timetable yet')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Weekly timetable' })).not.toBeInTheDocument()
  })

  it('shows dashes rather than a confident zero when the read fails', async () => {
    api.list.mockImplementation(async () => {
      throw new Error('offline')
    })
    renderPage()

    expect(await screen.findByText('Could not load your timetable')).toBeInTheDocument()
    await waitFor(() => expect(figure('Class periods')).toHaveTextContent('—'))
    expect(figure('Subjects')).toHaveTextContent('—')
    expect(figure('Sections taught')).toHaveTextContent('—')
    expect(figure('Class periods')).not.toHaveTextContent('0')
  })

  it('reads again from the retry control', async () => {
    api.list.mockImplementationOnce(async () => {
      throw new Error('offline')
    })
    renderPage()

    await screen.findByText('Could not load your timetable')
    const readsBefore = scheduleReads()

    await userEvent.click(screen.getByRole('button', { name: /Try again|Retry/i }))
    await waitFor(() => expect(screen.getByText('Class periods')).toBeInTheDocument())
    expect(scheduleReads()).toBe(readsBefore + 1)
    expect(within(grid()).getByText('Mathematics')).toBeInTheDocument()
  })
})

describe('the same timetable for a learner', () => {
  it('asks the server for its week and names no ids of its own', async () => {
    renderPage('student')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(api.list.mock.calls.map(([path]) => path)).toEqual(['/schedules/'])
    expect(scheduleReads()).toBe(1)
  })

  it('drops the filters a single section cannot use', async () => {
    renderPage('student')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(screen.getByLabelText('Filter by subject')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by day')).toBeInTheDocument()
    // One section, and every row on it belongs to somebody else.
    expect(screen.queryByLabelText('Filter by section')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by teacher')).not.toBeInTheDocument()
  })

  it('counts the people who teach it, not the sections it is not in', async () => {
    serve({
      schedules: [
        MATH_MONDAY,
        SCIENCE_TUESDAY,
        schedule({
          id: 3,
          teacher_assignment: 3,
          day_of_week: 3,
          day_of_week_display: 'Wednesday',
          start_time: '09:00:00',
          end_time: '10:00:00',
          teacher_assignment_detail: detail({ id: 3, teacher_id: 9, teacher_name: 'Ben Dela Cruz' }),
        }),
      ],
    })
    renderPage('student')

    expect(await screen.findByText('Teachers')).toBeInTheDocument()
    expect(figure('Teachers')).toHaveTextContent('2')
    expect(figure('Class periods')).toHaveTextContent('3')
    expect(screen.queryByText('Sections taught')).not.toBeInTheDocument()
  })

  it('explains a section with no published week in the learners own words', async () => {
    serve({ schedules: [] })
    renderPage('student')

    expect(await screen.findByText('No timetable for your section yet')).toBeInTheDocument()
    expect(screen.queryByText('No classes on your timetable yet')).not.toBeInTheDocument()
  })

  it('still leaves nothing on the page that could write', async () => {
    renderPage('student')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(screen.queryByRole('button', { name: /Add Schedule/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Schedule actions' })).toHaveLength(0)
    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
  })
})

describe('the same timetable for a parent', () => {
  const TWO_CHILDREN = [
    { student_id: 11, name: 'Sara Student', section: 'Grade 7 - Sampaguita' },
    { student_id: 12, name: 'Nina Student', section: 'Grade 7 - Gumamela' },
  ]

  it('waits for the roster, then reads one childs week', async () => {
    renderPage('parent')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(lastReadParams()).toEqual({ child: 11 })
    expect(scheduleReads()).toBe(1)
    // The roster is the only other thing this screen asks for.
    expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/dashboard/'])
  })

  it('names the child whose week is on screen', async () => {
    serve({ children: TWO_CHILDREN })
    renderPage('parent')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(screen.getByText(/Showing Sara Student/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Nina Student/ })).toBeInTheDocument()
  })

  it('switches to the other child with one further read', async () => {
    serve({ children: TWO_CHILDREN })
    renderPage('parent')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.click(screen.getByRole('tab', { name: /Nina Student/ }))

    await waitFor(() => expect(scheduleReads()).toBe(2))
    expect(lastReadParams()).toEqual({ child: 12 })
    expect(screen.getByText(/Showing Nina Student/)).toBeInTheDocument()
  })

  it('closes a period that belonged to the other child', async () => {
    serve({ children: TWO_CHILDREN })
    renderPage('parent')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.click(within(grid()).getByRole('button', { name: /Mathematics/ }))
    await screen.findByRole('dialog', { name: 'Schedule details' })

    await userEvent.click(screen.getByRole('tab', { name: /Nina Student/ }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Schedule details' })).not.toBeInTheDocument()
    )
  })

  it('does not carry one childs filter onto the next', async () => {
    serve({ children: TWO_CHILDREN })
    renderPage('parent')

    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.selectOptions(screen.getByLabelText('Filter by subject'), 'Science')
    expect(within(grid()).queryByText('Mathematics')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Nina Student/ }))
    await waitFor(() => expect(scheduleReads()).toBe(2))

    expect(screen.getByLabelText('Filter by subject')).toHaveValue('')
    expect(within(grid()).getByText('Mathematics')).toBeInTheDocument()
  })

  it('says so when no child is linked, without asking for a week', async () => {
    serve({ children: [] })
    renderPage('parent')

    expect(await screen.findByText('No linked children')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Weekly timetable' })).not.toBeInTheDocument()
    expect(scheduleReads()).toBe(0)
  })

  it('shows dashes and a way back when the roster cannot be read', async () => {
    api.get.mockImplementation(async () => {
      throw new Error('offline')
    })
    renderPage('parent')

    expect(await screen.findByText('Could not load your children')).toBeInTheDocument()
    expect(figure('Class periods')).toHaveTextContent('—')
    expect(scheduleReads()).toBe(0)
  })

  it('explains a child whose section has no published week', async () => {
    serve({ schedules: [] })
    renderPage('parent')

    expect(await screen.findByText('No timetable for this child yet')).toBeInTheDocument()
    expect(screen.queryByText('No linked children')).not.toBeInTheDocument()
  })
})
