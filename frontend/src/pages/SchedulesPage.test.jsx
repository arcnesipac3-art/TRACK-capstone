import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SchedulesPage from './SchedulesPage'
import { acceptConfirm, declineConfirm, renderConfirmed } from '../test/confirm'
import api from '../services/api'

/**
 * The schedules screen, end to end.
 *
 * The arithmetic lives in `utils/schedules.test.js`; these specs are about the
 * behaviour a screen owns and a pure function cannot: that one read feeds the
 * grid, the filters and the headline figures; that a filter is a re-render
 * rather than a second crawl; and that a destructive write asks first, can be
 * taken back, and says so when the server refuses.
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
    teacher_id: 4,
    teacher_name: 'Ben Dela Cruz',
    subject_name: 'Science',
    section_id: 5,
    section_name: 'Grade 7 - Gumamela',
  }),
})

// A different subject and section, but still Ana Cruz — and on a Saturday.
const SATURDAY_CLASS = schedule({
  id: 3,
  teacher_assignment: 3,
  day_of_week: 6,
  day_of_week_display: 'Saturday',
  start_time: '09:00:00',
  end_time: '10:00:00',
  room: 'Room 3',
  teacher_assignment_detail: detail({
    id: 3,
    subject_name: 'Araling Panlipunan',
    section_id: 5,
    section_name: 'Grade 7 - Gumamela',
  }),
})

// Same teacher, same section, half an hour into MATH_MONDAY: a real clash.
const MONDAY_CLASH = schedule({
  id: 4,
  teacher_assignment: 4,
  start_time: '07:30:00',
  end_time: '08:30:00',
  teacher_assignment_detail: detail({
    id: 4,
    subject_name: 'Music',
  }),
})

const SATURDAY_CLASH = schedule({
  id: 5,
  teacher_assignment: 5,
  day_of_week: 6,
  day_of_week_display: 'Saturday',
  start_time: '09:30:00',
  end_time: '10:30:00',
  room: 'Room 5',
  teacher_assignment_detail: detail({
    id: 5,
    subject_name: 'Physics',
    section_id: 5,
    section_name: 'Grade 7 - Gumamela',
  }),
})

const ASSIGNMENTS = [
  {
    id: 1,
    teacher: 3,
    teacher_name: 'Ana Cruz',
    subject: 11,
    subject_name: 'Mathematics',
    section: 4,
    section_name: 'Grade 7 - Sampaguita',
  },
  {
    id: 2,
    teacher: 4,
    teacher_name: 'Ben Dela Cruz',
    subject: 12,
    subject_name: 'Science',
    section: 5,
    section_name: 'Grade 7 - Gumamela',
  },
]

/** Answers each list endpoint the screen may ask for. */
function serve({
  schedules = [MATH_MONDAY, SCIENCE_TUESDAY],
  assignments = ASSIGNMENTS,
} = {}) {
  api.list.mockImplementation(async (path) => {
    if (path === '/schedules/') return schedules
    if (path === '/teacher-assignments/') return assignments
    return []
  })
}

function renderPage() {
  return renderConfirmed(<SchedulesPage />, {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  })
}

/** The grid, so a subject name in a filter dropdown cannot answer for it.
 *  Tests that have not awaited a load yet reach it with `findByRole` first. */
const grid = () => screen.getByRole('region', { name: 'Weekly timetable' })

const conflictsKpi = () => screen.findByRole('button', { name: /activate to review/i })

async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: /Add Schedule/ }))
  return screen.findByRole('dialog', { name: 'Add Schedule' })
}

async function fillForm(dialog, { assignment, day, start, end, room }) {
  if (assignment !== undefined) {
    const subject = within(dialog).getByLabelText('Class and subject')
    // The class list is a request of its own; the select is disabled until it
    // arrives, so filling the form means waiting for it in the right order.
    await waitFor(() => expect(subject).toBeEnabled())
    await userEvent.selectOptions(subject, assignment)
  }
  if (day !== undefined) {
    await userEvent.selectOptions(within(dialog).getByLabelText('Day of week'), day)
  }
  // jsdom sanitises a partial `type="time"` value, so these are set whole.
  if (start !== undefined) {
    fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: start } })
  }
  if (end !== undefined) {
    fireEvent.change(within(dialog).getByLabelText('End time'), { target: { value: end } })
  }
  if (room !== undefined) {
    await userEvent.type(within(dialog).getByLabelText('Room'), room)
  }
}

