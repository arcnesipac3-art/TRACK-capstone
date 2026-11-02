import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsPage from './RequirementsPage'
import useFetch from '../hooks/useFetch'

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

const DAY = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

const CHILDREN = [
  { student_id: 11, name: 'Sofia Cruz', section: 'Grade 7 — Sampaguita' },
  { student_id: 12, name: 'Miguel Torres', section: 'Grade 7 — Gumamela' },
]

const REQUIREMENTS = [
  {
    id: 201,
    title: 'Quarter 1 Portfolio',
    requirement_type: 'project',
    subject_name: 'Science',
    section_name: 'Grade 7 — Sampaguita',
    teacher_assignment: 500,
    deadline: DAY(3),
    is_overdue: false,
  },
  {
    id: 202,
    title: 'Reading Log',
    requirement_type: 'activity',
    subject_name: 'English',
    section_name: 'Grade 7 — Sampaguita',
    teacher_assignment: 501,
    deadline: DAY(-2),
    is_overdue: true,
  },
]

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

function mockFetch({
  dashboard = LOADED({ children: [] }),
  requirements = LOADED(REQUIREMENTS),
  submissions = LOADED([]),
  assignments = LOADED([]),
} = {}) {
  useFetch.mockImplementation((path) => {
    const reload = vi.fn()
    if (path === '/dashboard/') return { ...dashboard, reload }
    if (path === '/requirements/') return { ...requirements, reload }
    if (path === '/submissions/') return { ...submissions, reload }
    if (path === '/teacher-assignments/') return { ...assignments, reload }
    return { ...IDLE, reload }
  })
}

/** Params actually handed to the requirements request (last call wins). */
function requirementsParams() {
  const calls = useFetch.mock.calls.filter(([path]) => path === '/requirements/')
  return calls[calls.length - 1][1]?.params
}

/** The page reads `?class=` off the router, so every render needs a route. */
function renderPage(ui, entry = '/') {
  return render(<MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RequirementsPage — student', () => {
  it('boxes the explorer inside one shared card', () => {
    mockFetch()
    renderPage(<RequirementsPage scope="student" />)

    const card = document.querySelector('.card')
    expect(card).not.toBeNull()
    // One card only: the explorer must not wrap itself a second time.
    expect(document.querySelectorAll('.card')).toHaveLength(1)
    expect(card.querySelector('.card-body').className).not.toContain('flush')
    expect(within(card).getAllByRole('article')).toHaveLength(2)

    // The student keeps the status/sort strip and the submit affordance.
    expect(within(card).getByLabelText('Status')).toBeInTheDocument()
    expect(within(card).getByLabelText('Sort by')).toBeInTheDocument()
    expect(within(card).getAllByRole('button', { name: /submit work/i })).toHaveLength(2)
  })

  it('names the request and reports a failure without inventing rows', async () => {
    const user = userEvent.setup()
    mockFetch({ requirements: { ...IDLE, error: new Error('Requirements unavailable') } })
    renderPage(<RequirementsPage scope="student" />)

    expect(screen.getByText('Could not load requirements')).toBeInTheDocument()
    expect(screen.getByText('Requirements unavailable')).toBeInTheDocument()
    expect(screen.queryAllByRole('article')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(useFetch).toHaveBeenCalled()
  })

  it('explains an empty list instead of leaving a bare card', () => {
    mockFetch({ requirements: LOADED([]) })
    renderPage(<RequirementsPage scope="student" />)

    expect(screen.getByText('No requirements to show')).toBeInTheDocument()
    expect(
      screen.getByText('When teachers post requirements, they will appear here.')
    ).toBeInTheDocument()
  })
})

describe('RequirementsPage — parent', () => {
  it('holds the child picker open until the directory resolves', () => {
    mockFetch({ dashboard: { ...IDLE, loading: true } })
    renderPage(<RequirementsPage scope="parent" />)

    // Announced once, and the placeholder lives in a real card body.
    const announced = screen.getByText('Loading your children…')
    expect(announced).toHaveAttribute('role', 'status')
    expect(announced).toHaveAttribute('aria-live', 'polite')
    const block = document.querySelector('.skeleton-block')
    expect(block).not.toBeNull()
    expect(block.closest('.card-body')).not.toBeNull()

    // Neither the selector nor the list is rendered against unknown children.
    expect(screen.queryByRole('tablist', { name: 'Select child' })).toBeNull()
    expect(document.querySelectorAll('.record-card')).toHaveLength(0)
  })

  it('describes an account with no child linked to it', () => {
    mockFetch({ dashboard: LOADED({ children: [] }) })
    renderPage(<RequirementsPage scope="parent" />)

    const card = document.querySelector('.card')
    expect(card).not.toBeNull()
    expect(within(card).getByText('No linked children')).toBeInTheDocument()
    expect(card.querySelector('.skeleton')).toBeNull()
    expect(screen.queryByLabelText('Status')).toBeNull()
  })

  it('reports a failed directory request', () => {
    mockFetch({ dashboard: { ...IDLE, error: new Error('Directory unavailable') } })
    renderPage(<RequirementsPage scope="parent" />)

    expect(screen.getByText('Could not load your children')).toBeInTheDocument()
    expect(screen.getByText('Directory unavailable')).toBeInTheDocument()
  })

  it('scopes the list to the selected child and follows the picker', async () => {
    const user = userEvent.setup()
    mockFetch({ dashboard: LOADED({ children: CHILDREN }) })
    renderPage(<RequirementsPage scope="parent" />)

    // Defaults to the first child and says so in the subtitle.
    expect(requirementsParams()).toEqual({ child: 11 })
    expect(
      screen.getByText(/Assignments for your selected child.*Showing Sofia Cruz\./)
    ).toBeInTheDocument()

    // Parents read status but cannot submit on a child's behalf.
    expect(within(document.querySelector('.card')).getByLabelText('Status')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /submit work/i })).toHaveLength(0)

    const picker = screen.getByRole('tablist', { name: 'Select child' })
    expect(within(picker).getByRole('tab', { name: /Miguel Torres/ })).toHaveAttribute(
      'aria-selected',
      'false'
    )

    await user.click(within(picker).getByRole('tab', { name: /Miguel Torres/ }))
    expect(requirementsParams()).toEqual({ child: 12 })
    expect(screen.getByText(/Showing Miguel Torres\./)).toBeInTheDocument()
  })

  it('stays a single column when only one child is linked', () => {
    mockFetch({ dashboard: LOADED({ children: [CHILDREN[0]] }) })
    renderPage(<RequirementsPage scope="parent" />)

    expect(screen.queryByRole('tablist', { name: 'Select child' })).toBeNull()
    expect(screen.getByText(/Showing Sofia Cruz\./)).toBeInTheDocument()
    expect(requirementsParams()).toEqual({ child: 11 })
  })
})

