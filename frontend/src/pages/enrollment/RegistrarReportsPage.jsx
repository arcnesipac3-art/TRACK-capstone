import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import CardSkeleton from '../../components/loading/CardSkeleton'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useState } from 'react'
import useFetch from '../../hooks/useFetch'
import { ENROLLMENT_TYPES, applicationStatus } from '../../utils/enrollment'
import { formatNumber } from '../../utils/format'
import './RegistrarEnrollment.css'

/**
 * Enrollment report for one school year: confirmed enrollments plus the
 * by-status, by-grade, by-type breakdowns and section occupancy, with a
 * print-friendly layout.
 */
export default function RegistrarReportsPage() {
  const yearsFetch = useFetch('/school-years/', { list: true })
  // '' means "follow the active school year" until the user picks one.
  const [schoolYear, setSchoolYear] = useState('')

  const schoolYears = yearsFetch.data || []
  // Default to the active school year as soon as the list lands.
  const activeYear =
    schoolYears.find((y) => y.is_active) || schoolYears[0] || null
  const selectedYear = schoolYear || (activeYear ? String(activeYear.id) : '')

  const { data, loading, error, reload } = useFetch(
    '/enrollment/reports/school-year/',
    {
      params: selectedYear ? { school_year: selectedYear } : {},
      enabled: Boolean(selectedYear),
    }
  )

  const denied = error?.status === 403
  const report = data || null

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment Reports"
        subtitle="Confirmed enrollments and application breakdowns per school year."
        actions={
          <>
            <div className="field no-print" style={{ minWidth: 200 }}>
              <label htmlFor="rep-year" className="sr-only">
                School year
              </label>
              <select
                id="rep-year"
                className="select"
                value={selectedYear}
                onChange={(e) => setSchoolYear(e.target.value)}
              >
                {schoolYears.length === 0 && (
                  <option value="">Choose a school year…</option>
                )}
                {schoolYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm no-print"
              onClick={() => window.print()}
              disabled={!report}
            >
              <Icon name="printer" size={14} />
              Print
            </button>
          </>
        }
      />

      {yearsFetch.loading && !yearsFetch.data && (
        <div className="report-grid">
          <TableSkeleton columns={2} rows={4} label="Loading report…" />
          <TableSkeleton columns={2} rows={4} />
        </div>
      )}

      {!yearsFetch.loading && yearsFetch.error && schoolYears.length === 0 && (
        <ErrorMessage
          error={yearsFetch.error}
          title="Could not load the school years"
          onRetry={yearsFetch.reload}
        />
      )}

      {!yearsFetch.loading && !yearsFetch.error && schoolYears.length === 0 && (
        <EmptyState
          as="h2"
          icon="calendar"
          title="No school years yet"
          message="Create a school year first — reports are produced per school year."
        />
      )}

      {/* Everything below keys off `selectedYear`, not the raw state: the
          first render defaults to the active school year on purpose, so
          gating on `schoolYear` would hide a report that is already loading. */}
      {selectedYear && loading && !report && (
        <div className="report-grid">
          <TableSkeleton columns={2} rows={5} label="Loading report…" />
          <TableSkeleton columns={2} rows={5} />
        </div>
      )}

      {selectedYear && !loading && denied && (
        <EmptyState
          as="h2"
          icon="shield"
          title="You don't have permission"
          message="This screen needs the enrollment.view permission. Ask an administrator to grant it to your account."
        />
      )}

      {selectedYear && !loading && !denied && error && (
        <ErrorMessage
          error={error}
          title="Could not build the report"
          onRetry={reload}
        />
      )}

      {selectedYear && !loading && !error && report && (
        <>
          <section className="enr-stat-grid">
            <StatCard
              label="Confirmed enrollments"
              value={formatNumber(report.confirmed_enrollments)}
              tone="green"
              hint={report.school_year?.label}
            />
          </section>

          <div className="report-grid">
            <section className="card">
              <div className="card-header">
                <h2>By status</h2>
              </div>
              {(report.by_status || []).length === 0 ? (
                <div className="card-body">
                  <p className="subtle">No applications in this school year.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Status</th>
                        <th scope="col">Applications</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_status.map((row) => {
                        const status = applicationStatus(row.status)
                        return (
                          <tr key={row.status}>
                            <td data-label="Status" className="cell-main">
                              <StatusBadge label={status.label} tone={status.tone} />
                            </td>
                            <td data-label="Applications">
                              {formatNumber(row.total)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2>By grade level</h2>
              </div>
              {(report.by_grade || []).length === 0 ? (
                <div className="card-body">
                  <p className="subtle">No records in this school year.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Grade level</th>
                        <th scope="col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_grade.map((row) => (
                        <tr key={row.grade_level_id ?? row.grade_level}>
                          <td data-label="Grade level" className="cell-main">
                            {row.grade_level}
                          </td>
                          <td data-label="Total">{formatNumber(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2>By enrollment type</h2>
              </div>
              {(report.by_type || []).length === 0 ? (
                <div className="card-body">
                  <p className="subtle">No records in this school year.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Enrollment type</th>
                        <th scope="col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_type.map((row) => (
                        <tr key={row.enrollment_type}>
                          <td data-label="Enrollment type" className="cell-main">
                            {ENROLLMENT_TYPES[row.enrollment_type] ||
                              row.enrollment_type ||
                              '—'}
                          </td>
                          <td data-label="Total">{formatNumber(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2>Section occupancy</h2>
              </div>
              {(report.sections || []).length === 0 ? (
                <div className="card-body">
                  <p className="subtle">No sections in this school year.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Section</th>
                        <th scope="col">Grade level</th>
                        <th scope="col">Capacity</th>
                        <th scope="col">Assigned</th>
                        <th scope="col">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.sections.map((row) => (
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
                            {row.capacity === null || row.capacity === undefined ? (
                              <span className="subtle">—</span>
                            ) : (
                              formatNumber(Math.max(0, row.capacity - row.assigned))
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {selectedYear && !loading && !error && !report && (
        <CardSkeleton lines={3} label="Loading report…" />
      )}
    </div>
  )
}
