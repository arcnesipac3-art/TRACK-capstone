import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import { ListSkeleton } from '../../components/loading'
import StatusBadge from '../../components/StatusBadge'
import useFetch from '../../hooks/useFetch'
import { periodStatus } from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import './EnrollmentPages.css'

function toResults(data) {
  if (Array.isArray(data)) return data
  return (data && data.results) || []
}

/**
 * Public enrollment home (/enroll). Anyone can see the open periods and start
 * or track an application — no account, no sign-in. Accounts are only created
 * after the Registrar confirms the enrollment.
 */
export default function PublicEnrollPage() {
  const {
    data: periodData,
    loading,
    error,
    reload,
  } = useFetch('/enrollment/periods/')

  const openPeriods = toResults(periodData).filter((p) => p.is_accepting_applications)

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
        <div className="row row-wrap" style={{ gap: 10 }}>
          <Link className="btn btn-primary" to="/enroll/apply">
            Start an Application
          </Link>
          <Link className="btn btn-secondary" to="/enroll/track">
            Track My Application
          </Link>
        </div>
        <p className="enr-hero-note">
          You only create an account AFTER your enrollment is confirmed.
        </p>
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
            <div className="alert alert-info" role="alert">
              <Icon name="info" size={16} />
              <span className="grow">
                We could not load the enrollment periods right now. You can still
                start or track an application below.
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={reload}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && openPeriods.length === 0 && (
            <EmptyState
              icon="calendar"
              title="No open enrollment periods"
              message="New application windows will appear here as soon as the Registrar opens them. You can still track an application you already submitted."
              action={
                <Link className="btn btn-secondary btn-sm" to="/enroll/track">
                  Track My Application
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
                    <div className="row row-wrap" style={{ alignItems: 'center' }}>
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

      <p className="subtle" style={{ textAlign: 'center' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
