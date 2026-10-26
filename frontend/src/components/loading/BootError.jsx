import { useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../Logo'
import ButtonLoader from './ButtonLoader'
import './loading.css'

/**
 * Recovery screen shown when restoring the session fails for a reason other
 * than "not signed in" (server unreachable, timeout, 5xx). Anonymous visitors
 * with no error still go to /login as before — this only replaces the silent
 * redirect that used to send people to a sign-in form they could not use.
 *
 * Never renders protected data: it is shown *instead of* the guarded outlet.
 */
export default function BootError({ message, onRetry }) {
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    if (retrying) return
    setRetrying(true)
    try {
      await onRetry?.()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="app-loader" role="alert">
      <div className="boot-error">
        <Logo size="lg" />
        <h1>We couldn&rsquo;t restore your session</h1>
        <p>{message || 'TRACK could not reach the server. Check your connection and try again.'}</p>
        <div className="boot-error-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRetry}
            disabled={retrying}
            aria-busy={retrying}
          >
            {retrying && <ButtonLoader />}
            {retrying ? 'Trying again…' : 'Try again'}
          </button>
          <Link to="/login" className="btn btn-secondary">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
