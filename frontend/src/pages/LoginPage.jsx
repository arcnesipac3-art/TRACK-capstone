import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

/** Role cards shown in the aside panel. */
const ROLES = [
  {
    icon: 'gradCap',
    label: 'Students',
    description: 'Track deadlines, submissions and daily attendance.',
  },
  {
    icon: 'book',
    label: 'Teachers',
    description: 'Post requirements, record attendance and verify work.',
  },
  {
    icon: 'users',
    label: 'Parents',
    description: "Follow your child's progress and school announcements.",
  },
  {
    icon: 'shield',
    label: 'Administrators',
    description: 'Manage users, fees, schedules and school-wide reports.',
  },
]

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const from = location.state?.from

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(from || dashboardPath(user.role), { replace: true })
    }
  }, [isAuthenticated, user, from, navigate])

  if (isLoading) {
    return (
      <div className="centered-page" role="status" aria-live="polite">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <span>Checking your session…</span>
      </div>
    )
  }
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  function validate() {
    const errors = {}
    if (!identifier.trim()) errors.identifier = 'Enter your username or email.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    setSubmitting(true)
    try {
      const profile = await login(identifier.trim(), password)
      navigate(from || dashboardPath(profile.role), { replace: true })
    } catch (err) {
      if (err.status === 400 || err.status === 401) {
        setFormError('The username or password you entered is incorrect. Please try again.')
      } else if (err.status === 403) {
        setFormError('Your browser blocked the sign-in request. Reload the page and try again.')
      } else {
        setFormError(err.message)
      }
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout">
      {/* ── Left panel ──────────────────────────────────────────────── */}
      <aside className="auth-aside">
        <div className="aside-brand">
          <Logo variant="light" size="lg" />
          <p className="aside-school">Kiwalan National High School</p>
        </div>

        <div className="aside-copy">
          <p className="aside-tagline">
            Tracking Requirements, Attendance &amp; Communication for KNHS
          </p>

          <div className="aside-roles">
            {ROLES.map((role) => (
              <div className="aside-role-card" key={role.label}>
                <span className="aside-role-icon" aria-hidden="true">
                  <Icon name={role.icon} size={17} />
                </span>
                <div>
                  <div className="aside-role-label">{role.label}</div>
                  <div className="aside-role-desc">{role.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="aside-foot">Iligan City, Philippines</p>
      </aside>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Logo />
          </div>

          <div className="auth-heading">
            <h1>Welcome back</h1>
            <p className="auth-lede">Sign in to your TRACK account.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <div className="auth-error" role="alert">
                <span className="auth-error-icon" aria-hidden="true">
                  <Icon name="info" size={16} />
                </span>
                <div>
                  <strong>Sign-in failed.</strong>
                  <span> {formError}</span>
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="identifier">Username or email</label>
              <input
                id="identifier"
                name="username"
                className="input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                placeholder="e.g. teacher1 or name@knhs.edu.ph"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={fieldErrors.identifier ? 'true' : undefined}
                aria-describedby={fieldErrors.identifier ? 'identifier-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.identifier && (
                <span className="field-error" id="identifier-error">
                  <Icon name="info" size={13} />
                  {fieldErrors.identifier}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  name="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={fieldErrors.password ? 'true' : undefined}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? 'close' : 'eye'} size={16} />
                </button>
              </div>
              {fieldErrors.password && (
                <span className="field-error" id="password-error">
                  <Icon name="info" size={13} />
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting && <span className="spinner spinner-sm" aria-hidden="true" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="auth-divider" aria-hidden="true" />

          <p className="auth-note">
            Accounts are issued by the school registrar. Trouble signing in? Contact the TRACK administrator.
          </p>
          <Link to="/" className="back-home">
            <Icon name="arrowLeft" size={14} />
            Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}
