import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { dashboardPath, roleLabel } from '../utils/format'

export default function UnauthorizedPage() {
  const { user, isAuthenticated } = useAuth()

  return (
    <div className="centered-page">
      <span className="empty-icon" aria-hidden="true"
        style={{ width: 56, height: 56, display: 'grid', placeItems: 'center',
          background: 'var(--red-100)', color: 'var(--red-700)',
          borderRadius: '50%' }}>
        <Icon name="shield" size={26} />
      </span>
      <div className="code">403</div>
      <h1>Access denied</h1>
      <p>
        Your account{isAuthenticated ? ` (${roleLabel(user.role)})` : ''} does
        not have permission to open that page. If you think this is a mistake,
        contact the school administrator.
      </p>
      <div className="row row-wrap" style={{ justifyContent: 'center' }}>
        <Link className="btn btn-primary" to={isAuthenticated ? dashboardPath(user.role) : '/login'}>
          {isAuthenticated ? 'Back to my dashboard' : 'Sign in'}
        </Link>
        <Link className="btn btn-secondary" to="/">
          Go to home
        </Link>
      </div>
    </div>
  )
}
