import { render, screen, within } from '@testing-library/react'
import { ConfirmProvider } from '../context/ConfirmProvider'

/**
 * Test harness for screens that ask `useConfirm()` before writing.
 *
 * The provider owns the one dialog the whole shell shares, so a page rendered
 * without it throws on mount — this is the same wrapper `main.jsx` installs,
 * and it lets a spec drive the real yes/no instead of stubbing `window.confirm`.
 */
export function renderConfirmed(ui, options) {
  return render(<ConfirmProvider>{ui}</ConfirmProvider>, options)
}

/**
 * Press the action button of the open dialog, naming it so the spec cannot
 * match the same word on the row button behind it.
 */
export async function acceptConfirm(user, { title, label }) {
  const dialog = screen.getByRole('dialog', { name: title })
  await user.click(within(dialog).getByRole('button', { name: label }))
}

/** Back out of the open dialog: the write must not happen. */
export async function declineConfirm(user, { title }) {
  const dialog = screen.getByRole('dialog', { name: title })
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
}
