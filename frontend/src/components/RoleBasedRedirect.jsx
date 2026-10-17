import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

/** Sends an authenticated user to the dashboard that matches their role. */
export default function RoleBasedRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={dashboardPath(user.role)} replace />
}
