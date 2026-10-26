import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EnrollmentPeriodsPage from './EnrollmentPeriodsPage'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  API_BASE: '/api',
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { user: { id: 1, role: 'admin' }, can: () => true },
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const OPEN_PERIOD = {
  id: 1,
  school_year: 1,
  school_year_label: '2026-2027',
  name: 'SY 2026-2027 Registration',
  status: 'open',
  opens_at: '2026-06-01T08:00:00+08:00',
  closes_at: '2026-07-15T17:00:00+08:00',
  grade_level_ids: [1, 2],
  allowed_enrollment_types: ['new', 'returning'],
  allow_waitlist: true,
  is_accepting_applications: true,
  application_count: 12,
  requirement_count: 4,
}

const EMPTY_PERIOD = {
  id: 2,
  school_year: 1,
  school_year_label: '2027-2028',
  name: 'Second window',
  status: 'upcoming',
  opens_at: '2027-06-01T08:00:00+08:00',
  closes_at: '2027-07-15T17:00:00+08:00',
  grade_level_ids: [],
  allowed_enrollment_types: null,
  allow_waitlist: false,
  is_accepting_applications: false,
  application_count: 0,
  requirement_count: 0,
}

function mockPeriods(periods) {
  useFetch.mockImplementation((path) => {
    if (path === '/enrollment/periods/') {
      return { data: periods, loading: false, error: null, reload: vi.fn() }
    }
    return { data: [], loading: false, error: null, reload: vi.fn() }
  })
}

function renderPage() {
  return render(<EnrollmentPeriodsPage />)
}

describe('EnrollmentPeriodsPage', () => {
  beforeEach(() => {
    api.patch.mockReset()
    api.delete.mockReset()
    useFetch.mockReset()
    mockAuth.can = () => true
    mockPeriods([OPEN_PERIOD, EMPTY_PERIOD])
  })

  it('lists the configured periods with their settings', async () => {
    renderPage()

    expect(
      await screen.findByText('SY 2026-2027 Registration')
    ).toBeInTheDocument()
    expect(screen.getByText('Second window')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('New enrollee, Returning student')).toBeInTheDocument()
    expect(screen.getByText('All grade levels')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('closes an open period after confirmation', async () => {
    api.patch.mockResolvedValue({ ...OPEN_PERIOD, status: 'closed' })
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Close SY 2026-2027 Registration' })
    )

    const dialog = await screen.findByRole('dialog', { name: /close this period/i })
    expect(
      within(dialog).getByText(/closing stops new submissions/i)
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Close period' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/enrollment/periods/1/', {
      status: 'closed',
    })
  })

  it('hides the delete button while the period has applications', async () => {
    renderPage()

    expect(await screen.findByText('Second window')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete SY 2026-2027 Registration' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete Second window' })
    ).toBeInTheDocument()
  })

  it('deletes an application-free period after confirmation', async () => {
    api.delete.mockResolvedValue(null)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete Second window' }))

    const dialog = await screen.findByRole('dialog', { name: /delete this period/i })
    await user.click(within(dialog).getByRole('button', { name: 'Delete period' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    expect(api.delete).toHaveBeenCalledWith('/enrollment/periods/2/')
  })

  it('shows the server message when a delete is refused', async () => {
    api.delete.mockRejectedValue(
      Object.assign(
        new Error('This period already has applications and cannot be deleted.'),
        { status: 400 }
      )
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete Second window' }))
    const dialog = await screen.findByRole('dialog', { name: /delete this period/i })
    await user.click(within(dialog).getByRole('button', { name: 'Delete period' }))

    expect(
      await screen.findByText(/already has applications and cannot be deleted/i)
    ).toBeInTheDocument()
  })

  it('opens the period form for a new record', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new period/i }))

    const dialog = await screen.findByRole('dialog', {
      name: /new enrollment period/i,
    })
    expect(
      within(dialog).getByLabelText(/school year/i)
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: /create period/i })
    ).toBeInTheDocument()
  })
})
