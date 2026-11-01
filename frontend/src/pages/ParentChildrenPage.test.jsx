import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ParentChildrenPage from './ParentChildrenPage'
import useFetch from '../hooks/useFetch'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))

const CHILDREN = [
  {
    student_id: 11,
    name: 'Sofia Cruz',
    section: 'Grade 7 — Sampaguita (2026-2027)',
    total_requirements: 6,
    verified: 1,
    overdue: 4,
    attendance: { present_rate: 80, total_records: 10 },
  },
  {
    student_id: 12,
    name: 'Miguel Torres',
    section: null,
    total_requirements: 3,
    verified: 3,
    overdue: 0,
    attendance: { present_rate: null, total_records: 0 },
  },
]

const PROFILES = [
  { id: 11, lrn: '123456789001' },
  { id: 12, lrn: '123456789002' },
]

const IDLE = { data: null, loading: false, error: null }
const LOADED = (data) => ({ data, loading: false, error: null })

function mockFetch({
  dashboard = LOADED({ children: CHILDREN }),
  profiles = LOADED(PROFILES),
} = {}) {
  useFetch.mockImplementation((path) => {
    if (path === '/students/') return { ...profiles, reload: vi.fn() }
    return { ...dashboard, reload: vi.fn() }
  })
}

const tile = (name) => screen.getByRole('heading', { level: 2, name }).closest('section')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ParentChildrenPage', () => {
  it('shows one profile card per linked child', () => {
    mockFetch()
    render(<ParentChildrenPage />)

    const sofia = tile('Sofia Cruz')
    expect(sofia.className).toContain('card')
    expect(within(sofia).getByText('Grade 7 — Sampaguita (2026-2027)')).toBeInTheDocument()
    expect(within(sofia).getByText('4 overdue')).toBeInTheDocument()
    expect(within(sofia).getByText('123456789001')).toBeInTheDocument()
    expect(within(sofia).getByText('80% present (10 records)')).toBeInTheDocument()
    expect(sofia.querySelector('.stack').className).toBe('stack stack-sm')
    expect(sofia.querySelectorAll('.profile-field')).toHaveLength(4)

    // A child with no section and no sessions is described, not zeroed out.
    const miguel = tile('Miguel Torres')
    expect(within(miguel).getByText('No section assigned')).toBeInTheDocument()
    expect(within(miguel).getByText('On track')).toBeInTheDocument()
    expect(within(miguel).getByText('No records yet')).toBeInTheDocument()

    expect(screen.getByText(/enforced by the server/)).toBeInTheDocument()
  })

  it('keeps the LRN honest when the profile request has nothing to match', () => {
    mockFetch({ profiles: LOADED([]) })
    render(<ParentChildrenPage />)

    expect(within(tile('Sofia Cruz')).getByText('—')).toBeInTheDocument()
  })

  it('explains an account with no child linked to it', () => {
    mockFetch({ dashboard: LOADED({ children: [] }) })
    render(<ParentChildrenPage />)

    expect(screen.getByText('No linked children')).toBeInTheDocument()
    expect(document.querySelectorAll('.profile-field')).toHaveLength(0)
  })

  it('boxes the loading placeholder in a card', () => {
    mockFetch({ dashboard: { ...IDLE, loading: true } })
    render(<ParentChildrenPage />)

    const card = document.querySelector('.card')
    expect(card).not.toBeNull()
    expect(card.querySelector('.skeleton')).not.toBeNull()
  })

  it('reports a failed request and retries it', async () => {
    const user = userEvent.setup()
    mockFetch({ dashboard: { ...IDLE, error: new Error('Directory unavailable') } })
    render(<ParentChildrenPage />)

    expect(screen.getByText('Could not load your children')).toBeInTheDocument()
    expect(screen.getByText('Directory unavailable')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(useFetch).toHaveBeenCalled()
  })
})
