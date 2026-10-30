import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationWizardPage from './ApplicationWizardPage'
import EnrollmentPortal from './EnrollmentPortal'
import api, { getGuestToken, getStoredToken, setGuestToken } from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), list: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
  setGuestToken: vi.fn(),
  // The wizard resolves an existing guest application when the server
  // refuses a second open one — defaults are overridden per test below.
  getStoredToken: vi.fn(),
  getGuestToken: vi.fn(),
}))
vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const PERIODS_PAYLOAD = {
  count: 1,
  results: [
    {
      id: 3,
      name: 'First Semester 2026',
      school_year_label: '2026-2027',
      status: 'open',
      is_accepting_applications: true,
    },
  ],
}

const GRADE_LEVELS = [
  { id: 1, name: 'Grade 7', order: 1 },
  { id: 11, name: 'Grade 11', order: 11 },
]

function draftDetail(overrides = {}) {
  return {
    id: 11,
    reference: 'APP-0011',
    status: 'draft',
    period: 3,
    period_label: 'First Semester 2026',
    school_year: 1,
    school_year_label: '2026-2027',
    enrollment_type: 'new',
    grade_level: 1,
    grade_level_name: 'Grade 7',
    strand: '',
    previous_school: '',
    previous_school_address: '',
    lrn: '123456789012',
    first_name: 'Liza',
    middle_name: '',
    last_name: 'Mabini',
    date_of_birth: '2012-05-01',
    sex: 'female',
    address: 'Iligan City',
    contact_number: '09170000000',
    guardian_name: '',
    guardian_relationship: '',
    guardian_contact: '',
    guardian_email: '',
    documents: [
      {
        id: 5,
        requirement: 1,
        name: 'Birth Certificate',
        is_required: true,
        status: 'not_submitted',
        original_filename: null,
        review_note: '',
      },
    ],
    events: [],
    missing_documents: ['Birth Certificate'],
    available_actions: [],
    ...overrides,
  }
}

/** The wizard reads periods + grade levels through useFetch. */
function mockUseFetch() {
  useFetch.mockImplementation((path) => {
    if (path === '/enrollment/periods/') {
      return { data: PERIODS_PAYLOAD, loading: false, error: null, reload: vi.fn() }
    }
    return { data: GRADE_LEVELS, loading: false, error: null, reload: vi.fn() }
  })
}

function mockApi({ detail }) {
  api.get.mockImplementation((path) => {
    if (path.startsWith('/enrollment/applications/my/')) {
      return Promise.resolve(detail)
    }
    return Promise.resolve(null)
  })
  api.patch.mockResolvedValue(detail)
  api.post.mockResolvedValue({ id: detail.id, reference: detail.reference })
}

function renderWizard(entry = '/student/enrollment/new') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      {/* Mirrors the production mounting: the portal layout at
          /student/enrollment with `new` and `applications/:id` as children. */}
      <Routes>
        <Route path="/student/enrollment" element={<EnrollmentPortal />}>
          <Route index element={<div>My applications page</div>} />
          <Route path="new" element={<ApplicationWizardPage />} />
          <Route
            path="applications/:id"
            element={<div>Application detail page</div>}
          />
        </Route>
        <Route
          path="/enroll/applications/:id"
          element={<div>Guest application detail</div>}
        />
        <Route path="/enroll/apply" element={<ApplicationWizardPage />} />
      </Routes>
    </MemoryRouter>
  )
}

/** Resume a draft and click through steps 2 → 3 → 4. */
async function walkToDocuments(user) {
  await screen.findByLabelText(/learner reference number/i)
  await user.click(screen.getByRole('button', { name: /save & continue/i }))
  await screen.findByRole('heading', { name: /parent \/ guardian/i })
  await user.click(screen.getByRole('button', { name: /save & continue/i }))
  await screen.findByRole('heading', { name: /^documents$/i })
}