describe('RequirementsPage — staff', () => {
  it('leaves the teacher request unscoped and keeps the post affordance', () => {
    mockFetch()
    renderPage(<RequirementsPage scope="teacher" />)

    expect(requirementsParams()).toEqual({})
    // Teachers see class information, not a student's submission controls.
    expect(screen.queryByLabelText('Status')).toBeNull()
    expect(document.querySelectorAll('.record-card')).toHaveLength(2)
    expect(screen.queryByText(/Showing requirements for/)).toBeNull()
  })
})

describe('RequirementsPage — class context', () => {
  it('narrows the list to the class named in the url', async () => {
    const user = userEvent.setup()
    mockFetch()
    renderPage(<RequirementsPage scope="teacher" />, '/teacher/requirements?class=500')

    expect(document.querySelectorAll('.record-card')).toHaveLength(1)
    expect(screen.getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Reading Log')).toBeNull()
    expect(
      screen.getByText(/Showing requirements for Science — Grade 7 — Sampaguita/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show all classes/i }))
    expect(document.querySelectorAll('.record-card')).toHaveLength(2)
    expect(screen.queryByText(/Showing requirements for/)).toBeNull()
  })

  it('says so when the class has nothing posted yet', () => {
    mockFetch()
    renderPage(<RequirementsPage scope="teacher" />, '/teacher/requirements?class=777')

    expect(document.querySelectorAll('.record-card')).toHaveLength(0)
    expect(screen.getByText('Nothing has been posted to this class yet.')).toBeInTheDocument()
  })

  it('opens the create form on the class the card came from', async () => {
    const user = userEvent.setup()
    mockFetch({
      assignments: LOADED([
        { id: 500, subject_name: 'Science', section_name: 'Grade 7 — Sampaguita' },
        { id: 501, subject_name: 'English', section_name: 'Grade 7 — Sampaguita' },
      ]),
    })
    renderPage(<RequirementsPage scope="teacher" />, '/teacher/requirements?class=500')

    await user.click(screen.getByRole('button', { name: /new requirement/i }))
    expect(screen.getByLabelText('Class and subject')).toHaveValue('500')
  })
})

describe('RequirementsPage — inside a class workspace', () => {
  const embedded = LOADED([
    { id: 500, subject_name: 'Science', section_name: 'Grade 7 — Sampaguita' },
    { id: 501, subject_name: 'English', section_name: 'Grade 7 — Sampaguita' },
  ])

  it('drops the page header and keeps only this class’s requirements', () => {
    mockFetch({ assignments: embedded })
    renderPage(
      <RequirementsPage scope="teacher" assignmentId="500" embedded />,
      '/teacher/classes/500/requirements'
    )

    expect(document.querySelector('.page-header')).toBeNull()
    expect(document.querySelector('.cw-activity-bar')).not.toBeNull()
    expect(screen.getByText(/Only this class is listed/)).toBeInTheDocument()
    expect(document.querySelectorAll('.record-card')).toHaveLength(1)
    expect(screen.getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Reading Log')).toBeNull()
  })

  it('gives no way to widen the scope, because the class is the scope', () => {
    mockFetch({ assignments: embedded })
    renderPage(
      <RequirementsPage scope="teacher" assignmentId="500" embedded />,
      '/teacher/classes/500/requirements'
    )

    expect(screen.queryByText(/Showing requirements for/)).toBeNull()
    expect(screen.queryByRole('button', { name: /show all classes/i })).toBeNull()
  })

  it('ignores a ?class= that names a different class', () => {
    mockFetch({ assignments: embedded })
    renderPage(
      <RequirementsPage scope="teacher" assignmentId="500" embedded />,
      '/teacher/classes/500/requirements?class=501'
    )

    // The route owns the scope: a stray query string cannot swap the class.
    expect(screen.getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Reading Log')).toBeNull()
  })

  it('posts to the class the workspace is open on', async () => {
    const user = userEvent.setup()
    mockFetch({ assignments: embedded })
    renderPage(
      <RequirementsPage scope="teacher" assignmentId="500" embedded />,
      '/teacher/classes/500/requirements'
    )

    await user.click(screen.getByRole('button', { name: /new requirement/i }))
    expect(screen.getByLabelText('Class and subject')).toHaveValue('500')
  })
})
