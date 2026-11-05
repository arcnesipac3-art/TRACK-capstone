import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocumentStaffActions from './DocumentStaffActions'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { post: vi.fn(), get: vi.fn(), list: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
}))

const WITH_FILE = { id: 3, name: 'PSA Birth Certificate', file: '/media/docs/birth.pdf' }
const NO_FILE = { id: 4, name: 'Form 137', file: null }

describe('DocumentStaffActions', () => {
  beforeEach(() => {
    api.post.mockReset()
  })

  it('waives without a note and closes the panel it opened', async () => {
    const waived = { ...WITH_FILE, status: 'waived', file: null }
    api.post.mockResolvedValue(waived)
    const onDone = vi.fn()
    render(<DocumentStaffActions applicationId={9} doc={WITH_FILE} onDone={onDone} />)

    await userEvent.click(screen.getByRole('button', { name: 'Waive' }))
    expect(
      await screen.findByText(/Waive “PSA Birth Certificate”\?/)
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Waive document' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/enrollment/applications/9/documents/3/action/',
        { action: 'waive', note: '' }
      )
    )
    // The standing wording is the server's, so an empty note is what travels.
    expect(onDone).toHaveBeenCalledWith(waived, 'waive')
    expect(screen.queryByText(/Waive “PSA Birth Certificate”\?/)).toBeNull()
  })

  it('will not return a document on an empty note', async () => {
    const onDone = vi.fn()
    render(<DocumentStaffActions applicationId={9} doc={WITH_FILE} onDone={onDone} />)

    await userEvent.click(screen.getByRole('button', { name: 'Return' }))
    await userEvent.click(screen.getByRole('button', { name: 'Return document' }))

    expect(
      screen.getByText(/Explain what must be corrected/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()

    await userEvent.type(
      screen.getByLabelText(/What must be corrected\?/),
      '  Re-scan the reverse side.  '
    )
    await userEvent.click(screen.getByRole('button', { name: 'Return document' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/enrollment/applications/9/documents/3/action/',
        { action: 'return', note: 'Re-scan the reverse side.' }
      )
    )
  })

  it('hides Verify from a slot with no file, and keeps the failure visible', async () => {
    api.post.mockRejectedValue(
      new Error("This document needs a file before it can be verified.")
    )
    const view = render(
      <DocumentStaffActions applicationId={9} doc={NO_FILE} onDone={() => {}} />
    )
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Waive' })).toBeInTheDocument()

    view.rerender(<DocumentStaffActions applicationId={9} doc={WITH_FILE} onDone={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

    const panel = await screen.findByRole('alert')
    expect(within(panel).getByText(/needs a file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled()
  })
})
