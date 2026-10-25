import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function NotFoundPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="centered-page">
      <div className="code">404</div>
      <h1>Page not found</h1>
      <p>
        The page you are looking for does not exist or may have been moved.
      </p>
      <div className="row row-wrap" style={{ justifyContent: 'center' }}>
        <Link
          className="btn btn-primary"
          to={isAuthenticated ? '/dashboard' : '/login'}
        >
          {isAuthenticated ? 'Back to dashboard' : 'Sign in'}
        </Link>
        <Link className="btn btn-secondary" to="/">
          Go to home
        </Link>
      </div>
    </div>
  )
}
