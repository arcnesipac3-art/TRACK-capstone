import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Button from './Button'
import ButtonLink from './ButtonLink'

function renderLink(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

/**
 * A link that is styled differently from a button is the bug this component
 * exists to prevent, so the class list — not the visuals — is the contract.
 */
describe('ButtonLink', () => {
  it('renders an anchor that navigates', () => {
    renderLink(
      <ButtonLink variant="secondary" size="sm" to="/enroll/applications">
        View all applications
      </ButtonLink>
    )

    const link = screen.getByRole('link', { name: 'View all applications' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/enroll/applications')
  })

  it('carries exactly the classes Button puts on the same control', () => {
    const { container } = renderLink(
      <ButtonLink variant="ghost" size="xs" to="/a">
        Go
      </ButtonLink>
    )
    const button = render(<Button variant="ghost" size="xs">Go</Button>).container

    expect(container.firstChild.className).toBe(button.firstChild.className)
  })

  it('keeps the class name the caller adds', () => {
    renderLink(
      <ButtonLink to="/a" className="pub-nav-cta">
        Open
      </ButtonLink>
    )

    expect(screen.getByRole('link', { name: 'Open' }).className).toContain(
      'pub-nav-cta'
    )
  })

  it('passes router props through to the link', () => {
    renderLink(
      <ButtonLink to={{ pathname: '/a', search: '?period=3' }} state={{ periodId: 3 }} replace aria-label="Start over">
        Start
      </ButtonLink>
    )

    const link = screen.getByRole('link', { name: 'Start over' })
    expect(link).toHaveAttribute('href', '/a?period=3')
    expect(link).toHaveAttribute('aria-label', 'Start over')
  })

  it('resolves a relative target against the route that renders it', () => {
    // This is why the enrollment screens can write `to="applications"`: the
    // link hangs off its own route, so the same markup works under /student,
    // /parent and the public /enroll paths.
    render(
      <MemoryRouter initialEntries={['/student/enrollment']}>
        <Routes>
          <Route
            path="/student/enrollment"
            element={
              <ButtonLink to="applications" variant="ghost" size="xs">
                View all applications
              </ButtonLink>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/student/enrollment/applications'
    )
  })
})
