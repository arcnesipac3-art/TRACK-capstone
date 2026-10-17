import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

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

  // Already signed in? Go straight to the correct dashboard.
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
      // 400 → bad credentials; 0 → server unreachable; other → server message
      if (err.status === 400 || err.status === 401) {
        setFormError(
          'The username or password you entered is incorrect. Please try again.'
        )
      } else if (err.status === 403) {
        setFormError(
          'Your browser blocked the sign-in request. Reload the page and try again.'
        )
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
      <aside className="auth-aside">
        <div className="aside-brand">
          <Logo variant="light" />
        </div>

        <div className="aside-copy">
          <h2>One place for requirements, attendance, and communication.</h2>
          <p>
            TRACK gives Kiwalan National High School a clear view of every
            assignment, submission and school day — from the classroom to the
            principal's office.
          </p>
          <div className="aside-points">
            <div className="aside-point">
              <span className="ap-mark" aria-hidden="true">1</span>
              Teachers post requirements and verify work.
            </div>
            <div className="aside-point">
              <span className="ap-mark" aria-hidden="true">2</span>
              Students track deadlines, submissions and attendance.
            </div>
            <div className="aside-point">
              <span className="ap-mark" aria-hidden="true">3</span>
              Parents follow their children's progress in real time.
            </div>
          </div>
        </div>

        <p className="aside-foot">
          Kiwalan National High School · Iligan City, Philippines
        </p>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Logo />
          </div>

          <h1>Welcome back</h1>
          <p className="auth-lede">
            Sign in to your TRACK account for Kiwalan National High School.
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <div className="auth-error" role="alert">
                <Icon name="info" size={17} />
                <div>
                  <strong>Sign-in failed</strong>
                  {formError}
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
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={fieldErrors.identifier ? 'true' : undefined}
                aria-describedby={
                  fieldErrors.identifier ? 'identifier-error' : undefined
                }
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
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={fieldErrors.password ? 'true' : undefined}
                  aria-describedby={
                    fieldErrors.password ? 'password-error' : undefined
                  }
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
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
              {submitting && (
                <span className="spinner spinner-sm" aria-hidden="true" />
              )}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-note">
            Accounts are issued by the school registrar. Trouble signing in?
            Contact the TRACK administrator.
            <br />
            <Link to="/" className="back-home" style={{ marginTop: 8 }}>
              <Icon name="arrowLeft" size={14} />
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
