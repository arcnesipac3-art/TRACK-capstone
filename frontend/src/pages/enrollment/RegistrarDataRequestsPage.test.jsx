import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrarDataRequestsPage from './RegistrarDataRequestsPage'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), list: vi.fn(), post: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
}))

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { can: vi.fn(() => true) } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const OPEN = {
  id: 7,
  kind: 'correction',
  kind_display: 'Correct and update',
  detail: 'My surname is spelled with one B, not two.',
  status: 'pending',
  status_display: 'Pending',
  response_note: '',
  handled_at: null,
  created_at: '2026-11-02T08:30:00+08:00',
  requester_username: 't_student1',
  requester_name: 'Sara Student',
  requester_email: 'sara@example.com',
}

const ANSWERED = {
  ...OPEN,
  id: 8,
  kind: 'erasure',
  kind_display: 'Delete my record',
  detail: 'Please delete everything TRACK holds about me.',
  status: 'refused',
  status_display: 'Refused',
  response_note:
    'Your messages were removed. The registrar must keep your academic record for the period DepEd requires.',
  handled_at: '2026-11-04T09:00:00+08:00',
}

// The account named in the ask is already gone; the request is not.
const ORPHANED = {
  ...OPEN,
  id: 9,
  requester_username: null,
  requester_name: null,
  requester_email: '',
}

function mockQueue(rows, error = null) {
  useFetch.mockReturnValue({
    data: rows,
    loading: false,
    error,
    reload: vi.fn(),
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RegistrarDataRequestsPage />
    </MemoryRouter>
  )
}

describe('RegistrarDataRequestsPage', () => {
  beforeEach(() => {
    api.post.mockReset()
    useFetch.mockReset()
    mockAuth.can = vi.fn(() => true)
    mockQueue([OPEN, ANSWERED])
  })

  it('reads the queue from the office endpoint and shows who asked', () => {
    renderPage()

    expect(useFetch).toHaveBeenCalledWith('/account/data-requests/queue/', {
      list: true,
    })
    expect(screen.getByText('Sara Student')).toBeInTheDocument()
    expect(screen.getByText(OPEN.detail)).toBeInTheDocument()
    expect(screen.getByText('sara@example.com')).toBeInTheDocument()
    expect(screen.getByText('1 open')).toBeInTheDocument()
  })

  it('opens on the asks still waiting, not the ones already closed', () => {
    renderPage()

    expect(screen.getByText(OPEN.detail)).toBeInTheDocument()
    expect(screen.queryByText(ANSWERED.detail)).toBeNull()
    expect(
      screen.getByRole('group', { name: 'Request views' })
    ).toBeInTheDocument()
  })

  it('shows the written answer once the office switches to closed requests', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Answered' }))

    expect(screen.getByText(ANSWERED.detail)).toBeInTheDocument()
    expect(screen.getByText(/must keep your academic record/i)).toBeInTheDocument()
    expect(screen.getByText('Refused')).toBeInTheDocument()
  })

  it('will not send an answer that is shorter than the notice promises', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Write the answer' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(/The answer the requester reads/i),
      'done'
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save the answer' }))

    expect(
      within(dialog).getByText(/at least 15 characters/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('posts the outcome and the note, then reloads the queue', async () => {
    const reload = vi.fn()
    useFetch.mockReturnValue({ data: [OPEN], loading: false, error: null, reload })
    api.post.mockResolvedValue({ ...OPEN, status: 'answered' })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Write the answer' }))
    const dialog = await screen.findByRole('dialog')
    const note = 'Removed the wrong spelling from your learner record today.'
    await userEvent.type(
      within(dialog).getByLabelText(/The answer the requester reads/i),
      note
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save the answer' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/account/data-requests/7/answer/', {
        status: 'answered',
        response_note: note,
      })
    )
    expect(reload).toHaveBeenCalled()
  })

  it('lets the office refuse, which is an answer too', async () => {
    api.post.mockResolvedValue({ ...OPEN, status: 'refused' })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Write the answer' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/Outcome/i),
      'refused'
    )
    await userEvent.type(
      within(dialog).getByLabelText(/The answer the requester reads/i),
      'The registrar is required by law to keep the academic record; nothing else is held.'
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save the answer' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/account/data-requests/7/answer/',
        expect.objectContaining({ status: 'refused' })
      )
    )
  })

  it('keeps a request whose account was closed workable', async () => {
    mockQueue([ORPHANED])
    renderPage()

    expect(screen.getByText('Account closed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Write the answer' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(OPEN.detail)
    ).toBeInTheDocument()
  })

  it('offers no answer control to an office reader without the manage key', () => {
    mockAuth.can = vi.fn((key) => key !== 'enrollment.manage')
    renderPage()

    expect(screen.getByText(OPEN.detail)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Write the answer' })).toBeNull()
  })

  it('says who to ask when the queue itself is refused', () => {
    mockAuth.can = vi.fn(() => false)
    mockQueue(null, Object.assign(new Error('Only the enrollment office can read this queue.'), { status: 403 }))
    renderPage()

    expect(
      screen.getByText(/This queue belongs to the enrollment office/i)
    ).toBeInTheDocument()
  })

  it('keeps the retry next to a load failure that is not a refusal', async () => {
    const reload = vi.fn()
    useFetch.mockReturnValue({
      data: null,
      loading: false,
      error: Object.assign(new Error('Cannot reach the TRACK server.'), { status: 0 }),
      reload,
    })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })

  it('reports an empty queue as the normal state, not an error', () => {
    mockQueue([])
    renderPage()

    expect(screen.getByText(/An empty queue is the normal state/i)).toBeInTheDocument()
  })
})
