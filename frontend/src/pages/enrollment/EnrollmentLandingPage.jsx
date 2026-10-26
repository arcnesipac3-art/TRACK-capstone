import { Link, useNavigate } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import { ListSkeleton, TableSkeleton } from '../../components/loading'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import useFetch from '../../hooks/useFetch'
import { applicationStatus, periodStatus } from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import './EnrollmentPages.css'

function toResults(data) {
  if (Array.isArray(data)) return data
  return (data && data.results) || []
}

/** Applicant enrollment home: open periods + this account's applications. */
export default function EnrollmentLandingPage() {
  const navigate = useNavigate()

  const {
    data: appData,
    loading,
    error,
    reload,
  } = useFetch('/enrollment/applications/my/', { params: { page_size: 50 } })

  const {
    data: periodData,
    loading: periodsLoading,
    error: periodsError,
    reload: reloadPeriods,
  } = useFetch('/enrollment/periods/')

  const applications = toResults(appData)
  const openPeriods = toResults(periodData).filter((p) => p.is_accepting_applications)

  function startApplication(period) {
    navigate(`new?period=${period.id}`, { state: { periodId: period.id } })
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment"
        subtitle="Start an application for the open school year and follow it through the Registrar's review."
      />

      <section className="card">
        <header className="card-header">
          <h2>Open enrollment periods</h2>
        </header>
        <div className="card-body">
          {periodsLoading && !periodData && (
            <ListSkeleton items={2} lines={2} label="Loading enrollment periods…" />
          )}

          {!periodsLoading && periodsError && (
            <ErrorMessage
              error={periodsError}
              title="Could not load enrollment periods"
              onRetry={reloadPeriods}
            />
          )}

          {!periodsLoading && !periodsError && openPeriods.length === 0 && (
            <EmptyState
              icon="calendar"
              title="No open enrollment periods"
              message="New application windows will appear here as soon as the Registrar opens them."
            />
          )}

          {!periodsLoading && !periodsError && openPeriods.length > 0 && (
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
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => startApplication(period)}
                    >
                      Start an application
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2>My applications</h2>
        </header>

        {loading && !appData && (
          <TableSkeleton
            headers={['Reference', 'Grade', 'School year', 'Status', 'Submitted', 'Actions']}
            rows={4}
            label="Loading your applications…"
          />
        )}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load your applications"
              onRetry={reload}
            />
          </div>
        )}

        {!loading && !error && applications.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="gradCap"
              title="No applications yet"
              message="When you start an application from an open enrollment period, it will show up here."
            />
          </div>
        )}

        {!loading && !error && applications.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Grade</th>
                  <th>School year</th>
                  <th>Status</th>
                  <th>Missing documents</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const status = applicationStatus(app.status)
                  const missing = (app.missing_documents || []).length
                  return (
                    <tr key={app.id}>
                      <td data-label="Reference" className="cell-main">
                        {app.reference}
                      </td>
                      <td data-label="Grade">{app.grade_level_name}</td>
                      <td data-label="School year">{app.school_year_label}</td>
                      <td data-label="Status">
                        <StatusBadge label={status.label} tone={status.tone} />
                      </td>
                      <td data-label="Missing documents">
                        {missing > 0 ? (
                          <StatusBadge
                            label={`${missing} missing`}
                            tone="amber"
                            title={ (app.missing_documents || []).join(', ') }
                          />
                        ) : (
                          <span className="subtle">None</span>
                        )}
                      </td>
                      <td data-label="Submitted">
                        {app.submitted_at ? formatDateTime(app.submitted_at) : <span className="subtle">—</span>}
                      </td>
                      <td data-label="Actions">
                        <div className="row row-wrap" style={{ gap: 8 }}>
                          <Link className="btn btn-secondary btn-xs" to={`applications/${app.id}`}>
                            View
                          </Link>
                          {app.status === 'draft' && (
                            <Link className="btn btn-primary btn-xs" to={`new?application=${app.id}`}>
                              Continue draft
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
