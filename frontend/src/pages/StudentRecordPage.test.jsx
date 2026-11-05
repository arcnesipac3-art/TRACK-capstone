import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentRecordPage from './StudentRecordPage'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    list: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  API_BASE: '/api',
  ApiError: class ApiError extends Error {},
  authHeader: () => ({}),
}))

// The record page hides the enrollment half when the account lacks the key.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { user: { id: 1, role: 'admin' }, can: () => true },
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const PROFILE = {
  id: 41,
  lrn: '100000000001',
  section: 3,
  section_name: 'Grade 7 — Sampaguita (2026-2027)',
  date_of_birth: '2012-04-09',
  address: 'Purok 4, Baguio City',
  contact_number: '0917-000-0000',
  user: {
    id: 8,
    username: 'learner9',
    full_name: 'Sara Student',
    email: 'sara@knhs.edu.ph',
    is_active: true,
  },
}

const APPLICATION_ROW = {
  id: 9,
  reference: 'ENR-2026-0009',
  status: 'under_review',
  status_display: 'Under Review',
  enrollment_type: 'new',
  grade_level_name: 'Grade 7',
  school_year_label: '2026-2027',
  submitted_at: '2026-06-01T08:30:00+08:00',
  outstanding_documents: 1,
}

const ENROLLMENT_ROW = {
  id: 12,
  school_year_label: '2026-2027',
  grade_level_name: 'Grade 7',
  section_display: 'Grade 7 — Sampaguita (2026-2027)',
  status: 'active',
  confirmed_at: '2026-06-20T10:00:00+08:00',
  confirmed_by_name: 'Ria Registrar',
  application_reference: 'ENR-2026-0009',
}

const BIRTH_CERTIFICATE = {
  id: 3,
  name: 'PSA Birth Certificate',
  is_required: true,
  requires_verification: true,
  status: 'submitted',
  status_display: 'Awaiting Review',
  file: '/media/docs/birth.pdf',
  original_filename: 'birth.pdf',
  submitted_at: '2026-06-01T08:30:00+08:00',
  verified_at: null,
  verified_by_name: null,
  review_note: null,
  download_url: '/api/enrollment/applications/9/documents/3/download/',
}

const CARD = {
  id: 4,
  name: 'Form 137',
  is_required: false,
  requires_verification: false,
  status: 'not_submitted',
  status_display: 'Not Submitted',
  file: null,
  original_filename: '',
  submitted_at: null,
  verified_at: null,
  verified_by_name: null,
  review_note: null,
  download_url: null,
}

const APPLICATION_DETAIL = {
  id: 9,
  reference: 'ENR-2026-0009',
  documents: [BIRTH_CERTIFICATE, CARD],
}

