import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrarApplicationsPage from './RegistrarApplicationsPage'
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
  authHeader: () => ({}),
}))

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const ROW = {
  id: 9,
  reference: 'ENR-2026-0009',
  full_name: 'Juan Dela Cruz',
  lrn: '123456789012',
  status: 'under_review',
  status_display: 'Under Review',
  enrollment_type: 'new',
  grade_level: 1,
  grade_level_name: 'Grade 7',
  school_year: 1,
  school_year_label: '2026-2027',
  strand: null,
  assigned_section_name: null,
  outstanding_documents: 2,
  submitted_at: '2026-06-01T08:30:00+08:00',
  created_at: '2026-05-30T10:00:00+08:00',
  updated_at: '2026-06-01T08:30:00+08:00',
  decided_at: null,
}

const DASHBOARD = {
  total_applications: 12,
  submitted: 4,
  under_review: 3,
  awaiting_corrections: 2,
  accepted: 1,
}

function mockOptions() {
  useFetch.mockImplementation((path) => {
    if (path === '/enrollment/dashboard/') {
      return { data: DASHBOARD, loading: false, error: null, reload: vi.fn() }
    }
    if (path === '/grade-levels/') {
      return {
        data: [{ id: 1, name: 'Grade 7' }],
        loading: false,
        error: null,
        reload: vi.fn(),
      }
    }
    if (path === '/school-years/') {
      return {
        data: [{ id: 1, label: '2026-2027' }],
        loading: false,
        error: null,
        reload: vi.fn(),
      }
    }
    return { data: [], loading: false, error: null, reload: vi.fn() }
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/applications']}>
      <RegistrarApplicationsPage />
    </MemoryRouter>
  )
}

/** True when any api.get call carried this query param. */
function sawParam(key, value) {
  return api.get.mock.calls.some(
    ([, options]) => options?.params?.[key] === value
  )
}

describe('RegistrarApplicationsPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    useFetch.mockReset()
    mockOptions()
  })

  it('renders the application rows from the API', async () => {
    api.get.mockResolvedValue({ count: 1, results: [ROW] })
    renderPage()

    expect(await screen.findByText('ENR-2026-0009')).toBeInTheDocument()
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Grade 7')).toBeInTheDocument()
    expect(within(table).getByText('Under Review')).toBeInTheDocument()
    expect(within(table).getByText('2 outstanding')).toBeInTheDocument()
    expect(within(table).getByText('New enrollee')).toBeInTheDocument()
  })

  it('sends the chosen status filter to the API', async () => {
    api.get.mockResolvedValue({ count: 1, results: [ROW] })
    const user = userEvent.setup()
    renderPage()

    const statusSelect = await screen.findByLabelText(/^status$/i)
    await user.selectOptions(statusSelect, 'under_review')

    await waitFor(() => expect(sawParam('status', 'under_review')).toBe(true))
    expect(sawParam('status', 'draft')).toBe(false)
  })

  it('sends the submitted-from date filter to the API', async () => {
    api.get.mockResolvedValue({ count: 1, results: [ROW] })
    renderPage()

    const fromInput = await screen.findByLabelText(/submitted from/i)
    fireEvent.change(fromInput, { target: { value: '2026-06-01' } })

    await waitFor(() => expect(sawParam('submitted_from', '2026-06-01')).toBe(true))
  })

  it('filters through the quick status pills', async () => {
    api.get.mockResolvedValue({ count: 1, results: [ROW] })
    const user = userEvent.setup()
    renderPage()

    const pill = await screen.findByRole('button', { name: /under review/i })
    await user.click(pill)

    await waitFor(() => expect(sawParam('status', 'under_review')).toBe(true))
  })

  it('shows a friendly permission state on 403 instead of a crash', async () => {
    api.get.mockRejectedValue(
      Object.assign(new Error("You do not have the 'enrollment.view' permission."), {
        status: 403,
      })
    )
    renderPage()

    expect(await screen.findByText(/you don't have permission/i)).toBeInTheDocument()
    expect(
      screen.getByText(/enrollment\.view permission/i)
    ).toBeInTheDocument()
    expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument()
  })

  it('shows the server error with a retry action on other failures', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('Server exploded'), { status: 500 }))
    renderPage()

    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
