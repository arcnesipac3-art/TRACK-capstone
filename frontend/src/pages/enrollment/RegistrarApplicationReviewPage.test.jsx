import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrarApplicationReviewPage from './RegistrarApplicationReviewPage'
import api from '../../services/api'

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

// The review page reads permissions through the auth context — swapped per
// case (a full Registrar vs. a read-only reviewer without confirm rights).
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { user: { id: 1, role: 'admin' }, can: () => true },
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const DOCUMENT = {
  id: 3,
  requirement: 1,
  name: 'PSA Birth Certificate',
  is_required: true,
  requires_verification: true,
  status: 'submitted',
  status_display: 'Awaiting Review',
  file: '/media/docs/birth.pdf',
  original_filename: 'birth.pdf',
  submitted_at: '2026-06-01T08:30:00+08:00',
  verified_at: null,
  review_note: null,
  download_url: '/api/enrollment/applications/9/documents/3/download/',
  position: 1,
  verified_by_name: null,
}

const BASE_DETAIL = {
  id: 9,
  reference: 'ENR-2026-0009',
  full_name: 'Juan Dela Cruz',
  applicant_username: 'juan.dela cruz',
  status: 'under_review',
  status_display: 'Under Review',
  enrollment_type: 'new',
  grade_level_name: 'Grade 7',
  school_year_label: '2026-2027',
  available_actions: ['incomplete', 'accepted', 'waitlisted', 'rejected', 'cancelled'],
  verification_blockers: [],
  missing_documents: [],
  student: null,
  student_matches: [],
  documents: [DOCUMENT],
  events: [
    {
      id: 1,
      action: 'submitted',
      actor_name: 'Juan Dela Cruz',
      from_status: 'draft',
      to_status: 'submitted',
      note: 'All files attached.',
      internal_note: 'Checked against last year’s record.',
      created_at: '2026-06-01T08:30:00+08:00',
    },
  ],
  assigned_section: null,
  assigned_section_name: null,
  section_assigned_at: null,
  section_approved_by_name: null,
  decision_reason: null,
  submitted_at: '2026-06-01T08:30:00+08:00',
  reviewed_at: null,
  decided_at: null,
  enrollments: [],
}

const RECOMMENDATIONS = {
  application: 9,
  grade_level: 'Grade 7',
  school_year: '2026-2027',
  recommendations: [
    {
      section_id: 10,
      name: 'Sampaguita',
      grade_level: 'Grade 7',
      adviser: 'Ada Admin',
      capacity: 10,
      assigned: 8,
      available: 2,
      currently_assigned: false,
    },
    {
      section_id: 11,
      name: 'Gumamela',
      grade_level: 'Grade 7',
      adviser: null,
      capacity: 30,
      assigned: 30,
      available: 0,
      currently_assigned: false,
    },
  ],
}

