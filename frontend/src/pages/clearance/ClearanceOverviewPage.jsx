import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ButtonLink from '../../components/ButtonLink'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { daysUntil, overallStatus, periodStatus } from '../../utils/clearance'
import { formatDateTime, formatRelative } from '../../utils/format'
import './Clearance.css'

/**
 * How much of a period is finished, office by office.
 *
 * One period at a time on purpose: two terms averaged into one percentage is
 * how the number stops meaning anything, so the school-year figure is read as
 * many single-period figures.
 */
export default function ClearanceOverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = useAuth()
  const canManage = can('clearance.manage')
  const canVerify = can('clearance.verify')

  const periods = useFetch('/clearance/periods/', { list: true })
  const [chosen, setChosen] = useState(searchParams.get('period') || '')

  const list = useMemo(() => periods.data || [], [periods.data])
  // The period that is actually running is the one worth opening first; a
  // school with three drafted terms should not land on an empty set of figures.
  const suggested = useMemo(
    () => list.find((period) => period.status === 'active')?.id || list[0]?.id || '',
    [list]
  )
  const periodId = chosen || (periods.data ? suggested : '')

  useEffect(() => {
    if (periodId) setSearchParams({ period: periodId }, { replace: true })
  }, [periodId, setSearchParams])

  const read = useFetch('/clearance/dashboard/', {
    params: { period: periodId },
    enabled: Boolean(periodId),
  })
  const activity = useFetch('/clearance/activity/', {
    params: { period: periodId },
    enabled: Boolean(periodId),
  })

  const figures = read.data
  const watch = figures?.deadline_watch || []
  const statusMeta = periodStatus(figures?.period?.status)

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Clearance Overview"
        subtitle="One period at a time: how far the learners have come, and which office is holding the line."
        actions={
          <>
            <div className="field">
              <label htmlFor="clr-ov-period" className="subtle">
                Period
              </label>
              <select
                id="clr-ov-period"
                className="select"
                value={periodId || ''}
                onChange={(event) => setChosen(event.target.value)}
              >
                {list.length === 0 && <option value="">No periods yet</option>}
                {list.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </div>
            {canManage && (
              <ButtonLink variant="secondary" size="sm" to="/admin/clearance/periods">
                <Icon name="calendar" size={14} />
                Configure
              </ButtonLink>
            )}
          </>
        }
      />

      {read.loading && !figures && (
        <Card loading title="Figures">
          <span className="subtle">Reading this period…</span>
        </Card>
      )}

      {!read.loading && read.error && (
        <ErrorMessage error={read.error} title="Could not read this period" onRetry={read.reload} />
      )}

      {figures && (
        <>
          <div className="kpi-grid">
            <StatCard
              label="Learners in this period"
              value={figures.total}
              hint={`${figures.filtered_total ?? figures.total} match the filters on the learner list`}
              icon="gradCap"
            />
            <StatCard
              label="Cleared"
              value={figures.cleared}
              tone="green"
              hint={`${figures.completion_percent}% of ${figures.total || 0}`}
              icon="checkCircle"
            />
            <StatCard
              label="Ready for final approval"
              value={figures.ready_for_final}
              tone="amber"
              hint="Every office has signed off"
              icon="shield"
            />
            <StatCard
              label="Still with a department"
              value={figures.in_progress}
              tone="blue"
              hint="Including the learners who have not started"
              icon="clock"
            />
            <StatCard
              label="Obligations outstanding"
              value={figures.open_obligations}
              tone={figures.open_obligations ? 'amber' : 'default'}
              hint={`${figures.waived_obligations} waived on record`}
              icon="alertTriangle"
            />
          </div>

          <div className="row row-wrap gap-sm">
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            <span className="subtle">
              {figures.period?.school_year_label} · closes {formatDateTime(figures.period?.closes_at)}
              {figures.period && daysUntil(figures.period.closes_at) !== null
                ? ` · ${daysUntil(figures.period.closes_at)} day(s) left`
                : ''}
            </span>
            <Link className="clr-chip" to={`/admin/clearance/learners?period=${figures.period?.id}`}>
              <Icon name="list" size={14} />
              All learners in this period
            </Link>
            {canVerify && (
              <Link className="clr-chip" to="/admin/clearance/queue">
                <Icon name="inbox" size={14} />
                My department queue
              </Link>
            )}
          </div>

          <section className="clr-setup">
            <div className="stack stack-md">
              <Card
                title="Department progress"
                flush={(figures.departments || []).length > 0}
              >
                {(figures.departments || []).length === 0 ? (
                  <EmptyState
                    icon="building"
                    title="No departments configured"
                    message="Add the offices that must sign a learner off before activating this period."
                    action={
                      canManage && (
                        <ButtonLink
                          variant="primary"
                          size="sm"
                          to={`/admin/clearance/periods/${figures.period?.id}`}
                        >
                          Configure this period
                        </ButtonLink>
                      )
                    }
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="table responsive-table">
                      <thead>
                        <tr>
                          <th scope="col">Department</th>
                          <th scope="col">Signed off</th>
                          <th scope="col">Awaiting</th>
                          <th scope="col">Corrections</th>
                          <th scope="col">Rejected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {figures.departments.map((department) => (
                          <tr key={department.id}>
                            <td data-label="Department" className="cell-main">
                              <Link
                                to={`/admin/clearance/learners?period=${figures.period?.id}&department=${department.id}`}
                              >
                                {department.department}
                              </Link>
                              <span className="subtle block">
                                {department.total} learner(s)
                                {department.is_required ? '' : ' · advisory office'}
                              </span>
                            </td>
                            <td data-label="Signed off">
                              <div className="progress-row">
                                <div className="pr-top">
                                  <span className="pr-label">{department.percent}%</span>
                                  <span className="pr-value">
                                    {department.approved + department.not_applicable}
                                  </span>
                                </div>
                                <div
                                  className="progress-track"
                                  role="img"
                                  aria-label={`${department.percent} percent of ${department.department}'s queue signed off`}
                                >
                                  <div
                                    className="progress-fill green"
                                    style={{ width: `${department.percent}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td data-label="Awaiting">{department.pending}</td>
                            <td data-label="Corrections">{department.needs_correction}</td>
                            <td data-label="Rejected">{department.rejected}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card
                title="Learners nearing a deadline"
                action={<span className="subtle">{watch.length} listed</span>}
                flush={watch.length > 0}
              >
                {watch.length === 0 ? (
                  <p className="subtle">
                    Nobody in this period is close to a deadline they have not met — or the
                    period has closed, in which case the remaining learners stay where they are.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="table responsive-table">
                      <thead>
                        <tr>
                          <th scope="col">Learner</th>
                          <th scope="col">Grade &amp; section</th>
                          <th scope="col">Status</th>
                          <th scope="col">Days left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {watch.map((learner) => {
                          const status = overallStatus(learner.status)
                          return (
                            <tr key={learner.id}>
                              <td data-label="Learner" className="cell-main">
                                <Link to={`/admin/clearance/learners/${learner.id}`}>
                                  {learner.learner}
                                </Link>
                              </td>
                              <td data-label="Grade & section">
                                {learner.grade_level}
                                {learner.section ? ` · ${learner.section}` : ''}
                              </td>
                              <td data-label="Status">
                                <StatusBadge label={status.label} tone={status.tone} />
                              </td>
                              <td data-label="Days left">
                                <StatusBadge
                                  tone={learner.days_left <= 2 ? 'red' : 'amber'}
                                  label={`${learner.days_left} day(s)`}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <div className="stack stack-md">
              <Card title="Where the learners stand">
                <SummaryRows
                  rows={[
                    {
                      label: 'Cleared',
                      value: figures.cleared,
                      total: figures.total,
                      tone: 'green',
                      showPercent: true,
                    },
                    {
                      label: 'Ready for final approval',
                      value: figures.ready_for_final,
                      total: figures.total,
                      tone: 'amber',
                    },
                    {
                      label: 'With a department',
                      value: figures.in_progress,
                      total: figures.total,
                      tone: 'blue',
                    },
                    {
                      label: 'Not cleared',
                      value: figures.not_cleared,
                      total: figures.total,
                      tone: 'red',
                    },
                  ]}
                />
              </Card>

              <Card
                title="By grade level"
                loading={read.loading && !figures}
                empty={
                  (figures.by_grade_level || []).length === 0 ? (
                    <p className="subtle">No records to group yet.</p>
                  ) : null
                }
              >
                <SummaryRows
                  rows={(figures.by_grade_level || []).map((row) => ({
                    label: row.grade_level,
                    value: row.cleared,
                    total: row.total,
                    tone: 'green',
                    display: `${row.cleared}/${row.total}`,
                  }))}
                />
              </Card>

              <Card
                title="By section"
                empty={
                  (figures.by_section || []).length === 0 ? (
                    <p className="subtle">No records to group yet.</p>
                  ) : null
                }
              >
                <SummaryRows
                  rows={(figures.by_section || []).map((row) => ({
                    label: row.section,
                    value: row.cleared,
                    total: row.total,
                    tone: 'green',
                    display: `${row.cleared}/${row.total}`,
                  }))}
                />
              </Card>

              <Card
                title="Recent clearance activity"
                loading={activity.loading && !activity.data}
                error={activity.error}
                onRetry={activity.reload}
                empty={
                  (activity.data || []).length === 0 ? (
                    <p className="subtle">Nothing has been recorded in this period yet.</p>
                  ) : null
                }
              >
                <ul className="stack stack-xs">
                  {(activity.data || []).slice(0, 12).map((event) => (
                    <li key={event.id} className="stack stack-xs">
                      <div className="row row-between">
                        <strong>{event.learner}</strong>
                        <span className="subtle">{formatRelative(event.created_at)}</span>
                      </div>
                      <span className="subtle">
                        {event.department ? `${event.department} · ` : ''}
                        {event.actor_name || 'the workflow'}
                      </span>
                      {event.note && <span>{event.note}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>
        </>
      )}

      {!read.loading && !figures && list.length === 0 && (
        <Card>
          <EmptyState
            as="h2"
            icon="calendar"
            title="No clearance periods yet"
            message={
              canManage
                ? 'Create a period, add the departments that must sign a learner off, then activate it for the grade levels it covers.'
                : 'Ask the Registrar’s office to configure a clearance period.'
            }
            action={
              canManage && (
                <ButtonLink variant="primary" size="sm" to="/admin/clearance/periods">
                  <Icon name="plus" size={15} />
                  Clearance periods
                </ButtonLink>
              )
            }
          />
        </Card>
      )}
    </div>
  )
}
