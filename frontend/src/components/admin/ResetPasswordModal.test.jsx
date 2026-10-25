import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResetPasswordModal from './ResetPasswordModal'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

const USER = { id: 7, username: 'teacher1', full_name: 'Tina Teacher' }

function setup(props = {}) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(
    <ResetPasswordModal open user={USER} onClose={onClose} onDone={onDone} {...props} />
  )
  return { onClose, onDone }
}

/** Fills both password fields with a value that passes every client rule. */
async function fillValid(user, value = 'Brava-Skies-88') {
  await user.type(screen.getByLabelText(/^new password$/i), value)
  await user.type(screen.getByLabelText(/confirm new password/i), value)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResetPasswordModal — rendering', () => {
  it('names the dialog after the account being reset', () => {
    setup()
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Reset password for Tina Teacher'
    )
  })

  it('falls back to the username when there is no full name', () => {
    setup({ user: { id: 7, username: 'teacher1' } })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Reset password for teacher1'
    )
  })

  it('warns that the old password stops working', () => {
    setup()
    expect(screen.getByText(/old password stops working immediately/i)).toBeInTheDocument()
  })

  it('labels both password inputs visibly', () => {
    setup()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
  })
})

describe('ResetPasswordModal — client-side validation', () => {
  it('refuses to submit an empty form', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/enter a new password/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than eight characters', async () => {
    const user = userEvent.setup()
    setup()
    await fillValid(user, 'short')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(
      await screen.findByText(/use at least 8 characters/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejects a password made only of numbers', async () => {
    const user = userEvent.setup()
    setup()
    await fillValid(user, '1234567890123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(
      await screen.findByText(/cannot be only numbers/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejects a confirmation that does not match', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText(/^new password$/i), 'Brava-Skies-88')
    await user.type(screen.getByLabelText(/confirm new password/i), 'Brava-Skies-99')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(
      await screen.findByText(/do not match/i)
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('clears a field error once the field is edited again', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await screen.findByText(/enter a new password/i)

    await user.type(screen.getByLabelText(/^new password$/i), 'Brava-Skies-88')
    expect(screen.queryByText(/enter a new password/i)).not.toBeInTheDocument()
  })

  it('marks the failing input as invalid for assistive tech', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    const input = await screen.findByLabelText(/^new password$/i)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/enter a new password/i)
  })
})

describe('ResetPasswordModal — submit', () => {
  it('posts the account id and the new password', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ message: 'Password reset for Tina Teacher.' })
    setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/auth/reset-password/', {
      user_id: 7,
      new_password: 'Brava-Skies-88',
    })
  })

  it('reports the server message back to the page', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ message: 'Password reset for Tina Teacher.' })
    const { onDone } = setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith('Password reset for Tina Teacher.')
    )
  })

  it('replaces the form with a confirmation and no password box', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ message: 'Password reset for Tina Teacher.' })
    setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(
      await screen.findByText(/has been changed/i)
    ).toBeInTheDocument()
    // The password must not linger in the DOM once submitted.
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/confirm new password/i)).not.toBeInTheDocument()
  })

  it('closes from the confirmation state', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ message: 'ok' })
    const { onClose } = setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    await user.click(await screen.findByRole('button', { name: /done/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces a field error returned by the server', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue(
      Object.assign(new Error('Bad request'), {
        details: { new_password: ['This password is too common.'] },
      })
    )
    setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/too common/i)).toBeInTheDocument()
  })

  it('surfaces a non-field error without losing the form', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue(
      Object.assign(new Error('Cannot reach the TRACK server.'), { details: null })
    )
    setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(
      await screen.findByText(/cannot reach the track server/i)
    ).toBeInTheDocument()
    // Still on the form, so the registrar can retry.
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
  })

  it('lets the registrar back out without submitting', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('does nothing when no account is supplied', () => {
    setup({ user: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
