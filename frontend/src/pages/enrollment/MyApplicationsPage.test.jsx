import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyApplicationsPage from './MyApplicationsPage'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../../services/api', () => {
  const api = {
    get: vi.fn(async () => ({})),
    list: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { default: api, ApiError: class ApiError extends Error {} }
})

const DRAFT = {
  id: 7,
  reference: 'APP-0007',
  status: 'draft',
  enrollment_type: 'new',
  grade_level_name: 'Grade 7',
  strand: '',
  school_year: 1,
  school_year_label: '2026-2027',
  missing_documents: ['Birth Certificate'],
  submitted_at: null,
}

const SUBMITTED = {
  ...DRAFT,
  id: 8,
  reference: 'APP-0008',
  status: 'submitted',
  enrollment_type: 'transferee',
  grade_level_name: 'Grade 11',
  strand: 'STEM',
  school_year: 2,
  school_year_label: '2025-2026',
  missing_documents: [],
  submitted_at: '2026-02-03T09:15:00+08:00',
}

function mockFetches({ apps = [DRAFT, SUBMITTED], loading = false, error = null } = {}) {
  useFetch.mockReturnValue({ data: apps, loading, error, reload: vi.fn() })
}

function renderPage() {
  // The page links relatively (`to="applications/7"`), so it needs its own
  // route to resolve against — the same shape App.jsx gives it.
  return render(
    <MemoryRouter initialEntries={['/student/enrollment/applications']}>
      <Routes>
        <Route path="/student/enrollment/applications/*" element={<MyApplicationsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MyApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue([
      { id: 1, label: '2026-2027' },
      { id: 2, label: '2025-2026' },
    ])
  })

  it('lists every application with the actions its status allows', async () => {
    mockFetches()
    renderPage()

    expect(await screen.findByText('APP-0007')).toBeInTheDocument()
    expect(screen.getByText('APP-0008')).toBeInTheDocument()
    expect(screen.getByText('Transferee')).toBeInTheDocument()
    expect(screen.getByText('Grade 11 — STEM')).toBeInTheDocument()
    expect(screen.getByText(/1 missing/)).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Start a new application' })).toHaveAttribute(
      'href',
      '/student/enrollment/applications/new'
    )
    const [draftRow, submittedRow] = screen.getAllByRole('row').slice(1)
    expect(
      within(draftRow).getByRole('link', { name: /continue draft/i })
    ).toHaveAttribute('href', '/student/enrollment/applications/new?application=7')
    expect(
      within(submittedRow).queryByRole('link', { name: /continue draft/i })
    ).not.toBeInTheDocument()
  })

  it('narrows the list with the filter bar and puts every row back on Clear', async () => {
    const user = userEvent.setup()
    mockFetches()
    renderPage()
    await screen.findByText('APP-0007')

    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Status'), 'submitted')
    expect(screen.getByText('APP-0008')).toBeInTheDocument()
    expect(screen.queryByText('APP-0007')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('School year'), '1')
    expect(screen.getByText(/no matching applications/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('APP-0007')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('')
    expect(screen.getByLabelText('School year')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('says so when the school years cannot be loaded', async () => {
    api.list.mockRejectedValue(new Error('offline'))
    mockFetches()
    renderPage()

    const message = await screen.findByText(/school years could not be loaded/i)
    expect(message).toHaveAttribute('id', 'apps-year-err')
    expect(screen.getByLabelText('School year')).toHaveAttribute('aria-describedby', 'apps-year-err')
    expect(screen.getByLabelText('School year')).toHaveAttribute('aria-invalid', 'true')
  })

  it('invites the first application when there are none', async () => {
    mockFetches({ apps: [] })
    renderPage()

    expect(await screen.findByText(/no applications yet/i)).toBeInTheDocument()
    expect(screen.getByText(/start an application from an open enrollment period/i)).toBeInTheDocument()
  })

  it('reports a failed load instead of an empty list', async () => {
    const reload = vi.fn()
    useFetch.mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Cannot reach the server'),
      reload,
    })
    renderPage()

    expect(await screen.findByText(/could not load your applications/i)).toBeInTheDocument()
    expect(screen.queryByText(/no applications yet/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalled()
  })
})