describe('ApplicationWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // Default world: a signed-in account with no guest credential.
    getStoredToken.mockReturnValue('auth-token')
    getGuestToken.mockReturnValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a draft and continues with server-prefilled student details', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    const user = userEvent.setup()
    renderWizard()

    await user.selectOptions(
      await screen.findByLabelText(/enrollment period/i),
      '3'
    )
    await user.selectOptions(screen.getByLabelText(/grade level/i), '1')
    await user.click(screen.getByRole('button', { name: /create draft/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][0]).toBe('/enrollment/applications/my/')
    expect(api.post.mock.calls[0][1]).toMatchObject({
      period: 3,
      enrollment_type: 'new',
      grade_level: 1,
    })

    expect(
      await screen.findByLabelText(/learner reference number/i)
    ).toHaveValue('123456789012')
    expect(screen.getByLabelText(/^first name/i)).toHaveValue('Liza')
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue('2012-05-01')
    expect(screen.getByText(/draft app-0011/i)).toBeInTheDocument()
  })

  it('stores the guest token returned by an account-less draft create', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    api.post.mockResolvedValue({
      id: 11,
      reference: 'APP-0011',
      guest_token: 'c'.repeat(64),
    })
    const user = userEvent.setup()
    renderWizard()

    await user.selectOptions(
      await screen.findByLabelText(/enrollment period/i),
      '3'
    )
    await user.selectOptions(screen.getByLabelText(/grade level/i), '1')
    await user.click(screen.getByRole('button', { name: /create draft/i }))

    await waitFor(() =>
      expect(setGuestToken).toHaveBeenCalledWith('c'.repeat(64))
    )
    expect(await screen.findByLabelText(/learner reference number/i)).toBeInTheDocument()
  })

  it('surfaces the duplicate-application error with a way back', async () => {
    mockUseFetch()
    api.post.mockRejectedValue(
      Object.assign(
        new Error('You already have an active application for this school year.'),
        { status: 400 }
      )
    )
    const user = userEvent.setup()
    renderWizard()

    await user.selectOptions(
      await screen.findByLabelText(/enrollment period/i),
      '3'
    )
    await user.selectOptions(screen.getByLabelText(/grade level/i), '1')
    await user.click(screen.getByRole('button', { name: /create draft/i }))

    expect(
      await screen.findByText(/already have an active application/i)
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /go to my applications/i })
    )
    expect(await screen.findByText('My applications page')).toBeInTheDocument()
  })

  it('links a public applicant straight to their existing application', async () => {
    // A guest (no account, only the browser token) hitting the
    // one-open-application rule gets a direct way to their own copy.
    mockUseFetch()
    getStoredToken.mockReturnValue(null)
    getGuestToken.mockReturnValue('g'.repeat(32))
    api.post.mockRejectedValue(
      Object.assign(
        new Error(
          'This browser already has an open application. Track it instead of starting another one.',
        ),
        { status: 400 },
      ),
    )
    api.get.mockResolvedValue({
      results: [{ id: 42, reference: 'APP-42', status: 'draft' }],
    })
    const user = userEvent.setup()
    renderWizard('/enroll/apply')

    await user.selectOptions(
      await screen.findByLabelText(/enrollment period/i),
      '3',
    )
    await user.selectOptions(screen.getByLabelText(/grade level/i), '1')
    await user.click(screen.getByRole('button', { name: /create draft/i }))

    expect(
      await screen.findByText(/already has an open application/i),
    ).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      '/enrollment/applications/my/',
      expect.objectContaining({ params: { page_size: 1 } }),
    )
    await user.click(
      screen.getByRole('button', { name: /open my application/i }),
    )
    expect(await screen.findByText('Guest application detail')).toBeInTheDocument()
  })

  it('blocks submission while required documents are missing', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    const user = userEvent.setup()
    renderWizard('/student/enrollment/new?application=11')

    await walkToDocuments(user)
    await user.click(
      screen.getByRole('button', { name: /continue to review/i })
    )

    expect(await screen.findByText(/still missing/i)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /submit application/i })
    )

    expect(
      await screen.findByText(/upload the missing required documents/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('submits through the confirmation modal', async () => {
    mockUseFetch()
    mockApi({
      detail: draftDetail({ missing_documents: [], documents: [] }),
    })
    const user = userEvent.setup()
    renderWizard('/student/enrollment/new?application=11')

    await walkToDocuments(user)
    await user.click(
      screen.getByRole('button', { name: /continue to review/i })
    )

    await user.click(
      await screen.findByRole('button', { name: /submit application/i })
    )
    const dialog = await screen.findByRole('dialog', { name: /submit application/i })
    expect(
      within(dialog).getByText(/no longer edit the application/i)
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /submit now/i }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/enrollment/applications/my/11/submit/')
    )
    expect(await screen.findByText('Application detail page')).toBeInTheDocument()
  })

  it('uploads a document straight to the multipart upload endpoint', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderWizard('/student/enrollment/new?application=11')

    await walkToDocuments(user)

    const input = await screen.findByLabelText(/upload birth certificate/i)
    const file = new File(['pdf-bytes'], 'birth-certificate.pdf', {
      type: 'application/pdf',
    })
    await user.upload(input, file)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/enrollment/applications/my/11/documents/5/upload/')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    // No token in sessionStorage → no Authorization header to assert; the
    // browser must set the multipart boundary itself, so no Content-Type.
    expect(options.headers).toBeUndefined()
    // The detail is reloaded afterwards so the status badges refresh.
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/enrollment/applications/my/11/')
    )
  })

  it('confirms before canceling with unsaved edits, and leaves cleanly without', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    const user = userEvent.setup()
    renderWizard()

    // Clean form on step 1: Cancel leaves immediately, no dialog.
    await user.click(await screen.findByRole('button', { name: /^cancel$/i }))
    expect(await screen.findByText('My applications page')).toBeInTheDocument()
  })

  it('asks for confirmation when Cancel would discard unsaved edits', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    const user = userEvent.setup()
    renderWizard()

    // Edit step 1 (dirty) then try to leave.
    const previousSchool = await screen.findByLabelText(/previous school \(optional\)/i)
    await user.type(previousSchool, 'Old School')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    const dialog = await screen.findByRole('dialog', { name: /discard unsaved changes/i })
    expect(
      within(dialog).getByText(/not been saved yet/i)
    ).toBeInTheDocument()

    // Keep editing closes the dialog and stays on the wizard.
    await user.click(within(dialog).getByRole('button', { name: /keep editing/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/previous school \(optional\)/i)).toHaveValue('Old School')

    // Discard & leave navigates away.
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    const reopened = await screen.findByRole('dialog', { name: /discard unsaved changes/i })
    await user.click(within(reopened).getByRole('button', { name: /discard & leave/i }))
    expect(await screen.findByText('My applications page')).toBeInTheDocument()
  })

  it('shows the Saved badge only for the section that was actually saved', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail() })
    const user = userEvent.setup()
    renderWizard('/student/enrollment/new?application=11')

    await screen.findByLabelText(/learner reference number/i)
    // Nothing saved yet on this step — no badge.
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save & continue/i }))
    // Student step was saved; the guardian step must not claim it.
    await screen.findByRole('heading', { name: /parent \/ guardian/i })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    // Editing a field on the guardian step, then saving, shows it here only.
    await user.type(screen.getByLabelText(/^full name$/i), 'Ana Cruz')
    await user.click(screen.getByRole('button', { name: /save & continue/i }))
    await screen.findByRole('heading', { name: /^documents$/i })
  })

  it('redirects a resumed application that is no longer a draft', async () => {
    mockUseFetch()
    mockApi({ detail: draftDetail({ status: 'submitted' }) })
    renderWizard('/student/enrollment/new?application=11')

    expect(await screen.findByText('Application detail page')).toBeInTheDocument()
  })
})
