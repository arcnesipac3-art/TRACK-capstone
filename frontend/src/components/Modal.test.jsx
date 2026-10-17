import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

function renderModal(props = {}) {
  const onClose = vi.fn()
  const utils = render(
    <Modal open title="Test dialog" onClose={onClose} {...props}>
      <label htmlFor="m-name">Name</label>
      <input id="m-name" className="input" />
      <button type="button">Other action</button>
    </Modal>
  )
  return { onClose, ...utils }
}

describe('Modal', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    // jsdom has no layout engine, so `offsetParent` is always null and the
    // Modal's "is this element visible?" filter would treat every control as
    // hidden. Stub it so the focus trap is exercised for real.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.ownerDocument?.body ?? null
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent')
  })

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Hidden" onClose={() => {}}>
        <p>body</p>
      </Modal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes a dialog role with the title as its accessible name', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Test dialog')
  })

  it('marks itself modal for assistive tech', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus into the dialog on open', async () => {
    renderModal()
    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
        true
      )
    })
  })

  it('locks background scrolling while open', () => {
    renderModal()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape when dismissible is false', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal({ dismissible: false })
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByRole('dialog'))
    // Clicking the panel itself must NOT close it.
    expect(onClose).not.toHaveBeenCalled()
    await user.click(document.querySelector('.modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close on backdrop click when not dismissible', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal({ dismissible: false })
    await user.click(document.querySelector('.modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hides the close button when not dismissible', () => {
    renderModal({ dismissible: false })
    expect(
      screen.queryByRole('button', { name: /close dialog/i })
    ).not.toBeInTheDocument()
  })

  it('restores body scroll on unmount', async () => {
    const { unmount } = renderModal()
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('keeps Tab inside the dialog (focus trap)', async () => {
    const user = userEvent.setup()
    renderModal()
    const dialog = screen.getByRole('dialog')
    const focusables = dialog.querySelectorAll(
      'input, button, select, textarea, a[href]'
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    // Shift+Tab from the first element should wrap to the last.
    first.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(last)

    // Tab from the last element should wrap back to the first.
    await user.tab()
    expect(document.activeElement).toBe(first)
  })

  it('renders a footer with actions when provided', () => {
    render(
      <Modal open title="With footer" onClose={() => {}} footer={<button>Save</button>}>
        <p>body</p>
      </Modal>
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('honours a custom width', () => {
    renderModal({ width: 420 })
    expect(screen.getByRole('dialog')).toHaveStyle({ maxWidth: '420px' })
  })
})