function mockApi({ detail = BASE_DETAIL, recommendations = RECOMMENDATIONS } = {}) {
  api.get.mockImplementation((path) => {
    if (path.includes('section-recommendations')) {
      return Promise.resolve(recommendations)
    }
    return Promise.resolve(detail)
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/applications/9']}>
      <Routes>
        <Route path="/applications/:id" element={<RegistrarApplicationReviewPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RegistrarApplicationReviewPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    mockAuth.can = () => true
  })

  it('renders the application detail, documents and history', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('ENR-2026-0009')).toBeInTheDocument()
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('PSA Birth Certificate')).toBeInTheDocument()
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument()
    expect(screen.getByText('Sampaguita')).toBeInTheDocument()
    expect(screen.getByText(/internal/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /accept application/i })
    ).toBeInTheDocument()
  })

  it('accepts the application through its confirmation modal exactly once', async () => {
    mockApi()
    api.post.mockResolvedValue({ ...BASE_DETAIL, status: 'accepted' })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /accept application/i }))

    const dialog = await screen.findByRole('dialog', {
      name: /accept this application/i,
    })
    expect(
      within(dialog).getByText(/required documents must already be verified/i)
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/enrollment/applications/9/action/', {
      action: 'accept',
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('verifies a document with a single POST', async () => {
    mockApi()
    api.post.mockResolvedValue(DOCUMENT)
    const user = userEvent.setup()
    renderPage()

    const docCard = (await screen.findByText('PSA Birth Certificate')).closest(
      '.doc-item'
    )
    await user.click(within(docCard).getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith(
      '/enrollment/applications/9/documents/3/action/',
      { action: 'verify' }
    )
  })

  it('confirms enrollment only when accepted, assigned and permitted', async () => {
    mockApi({
      detail: {
        ...BASE_DETAIL,
        status: 'accepted',
        status_display: 'Accepted',
        assigned_section: 10,
        assigned_section_name: 'Sampaguita',
        available_actions: ['enrolled', 'cancelled'],
      },
    })
    api.post.mockResolvedValue({
      enrollment: {
        student_name: 'Juan Dela Cruz',
        section_display: 'Sampaguita',
        school_year_label: '2026-2027',
      },
      created: true,
    })
    const user = userEvent.setup()
    renderPage()

    const button = await screen.findByRole('button', { name: /confirm enrollment/i })
    expect(button).toBeEnabled()

    await user.click(button)
    const dialog = await screen.findByRole('dialog', {
      name: /confirm enrollment/i,
    })
    expect(
      within(dialog).getByText(/creates the permanent enrollment record/i)
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Confirm enrollment' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/enrollment/applications/9/confirm/', {})
    expect(
      await screen.findByText(/enrollment confirmed for juan dela cruz in sampaguita/i)
    ).toBeInTheDocument()
  })

  it('hides the confirmation button while the application is still under review', async () => {
    mockApi()
    renderPage()

    expect(
      await screen.findByRole('button', { name: /request corrections/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /confirm enrollment/i })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Not assigned yet')).toBeInTheDocument()
  })

  it('hides the confirmation button without the enrollment.confirm permission', async () => {
    mockApi({
      detail: {
        ...BASE_DETAIL,
        status: 'accepted',
        status_display: 'Accepted',
        assigned_section: 10,
        assigned_section_name: 'Sampaguita',
      },
    })
    mockAuth.can = (key) => key === 'enrollment.manage'
    renderPage()

    expect(await screen.findByText('ENR-2026-0009')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /confirm enrollment/i })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/enrollment\.confirm permission/i)
    ).toBeInTheDocument()
  })

  it('surfaces a 409 conflict as an error alert', async () => {
    mockApi({
      detail: {
        ...BASE_DETAIL,
        status: 'accepted',
        status_display: 'Accepted',
        assigned_section: 10,
        assigned_section_name: 'Sampaguita',
      },
    })
    api.post.mockRejectedValue(
      Object.assign(new Error('This student is already enrolled in this school year.'), {
        status: 409,
      })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /confirm enrollment/i }))
    const dialog = await screen.findByRole('dialog', { name: /confirm enrollment/i })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm enrollment' }))

    const alerts = await screen.findAllByRole('alert')
    expect(
      alerts.some((el) => /already enrolled/i.test(el.textContent))
    ).toBe(true)
  })

  it('keeps the typed note and shows the error when the action fails', async () => {
    mockApi()
    api.post.mockRejectedValue(
      Object.assign(new Error('The application moved to another status.'), {
        status: 409,
      })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /request corrections/i })
    )
    const dialog = await screen.findByRole('dialog', {
      name: /request corrections/i,
    })

    const note = within(dialog).getByLabelText(/required corrections/i)
    await user.type(note, 'Upload a clearer scan of the PSA certificate.')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    // The modal stays open with the typed note intact, and the server's
    // objection is visible inside it.
    const reopened = await screen.findByRole('dialog', {
      name: /request corrections/i,
    })
    expect(
      within(reopened).getByText(/moved to another status/i)
    ).toBeInTheDocument()
    expect(
      within(reopened).getByLabelText(/required corrections/i)
    ).toHaveValue('Upload a clearer scan of the PSA certificate.')
  })

  it('shows a friendly permission state on 403', async () => {
    api.get.mockRejectedValue(
      Object.assign(new Error("You do not have the 'enrollment.view' permission."), {
        status: 403,
      })
    )
    renderPage()

    expect(await screen.findByText(/you don't have permission/i)).toBeInTheDocument()
  })
})
