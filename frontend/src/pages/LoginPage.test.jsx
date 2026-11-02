import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LoginPage from './LoginPage'
import AuthContext from '../context/AuthContext'

const LANDMARKS = [
  '/dashboard',
  '/admin/dashboard',
  '/teacher/dashboard',
  '/student/dashboard',
  '/admin/reports',
]

/**
 * The page reads `useAuth()` and calls `navigate()` on success, so the provider
 * is forced into a known state and every route it can land on is a probe that
 * says where the visitor ended up.
 */
function renderPage(
  overrides = {},
  { entry = '/login', locationState, initialEntries } = {}
) {
  const login = vi.fn(async () => ({ role: 'teacher' }))
  const value = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login,
    ...overrides,
  }
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={initialEntries || [{ pathname: entry, state: locationState }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {LANDMARKS.map((path) => (
            <Route key={path} path={path} element={<p>landed on {path}</p>} />
          ))}
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
  return { login, value }
}

const status = () => screen.queryByText(/landed on \//)?.textContent ?? null

const failWith = (status, message) =>
  Object.assign(new Error(message), { status })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('shows the branded loader while the stored session is being checked', () => {
    renderPage({ isLoading: true })

    expect(screen.getByText('Checking your session…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Username or email' })).toBeNull()
  })

  it('keeps a signed-in visitor off the form', () => {
    renderPage({ isAuthenticated: true, user: { id: 3, role: 'teacher' } })

    expect(status()).toBe('landed on /teacher/dashboard')
  })

  it('sends a session with no profile to the role redirect', () => {
    renderPage({ isAuthenticated: true, user: null })

    expect(status()).toBe('landed on /dashboard')
  })

  it('offers sign-in and the applicant route, but no way to self-register', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Username or email' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Apply without an account/ })
    ).toHaveAttribute('href', '/enroll')
    expect(screen.getByText(/there is no sign-up form here/)).toBeInTheDocument()
  })

  it('refuses to submit an empty form and points at both fields', async () => {
    const user = userEvent.setup()
    const { login } = renderPage()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your username or email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()

    const identifier = screen.getByRole('textbox', { name: 'Username or email' })
    expect(identifier).toHaveAttribute('aria-invalid', 'true')
    expect(identifier).toHaveAttribute('aria-describedby', 'identifier-error')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'password-error')
    expect(document.getElementById('identifier-error').textContent).toContain('username or email')
  })

  it('signs in with the trimmed identifier and lands on that role’s dashboard', async () => {
    const user = userEvent.setup()
    const { login } = renderPage()

    await user.type(screen.getByRole('textbox', { name: 'Username or email' }), '  teacher1  ')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(status()).toBe('landed on /teacher/dashboard'))
    expect(login).toHaveBeenCalledWith('teacher1', 'correct horse')
  })

  it('returns the visitor to the screen that bounced them to sign-in', async () => {
    const user = userEvent.setup()
    renderPage({}, { locationState: { from: '/admin/reports' } })

    await user.type(screen.getByRole('textbox', { name: 'Username or email' }), 'ada')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(status()).toBe('landed on /admin/reports'))
  })

  it('says the credentials were wrong, not that the request failed', async () => {
    const user = userEvent.setup()
    renderPage({ login: vi.fn(async () => { throw failWith(401, 'Invalid credentials.') }) })

    await user.type(screen.getByRole('textbox', { name: 'Username or email' }), 'teacher1')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Sign-in failed. The username or password you entered is incorrect. Please try again.'
    )
    expect(status()).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()

    // The typed name stays so only the secret has to be retyped.
    expect(screen.getByRole('textbox', { name: 'Username or email' })).toHaveValue('teacher1')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('explains a blocked request differently from a wrong password', async () => {
    const user = userEvent.setup()
    renderPage({ login: vi.fn(async () => { throw failWith(403, 'CSRF failed.') }) })

    await user.type(screen.getByRole('textbox', { name: 'Username or email' }), 'teacher1')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Your browser blocked/)
  })

  it('passes any other failure through in the server’s own words', async () => {
    const user = userEvent.setup()
    renderPage({ login: vi.fn(async () => { throw failWith(500, 'School service is down.') }) })

    await user.type(screen.getByRole('textbox', { name: 'Username or email' }), 'teacher1')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('School service is down.')
  })

  it('locks the form and announces the wait while signing in', async () => {
    const user = userEvent.setup()
    let release
    renderPage({
      login: vi.fn(() => new Promise((resolve) => { release = resolve })),
    })

    await user.type(screen.getByRole('textbox', { name: 'Username or email' }), 'teacher1')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const button = screen.getByRole('button', { name: /Signing in/i })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('textbox', { name: 'Username or email' })).toBeDisabled()

    await act(async () => {
      release({ role: 'teacher' })
    })
    expect(status()).toBe('landed on /teacher/dashboard')
  })

  it('reveals the password on request and hides it again', async () => {
    const user = userEvent.setup()
    renderPage()

    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })
})
