import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'

function Boom() {
  throw new Error('kaboom')
}

function Fine() {
  return <p>all good</p>
}

/** Wraps the boundary in a router so its <Link to="/"> renders. */
function renderBoundary(children) {
  return render(
    <MemoryRouter>
      <ErrorBoundary>{children}</ErrorBoundary>
    </MemoryRouter>
  )
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs every caught error; silence it so test output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children normally when nothing throws', () => {
    renderBoundary(<Fine />)
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('catches a render crash and shows a card instead of a blank page', () => {
    renderBoundary(<Boom />)
    expect(
      screen.getByText('This screen ran into a problem')
    ).toBeInTheDocument()
    // The real message is surfaced, not swallowed.
    expect(screen.getByText('kaboom')).toBeInTheDocument()
  })

  it('marks the fallback as an alert for screen readers', () => {
    renderBoundary(<Boom />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('offers a way back — reload, retry and a home link', () => {
    renderBoundary(<Boom />)
    expect(
      screen.getByRole('button', { name: /reload the page/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to home/i })).toBeInTheDocument()
  })

  it('"Try again" clears the captured error and re-renders the subtree', async () => {
    const user = userEvent.setup()

    // The throw decision is read from a flag the test controls — never mutated
    // during render. React 19 may render a child more than once, so an
    // in-render toggle would silently stop throwing on the retry.
    const state = { shouldThrow: true }
    function Flaky() {
      if (state.shouldThrow) throw new Error('kaboom')
      return <p>all good</p>
    }

    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      </MemoryRouter>
    )
    expect(
      screen.getByText('This screen ran into a problem')
    ).toBeInTheDocument()

    // Recover the child, then ask the boundary to try again.
    state.shouldThrow = false
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('all good')).toBeInTheDocument()
    expect(
      screen.queryByText('This screen ran into a problem')
    ).not.toBeInTheDocument()
  })
})
