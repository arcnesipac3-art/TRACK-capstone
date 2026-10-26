import ErrorMessage from '../../components/ErrorMessage'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatCardSkeleton from '../../components/loading/StatCardSkeleton'
import useFetch from '../../hooks/useFetch'
import { formatNumber } from '../../utils/format'
import { useState } from 'react'
import './RegistrarEnrollment.css'

/** The eight headline figures the Registrar watches every day. */
const STATS = [
  { key: 'total_applications', label: 'Total applications' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'awaiting_corrections', label: 'Awaiting corrections', tone: 'amber' },
  { key: 'accepted', label: 'Accepted', tone: 'green' },
  { key: 'enrolled', label: 'Enrolled', tone: 'green' },
  { key: 'pending_documents', label: 'Pending document verification', tone: 'amber' },
  { key: 'confirmed_enrollments', label: 'Confirmed enrollments', tone: 'green' },
]

/** Utilisation bar width as a 0–100 percentage, clamped. */
function utilization(assigned, capacity) {
  if (!capacity) return null
  return Math.max(0, Math.min(100, Math.round((assigned / capacity) * 100)))
}

/**
 * Registrar overview: application counts per status, section occupancy and
 * applications per grade level, all from GET /enrollment/dashboard/.
 *
 * Loading and error states never render zeros — a failed request shows the
 * error with a retry instead of fabricated figures.
 */
export default function RegistrarDashboard() {
  const [schoolYear, setSchoolYear] = useState('')

  const years = useFetch('/school-years/', { list: true })
  const { data, loading, error, reload } = useFetch('/enrollment/dashboard/', {
    params: schoolYear ? { school_year: schoolYear } : {},
  })

  const schoolYears = years.data || []
  const stats = data || null
  const sections = data?.sections

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Registrar Dashboard"
        subtitle="Enrollment applications, document verification and confirmed enrollments at a glance."
        actions={
          <div className="field no-print" style={{ minWidth: 200 }}>
            <label htmlFor="reg-dashboard-year" className="sr-only">
              School year
            </label>
            <select
              id="reg-dashboard-year"
              className="select"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
            >
              <option value="">All school years</option>
              {schoolYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading && !stats && (
        <div className="enr-stat-grid" aria-hidden="true">
          {STATS.map((s) => (
            <StatCardSkeleton key={s.key} />
          ))}
        </div>
      )}

      {!loading && error && (
        <ErrorMessage
          error={error}
          title="Could not load the registrar dashboard"
          onRetry={reload}
        />
      )}

      {!loading && !error && stats && (
        <>
          <section className="enr-stat-grid">
            {STATS.map((s) => (
              <StatCard
                key={s.key}
                label={s.label}
                value={formatNumber(stats[s.key])}
                tone={s.tone}
              />
            ))}
          </section>

          {sections !== undefined && (
            <section className="card">
              <div className="card-header">
                <h2>Section occupancy</h2>
                {!schoolYear && (
                  <span className="subtle">Pick a school year to see its sections.</span>
                )}
              </div>
              {sections && sections.length > 0 ? (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Section</th>
                        <th scope="col">Grade level</th>
                        <th scope="col">Capacity</th>
                        <th scope="col">Assigned</th>
                        <th scope="col">Available</th>
                        <th scope="col">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map((row) => {
                        const pct = utilization(row.assigned, row.capacity)
                        return (
                          <tr key={row.section_id}>
                            <td data-label="Section" className="cell-main">
                              {row.section}
                            </td>
                            <td data-label="Grade level">{row.grade_level}</td>
                            <td data-label="Capacity">
                              {row.capacity ?? <span className="subtle">No limit</span>}
                            </td>
                            <td data-label="Assigned">{formatNumber(row.assigned)}</td>
                            <td data-label="Available">
                              {row.available ?? <span className="subtle">—</span>}
                            </td>
                            <td data-label="Utilization">
                              {pct === null ? (
                                <span className="subtle">—</span>
                              ) : (
                                <span className="util-cell">
                                  <span className="util-track">
                                    <span
                                      className={`util-fill${
                                        pct >= 100
                                          ? ' is-full'
                                          : pct >= 85
                                            ? ' is-high'
                                            : ''
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </span>
                                  <span className="util-pct">{pct}%</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card-body">
                  <p className="subtle">
                    {schoolYear
                      ? 'No sections exist for this school year yet.'
                      : 'Select a school year to see section occupancy.'}
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <h2>Applications by grade level</h2>
            </div>
            <div className="card-body">
              {(stats.by_grade || []).length === 0 ? (
                <p className="subtle">No applications yet.</p>
              ) : (
                (() => {
                  const max = Math.max(...stats.by_grade.map((row) => row.total), 1)
                  return (
                    <div>
                      {stats.by_grade.map((row) => (
                        <div className="grade-row" key={row.grade_level_id ?? row.grade_level}>
                          <span className="grade-name">{row.grade_level}</span>
                          <span className="grade-track">
                            <span style={{ width: `${Math.round((row.total / max) * 100)}%` }} />
                          </span>
                          <span className="grade-total">{formatNumber(row.total)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()
              )}
            </div>
          </section>
        </>
      )}

      {!loading && !error && !stats && (
        <EmptyState
          icon="chart"
          title="No dashboard data"
          message="The server returned no figures. Try again in a moment."
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
              Retry
            </button>
          }
        />
      )}
    </div>
  )
}
