import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import useFetch from '../../hooks/useFetch'
import useServerList from '../../hooks/useServerList'
import { departmentStatus } from '../../utils/clearance'
import { deadlineInfo, formatDate, formatRelative } from '../../utils/format'
import './Clearance.css'

const PAGE_SIZE = 25

const ORDER_OPTIONS = [
  { value: '', label: 'Waiting longest first' },
  { value: 'name', label: 'Learner name A–Z' },
]

/**
 * The officer's own queue.
 *
 * Nothing on this screen is scoped by a query parameter alone: the server takes
 * the departments this person belongs to and answers with their items, so
 * changing the period or office in the filter bar can only narrow what is
 * already reachable. The summary chips come from the same membership, which is
 * why an officer with two active periods sees two rows, not one blended count.
 */
export default function ClearanceQueuePage() {
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState(() => ({
    period: searchParams.get('period') || '',
    department: searchParams.get('department') || '',
    status: searchParams.get('status') || '',
    grade_level: searchParams.get('grade_level') || '',
    section: searchParams.get('section') || '',
    order: searchParams.get('order') || '',
  }))
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [page, setPage] = useState(1)

  const options = useFetch('/clearance/options/')
  const periods = useFetch('/clearance/periods/', {
    list: true,
    params: { status: 'active' },
  })
  const summary = useFetch('/clearance/queue/summary/')
  const sections = useFetch('/sections/', { list: true })

  const list = useServerList('/clearance/queue/', {
    params: { ...filters, search, page, page_size: PAGE_SIZE },
  })

  const groups = summary.data?.groups || []
  const empty = !summary.loading && summary.data?.total === 0

  function narrow(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function focusGroup(group) {
    setFilters((prev) => ({
      ...prev,
      period: String(group.period),
      department: String(group.department),
      status: '',
    }))
    setPage(1)
  }

  const active =
    Object.values(filters).some(Boolean) || Boolean(search) || Boolean(typed)

  if (empty) {
    return (
      <div className="stack stack-md">
        <PageHeader
          title="Department Queue"
          subtitle="The learners your offices are holding, one row per learner per office."
        />
        <Card>
          <EmptyState
            as="h2"
            icon="inbox"
            title="Nothing is waiting on you"
            message={
              summary.data?.total === 0 && options.data?.departments?.length
                ? 'You are personnel of an office, but no clearance period is active for it right now. A period shows its officers here the moment it is activated.'
                : 'You are not listed as personnel of any clearance department yet. An office is configured per period, and its people are the administrators assigned to that department.'
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Department Queue"
        subtitle="The learners your offices are holding, one row per learner per office."
        actions={
          <Link className="clr-chip" to="/admin/clearance/obligations">
            <Icon name="alertTriangle" size={14} />
            Obligation ledger
          </Link>
        }
      />

      <div className="kpi-grid">
        <StatCard
          label="In your queue"
          value={summary.data?.total ?? '—'}
          hint="Every period your offices take part in"
          icon="inbox"
        />
        <StatCard
          label="Awaiting a decision"
          value={summary.data?.awaiting ?? '—'}
          tone="blue"
          hint="Submitted or under review"
          icon="clock"
        />
        <StatCard
          label="Something outstanding"
          value={summary.data?.obligations ?? '—'}
          tone="amber"
          hint="Obligations not yet settled or waived"
          icon="alertTriangle"
        />
      </div>

      {groups.length > 0 && (
        <Card title="By office and period">
          <div className="clr-chips">
            {groups.map((group) => (
              <button
                type="button"
                key={`${group.period}-${group.department}`}
                className="clr-chip clr-chip-button"
                onClick={() => focusGroup(group)}
              >
                <strong>{group.department_name}</strong>
                <span>{group.period_name}</span>
                <span className="subtle">
                  {group.awaiting} of {group.total} waiting
                  {group.corrections ? ` · ${group.corrections} corrected` : ''}
                  {group.rejected ? ` · ${group.rejected} rejected` : ''}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="clr-qf-period">Period</label>
          <select
            id="clr-qf-period"
            className="select"
            value={filters.period}
            onChange={(event) => narrow('period', event.target.value)}
          >
            <option value="">Every active period</option>
            {(periods.data || []).map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="clr-qf-department">Office</label>
          <select
            id="clr-qf-department"
            className="select"
            value={filters.department}
            onChange={(event) => narrow('department', event.target.value)}
          >
            <option value="">Every office I belong to</option>
            {(options.data?.departments || [])
              .filter((department) => department.can_verify)
              .map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="clr-qf-status">Item status</label>
          <select
            id="clr-qf-status"
            className="select"
            value={filters.status}
            onChange={(event) => narrow('status', event.target.value)}
          >
            <option value="">Any status</option>
            {(options.data?.department_statuses || []).map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="clr-qf-grade">Grade level</label>
          <select
            id="clr-qf-grade"
            className="select"
            value={filters.grade_level}
            onChange={(event) => narrow('grade_level', event.target.value)}
          >
            <option value="">All grade levels</option>
            {(options.data?.grade_levels || []).map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="clr-qf-section">Section</label>
          <select
            id="clr-qf-section"
            className="select"
            value={filters.section}
            onChange={(event) => narrow('section', event.target.value)}
          >
            <option value="">All sections</option>
            {(sections.data || []).map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="clr-qf-order">Order</label>
          <select
            id="clr-qf-order"
            className="select"
            value={filters.order}
            onChange={(event) => narrow('order', event.target.value)}
          >
            {ORDER_OPTIONS.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        <form
          className="field grow"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(typed.trim())
            setPage(1)
          }}
        >
          <label htmlFor="clr-qf-search">Search</label>
          <div className="row row-wrap">
            <input
              id="clr-qf-search"
              className="input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Learner name or LRN"
            />
            <Button variant="secondary" size="sm" type="submit">
              <Icon name="search" size={14} />
              Search
            </Button>
            {active && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setFilters({
                    period: '',
                    department: '',
                    status: '',
                    grade_level: '',
                    section: '',
                    order: '',
                  })
                  setSearch('')
                  setTyped('')
                  setPage(1)
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </form>
      </div>

      <Card
        title="Learners to verify"
        action={<span className="subtle">{list.count} item{list.count === 1 ? '' : 's'}</span>}
        loading={list.loading && list.rows.length === 0}
        error={list.error}
        onRetry={list.reload}
        flush={list.rows.length > 0}
      >
        {list.rows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Office</th>
                    <th scope="col">Status</th>
                    <th scope="col">Documents</th>
                    <th scope="col">Deadline</th>
                    <th scope="col">Last change</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => {
                    const status = departmentStatus(row.status)
                    const due = deadlineInfo(row.deadline)
                    return (
                      <tr key={row.id}>
                        <td data-label="Learner" className="cell-main">
                          <Link to={`/admin/clearance/queue/${row.id}`}>{row.learner}</Link>
                          <span className="subtle block">
                            {[row.grade_level, row.section].filter(Boolean).join(' · ') ||
                              row.lrn ||
                              'No LRN'}
                          </span>
                        </td>
                        <td data-label="Office">
                          {row.department_name}
                          {row.outstanding_obligations > 0 && (
                            <span className="subtle block">
                              {row.outstanding_obligations} obligation(s) open
                            </span>
                          )}
                        </td>
                        <td data-label="Status">
                          <StatusBadge
                            label={row.status_label || status.label}
                            tone={status.tone}
                          />
                          {row.decision_note && (
                            <span className="subtle block">“{row.decision_note}”</span>
                          )}
                        </td>
                        <td data-label="Documents">
                          {row.awaiting_document ? (
                            <StatusBadge tone="blue" label="Document to review" />
                          ) : (
                            <span className="subtle">Nothing to open</span>
                          )}
                        </td>
                        <td data-label="Deadline">
                          {row.deadline ? formatDate(row.deadline) : '—'}
                          <span className="subtle block">{due.label}</span>
                        </td>
                        <td data-label="Last change">
                          {formatRelative(row.updated_at)}
                          {row.decided_by_name && (
                            <span className="subtle block">by {row.decided_by_name}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="clr-pager">
              <Pagination
                idPrefix="clr-queue"
                page={list.page}
                totalPages={list.totalPages}
                onPage={setPage}
                loading={list.loading}
                info={`Showing ${list.rows.length} of ${list.count} item(s)`}
              />
            </div>
          </>
        ) : (
          <EmptyState
            icon={active ? 'search' : 'checkCircle'}
            title={active ? 'Nothing matches these filters' : 'Your offices are settled'}
            message={
              active
                ? 'Widen the filters — a period or office that is not active holds nothing in your queue.'
                : 'Every learner your offices were given has a recorded decision.'
            }
          />
        )}
      </Card>
    </div>
  )
}
