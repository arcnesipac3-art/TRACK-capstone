import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function mockFetch({ submissions = LOADED(ITEMS) } = {}) {
  useFetch.mockImplementation((path) => {
    const reload = vi.fn()
    if (path === '/submissions/') return { ...submissions, reload }
    return { ...IDLE, reload }
  })
}

const card = () => document.querySelector('.card')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SubmissionsPage — student', () => {
  it('puts the table placeholder in a flush card so nothing rewraps', () => {
    mockFetch({ submissions: { ...IDLE, loading: true } })
    render(<SubmissionsPage />)

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
    render(<SubmissionsPage />)

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
    render(<SubmissionsPage />)

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
    render(<SubmissionsPage />)

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
    render(<SubmissionsPage mode="review" />)

    expect(screen.getByLabelText('Show')).toBeInTheDocument()
    expect(screen.getByText('1 awaiting verification')).toBeInTheDocument()

    const row = screen.getByText('Lab Sheet').closest('.list-card')
    await user.click(within(row).getByRole('button', { name: /verify/i }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/submissions/303/', { status: 'verified' })
    )
  })
})
