import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AuthContext from '../context/AuthContext'
import ProtectedRoute from './ProtectedRoute'

/**
 * Renders the guard around a probe route, with the auth context forced into a
 * known state. `useAuth` reads the context value directly, so stubbing the
 * provider value is enough — no network involved.
 */
function renderGuard(authValue, { path = '/admin/dashboard', roles } = {}) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProtectedRoute roles={roles} />}>
            <Route
              path={path}
              element={<p>secret screen</p>}
            />
          </Route>
          <Route path="/login" element={<p>login screen</p>} />
          <Route path="/unauthorized" element={<p>denied screen</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

const base = {
  user: null,
  status: 'anonymous',
  isAuthenticated: false,
  isLoading: false,
  bootstrapError: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}

const teacher = {
  ...base,
  user: { id: 1, username: 'tina', role: 'teacher', fullName: 'Tina Teacher' },
  status: 'authenticated',
  isAuthenticated: true,
}

const admin = {
  ...teacher,
  user: { id: 9, username: 'ada', role: 'admin', fullName: 'Ada Admin' },
}

describe('ProtectedRoute', () => {
  it('renders the screen for an authenticated user with the right role', () => {
    renderGuard(teacher, { roles: ['teacher'] })
    expect(screen.getByText('secret screen')).toBeInTheDocument()
  })

  it('sends anonymous visitors to /login', () => {
    renderGuard(base)
    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('secret screen')).not.toBeInTheDocument()
  })

  it('blocks the wrong role with /unauthorized', () => {
    renderGuard(teacher, { roles: ['admin'] })
    expect(screen.getByText('denied screen')).toBeInTheDocument()
    expect(screen.queryByText('secret screen')).not.toBeInTheDocument()
  })

  it('shows a loading state while the session is still restoring', () => {
    renderGuard({ ...base, status: 'loading', isLoading: true })
    // Neither the screen nor the login redirect — avoids a layout flash.
    expect(screen.queryByText('secret screen')).not.toBeInTheDocument()
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
    expect(
      screen.getByText(/restoring your session/i)
    ).toBeInTheDocument()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('allows any of several listed roles', () => {
    renderGuard(teacher, { roles: ['teacher', 'admin'] })
    expect(screen.getByText('secret screen')).toBeInTheDocument()
  })

  it('allows an admin through an admin-only route', () => {
    renderGuard(admin, { roles: ['admin'] })
    expect(screen.getByText('secret screen')).toBeInTheDocument()
  })

  it('accepts every role when no restriction is passed', () => {
    renderGuard(teacher)
    expect(screen.getByText('secret screen')).toBeInTheDocument()
  })

  it('treats an authenticated user with no role as unauthorized, not allowed', () => {
    // Guards against a malformed profile silently passing the check.
    renderGuard(
      {
        ...base,
        user: { id: 5, username: 'x', role: null },
        isAuthenticated: true,
        status: 'authenticated',
      },
      { roles: ['admin'] }
    )
    expect(screen.getByText('denied screen')).toBeInTheDocument()
  })

  it('is a UX gate only — the real authorization is enforced by Django', () => {
    // Documents the contract so nobody assumes this is a security boundary.
    renderGuard(teacher, { roles: ['admin'] })
    expect(screen.getByText('denied screen')).toBeInTheDocument()
  })
})
