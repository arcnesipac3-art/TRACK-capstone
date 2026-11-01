import ErrorMessage from '../../components/ErrorMessage'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatCardSkeleton from '../../components/loading/StatCardSkeleton'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import useFetch from '../../hooks/useFetch'
import { formatNumber } from '../../utils/format'
import { useState } from 'react'
import Button from '../../components/Button'
import './RegistrarEnrollment.css'

const QUEUE = '/admin/enrollment/applications'

/**
 * The eight figures the Registrar watches every day, worst first: the work
 * waiting on the office comes before the work already finished.
 *
 * `queues: true` turns a tile into a link into the applications queue, filtered
 * to that status and to the same school year the figure was counted in, so the
 * list a tile opens always matches the number on it. The two tiles left plain
 * are derived from rows the queue has no filter for: documents awaiting
 * verification, and enrollment records rather than applications.
 */
const STATS = [
  {
    key: 'under_review',
    label: 'Under review',
    icon: 'inbox',
    status: 'under_review',
    queues: true,
  },
  {
    key: 'awaiting_corrections',
    label: 'Awaiting corrections',
    tone: 'amber',
    icon: 'undo',
    status: 'incomplete',
    queues: true,
  },
  {
    key: 'pending_documents',
    label: 'Pending document verification',
    tone: 'amber',
    icon: 'file',
  },
  {
    key: 'submitted',
    label: 'Submitted',
    icon: 'clipboard',
    status: 'submitted',
    queues: true,
  },
  {
    key: 'accepted',
    label: 'Accepted',
    tone: 'green',
    icon: 'checkCircle',
    status: 'accepted',
    queues: true,
  },
  {
    key: 'enrolled',
    label: 'Enrolled',
    tone: 'green',
    icon: 'gradCap',
    status: 'enrolled',
    queues: true,
  },
  {
    key: 'confirmed_enrollments',
    label: 'Confirmed enrollments',
    tone: 'green',
    icon: 'users',
  },
  {
    key: 'total_applications',
    label: 'Total applications',
    icon: 'chart',
    queues: true,
  },
]

/** Utilisation bar width as a 0–100 percentage, clamped. */
function utilization(assigned, capacity) {
  if (!capacity) return null
  return Math.max(0, Math.min(100, Math.round((assigned / capacity) * 100)))
}

/** Queue link for one figure, in the school year that figure was counted in. */
function queueHref(status, scope) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (scope) params.set('school_year', scope)
  const query = params.toString()
  return query ? `${QUEUE}?${query}` : QUEUE
}

/**
 * `open_periods` is a count of every open period, not just the chosen year, so
 * it says so instead of reading as part of the scope above it.
 */
function periodsNote(count) {
  if (!count) return 'No enrollment period is open, in this or any other year.'
  const subject =
    count === 1
      ? 'One enrollment period is'
      : `${formatNumber(count)} enrollment periods are`
  return `${subject} open, counted across every school year.`
}

/**
 * Registrar overview: application counts per status, section occupancy and
 * applications per grade level, all from GET /enrollment/dashboard/.
 *
 * Opens on the active school year — the server only reports section occupancy
 * for a year — and every tile that the applications queue can filter to links
 * there with the same scope.
 *
 * Loading and error states never render zeros — a failed request shows the
 * error with a retry instead of fabricated figures.
 */
export default function RegistrarDashboard() {
  const [picked, setPicked] = useState(null)

  const years = useFetch('/school-years/', { list: true })
  const schoolYears = years.data || []
  // Section occupancy only comes with a school year, so the page arrives on the
  // active year instead of on an empty table. `null` means nobody has chosen
  // yet; `''` is the registrar asking for every year on purpose.
  const activeYear = schoolYears.find((y) => y.is_active)
  const scope = picked === null ? (activeYear ? String(activeYear.id) : '') : picked

  const { data, loading, error, reload } = useFetch('/enrollment/dashboard/', {
    params: scope ? { school_year: scope } : {},
  })

  const stats = data
  const sections = data?.sections
  const scopeLabel = scope
    ? schoolYears.find((y) => String(y.id) === scope)?.label
    : null
  // Fullest sections first: the ones a registrar still has room to place
  // students in are the ones that need no attention.
  const occupancy = (sections || [])
    .slice()
    .sort(
      (a, b) =>
        (utilization(b.assigned, b.capacity) ?? -1) -
        (utilization(a.assigned, a.capacity) ?? -1)
    )
  const grades = stats?.by_grade || []
  const gradeTotal = grades.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment Overview"
        subtitle={
          scopeLabel
            ? `Enrollment applications, document verification and confirmed enrollments for the ${scopeLabel} school year.`
            : 'Enrollment applications, document verification and confirmed enrollments across every school year.'
        }
        actions={
          <div className="field no-print" style={{ minWidth: 200 }}>
            <label htmlFor="reg-dashboard-year" className="sr-only">
              School year
            </label>
            <select
              id="reg-dashboard-year"
              className="select"
              value={scope}
              onChange={(e) => setPicked(e.target.value)}
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
      >
        {stats && typeof stats.open_periods === 'number' && (
          <p className="subtle">{periodsNote(stats.open_periods)}</p>
        )}
      </PageHeader>

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
          title="Could not load the enrollment overview"
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
                icon={s.icon}
                to={s.queues ? queueHref(s.status, scope) : undefined}
              />
            ))}
          </section>

          {sections !== undefined && (
            <Card
              title="Section occupancy"
              empty={
                occupancy.length === 0 ? (
                  <EmptyState
                    icon="building"
                    title="No sections yet"
                    message="Sections for this school year will show their occupancy here as students are assigned."
                  />
                ) : null
              }
              flush={occupancy.length > 0}
            >
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
                    {occupancy.map((row) => {
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
            </Card>
          )}

          <Card
            title="Applications by grade level"
            action={
              grades.length > 0 && (
                <span className="subtle">Share of {formatNumber(gradeTotal)}.</span>
              )
            }
            empty={
              grades.length === 0 ? (
                <EmptyState
                  icon="chart"
                  title="No applications yet"
                  message="Applications from students and parents are counted here by the grade level they apply to."
                />
              ) : null
            }
          >
            <SummaryRows
              rows={grades.map((row) => ({
                label: row.grade_level,
                value: row.total,
                total: gradeTotal,
                display: formatNumber(row.total),
                showPercent: true,
              }))}
            />
          </Card>
        </>
      )}

      {!loading && !error && !stats && (
        <EmptyState
          as="h2"
          icon="chart"
          title="No dashboard data"
          message="The server returned no figures. Try again in a moment."
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              Retry
            </Button>
          }
        />
      )}
    </div>
  )
}
