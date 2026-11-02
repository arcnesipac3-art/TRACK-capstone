import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SubmissionsPage from './SubmissionsPage'
import api from '../services/api'
import useFetch from '../hooks/useFetch'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(),
    list: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ensureCsrf: vi.fn(),
  }
  return { default: api, api, API_BASE: '/api', ApiError: class ApiError extends Error {} }
})

const ITEMS = [
  {
    id: 301,
    requirement: 201,
    requirement_title: 'Quarter 1 Portfolio',
    student_name: 'Sofia Cruz',
    status: 'verified',
    submitted_at: '2026-10-12T01:30:00Z',
    teacher_feedback: '',
    link_url: 'https://drive.example/portfolio',
  },
  {
    id: 302,
    requirement: 202,
    requirement_title: 'Reading Log',
    student_name: 'Sofia Cruz',
    status: 'returned',
    submitted_at: '2026-10-20T01:30:00Z',
    teacher_feedback: `${'Revise the summary section. '.repeat(5)} And add page numbers.`,
    link_url: '',
  },
  {
    id: 303,
    requirement: 203,
    requirement_title: 'Lab Sheet',
    student_name: 'Sofia Cruz',
    status: 'submitted',
    submitted_at: null,
    teacher_feedback: '',
    link_url: '',
  },
]

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

function mockFetch({ submissions = LOADED(ITEMS), requirements = LOADED([]) } = {}) {
  useFetch.mockImplementation((path) => {
    const reload = vi.fn()
    if (path === '/submissions/') return { ...submissions, reload }
    if (path === '/requirements/') return { ...requirements, reload }
    return { ...IDLE, reload }
  })
}

/** The review screen reads `?class=` off the router, so every render needs one. */
function renderPage(ui, entry = '/') {
  return render(<MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>)
}

const card = () => document.querySelector('.card')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SubmissionsPage — student', () => {
  it('puts the table placeholder in a flush card so nothing rewraps', () => {
    mockFetch({ submissions: { ...IDLE, loading: true } })
    renderPage(<SubmissionsPage />)

    expect(screen.getByText('Loading your submissions…')).toHaveAttribute('role', 'status')
    expect(card().querySelector('.card-body').className).toContain('flush')
    // One table, real column headings, and no second `.table-wrap` inside it.
    // The skeleton tree is aria-hidden, so it is checked as markup.
    expect(card().querySelectorAll('.table-wrap')).toHaveLength(1)
    const head = [...card().querySelectorAll('thead th')]
    expect(head.map((th) => th.textContent)).toEqual([
      'Requirement',
      'Submitted',
      'Status',
      'Teacher feedback',
      'Work',
    ])
    expect(card().querySelectorAll('tbody tr')).toHaveLength(5)
    expect(card().querySelectorAll('.skeleton-line')).toHaveLength(25)
  })

  it('runs the finished table to the card edge', () => {
    mockFetch()
    renderPage(<SubmissionsPage />)

    expect(card().querySelector('.card-body').className).toContain('flush')
    const rows = within(card()).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Verified')).toHaveClass('badge badge-green')
    expect(within(rows[0]).getByRole('link', { name: 'Open link' })).toHaveAttribute(
      'href',
      'https://drive.example/portfolio'
    )
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('rel', 'noreferrer')

    // Long feedback is clamped, with the full text left on the title.
    const feedback = within(rows[1]).getByText(/Revise the summary/)
    expect(feedback.textContent.length).toBeLessThanOrEqual(71)
    expect(feedback.getAttribute('title').length).toBeGreaterThan(71)

    // Missing values stay described rather than blank.
    expect(within(rows[2]).getAllByText('—')).toHaveLength(3)
    expect(within(rows[2]).getByText('Awaiting verification')).toBeInTheDocument()
  })

  it('describes an account that has not submitted anything', () => {
    mockFetch({ submissions: LOADED([]) })
    renderPage(<SubmissionsPage />)

    expect(within(card()).getByRole('heading', { name: 'No submissions yet' })).toBeInTheDocument()
    expect(
      within(card()).getByText(/Work you submit from My Requirements/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryAllByRole('status')).toHaveLength(0)
  })

  it('reports a failed request and retries', async () => {
    const user = userEvent.setup()
    mockFetch({ submissions: { ...IDLE, error: new Error('Submissions unavailable') } })
    renderPage(<SubmissionsPage />)

    expect(screen.getByText('Could not load your submissions')).toBeInTheDocument()
    expect(screen.getByText('Submissions unavailable')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(useFetch).toHaveBeenCalled()
  })
})