/** Switch to the class-by-class view, where each row names its own actions. */
async function toListView() {
  await screen.findByRole('region', { name: 'Weekly timetable' })
  await userEvent.click(screen.getByRole('button', { name: 'List' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('weekly grid', () => {
  it('draws the loaded periods as blocks in the timetable', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    const card = await within(grid()).findByRole('button', { name: /Mathematics/ })
    expect(card).toHaveTextContent('Grade 7 - Sampaguita')
    expect(card).toHaveTextContent('07:00–08:00')
    expect(card).toHaveTextContent('Room 101')
  })

  it('shows Monday to Friday and nothing else', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(day) })).toBeInTheDocument()
    }
    expect(screen.queryByRole('columnheader', { name: /Saturday/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Sunday/ })).not.toBeInTheDocument()
  })

  it('opens a weekend column for the first class that needs one', async () => {
    serve({ schedules: [MATH_MONDAY, SATURDAY_CLASS] })
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    // Saturday joins the grid instead of the row vanishing from a five-day grid.
    expect(screen.getByRole('columnheader', { name: /Saturday/ })).toBeInTheDocument()
    expect(within(grid()).getByText('Araling Panlipunan')).toBeInTheDocument()
    // Sunday is still unclaimed.
    expect(screen.queryByRole('columnheader', { name: /Sunday/ })).not.toBeInTheDocument()
  })

  it('names the weekend in a conflict that only happens there', async () => {
    serve({ schedules: [SATURDAY_CLASS, SATURDAY_CLASH] })
    renderPage()

    await userEvent.click(await conflictsKpi())
    const panel = await screen.findByRole('region', { name: 'Scheduling conflicts' })

    expect(within(panel).getByText('Saturday · 09:00–10:00')).toBeInTheDocument()
  })

  it('renders the same rows as a class-by-class list', async () => {
    serve({ schedules: [MATH_MONDAY, SATURDAY_CLASS] })
    renderPage()
    await toListView()

    expect(await screen.findByRole('heading', { name: 'Araling Panlipunan' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /Saturday/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Saturday 09:00' })).toBeInTheDocument()
  })

  it('marks a clashed period in both views', async () => {
    serve({ schedules: [MATH_MONDAY, MONDAY_CLASH] })
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(await within(grid()).findAllByLabelText(/Scheduling conflict/)).toHaveLength(2)

    await toListView()
    expect(screen.getAllByText('Conflict')).toHaveLength(2)
  })
})

describe('headline figures', () => {
  it('counts periods, teachers and conflicts from the loaded rows', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY, MONDAY_CLASH] })
    renderPage()

    expect(await screen.findByText('Scheduled periods')).toBeInTheDocument()
    expect(screen.getByText('Scheduled periods').closest('.stat-card')).toHaveTextContent('3')
    expect(screen.getByText('Teachers scheduled').closest('.stat-card')).toHaveTextContent('2')
    expect(await conflictsKpi()).toHaveTextContent('1')
  })

  it('says so when nothing is booked yet', async () => {
    serve({ schedules: [] })
    renderPage()

    expect(await screen.findByText('No schedules configured')).toBeInTheDocument()
    expect(screen.getByText('Nothing booked yet')).toBeInTheDocument()
    expect(screen.getByText('Every class fits')).toBeInTheDocument()
  })

  it('shows an em dash rather than a reassuring zero when the read fails', async () => {
    api.list.mockRejectedValue(new Error('The request timed out.'))
    renderPage()

    expect(await screen.findByText('Could not load schedules')).toBeInTheDocument()
    expect(screen.getAllByText('Could not be counted')).toHaveLength(2)
    expect(screen.getByText('Could not be checked')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('re-reads the week when the retry is pressed', async () => {
    api.list.mockRejectedValueOnce(new Error('The request timed out.'))
    renderPage()

    await screen.findByText('Could not load schedules')
    expect(api.list).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByRole('button', { name: /Mathematics/ })).toBeInTheDocument()
    expect(api.list).toHaveBeenCalledTimes(2)
  })
})

