import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationDetailPage from './ApplicationDetailPage'
import EnrollmentPortal from './EnrollmentPortal'
import AuthContext from '../../context/AuthContext'
import api, { clearGuestToken } from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../../services/api', () => ({
  default: { post: vi.fn(), delete: vi.fn(), claimAccount: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
  clearGuestToken: vi.fn(),
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

/** Anonymous visitor — the page reads auth state for the claim panel. */
const anonymousAuth = {
  user: null,
  status: 'anonymous',
  isAuthenticated: false,
  isLoading: false,
  bootstrapError: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}

function renderDetail(app, entry = '/student/enrollment/applications/9') {
  const reload = vi.fn()
  useFetch.mockReturnValue({ data: app, loading: false, error: null, reload })
  render(
    <AuthContext.Provider value={anonymousAuth}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/student/enrollment" element={<EnrollmentPortal />}>
            <Route index element={<div>Student enrollment portal</div>} />
            <Route path="applications" element={<div>My applications</div>} />
            <Route path="applications/:id" element={<ApplicationDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
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

  it('deletes a cancelled application after confirmation and returns to the list', async () => {
    api.delete.mockResolvedValue(null)
    const user = userEvent.setup()
    renderDetail(makeDetail({ status: 'cancelled', available_actions: [] }))

    await user.click(screen.getByRole('button', { name: /delete application/i }))
    const dialog = await screen.findByRole('dialog', {
      name: /delete this application/i,
    })
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /delete application/i }))

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/enrollment/applications/my/9/')
    )
    expect(await screen.findByText('My applications')).toBeInTheDocument()
  })

  it('offers the delete action on a draft next to submit', () => {
    renderDetail(
      makeDetail({ status: 'draft', available_actions: ['submitted'] })
    )

    expect(
      screen.getByRole('button', { name: /submit application/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^delete application$/i })
    ).toBeInTheDocument()
  })

  it('hides the delete action while the application is still in play', () => {
    renderDetail(makeDetail({ status: 'under_review' }))
    expect(
      screen.queryByRole('button', { name: /delete application/i })
    ).not.toBeInTheDocument()
  })

  it('hides the delete action on an enrolled application', () => {
    renderDetail(makeDetail({ status: 'enrolled' }))
    expect(
      screen.queryByRole('button', { name: /delete application/i })
    ).not.toBeInTheDocument()
  })

  it('clears the guest token when a public applicant deletes their application', async () => {
    api.delete.mockResolvedValue(null)
    const user = userEvent.setup()
    useFetch.mockReturnValue({
      data: makeDetail({ status: 'cancelled', available_actions: [] }),
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(
      <AuthContext.Provider value={anonymousAuth}>
        <MemoryRouter initialEntries={['/enroll/applications/9']}>
          <Routes>
            <Route
              path="/enroll"
              element={
                <div>
                  Public enrollment home
                  <Outlet />
                </div>
              }
            >
              <Route path="applications/:id" element={<ApplicationDetailPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )

    await user.click(
      await screen.findByRole('button', { name: /delete application/i })
    )
    const dialog = await screen.findByRole('dialog', {
      name: /delete this application/i,
    })
    await user.click(
      within(dialog).getByRole('button', { name: /delete application/i })
    )

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/enrollment/applications/my/9/')
    )
    // The token belonged to the deleted row — dropped, and the visitor is
    // back on the public landing instead of a dead detail page.
    expect(clearGuestToken).toHaveBeenCalled()
    expect(await screen.findByText('Public enrollment home')).toBeInTheDocument()
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
      <AuthContext.Provider value={anonymousAuth}>
        <MemoryRouter initialEntries={['/student/enrollment/applications/9']}>
          <Routes>
            <Route path="/student/enrollment" element={<EnrollmentPortal />}>
              <Route path="applications/:id" element={<ApplicationDetailPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
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

describe('ApplicationDetailPage — account claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('blocks submission of mismatched passwords client-side', async () => {
    const user = userEvent.setup()
    renderDetail(
      makeDetail({
        status: 'enrolled',
        account_claim_available: true,
        claim_token: 'claim-abc',
      })
    )

    expect(
      await screen.findByRole('heading', { name: /create your account/i })
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^username$/i), 'liza123')
    await user.type(screen.getByLabelText(/^password$/i), 'secret-pass')
    await user.type(screen.getByLabelText(/confirm password/i), 'different')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/the two passwords do not match/i)
    ).toBeInTheDocument()
    expect(api.claimAccount).not.toHaveBeenCalled()
  })

  it('claims the account and enters the student enrollment portal', async () => {
    api.claimAccount.mockResolvedValue({ id: 77, username: 'liza123' })
    const user = userEvent.setup()
    renderDetail(
      makeDetail({
        status: 'enrolled',
        account_claim_available: true,
        claim_token: 'claim-abc',
      })
    )

    await user.type(await screen.findByLabelText(/^username$/i), 'liza123')
    await user.type(screen.getByLabelText(/^password$/i), 'secret-pass')
    await user.type(screen.getByLabelText(/confirm password/i), 'secret-pass')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(api.claimAccount).toHaveBeenCalledWith({
        claim_token: 'claim-abc',
        username: 'liza123',
        password: 'secret-pass',
      })
    )
    expect(await screen.findByText('Student enrollment portal')).toBeInTheDocument()
  })

  it('surfaces a server rejection from the claim endpoint', async () => {
    api.claimAccount.mockRejectedValue(
      Object.assign(new Error('This claim token has already been used.'), {
        status: 400,
        details: null,
      })
    )
    const user = userEvent.setup()
    renderDetail(
      makeDetail({
        status: 'enrolled',
        account_claim_available: true,
        claim_token: 'spent-token',
      })
    )

    await user.type(await screen.findByLabelText(/^username$/i), 'liza123')
    await user.type(screen.getByLabelText(/^password$/i), 'secret-pass')
    await user.type(screen.getByLabelText(/confirm password/i), 'secret-pass')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/this claim token has already been used/i)
    ).toBeInTheDocument()
  })

  it('points at sign-in when an account already exists for the enrolled student', () => {
    renderDetail(
      makeDetail({ status: 'enrolled', account_claim_available: false })
    )

    expect(screen.getByRole('heading', { level: 1, name: /app-0009/i })).toBeInTheDocument()
    expect(
      screen.getByText(/an account already exists for this student/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login'
    )
    expect(
      screen.queryByRole('heading', { name: /create your account/i })
    ).not.toBeInTheDocument()
  })
})
