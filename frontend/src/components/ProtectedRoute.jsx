import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppLoader from './loading/AppLoader'
import BootError from './loading/BootError'

/**
 * Gate for every authenticated screen.
 *
 * - while the session is being restored → the branded loading screen (no
 *   layout jump, and no dashboard flash before authorization resolves),
 * - the session check failed outright   → an actionable recovery screen,
 * - anonymous visitors                  → /login (remembering where they went),
 * - wrong role for this branch          → /unauthorized,
 * - `permission` not held (admin)       → /unauthorized.
 *
 * This is UX only: Django enforces the real authorization on every request.
 */
export default function ProtectedRoute({ roles, permission }) {
  const { isAuthenticated, isLoading, user, can, bootstrapError, refreshUser } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AppLoader label="Restoring your session…" />
  }

  if (!isAuthenticated) {
    // The request never reached the server (offline, timeout, 5xx): sending
    // people to a sign-in form they cannot complete hides the real problem.
    if (bootstrapError) {
      return <BootError message={bootstrapError} onRetry={refreshUser} />
    }
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (permission && !can(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