describe('filters', () => {
  it('narrow the view without a second request', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY, SATURDAY_CLASS] })
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    await userEvent.selectOptions(screen.getByLabelText('Filter by teacher'), 'Ana Cruz')

    expect(within(grid()).getByText('Mathematics')).toBeInTheDocument()
    expect(within(grid()).queryByText('Science')).not.toBeInTheDocument()

    // The options came from the rows already in hand — no crawl for a dropdown.
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledWith('/schedules/', expect.anything())
  })

  it('key the teacher filter on the person, not the assignment row', async () => {
    // MATH_MONDAY and SATURDAY_CLASS are two assignments held by one teacher.
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY, SATURDAY_CLASS] })
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    const teacher = screen.getByLabelText('Filter by teacher')
    expect(within(teacher).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All teachers',
      'Ana Cruz',
      'Ben Dela Cruz',
    ])

    await userEvent.selectOptions(teacher, 'Ana Cruz')
    expect(within(grid()).getByText('Araling Panlipunan')).toBeInTheDocument()
  })

  it('keep reporting a conflict that a filter hides', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY, MONDAY_CLASH] })
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    // Science has no clash of its own; filtering to it must not say otherwise.
    await userEvent.selectOptions(screen.getByLabelText('Filter by subject'), 'Science')

    expect(await conflictsKpi()).toHaveTextContent('1')
    expect(within(grid()).queryByText('Mathematics')).not.toBeInTheDocument()
  })

  it('clear themselves', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY] })
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    await userEvent.selectOptions(
      screen.getByLabelText('Filter by section'),
      'Grade 7 - Sampaguita'
    )
    expect(within(grid()).queryByText('Science')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(within(grid()).getByText('Science')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by section')).toHaveValue('')
  })

  it('report when no row matches', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY] })
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })

    await userEvent.selectOptions(screen.getByLabelText('Filter by day'), '7')

    expect(await screen.findByText('No matching schedules')).toBeInTheDocument()
  })
})

describe('conflict review', () => {
  it('opens and closes from the conflict figure', async () => {
    serve({ schedules: [MATH_MONDAY, MONDAY_CLASH] })
    renderPage()

    expect(screen.queryByRole('region', { name: 'Scheduling conflicts' })).not.toBeInTheDocument()

    await userEvent.click(await conflictsKpi())
    const panel = await screen.findByRole('region', { name: 'Scheduling conflicts' })
    expect(panel).toHaveTextContent('1 Scheduling Conflict across 1 time slot')

    await userEvent.click(screen.getByRole('button', { name: 'Close conflict panel' }))
    expect(screen.queryByRole('region', { name: 'Scheduling conflicts' })).not.toBeInTheDocument()
  })

  it('lists what collides and why', async () => {
    serve({ schedules: [MATH_MONDAY, MONDAY_CLASH] })
    renderPage()

    await userEvent.click(await conflictsKpi())
    const panel = await screen.findByRole('region', { name: 'Scheduling conflicts' })

    expect(within(panel).getByText('Monday · 07:00–08:00')).toBeInTheDocument()
    expect(within(panel).getByText('Ana Cruz is double-booked at this time')).toBeInTheDocument()
    expect(
      within(panel).getByText('Grade 7 - Sampaguita has two overlapping classes')
    ).toBeInTheDocument()
  })

  it('opens the period behind a conflict from the panel', async () => {
    serve({ schedules: [MATH_MONDAY, MONDAY_CLASH] })
    renderPage()

    await userEvent.click(await conflictsKpi())
    const panel = await screen.findByRole('region', { name: 'Scheduling conflicts' })

    await userEvent.click(within(panel).getAllByRole('button', { name: /Mathematics/ })[0])
    expect(await screen.findByRole('dialog', { name: 'Schedule details' })).toBeInTheDocument()
  })
})

