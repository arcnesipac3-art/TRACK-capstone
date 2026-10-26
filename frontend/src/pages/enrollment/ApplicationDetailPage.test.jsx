import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationDetailPage from './ApplicationDetailPage'
import EnrollmentPortal from './EnrollmentPortal'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../../services/api', () => ({
  default: { post: vi.fn() },
  API_BASE: '/api',
}))

function makeDetail(overrides = {}) {
  return {
    id: 9,
    reference: 'APP-0009',
    status: 'under_review',
    school_year_label: '2026-2027',
    grade_level_name: 'Grade 7',
    period_label: 'First Semester 2026',
    enrollment_type: 'new',
    lrn: '123456789012',
    first_name: 'Liza',
    middle_name: '',
    last_name: 'Mabini',
    date_of_birth: '2012-05-01',
    sex: 'female',
    address: 'Iligan City',
    contact_number: '09170000000',
    guardian_name: 'Rosa Cruz',
    guardian_relationship: 'Mother',
    guardian_contact: '09180000000',
    guardian_email: '',
    documents: [
      {
        id: 21,
        name: 'Birth Certificate',
        is_required: true,
        status: 'verified',
        original_filename: 'birth-cert.pdf',
        review_note: '',
      },
    ],
    events: [
      {
        id: 1,
        action: 'submitted',
        actor_name: 'Liza Mabini',
        from_status: 'draft',
        to_status: 'submitted',
        note: 'Application submitted for review.',
        created_at: '2026-10-01T08:00:00+08:00',
      },
      {
        id: 2,
        action: 'under_review',
        actor_name: 'Reg Staff',
        from_status: 'submitted',
        to_status: 'under_review',
        note: 'Checking requirements.',
        created_at: '2026-10-02T09:00:00+08:00',
      },
    ],
    missing_documents: [],
    available_actions: [],
    requirements_snapshot: { internal_note: 'SECRET-SNAPSHOT' },
    student_profile_id: 77,
    ...overrides,
  }
}

function renderDetail(app, entry = '/student/enrollment/applications/9') {
  const reload = vi.fn()
  useFetch.mockReturnValue({ data: app, loading: false, error: null, reload })
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/student/enrollment" element={<EnrollmentPortal />}>
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
  return { reload }
}

describe('ApplicationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders the progress timeline and hides internal server data', () => {
    renderDetail(makeDetail())

    expect(
      screen.getByRole('heading', { level: 1, name: /app-0009/i })
    ).toBeInTheDocument()
    expect(screen.getByText('Application submitted for review.')).toBeInTheDocument()
    expect(screen.getByText('Checking requirements.')).toBeInTheDocument()
    expect(screen.getByText(/Reg Staff/)).toBeInTheDocument()
    // Humanized action labels + from → to status badges.
    expect(screen.getAllByText('submitted').length).toBeGreaterThan(0)
    expect(screen.getAllByText('under review').length).toBeGreaterThan(0)

    // Staff-only payload never reaches the DOM.
    expect(screen.queryByText(/SECRET-SNAPSHOT/)).not.toBeInTheDocument()
    expect(screen.queryByText(/requirements_snapshot/i)).not.toBeInTheDocument()
    expect(screen.queryByText('77')).not.toBeInTheDocument()
  })

  it('withdraws through a confirmation dialog without double submission', async () => {
    // Never-resolving promise keeps the button in its busy state so the
    // double-click guard can be observed.
    api.post.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderDetail(makeDetail({ available_actions: ['withdrawn'] }))

    await user.click(screen.getByRole('button', { name: /withdraw application/i }))
    const dialog = await screen.findByRole('dialog', {
      name: /withdraw application/i,
    })
    expect(
      within(dialog).getByText(/cannot be undone/i)
    ).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: /^withdraw$/i })
    await user.click(confirm)

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith(
      '/enrollment/applications/my/9/withdraw/'
    )
    expect(confirm).toBeDisabled()

    await user.click(confirm)
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('greets a fresh submission with a success notice', () => {
    renderDetail(
      makeDetail({ status: 'submitted', submitted_at: '2026-10-01T08:00:00+08:00' }),
      '/student/enrollment/applications/9?submitted=1'
    )

    expect(screen.getByText(/APP-0009 was submitted/i)).toBeInTheDocument()
  })

  it('offers the submit action and document uploads on a draft', () => {
    renderDetail(
      makeDetail({
        status: 'draft',
        available_actions: ['submitted'],
        documents: [
          {
            id: 21,
            name: 'Birth Certificate',
            is_required: true,
            status: 'not_submitted',
            original_filename: null,
            review_note: '',
          },
        ],
      })
    )

    expect(
      screen.getByRole('button', { name: /submit application/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/upload birth certificate/i)).toBeInTheDocument()
  })

  it('shows the error state when the application cannot be loaded', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    useFetch.mockReturnValue({
      data: null,
      loading: false,
      error: { message: 'Not found.' },
      reload,
    })
    render(
      <MemoryRouter initialEntries={['/student/enrollment/applications/9']}>
        <Routes>
          <Route path="/student/enrollment" element={<EnrollmentPortal />}>
            <Route path="applications/:id" element={<ApplicationDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    expect(
      await screen.findByText(/could not load this application/i)
    ).toBeInTheDocument()
    expect(screen.getByText('Not found.')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /back to enrollment/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalled()
  })
})
