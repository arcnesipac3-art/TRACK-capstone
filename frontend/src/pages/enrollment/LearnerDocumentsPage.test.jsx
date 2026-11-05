import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LearnerDocumentsPage from './LearnerDocumentsPage'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), list: vi.fn(), post: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
}))

// The page only reads the role, to decide whose documents these are called.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { user: { id: 4, role: 'student' } },
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const APPLICATION_ROW = {
  id: 9,
  reference: 'ENR-2026-0009',
  status: 'under_review',
  grade_level_name: 'Grade 7',
  school_year_label: '2026-2027',
}

const DRAFT_ROW = { ...APPLICATION_ROW, id: 12, reference: 'ENR-2026-0012', status: 'draft' }

const BIRTH_CERTIFICATE = {
  id: 3,
  name: 'PSA Birth Certificate',
  is_required: true,
  status: 'verified',
  status_display: 'Verified',
  file: '/media/docs/birth.pdf',
  original_filename: 'birth.pdf',
  submitted_at: '2026-06-01T08:30:00+08:00',
  verified_at: '2026-06-02T09:00:00+08:00',
  review_note: 'Clear and readable.',
  download_url: '/api/enrollment/applications/9/documents/3/download/',
}

// Internal payload the applicant screens must never print.
const DETAIL = {
  id: 9,
  reference: 'ENR-2026-0009',
  status: 'under_review',
  first_name: 'Liza',
  last_name: 'Mabini',
  requirements_snapshot: { internal_note: 'SECRET-SNAPSHOT' },
  documents: [
    BIRTH_CERTIFICATE,
    {
      id: 4,
      name: 'Form 138',
      is_required: false,
      status: 'not_submitted',
      status_display: 'Not Submitted',
      file: null,
      original_filename: '',
      download_url: null,
    },
  ],
}

const DRAFT_DETAIL = { ...DETAIL, id: 12, reference: 'ENR-2026-0012', status: 'draft', documents: [] }

function mockReads({ applications = [APPLICATION_ROW], details = [DETAIL] } = {}) {
  api.list.mockImplementation(async () => applications)
  api.get.mockImplementation(async (path) => {
    const match = details.find((detail) => path === `/enrollment/applications/my/${detail.id}/`)
    if (!match) throw new Error('The checklist could not be loaded.')
    return match
  })
}

function renderPage(entry = '/student/enrollment/documents') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/student/enrollment" element={<Outlet />}>
          <Route path="documents" element={<LearnerDocumentsPage />} />
        </Route>
        <Route path="/parent/enrollment" element={<Outlet />}>
          <Route path="documents" element={<LearnerDocumentsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('LearnerDocumentsPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.list.mockReset()
    api.post.mockReset()
    mockAuth.user = { id: 4, role: 'student' }
  })

  it('collects every filed document across this account’s applications', async () => {
    mockReads()
    renderPage()

    expect(await screen.findByText('PSA Birth Certificate')).toBeInTheDocument()
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/enrollment/applications/my/9/')
    )
    expect(api.list).toHaveBeenCalledWith('/enrollment/applications/my/', expect.anything())

    const row = screen.getByText('PSA Birth Certificate').closest('.doc-item')
    expect(within(row).getByText('Verified')).toBeInTheDocument()
    expect(within(row).getByText('birth.pdf')).toBeInTheDocument()
    expect(within(row).getByText(/Uploaded/)).toBeInTheDocument()
    // The badge and the timestamp line both say Verified — the date is the point.
    expect(within(row).getByText(/^Verified /)).toBeInTheDocument()
    expect(within(row).getByText('Reviewer note: Clear and readable.')).toBeInTheDocument()

    // A slot with no file is listed, and offers nothing to open.
    const empty = (await screen.findByText('Form 138')).closest('.doc-item')
    expect(within(empty).queryByRole('button', { name: 'View' })).toBeNull()
    expect(screen.queryByText(/SECRET-SNAPSHOT/)).not.toBeInTheDocument()
  })

  it('reads a document inline and rules on nothing', async () => {
    mockReads()
    URL.createObjectURL = vi.fn(() => 'blob:learner')
    URL.revokeObjectURL = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    })
    global.fetch = fetchMock
    const user = userEvent.setup()
    renderPage()

    const row = (await screen.findByText('PSA Birth Certificate')).closest('.doc-item')
    await user.click(within(row).getByRole('button', { name: 'View' }))

    const dialog = await screen.findByRole('dialog', { name: 'PSA Birth Certificate' })
    expect(within(dialog).getByTitle('Preview of PSA Birth Certificate')).toHaveAttribute(
      'src',
      'blob:learner'
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/enrollment/applications/9/documents/3/download/',
      { headers: undefined }
    )
    expect(within(dialog).queryByRole('button', { name: 'Verify' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Return' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Waive' })).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('points a submitted application’s upload at the form it belongs to', async () => {
    mockReads({ applications: [APPLICATION_ROW, DRAFT_ROW], details: [DETAIL, DRAFT_DETAIL] })
    renderPage()

    const draftGroup = (await screen.findByText(/ENR-2026-0012/)).closest('.stack')
    expect(
      within(draftGroup).getByRole('link', { name: /Upload here/ })
    ).toHaveAttribute('href', '/student/enrollment/applications/12')
    // A submitted checklist has no upload entry point on this screen.
    const openGroup = screen.getByText(/ENR-2026-0009/).closest('.stack')
    expect(within(openGroup).queryByRole('link', { name: /Upload here/ })).toBeNull()
  })

  it('names the learner for a parent and keeps the copy theirs', async () => {
    mockAuth.user = { id: 7, role: 'parent' }
    mockReads()
    renderPage('/parent/enrollment/documents')

    expect(await screen.findByRole('heading', { level: 1, name: 'Filed documents' })).toBeInTheDocument()
    expect(screen.getByText(/linked to this account/i)).toBeInTheDocument()
    // The parent's list spans children, so each group says whose it is.
    expect(await screen.findByText(/ENR-2026-0009 · Liza Mabini/)).toBeInTheDocument()
    expect(screen.getByText('Across your linked children')).toBeInTheDocument()
  })

  it('says so when there is nothing on record yet', async () => {
    mockReads({ applications: [], details: [] })
    renderPage()

    expect(await screen.findByText('No documents on record')).toBeInTheDocument()
    expect(
      screen.getByText(/Documents belong to an application/i)
    ).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Start an application/ })).toHaveAttribute(
      'href',
      '/student/enrollment/new'
    )
  })

  it('keeps the applications it did read when a checklist fails', async () => {
    mockReads({ applications: [APPLICATION_ROW], details: [] })
    const user = userEvent.setup()
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('The checklist could not be loaded.')).toBeInTheDocument()
    // The learner can still reach each application's own page.
    expect(screen.getByRole('link', { name: /My applications/ })).toBeInTheDocument()

    const attempts = api.get.mock.calls.length
    await user.click(within(alert).getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(attempts))
  })
})
