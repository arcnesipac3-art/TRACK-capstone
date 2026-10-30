import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import { ListSkeleton } from '../../components/loading'
import StatusBadge from '../../components/StatusBadge'
import useFetch from '../../hooks/useFetch'
import api, { clearGuestToken, getGuestToken } from '../../services/api'
import { applicationStatus, periodStatus } from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import './EnrollmentPages.css'

function toResults(data) {
  if (Array.isArray(data)) return data
  return (data && data.results) || []
}

/** Statuses where the application is still moving through the Registrar —
 *  a guest in one of these should continue it, not start a new one (the
 *  server would refuse a second open application anyway). */
const LIVE_STATUSES = new Set([
  'draft',
  'submitted',
  'under_review',
  'incomplete',
  'resubmitted',
  'accepted',
  'waitlisted',
])

/**
 * Public enrollment home (/enroll). Anyone can see the open periods and start
 * or track an application — no account, no sign-in. Accounts are only created
 * after the Registrar confirms the enrollment.
 *
 * A returning guest (one holding a stored application token) is offered
 * "Continue your application" instead of a Start button that could only be
 * refused by the one-open-application rule.
 */
export default function PublicEnrollPage() {
  const {
    data: periodData,
    loading,
    error,
    reload,
  } = useFetch('/enrollment/periods/')

  // undefined = not checked yet · null = no (usable) guest application.
  // The initial value is derived from storage during render, so the effect
  // below only ever runs the request for a real guest (no sync setState).
  const [guestApp, setGuestApp] = useState(() =>
    getGuestToken() ? undefined : null,
  )

  useEffect(() => {
    if (!getGuestToken()) return undefined
    let active = true
    api
      .get('/enrollment/applications/my/', { params: { page_size: 1 } })
      .then((res) => {
        if (!active) return
        const first = res && Array.isArray(res.results) ? res.results[0] : null
        setGuestApp(first || null)
      })
      .catch((err) => {
        if (!active) return
        // Only a rejected credential is stale; a network blip must never
        // destroy a guest's only access to their application.
        if (err && (err.status === 401 || err.status === 403)) clearGuestToken()
        setGuestApp(null)
      })
    return () => {
      active = false
    }
  }, [])

  const openPeriods = toResults(periodData).filter((p) => p.is_accepting_applications)
  const canContinue = Boolean(guestApp && LIVE_STATUSES.has(guestApp.status))
  const guestBadge = guestApp ? applicationStatus(guestApp.status) : null

  return (
    <div className="stack stack-md">
      <section className="enr-hero" aria-labelledby="enroll-heading">
        <p className="enr-hero-eyebrow">Public enrollment portal</p>
        <h1 id="enroll-heading">Enroll at Kiwalan NHS — no account needed to apply.</h1>
        <p className="enr-hero-lede">
          Submit a new enrollment application online and follow its progress with
          your reference number. You only create an account AFTER your enrollment
          is confirmed.
        </p>
        <div className="row row-wrap gap-sm">
          {canContinue ? (
            <Link
              className="btn btn-primary"
              to={`/enroll/applications/${guestApp.id}`}
            >
              Continue your application
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/enroll/apply">
              Start an application
            </Link>
          )}
          <Link className="btn btn-secondary" to="/enroll/track">
            Track my application
          </Link>
        </div>
        {guestApp && (
          <p className="enr-hero-note">
            Application <strong>{guestApp.reference}</strong>{' '}
            <StatusBadge label={guestBadge.label} tone={guestBadge.tone} /> —{' '}
            <Link to={`/enroll/applications/${guestApp.id}`}>
              {canContinue ? 'pick up where you left off' : 'view it'}
            </Link>
          </p>
        )}
        {!guestApp && (
          <p className="enr-hero-note">
            You only create an account AFTER your enrollment is confirmed.
          </p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Open enrollment periods</h2>
        </header>
        <div className="card-body">
          {loading && !periodData && (
            <ListSkeleton items={2} lines={2} label="Loading enrollment periods…" />
          )}

          {!loading && error && (
            <ErrorMessage
              error={error}
              title="Could not load enrollment periods"
              onRetry={reload}
            />
          )}

          {!loading && !error && openPeriods.length === 0 && (
            <EmptyState
              icon="calendar"
              title="No open enrollment periods"
              message="New application windows will appear here as soon as the Registrar opens them. You can still track an application you already submitted."
              action={
                <Link className="btn btn-secondary btn-sm" to="/enroll/track">
                  Track my application
                </Link>
              }
            />
          )}

          {!loading && !error && openPeriods.length > 0 && (
            <div className="enr-grid">
              {openPeriods.map((period) => {
                const status = periodStatus(period.status)
                return (
                  <div className="enr-period-card" key={period.id}>
                    <div className="row row-wrap">
                      <h3 className="enr-period-title grow">{period.name}</h3>
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                    <span className="subtle">{period.school_year_label}</span>
                    <span className="subtle">
                      <Icon name="calendar" size={13} />{' '}
                      {formatDateTime(period.opens_at)} – {formatDateTime(period.closes_at)}
                    </span>
                    <Link
                      className="btn btn-primary btn-sm"
                      to={`/enroll/apply?period=${period.id}`}
                    >
                      Start an application
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <p className="subtle text-center">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
