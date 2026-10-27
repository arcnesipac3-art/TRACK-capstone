import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './AuthContext'
import api, { ApiError } from '../services/api'

// Mock the whole API module so no network is touched.
vi.mock('../services/api', () => {
  class ApiError extends Error {
    constructor(message, status, details = null) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.details = details
    }
  }
  return {
    // AuthProvider restores the session with api.get('/auth/me/') so it can
    // pass an AbortSignal for the 10s timeout — mock that path, not api.me.
    // getStoredToken is read from the real sessionStorage so tests control
    // it exactly the way the app does.
    default: {
      ensureCsrf: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      me: vi.fn(),
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue({}),
      getStoredToken: () => sessionStorage.getItem('track.auth.token'),
    },
    api: {
      ensureCsrf: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      me: vi.fn(),
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue({}),
    },
    ApiError,
    API_BASE: '/api',
    getStoredToken: () => sessionStorage.getItem('track.auth.token'),
  }
})

/** Renders a probe that surfaces the live auth context. */
function Probe() {
  const auth = useAuth()
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="authenticated">{String(auth.isAuthenticated)}</p>
      <p data-testid="loading">{String(auth.isLoading)}</p>
      <p data-testid="role">{auth.user?.role ?? 'none'}</p>
      <p data-testid="fullname">{auth.user?.fullName ?? ''}</p>
      <button
        type="button"
        onClick={() => auth.login('admin', 'secret')}
      >
        sign in
      </button>
      <button type="button" onClick={() => auth.logout()}>
        sign out
      </button>
      <p data-testid="permissions">{(auth.user?.permissions || []).join(',')}</p>
      <p data-testid="super">{String(auth.user?.isSuperAdmin ?? false)}</p>
      <p data-testid="can-audit">{String(auth.can('audit.view'))}</p>
      <p data-testid="can-fees">{String(auth.can('fees.view'))}</p>
    </div>
  )
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // The provider only queries /auth/me/ when a credential exists — every
  // test here simulates a browser that has one.
  sessionStorage.setItem('track.auth.token', 'test-token')
})

afterEach(() => {
  sessionStorage.clear()
})

describe('AuthProvider', () => {
  it('starts in the loading state before the session is restored', () => {
    api.get.mockReturnValue(new Promise(() => {})) // never resolves
    renderAuth()
    expect(screen.getByTestId('loading').textContent).toBe('true')
    expect(screen.getByTestId('status').textContent).toBe('loading')
  })

  it('restores an existing session from /auth/me/', async () => {
    api.get.mockResolvedValue({
      id: 1,
      username: 'ada',
      first_name: 'Ada',
      last_name: 'Admin',
      role: 'admin',
    })
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    )
    expect(screen.getByTestId('authenticated').textContent).toBe('true')
    expect(screen.getByTestId('role').textContent).toBe('admin')
    expect(screen.getByTestId('fullname').textContent).toBe('Ada Admin')
    // The restore must go through the abortable GET, not the plain api.me().
    expect(api.get).toHaveBeenCalledWith(
      '/auth/me/',
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it('treats a 401/403 from /auth/me/ as a clean anonymous state', async () => {
    api.get.mockRejectedValue(new ApiError('Not authenticated', 401))
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    )
    expect(screen.getByTestId('authenticated').textContent).toBe('false')
  })

  it('never calls /auth/me/ when the browser holds no token', async () => {
    sessionStorage.removeItem('track.auth.token')
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    )
    // Public pages would otherwise log a 401 on every visit.
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('records a bootstrap error for a network failure instead of pretending to be signed out silently', async () => {
    api.get.mockRejectedValue(new ApiError('Cannot reach the TRACK server.', 0))
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    )
    // The status still resolves so the app is usable, not stuck loading.
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('login() stores the returned profile and marks the session authenticated', async () => {
    const user = userEvent.setup()
    api.get.mockRejectedValue(new ApiError('no session', 401))
    api.login.mockResolvedValue({
      user: {
        id: 7,
        username: 'teresa',
        first_name: 'Teresa',
        last_name: 'Reyes',
        role: 'teacher',
      },
    })
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    )

    await user.click(screen.getByText('sign in'))

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    )
    expect(api.login).toHaveBeenCalledWith('admin', 'secret')
    expect(screen.getByTestId('role').textContent).toBe('teacher')
    expect(screen.getByTestId('fullname').textContent).toBe('Teresa Reyes')
  })

  it('normalises legacy role names from the backend', async () => {
    api.get.mockResolvedValue({ id: 1, username: 'x', role: 'administrator' })
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('role').textContent).toBe('admin')
    )
  })

  it('maps an unrecognised role to null so it can never pass a role gate', async () => {
    api.get.mockResolvedValue({ id: 1, username: 'x', role: 'hacker' })
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    )
    expect(screen.getByTestId('role').textContent).toBe('none')
  })

  it('logout() clears local state even if the server call fails', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ id: 1, username: 'ada', role: 'admin' })
    api.logout.mockRejectedValue(new ApiError('network down', 0))
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true')
    )

    await user.click(screen.getByText('sign out'))

    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('false')
    )
    expect(screen.getByTestId('status').textContent).toBe('anonymous')
  })

  it('never exposes a password or token in the context value', async () => {
    api.get.mockResolvedValue({ id: 1, username: 'ada', role: 'admin' })

    // Probe that renders the context's own keys and profile shape into the
    // DOM — no outer-variable assignment during render.
    function KeysProbe() {
      const auth = useAuth()
      return (
        <>
          <p data-testid="keys">{Object.keys(auth).sort().join(',')}</p>
          <p data-testid="profile">{JSON.stringify(auth.user)}</p>
        </>
      )
    }

    render(
      <AuthProvider>
        <KeysProbe />
      </AuthProvider>
    )

    await waitFor(() =>
      expect(screen.getByTestId('profile').textContent).not.toBe('')
    )
    const keys = screen.getByTestId('keys').textContent.split(',')
    expect(keys).not.toContain('password')
    expect(keys).not.toContain('token')
    // The profile itself carries no credential fields.
    expect(screen.getByTestId('profile').textContent).not.toMatch(/password/i)
  })
})

describe('permission helpers', () => {
  it('normalizes administrator RBAC data and answers can() per key', async () => {
    api.get.mockResolvedValue({
      id: 9,
      username: 'ada',
      first_name: 'Ada',
      last_name: 'Admin',
      role: 'admin',
      is_super_admin: true,
      departments: [
        { id: 1, name: 'Super Administration', code: 'SYSADMIN', is_active: true },
      ],
      permissions: ['users.view', 'audit.view'],
    })
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    )
    expect(screen.getByTestId('super').textContent).toBe('true')
    expect(screen.getByTestId('permissions').textContent).toBe('users.view,audit.view')
    expect(screen.getByTestId('can-audit').textContent).toBe('true')
    expect(screen.getByTestId('can-fees').textContent).toBe('false')
  })

  it('holds no keys for non-administrators, even if the payload sent some', async () => {
    api.get.mockResolvedValue({
      id: 3,
      username: 'tina',
      first_name: 'Tina',
      last_name: 'Teacher',
      role: 'teacher',
      permissions: ['users.view'],
    })
    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('role').textContent).toBe('teacher')
    )
    expect(screen.getByTestId('permissions').textContent).toBe('')
    expect(screen.getByTestId('can-audit').textContent).toBe('false')
    expect(screen.getByTestId('can-fees').textContent).toBe('false')
  })
})
