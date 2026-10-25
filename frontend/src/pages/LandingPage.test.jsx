import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthContext from '../context/AuthContext'
import LandingPage from './LandingPage'

const anonymous = {
  user: null,
  status: 'anonymous',
  isAuthenticated: false,
  isLoading: false,
  bootstrapError: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}

function renderLanding(authValue = anonymous) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

/** Minimal stand-in for IntersectionObserver: records the observed targets and
 *  lets a test fire the callback by hand. jsdom has no real implementation. */
class FakeIntersectionObserver {
  static latest = null

  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.targets = new Set()
    this.disconnected = false
    FakeIntersectionObserver.latest = this
  }

  observe(target) {
    this.targets.add(target)
  }

  unobserve(target) {
    this.targets.delete(target)
  }

  disconnect() {
    this.disconnected = true
    this.targets.clear()
  }

  /** Deliver an intersection change for the given targets. */
  fire(isIntersecting, targets = [...this.targets]) {
    this.callback(
      targets.map((target) => ({ target, isIntersecting })),
      this,
    )
  }
}

afterEach(() => {
  FakeIntersectionObserver.latest = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LandingPage', () => {
  it('renders the public sections', () => {
    renderLanding()

    expect(
      screen.getByRole('heading', { level: 1, name: /tracked in one place/i }),
    ).toBeInTheDocument()
    expect(document.querySelectorAll('.feature-card')).toHaveLength(8)
    expect(document.querySelectorAll('.role-card')).toHaveLength(4)
    expect(document.querySelectorAll('.faq-item')).toHaveLength(8)
    expect(document.querySelector('.cta-card')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-reveal]')).toHaveLength(6)
  })
})

describe('LandingPage scroll reveal', () => {
  /* jsdom ships no IntersectionObserver, so this is the "older browser / no
     scripting support" path: the hidden starting state must never be applied,
     or those sections would stay invisible forever. */
  it('leaves every section visible when IntersectionObserver is unavailable', () => {
    expect(typeof window.IntersectionObserver).toBe('undefined')

    renderLanding()

    const root = document.querySelector('.landing')
    expect(root).not.toHaveClass('reveal-ready')
    expect(
      root.querySelectorAll('[data-reveal].reveal-in'),
    ).toHaveLength(0)
  })

  it('arms the hidden state only when the observer exists', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    renderLanding()

    expect(document.querySelector('.landing')).toHaveClass('reveal-ready')
    const observer = FakeIntersectionObserver.latest
    expect(observer).not.toBeNull()
    expect(observer.targets.size).toBe(6)
    expect(observer.options).toMatchObject({ threshold: 0.06 })
    // Nothing hidden-and-unrevealed yet: the callback has not fired.
    expect(document.querySelectorAll('.reveal-in')).toHaveLength(0)
  })

  it('reveals a section on intersection, stops watching it, then settles it', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    renderLanding()
    const observer = FakeIntersectionObserver.latest

    vi.useFakeTimers()
    const [first, second] = [...observer.targets]
    observer.fire(true, [first])

    expect(first).toHaveClass('reveal-in')
    expect(second).not.toHaveClass('reveal-in')
    // Once revealed it is unobserved, so the fade cannot replay on scroll-back.
    expect(observer.targets.has(first)).toBe(false)
    expect(observer.targets.has(second)).toBe(true)

    // The settle backstop lands after the 520ms fade window (600ms) and pins
    // the visible end state even if the transition never ran.
    expect(first).not.toHaveClass('reveal-settled')
    vi.advanceTimersByTime(600)
    expect(first).toHaveClass('reveal-settled')
    expect(second).not.toHaveClass('reveal-settled')
  })

  it('keeps sections that have not scrolled into view hidden', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    renderLanding()
    const observer = FakeIntersectionObserver.latest

    vi.useFakeTimers()
    observer.fire(false)

    expect(document.querySelectorAll('.reveal-in')).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    expect(document.querySelectorAll('.reveal-settled')).toHaveLength(0)
  })

  it('disconnects the observer and cancels pending settles on unmount', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const { unmount } = renderLanding()
    const observer = FakeIntersectionObserver.latest

    vi.useFakeTimers()
    const [first] = [...observer.targets]
    observer.fire(true, [first])
    unmount()

    expect(observer.disconnected).toBe(true)
    // A cancelled timer must not fire against a detached node.
    vi.advanceTimersByTime(1000)
    expect(first.classList.contains('reveal-settled')).toBe(false)
  })
})