function mockReads({
  profile = [PROFILE],
  applications = [APPLICATION_ROW],
  enrollments = [ENROLLMENT_ROW],
  detail = APPLICATION_DETAIL,
  profileFailure = null,
} = {}) {
  api.list.mockImplementation(async (path) => {
    if (profileFailure) throw profileFailure
    if (path === '/students/') return profile
    if (path === '/enrollment/applications/') return applications
    if (path === '/enrollment/enrollments/') return enrollments
    return []
  })
  api.get.mockImplementation(async (path) => {
    if (path === `/enrollment/applications/${detail.id}/`) return detail
    return {}
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/students/41']}>
      <Routes>
        <Route path="/admin/students/:id" element={<StudentRecordPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StudentRecordPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.list.mockReset()
    api.post.mockReset()
    mockAuth.can = () => true
  })

  it('reads the learner out of the directory lists, narrowed to one student', async () => {
    mockReads()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Sara Student' })).toBeInTheDocument()
    const learnerCard = (await screen.findByText('100000000001')).closest('.card')
    expect(within(learnerCard).getByText('Grade 7 — Sampaguita (2026-2027)')).toBeInTheDocument()
    expect(within(learnerCard).getByText('Purok 4, Baguio City')).toBeInTheDocument()

    const studentsCall = api.list.mock.calls.find(([path]) => path === '/students/')
    expect(studentsCall[1].params).toEqual({ id: '41' })
    const applicationCall = api.list.mock.calls.find(
      ([path]) => path === '/enrollment/applications/'
    )
    expect(applicationCall[1].params).toEqual({ student: '41' })
    const enrollmentCall = api.list.mock.calls.find(
      ([path]) => path === '/enrollment/enrollments/'
    )
    expect(enrollmentCall[1].params).toEqual({ student: '41' })
  })

  it('shows the applications and enrollments filed for this learner', async () => {
    mockReads()
    renderPage()

    const card = (await screen.findByText('ENR-2026-0009')).closest('.card')
    expect(within(card).getByText('Under Review')).toBeInTheDocument()
    expect(within(card).getByText('New enrollee')).toBeInTheDocument()
    expect(within(card).getByText('1 document(s) outstanding')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /Open review/ })).toHaveAttribute(
      'href',
      '/admin/enrollment/applications/9'
    )

    const enrollment = screen.getByText(/^Confirmed/).closest('.doc-item')
    expect(within(enrollment).getByText(/Ria Registrar/)).toBeInTheDocument()
    expect(within(enrollment).getByText('Active')).toBeInTheDocument()
  })

  it('reads each application checklist when the Documents tab opens', async () => {
    mockReads()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'Sara Student' })
    expect(api.get).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'Documents' }))

    expect(await screen.findByText('PSA Birth Certificate')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/enrollment/applications/9/'))
    // A slot with no file is listed, but it cannot be opened.
    expect(screen.getByText('Form 137')).toBeInTheDocument()
    const card = screen.getByText('Form 137').closest('.doc-item')
    expect(within(card).queryByRole('button', { name: 'View' })).toBeNull()
  })

  it('previews a filed document inline from the student record', async () => {
    mockReads()
    URL.createObjectURL = vi.fn(() => 'blob:record')
    URL.revokeObjectURL = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    })
    global.fetch = fetchMock
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('tab', { name: 'Documents' }))
    const docCard = (await screen.findByText('PSA Birth Certificate')).closest('.doc-item')
    await user.click(within(docCard).getByRole('button', { name: 'View' }))

    const frame = await screen.findByTitle('Preview of PSA Birth Certificate')
    expect(frame.getAttribute('src')).toBe('blob:record')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/enrollment/applications/9/documents/3/download/',
      { headers: undefined }
    )
  })

  it('rules on a filed document from the record, in place', async () => {
    mockReads()
    URL.createObjectURL = vi.fn(() => 'blob:record')
    URL.revokeObjectURL = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    })
    api.post.mockResolvedValue({
      ...BIRTH_CERTIFICATE,
      status: 'verified',
      status_display: 'Verified',
      verified_at: '2026-06-02T09:00:00+08:00',
      verified_by_name: 'Ria Registrar',
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('tab', { name: 'Documents' }))
    const docCard = (await screen.findByText('PSA Birth Certificate')).closest('.doc-item')
    await user.click(within(docCard).getByRole('button', { name: 'View' }))

    const dialog = await screen.findByRole('dialog', { name: 'PSA Birth Certificate' })
    await user.click(within(dialog).getByRole('button', { name: 'Verify' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/enrollment/applications/9/documents/3/action/',
        { action: 'verify' }
      )
    )
    // The open preview stays open, its bar and the row behind it both flip.
    expect(within(dialog).getByText('Verified')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(docCard).getByText('Verified')).toBeInTheDocument()
    )
    expect(within(docCard).getByText(/Ria Registrar/)).toBeInTheDocument()
    // The checklist was re-read, not rebuilt from the client's guess: the mount
    // read is the first, the ruling behind it is the second.
    const appReads = () =>
      api.list.mock.calls.filter(([path]) => path === '/enrollment/applications/').length
    await waitFor(() => expect(appReads()).toBeGreaterThan(1))
    expect(screen.getByText('Form 137')).toBeInTheDocument()
  })

  it('gives a record viewer without enrollment.manage no ruling controls', async () => {
    mockAuth.can = (key) => key !== 'enrollment.manage'
    mockReads()
    URL.createObjectURL = vi.fn(() => 'blob:record')
    URL.revokeObjectURL = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('tab', { name: 'Documents' }))
    const docCard = (await screen.findByText('PSA Birth Certificate')).closest('.doc-item')
    await user.click(within(docCard).getByRole('button', { name: 'View' }))

    const dialog = await screen.findByRole('dialog', { name: 'PSA Birth Certificate' })
    expect(await within(dialog).findByTitle('Preview of PSA Birth Certificate')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Verify' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Return' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Waive' })).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('withholds the enrollment half from an account without enrollment.view', async () => {
    mockAuth.can = (key) => key === 'users.view'
    mockReads()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Sara Student' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Documents' })).toBeNull()
    expect(screen.getByText(/does not hold the enrollment.view permission/i)).toBeInTheDocument()

    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(
      api.list.mock.calls.some(([path]) => path.startsWith('/enrollment/'))
    ).toBe(false)
  })

  it('says so plainly when the learner is not on record', async () => {
    mockReads({ profile: [], applications: [], enrollments: [] })
    renderPage()

    expect(await screen.findByText('Student not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to students/ })).toHaveAttribute(
      'href',
      '/admin/students'
    )
  })

  it('reports a record the server refuses to show', async () => {
    mockReads({ profileFailure: Object.assign(new Error('No student access.'), { status: 403 }) })
    renderPage()

    expect(await screen.findByText("You don't have permission")).toBeInTheDocument()
    expect(screen.getByText(/students.view permission/i)).toBeInTheDocument()
  })
})