describe('deleting a period', () => {
  async function askToDelete() {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY] })
    renderPage()
    await toListView()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Monday 07:00' }))
  }

  it('asks before removing anything, and names the consequence', async () => {
    await askToDelete()

    const dialog = await screen.findByRole('dialog', { name: 'Delete Schedule?' })
    expect(dialog).toHaveTextContent(
      'Mathematics · Grade 7 - Sampaguita · Monday 07:00–08:00 · Room 101'
    )
    expect(dialog).toHaveTextContent('Past attendance sessions are preserved')
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('runs nothing when the admin backs out', async () => {
    await askToDelete()
    await declineConfirm(userEvent, { title: 'Delete Schedule?' })

    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete Monday 07:00' })).toBeInTheDocument()
  })

  it('removes the row and offers to put it back', async () => {
    await askToDelete()
    await acceptConfirm(userEvent, { title: 'Delete Schedule?', label: 'Delete Schedule' })

    expect(api.delete).toHaveBeenCalledWith('/schedules/1/')
    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent('Schedule deleted')

    await userEvent.click(within(toast).getByRole('button', { name: /Undo/ }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/schedules/', {
        teacher_assignment: 1,
        day_of_week: 1,
        start_time: '07:00:00',
        end_time: '08:00:00',
        room: 'Room 101',
      })
    )
  })

  it('drops the offer when dismissed', async () => {
    await askToDelete()
    await acceptConfirm(userEvent, { title: 'Delete Schedule?', label: 'Delete Schedule' })

    const toast = await screen.findByRole('alert')
    await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Schedule deleted')).not.toBeInTheDocument()
    // Dismissing is not undoing: the row is gone and nothing is re-posted.
    expect(api.post).not.toHaveBeenCalled()
  })

  it('says so when the delete fails', async () => {
    api.delete.mockRejectedValueOnce(new Error('Cannot delete: attendance exists.'))
    await askToDelete()
    await acceptConfirm(userEvent, { title: 'Delete Schedule?', label: 'Delete Schedule' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete: attendance exists.')
    expect(screen.queryByText('Schedule deleted')).not.toBeInTheDocument()
  })

  it('dismisses the failure once read', async () => {
    api.delete.mockRejectedValueOnce(new Error('Cannot delete: attendance exists.'))
    await askToDelete()
    await acceptConfirm(userEvent, { title: 'Delete Schedule?', label: 'Delete Schedule' })

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss delete error' }))
    expect(screen.queryByText('Cannot delete: attendance exists.')).not.toBeInTheDocument()
  })
})

describe('adding and editing', () => {
  it('loads the class list only when the dialog opens', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(api.list).not.toHaveBeenCalledWith('/teacher-assignments/', expect.anything())

    await openForm()
    expect(api.list).toHaveBeenCalledWith('/teacher-assignments/', expect.anything())
  })

  it('closes the add dialog without writing anything', async () => {
    renderPage()
    const dialog = await openForm()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Add Schedule' })).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('closes the edit dialog without writing anything', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.click(within(grid()).getAllByRole('button', { name: 'Schedule actions' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const form = await screen.findByRole('dialog', { name: 'Edit Class Schedule' })
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('offers all seven days, including the weekend', async () => {
    renderPage()
    const dialog = await openForm()

    const day = await within(dialog).findByLabelText('Day of week')
    expect(within(day).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Select a day…',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })

  it('blocks the save on a double-booking', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY] })
    renderPage()
    const dialog = await openForm()

    await fillForm(dialog, { assignment: '1', day: '1', start: '07:30', end: '08:30' })

    // 300 ms of debounce, then the clash is reported before the server is asked.
    expect(
      await within(dialog).findByText(
        'Ana Cruz already teaches Mathematics (Grade 7 - Sampaguita) at this time'
      )
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add Schedule' })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('warns about a shared room without blocking the save', async () => {
    serve({ schedules: [MATH_MONDAY] })
    renderPage()
    const dialog = await openForm()

    // Assignment 2 is another teacher and section, in the same room.
    await fillForm(dialog, { assignment: '2', day: '1', start: '07:30', end: '08:30', room: 'Room 101' })

    expect(
      await within(dialog).findByText(
        'Room Room 101 is already booked for Mathematics (Grade 7 - Sampaguita)'
      )
    ).toBeInTheDocument()

    const save = within(dialog).getByRole('button', { name: 'Add Schedule' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() => expect(api.post).toHaveBeenCalled())
  })

  it('refuses an end time that is not after the start', async () => {
    renderPage()
    const dialog = await openForm()

    await fillForm(dialog, { assignment: '1', day: '1', start: '09:00', end: '08:00' })

    expect(await within(dialog).findByText('End time must be after start time.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add Schedule' })).toBeDisabled()
  })

  it('reports the length of a class that is too short', async () => {
    renderPage()
    const dialog = await openForm()

    await fillForm(dialog, { assignment: '1', day: '4', start: '07:00', end: '07:20' })

    expect(await within(dialog).findByText('Class is less than 30 minutes.')).toBeInTheDocument()
    // A soft warning, unlike a double-booking.
    expect(within(dialog).getByRole('button', { name: 'Add Schedule' })).toBeEnabled()
  })

  it('edits the row behind a block, saving with PATCH', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY] })
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.click(within(grid()).getByRole('button', { name: /Mathematics/ }))
    const details = await screen.findByRole('dialog', { name: 'Schedule details' })
    await userEvent.click(within(details).getByRole('button', { name: /Edit/ }))

    const form = await screen.findByRole('dialog', { name: 'Edit Class Schedule' })
    expect(within(form).getByLabelText('Class and subject')).toHaveValue('1')
    expect(within(form).getByLabelText('Day of week')).toHaveValue('1')

    const room = within(form).getByLabelText('Room')
    await userEvent.clear(room)
    await userEvent.type(room, 'Room 204')

    await userEvent.click(within(form).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/schedules/1/',
        expect.objectContaining({ room: 'Room 204' })
      )
    )
  })

  it('shows one period in full before it is edited', async () => {
    serve({ schedules: [SATURDAY_CLASS] })
    renderPage()

    await screen.findByRole('region', { name: 'Weekly timetable' })
    await userEvent.click(within(grid()).getByRole('button', { name: /Araling/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Schedule details' })

    expect(within(dialog).getByText('Saturday')).toBeInTheDocument()
    expect(within(dialog).getByText('09:00–10:00')).toBeInTheDocument()
    expect(within(dialog).getByText('Grade 7')).toBeInTheDocument()
  })

  it('names the rooms already in use', async () => {
    serve({ schedules: [MATH_MONDAY, SCIENCE_TUESDAY] })
    renderPage()
    const dialog = await openForm()

    const room = within(dialog).getByLabelText('Room')
    expect(room).toHaveAttribute('list', 'room-suggestions')
    expect(
      within(dialog).getByText('Optional. Suggestions come from the rooms already in use.')
    ).toBeInTheDocument()
    // The suggestions are the rooms on the page, not a list the form invents.
    expect(Array.from(document.querySelectorAll('#room-suggestions option')).map((o) => o.value)).toEqual([
      'Room 101',
      'Room 102',
    ])
  })
})

describe('first load', () => {
  it('holds the grid shape while the week is still arriving', async () => {
    let resolve
    api.list.mockImplementation(() => new Promise((done) => resolve = done))
    renderPage()

    // The placeholder table is deliberately hidden from assistive tech; the
    // status line is what is announced, and the columns are already in place.
    expect(screen.getByRole('status')).toHaveTextContent('Loading schedules…')
    expect(document.querySelector('.timetable-table')).not.toBeNull()

    resolve([MATH_MONDAY])
    await screen.findByRole('region', { name: 'Weekly timetable' })
    expect(within(grid()).getByRole('button', { name: /Mathematics/ })).toBeInTheDocument()
  })

  it('keeps the figures on the old week until the new one lands', async () => {
    serve({ schedules: [MATH_MONDAY] })
    renderPage()
    expect(await screen.findByText('Scheduled periods')).toBeInTheDocument()
    expect(screen.getByText('Scheduled periods').closest('.stat-card')).toHaveTextContent('1')

    // Only the week is in flight; the dialog's own class list still answers.
    let resolve
    api.list.mockImplementation((path) =>
      path === '/schedules/'
        ? new Promise((done) => (resolve = done))
        : Promise.resolve(path === '/teacher-assignments/' ? ASSIGNMENTS : [])
    )
    await userEvent.click(screen.getByRole('button', { name: /Add Schedule/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Schedule' })
    await fillForm(dialog, { assignment: '1', day: '3', start: '10:00', end: '11:00' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add Schedule' }))

    // Saving refreshes the list; the strip must not blink to zero meanwhile.
    expect(screen.getByText('Scheduled periods').closest('.stat-card')).toHaveTextContent('1')
    resolve([MATH_MONDAY, SCIENCE_TUESDAY])
    await waitFor(() =>
      expect(screen.getByText('Scheduled periods').closest('.stat-card')).toHaveTextContent('2')
    )
  })
})
