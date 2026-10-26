import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import { TableSkeleton } from '../../components/loading'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  APPLICATION_STATUS,
  ENROLLMENT_TYPES,
  applicationStatus,
} from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import './EnrollmentPages.css'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(APPLICATION_STATUS).map(([value, config]) => ({
    value,
    label: config.label,
  })),
]

/** Full, filterable list of this account's enrollment applications. */
export default function MyApplicationsPage() {
  const [status, setStatus] = useState('')
  const [schoolYear, setSchoolYear] = useState('')
  const [years, setYears] = useState([])

  useEffect(() => {
    let cancelled = false
    api
      .list('/school-years/')
      .then((rows) => {
        if (!cancelled) setYears(rows)
      })
      .catch(() => {
        if (!cancelled) setYears([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { data, loading, error, reload } = useFetch(
    '/enrollment/applications/my/',
    { list: true }
  )

  const rows = (data || []).filter(
    (app) =>
      (!status || app.status === status) &&
      (!schoolYear || String(app.school_year) === String(schoolYear))
  )

  const hasFilters = Boolean(status || schoolYear)

  return (
    <div className="stack stack-md">
      <PageHeader
        title="My applications"
        subtitle="Every enrollment application this account has started, with its current status."
        actions={
          <Link className="btn btn-primary btn-sm" to="new">
            Start a new application
          </Link>
        }
      />

      <section className="card">
        <div className="card-body">
          <div className="row row-wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 200 }}>
              <label htmlFor="apps-status">Status</label>
              <select
                id="apps-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow" style={{ minWidth: 180 }}>
              <label htmlFor="apps-year">School year</label>
              <select
                id="apps-year"
                className="select"
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
              >
                <option value="">All school years</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setStatus('')
                  setSchoolYear('')
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        {loading && !data && (
          <TableSkeleton
            headers={['Reference', 'Grade', 'School year', 'Type', 'Status', 'Missing docs', 'Submitted', 'Actions']}
            rows={6}
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

        {!loading && !error && rows.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="gradCap"
              title={hasFilters ? 'No matching applications' : 'No applications yet'}
              message={
                hasFilters
                  ? 'Try a different status or school year.'
                  : 'Start an application from an open enrollment period and it will appear here.'
              }
            />
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Grade</th>
                  <th>School year</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Missing docs</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => {
                  const badge = applicationStatus(app.status)
                  const missing = (app.missing_documents || []).length
                  return (
                    <tr key={app.id}>
                      <td data-label="Reference" className="cell-main">
                        {app.reference}
                      </td>
                      <td data-label="Grade">
                        {app.grade_level_name}
                        {app.strand ? ` — ${app.strand}` : ''}
                      </td>
                      <td data-label="School year">{app.school_year_label}</td>
                      <td data-label="Type">
                        {ENROLLMENT_TYPES[app.enrollment_type] || app.enrollment_type}
                      </td>
                      <td data-label="Status">
                        <StatusBadge label={badge.label} tone={badge.tone} />
                      </td>
                      <td data-label="Missing docs">
                        {missing > 0 ? (
                          <StatusBadge label={`${missing} missing`} tone="amber" />
                        ) : (
                          <span className="subtle">None</span>
                        )}
                      </td>
                      <td data-label="Submitted">
                        {app.submitted_at ? (
                          formatDateTime(app.submitted_at)
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div className="row row-wrap" style={{ gap: 8 }}>
                          <Link
                            className="btn btn-secondary btn-xs"
                            to={`applications/${app.id}`}
                          >
                            View
                          </Link>
                          {app.status === 'draft' && (
                            <Link
                              className="btn btn-primary btn-xs"
                              to={`new?application=${app.id}`}
                            >
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