describe('SubmissionsPage — teacher review', () => {
  it('keeps the review list and its verification action on the real endpoint', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({ id: 303, status: 'verified' })
    mockFetch()
    renderPage(<SubmissionsPage mode="review" />)

    expect(screen.getByLabelText('Show')).toBeInTheDocument()
    expect(screen.getByText('1 awaiting verification')).toBeInTheDocument()

    const row = screen.getByText('Lab Sheet').closest('.list-card')
    await user.click(within(row).getByRole('button', { name: /verify/i }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/submissions/303/', { status: 'verified' })
    )
  })

  it('narrows the queue to the class handed over by My Classes', async () => {
    const user = userEvent.setup()
    mockFetch({
      requirements: LOADED([
        {
          id: 201,
          teacher_assignment: 500,
          subject_name: 'Science',
          section_name: 'Grade 7 — Sampaguita (2026-2027)',
        },
        {
          id: 202,
          teacher_assignment: 501,
          subject_name: 'English',
          section_name: 'Grade 7 — Sampaguita (2026-2027)',
        },
        {
          id: 203,
          teacher_assignment: 501,
          subject_name: 'English',
          section_name: 'Grade 7 — Sampaguita (2026-2027)',
        },
      ]),
    })
    renderPage(<SubmissionsPage mode="review" />, '/teacher/review?class=500')

    expect(
      screen.getByText(/Showing submissions for Science — Grade 7 — Sampaguita/)
    ).toBeInTheDocument()
    // Only the work posted by assignment 500 stays in view.
    await user.selectOptions(screen.getByLabelText('Show'), 'all')
    expect(screen.getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Reading Log')).toBeNull()
    expect(screen.queryByText('Lab Sheet')).toBeNull()

    await user.click(screen.getByRole('button', { name: /show all classes/i }))
    expect(screen.getByText('Lab Sheet')).toBeInTheDocument()
    expect(screen.queryByText(/Showing submissions for/)).toBeNull()
  })

  it('leaves the queue unscoped when no class is in the url', () => {
    mockFetch()
    renderPage(<SubmissionsPage mode="review" />)

    expect(screen.queryByText(/Showing submissions for/)).toBeNull()
    expect(screen.getByText('Lab Sheet')).toBeInTheDocument()
  })
})

describe('SubmissionsPage — inside a class workspace', () => {
  const CLASS_REQUIREMENTS = LOADED([
    {
      id: 201,
      teacher_assignment: 500,
      subject_name: 'Science',
      section_name: 'Grade 7 — Sampaguita',
    },
    {
      id: 202,
      teacher_assignment: 501,
      subject_name: 'English',
      section_name: 'Grade 7 — Sampaguita',
    },
    {
      id: 203,
      teacher_assignment: 500,
      subject_name: 'Science',
      section_name: 'Grade 7 — Sampaguita',
    },
  ])

  it('keeps only this class’s work and drops the standalone chrome', async () => {
    const user = userEvent.setup()
    mockFetch({ requirements: CLASS_REQUIREMENTS })
    renderPage(
      <SubmissionsPage
        mode="review"
        assignmentId={500}
        requirementIds={[201, 203]}
        embedded
      />,
      '/teacher/classes/500/submissions'
    )

    // The workspace header and its breadcrumb already name the class.
    expect(document.querySelector('.page-header')).toBeNull()
    expect(screen.queryByText(/Showing submissions for/)).toBeNull()
    expect(screen.queryByRole('button', { name: /show all classes/i })).toBeNull()

    await user.selectOptions(screen.getByLabelText('Show'), 'all')
    expect(screen.getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(screen.getByText('Lab Sheet')).toBeInTheDocument()
    // Reading Log belongs to the other subject in the same section.
    expect(screen.queryByText('Reading Log')).toBeNull()
    expect(screen.getByText('1 awaiting verification')).toBeInTheDocument()
  })

  it('uses the requirement ids the workspace already has instead of refetching', () => {
    mockFetch({ requirements: CLASS_REQUIREMENTS })
    renderPage(
      <SubmissionsPage
        mode="review"
        assignmentId={500}
        requirementIds={[201, 203]}
        embedded
      />,
      '/teacher/classes/500/submissions'
    )

    const call = useFetch.mock.calls.find(([path]) => path === '/requirements/')
    expect(call[1]).toMatchObject({ enabled: false })
  })

  it('cannot be pointed at another class by a stray url', async () => {
    const user = userEvent.setup()
    mockFetch({ requirements: CLASS_REQUIREMENTS })
    renderPage(
      <SubmissionsPage mode="review" assignmentId={500} requirementIds={[201]} embedded />,
      '/teacher/classes/500/submissions?class=501'
    )

    await user.selectOptions(screen.getByLabelText('Show'), 'all')
    expect(screen.getByText('Quarter 1 Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Reading Log')).toBeNull()
    expect(screen.queryByText('Lab Sheet')).toBeNull()
  })
})
