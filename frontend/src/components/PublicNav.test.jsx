import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicNav from './PublicNav'

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: false, user: null },
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

/**
 * jsdom has no layout engine, so `offsetParent` is always null and the focus
 * trap's visibility filter would treat every link as hidden. Stubbed the same
 * way Modal.test.jsx stubs it, so the trap is exercised for real.
 */
beforeEach(() => {
  document.body.style.overflow = ''
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

function renderNav() {
  return render(
    <MemoryRouter initialEntries={['/about']}>
      <PublicNav />
    </MemoryRouter>
  )
}

describe('PublicNav mobile menu', () => {
  it('is a dialog only once it is open', async () => {
    const user = userEvent.setup()
    renderNav()

    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument()
  })

  it('takes the keyboard when it opens and gives it back when it closes', async () => {
    const user = userEvent.setup()
    renderNav()
    const hamburger = screen.getByRole('button', { name: 'Open navigation menu' })

    await user.click(hamburger)
    const menu = screen.getByRole('dialog', { name: 'Navigation menu' })
    expect(menu.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).toBeNull()
    )
    expect(document.activeElement).toBe(hamburger)
  })

  it('keeps Tab inside the menu, so the page behind cannot be walked into', async () => {
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))

    const menu = screen.getByRole('dialog', { name: 'Navigation menu' })
    const links = menu.querySelectorAll('a[href]')
    const first = links[0]
    const last = links[links.length - 1]

    last.focus()
    await user.tab()
    expect(document.activeElement).toBe(first)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(last)
  })

  it('stops the page behind from scrolling and restores it on unmount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderNav()

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
