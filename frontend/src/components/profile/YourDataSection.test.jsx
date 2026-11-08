import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YourDataSection from './YourDataSection'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), list: vi.fn(), post: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
}))

const PENDING = {
  id: 7,
  kind: 'correction',
  kind_display: 'Correct and update',
  detail: 'My surname is spelled with two Bs, not one.',
  status: 'pending',
  status_display: 'Pending',
  response_note: '',
  handled_at: null,
  created_at: '2026-11-02T01:00:00Z',
}

const ANSWERED = {
  id: 8,
  kind: 'erasure',
  kind_display: 'Delete my record',
  detail: 'Please delete everything TRACK holds about me.',
  status: 'answered',
  status_display: 'Answered',
  response_note:
    'Your messages and push subscriptions are gone. The registrar must keep your academic record for the period DepEd requires.',
  handled_at: '2026-11-04T01:00:00Z',
  created_at: '2026-11-01T01:00:00Z',
}

function mockRequests(rows) {
  api.list.mockResolvedValue(rows)
}

describe('YourDataSection', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.list.mockReset()
    api.post.mockReset()
    mockRequests([])
    window.URL.createObjectURL = vi.fn(() => 'blob:export')
    window.URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  it('hands the export to the browser as a named JSON file', async () => {
    api.get.mockResolvedValue({
      schema: 'track.personal-data-export/1',
      generated_at: '2026-11-08T03:04:05Z',
      requested_by: { username: 't_student1' },
    })
    render(<YourDataSection username="t_student1" />)

    await userEvent.click(screen.getByRole('button', { name: /Download my data/i }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/account/export/'))
    const handed = window.URL.createObjectURL.mock.calls[0][0]
    expect(handed.type).toBe('application/json')
    expect(await handed.text()).toContain('track.personal-data-export/1')
  })

  it('says so when the export cannot be fetched', async () => {
    api.get.mockRejectedValue(new Error('Cannot reach the TRACK server.'))
    render(<YourDataSection username="t_student1" />)

    await userEvent.click(screen.getByRole('button', { name: /Download my data/i }))

    expect(await screen.findByText(/Cannot reach the TRACK server/)).toBeInTheDocument()
    expect(window.URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('will not file a request the office cannot act on', async () => {
    render(<YourDataSection username="t_student1" />)
    await screen.findByText(/You have not asked the school/i)

    await userEvent.selectOptions(screen.getByLabelText(/What are you asking for/i), 'erasure')
    await userEvent.type(screen.getByLabelText(/Describe it/i), 'delete me')
    await userEvent.click(screen.getByRole('button', { name: /Send the request/i }))

    expect(
      screen.getByText(/at least 15 characters, so the office can act on it/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('files a real request and puts it in the list', async () => {
    api.post.mockResolvedValue({ ...PENDING })
    render(<YourDataSection username="t_student1" />)
    await screen.findByText(/You have not asked the school/i)

    await userEvent.type(
      screen.getByLabelText(/Describe it/i),
      '  My surname is spelled with two Bs, not one.  '
    )
    await userEvent.click(screen.getByRole('button', { name: /Send the request/i }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/account/data-requests/', {
        kind: 'correction',
        detail: 'My surname is spelled with two Bs, not one.',
      })
    )
    expect(await screen.findByText(/Filed as request #7/)).toBeInTheDocument()
    // The list is the server's answer, so the row arrives through a reload.
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
  })

  it('shows an open request as still waiting', async () => {
    mockRequests([PENDING])
    render(<YourDataSection username="t_student1" />)

    expect(await screen.findByText(PENDING.detail)).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for the enrollment office/i)).toBeInTheDocument()
  })

  it('shows the office written answer, not just a status flip', async () => {
    mockRequests([ANSWERED])
    render(<YourDataSection username="t_student1" />)

    expect(await screen.findByText(/must keep your academic record/i)).toBeInTheDocument()
    expect(screen.getByText('Answered')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for the enrollment office/i)).toBeNull()
  })

  it('survives a failed list load without hiding the export', async () => {
    api.list.mockRejectedValue(new Error('Request failed (500).'))
    render(<YourDataSection username="t_student1" />)

    expect(await screen.findByRole('button', { name: /Download my data/i })).toBeEnabled()
    expect(screen.getByText(/Request failed/)).toBeInTheDocument()
  })
})
