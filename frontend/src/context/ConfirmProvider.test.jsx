import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from './ConfirmProvider'
import { useConfirm } from './ConfirmContext'

/**
 * The dialog is the only thing standing between a click and a write that
 * cannot be undone, so its contract is tested directly: one labelled question,
 * a declined answer that resolves `false` and closes, an accepted answer that
 * resolves `true`, Escape treated as a decline, and a bare string still
 * getting a title.
 */

let answers

function Caller({ request }) {
  const confirm = useConfirm()
  return (
    <button
      type="button"
      onClick={() => {
        confirm(request).then((a) => answers.push(a))
      }}
    >
      Ask
    </button>
  )
}

function renderCaller(request) {
  answers = []
  return render(
    <ConfirmProvider>
      <Caller request={request} />
    </ConfirmProvider>
  )
}

/** A caller that asks twice without waiting, to prove nothing is left hanging. */
function TwiceCaller() {
  const confirm = useConfirm()
  return (
    <button
      type="button"
      onClick={() => {
        confirm({ title: 'First?', message: 'One' }).then((a) => answers.push(a))
        confirm({ title: 'Second?', message: 'Two' })
      }}
    >
      Ask twice
    </button>
  )
}

beforeEach(() => {
  answers = []
})

describe('ConfirmProvider', () => {
  it('asks one labelled question and puts the verb on the action', async () => {
    const user = userEvent.setup()
    renderCaller({
      title: 'Delete section?',
      message: 'This cannot be undone.',
      detail: 'The server will refuse while students are enrolled.',
      confirmLabel: 'Delete',
    })

    await user.click(screen.getByRole('button', { name: 'Ask' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete section?' })
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument()
    expect(within(dialog).getByText(/students are enrolled/)).toBeInTheDocument()
    // Close, Cancel, Delete — the action carries the verb, not "OK".
    expect(within(dialog).getAllByRole('button')).toHaveLength(3)
    expect(answers).toEqual([])
  })

  it('resolves false and runs nothing when the administrator backs out', async () => {
    const user = userEvent.setup()
    renderCaller({ title: 'Delete section?', message: 'This cannot be undone.' })

    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await vi.waitFor(() => expect(answers).toEqual([false]))
  })

  it('resolves true when the action is accepted', async () => {
    const user = userEvent.setup()
    renderCaller({
      title: 'Delete section?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
    })

    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await vi.waitFor(() => expect(answers).toEqual([true]))
  })

  it('closes on Escape and treats that as a decline', async () => {
    const user = userEvent.setup()
    renderCaller({ title: 'Deactivate account?', message: 'They will not be able to sign in.' })

    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    await vi.waitFor(() => expect(answers).toEqual([false]))
  })

  it('answers a replaced request with a decline so no caller waits forever', async () => {
    const user = userEvent.setup()
    answers = []
    render(
      <ConfirmProvider>
        <TwiceCaller />
      </ConfirmProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Ask twice' }))

    expect(screen.getByRole('dialog', { name: 'Second?' })).toBeInTheDocument()
    await vi.waitFor(() => expect(answers).toEqual([false]))
  })

  it('gives a bare string a title of its own', async () => {
    const user = userEvent.setup()
    renderCaller('Delete this record?')

    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(screen.getByRole('dialog', { name: 'Are you sure?' })).toHaveTextContent(
      'Delete this record?'
    )
  })
})

describe('useConfirm', () => {
  it('refuses to guess when there is no provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Caller request={{ title: 'Delete?', message: 'No owner.' }} />)).toThrow(
      'useConfirm must be used inside <ConfirmProvider>'
    )
    spy.mockRestore()
  })
})
