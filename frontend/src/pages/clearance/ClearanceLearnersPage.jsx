import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import useFetch from '../../hooks/useFetch'
import useServerList from '../../hooks/useServerList'
import { overallStatus } from '../../utils/clearance'
import { formatDate } from '../../utils/format'
import './Clearance.css'

const PAGE_SIZE = 25

/**
 * Every learner in scope, one row each.
 *
 * The rows come from the server one page at a time: a school year of clearances
 * is thousands of learners, and the question on this screen is "who is not
 * finished", which the database answers with a filter and a count.
 */
export default function ClearanceLearnersPage() {
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState(() => ({
    period: searchParams.get('period') || '',
    status: searchParams.get('status') || '',
    grade_level: searchParams.get('grade_level') || '',
    section: searchParams.get('section') || '',
    department: searchParams.get('department') || '',
    obligations: searchParams.get('obligations') || '',
    search: '',
  }))
  const [typed, setTyped] = useState('')
  const [page, setPage] = useState(1)

  const options = useFetch('/clearance/options/')
  const periods = useFetch('/clearance/periods/', { list: true })
  const sections = useFetch('/sections/', { list: true })

  const list = useServerList('/clearance/records/', {
    params: { ...filters, page, page_size: PAGE_SIZE },
  })

  function narrow(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const active = Object.values(filters).some(Boolean) || Boolean(typed)
  const denied = list.error?.status === 403

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Clearance Learners"
        subtitle="One row per learner per period — where each of them stands, and what is holding them back."
        actions={
          <Link className="clr-chip" to="/admin/clearance/reports">
            <Icon name="file" size={14} />
            Reports &amp; export
          </Link>
        }
      />

      {denied ? (
        <Card>
          <EmptyState
            as="h2"
            icon="shield"
            title="You don't have permission"
            message="The clearance learner list needs the clearance.view permission."
          />
        </Card>
      ) : (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="clr-lf-period">Period</label>
              <select
                id="clr-lf-period"
                className="select"
                value={filters.period}
                onChange={(e) => narrow('period', e.target.value)}
              >
                <option value="">Every period</option>
                {(periods.data || []).map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-lf-status">Overall status</label>
              <select
                id="clr-lf-status"
                className="select"
                value={filters.status}
                onChange={(e) => narrow('status', e.target.value)}
              >
                <option value="">Any status</option>
                {(options.data?.overall_statuses || []).map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-lf-grade">Grade level</label>
              <select
                id="clr-lf-grade"
                className="select"
                value={filters.grade_level}
                onChange={(e) => narrow('grade_level', e.target.value)}
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
              <label htmlFor="clr-lf-section">Section</label>
              <select
                id="clr-lf-section"
                className="select"
                value={filters.section}
                onChange={(e) => narrow('section', e.target.value)}
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
              <label htmlFor="clr-lf-department">Department</label>
              <select
                id="clr-lf-department"
                className="select"
                value={filters.department}
                onChange={(e) => narrow('department', e.target.value)}
              >
                <option value="">Any office</option>
                {(options.data?.departments || []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-lf-obligations">Obligations</label>
              <select
                id="clr-lf-obligations"
                className="select"
                value={filters.obligations}
                onChange={(e) => narrow('obligations', e.target.value)}
              >
                <option value="">Anyone</option>
                <option value="open">With something outstanding</option>
              </select>
            </div>

            <form
              className="field grow"
              onSubmit={(event) => {
                event.preventDefault()
                narrow('search', typed.trim())
                setTyped(typed.trim())
              }}
            >
              <label htmlFor="clr-lf-search">Search</label>
              <div className="row row-wrap">
                <input
                  id="clr-lf-search"
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Name, LRN or clearance reference"
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
                        status: '',
                        grade_level: '',
                        section: '',
                        department: '',
                        obligations: '',
                        search: '',
                      })
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
            title="Learners"
            action={<span className="subtle">{list.count} record{list.count === 1 ? '' : 's'}</span>}
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
                        <th scope="col">Period</th>
                        <th scope="col">Grade &amp; section</th>
                        <th scope="col">Progress</th>
                        <th scope="col">Status</th>
                        <th scope="col">Outstanding</th>
                        <th scope="col">Cleared</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.rows.map((row) => {
                        const status = overallStatus(row.overall_status)
                        return (
                          <tr key={row.id}>
                            <td data-label="Learner" className="cell-main">
                              <Link to={`/admin/clearance/learners/${row.id}`}>{row.learner}</Link>
                              <span className="subtle block">{row.lrn || 'No LRN'}</span>
                            </td>
                            <td data-label="Period">
                              <Link to={`/admin/clearance/learners?period=${row.period}`}>
                                {row.period_name}
                              </Link>
                            </td>
                            <td data-label="Grade & section">
                              {row.grade_level || '—'}
                              {row.section_name ? ` · ${row.section_name}` : ''}
                            </td>
                            <td data-label="Progress">
                              <div className="progress-row">
                                <div className="pr-top">
                                  <span className="pr-label">{row.progress}%</span>
                                  {row.settled && (
                                    <span className="pr-value">
                                      <Icon name="check" size={13} />
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="progress-track"
                                  role="img"
                                  aria-label={`${row.progress} percent complete`}
                                >
                                  <div
                                    className={`progress-fill ${status.tone}`}
                                    style={{ width: `${row.progress}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td data-label="Status">
                              <StatusBadge label={status.label} tone={status.tone} />
                            </td>
                            <td data-label="Outstanding">
                              {row.outstanding_obligations ? (
                                <Link to={`/admin/clearance/learners/${row.id}?tab=obligations`}>
                                  {row.outstanding_obligations} obligation(s)
                                </Link>
                              ) : (
                                <span className="subtle">None</span>
                              )}
                            </td>
                            <td data-label="Cleared">
                              {row.reference ? (
                                <>
                                  {row.cleared_at ? formatDate(row.cleared_at) : '—'}
                                  <span className="subtle block">{row.reference}</span>
                                </>
                              ) : (
                                <span className="subtle">—</span>
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
                    idPrefix="clr-learners"
                    page={list.page}
                    totalPages={list.totalPages}
                    onPage={setPage}
                    loading={list.loading}
                    info={`Showing ${list.rows.length} of ${list.count} learner record(s)`}
                  />
                </div>
              </>
            ) : (
              <EmptyState
                icon={active ? 'search' : 'gradCap'}
                title={
                  active
                    ? 'No learner matches these filters'
                    : 'No clearance records yet'
                }
                message={
                  active
                    ? 'Widen the filters — or check that the period you meant is the one that is active.'
                    : 'A period opens a record for every learner it covers when it is activated.'
                }
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}
