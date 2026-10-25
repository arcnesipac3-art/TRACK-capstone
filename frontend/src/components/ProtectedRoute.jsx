import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

/**
 * Gate for every authenticated screen.
 *
 * - while the session is being restored → full-page spinner (no layout jump),
 * - anonymous visitors               → /login (remembering where they went),
 * - wrong role for this branch       → /unauthorized,
 * - `permission` not held (admin)    → /unauthorized.
 *
 * This is UX only: Django enforces the real authorization on every request.
 */
export default function ProtectedRoute({ roles, permission }) {
  const { isAuthenticated, isLoading, user, can } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="centered-page" role="status" aria-live="polite">
        <LoadingSpinner size="lg" label="Restoring your session…" />
      </div>
    )
  }

  if (!isAuthenticated) {
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
