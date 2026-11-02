import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useServerList from '../../hooks/useServerList'
import {
  ClearFiltersButton,
  CompletionCell,
  DateField,
  NoteCell,
  SearchField,
  SelectField,
  SessionBadge,
} from './parts'
import { SessionDetailModal } from './SessionHistory'
import { formatDate } from '../../utils/format'
import {
  DATE_SORT_OPTIONS,
  SESSION_STATUS_CHOICES,
  completionOf,
  sessionCounts,
  sessionQuery,
} from '../../utils/attendance'

/**
 * The school-wide session register, paged by the server.
 *
 * This view used to crawl every page of every session the school has ever
 * recorded so it could show a count and slice a table locally. The database
 * already knows both answers, so the screen asks for one page — and the number
 * beside the heading is the school's total, not the total it could afford to
 * download.
 */
export default function AdminAttendance() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [ordering, setOrdering] = useState(DATE_SORT_OPTIONS[0].value)
  const [page, setPage] = useState(1)
  const [detailFor, setDetailFor] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const list = useServerList('/attendance/sessions/', {
    params: sessionQuery({
      page,
      dateAfter: from,
      dateBefore: to,
      status,
      search: debounced,
      ordering,
    }),
  })

  const hasFilters = Boolean(debounced) || Boolean(from) || Boolean(to) || Boolean(status)

  function narrow(apply) {
    apply()
    setPage(1)
  }

  return (
    <section className="card">
      <header className="card-header">
        <div className="stack stack-xs">
          <h2>Attendance sessions</h2>
          <span className="subtle">
            {hasFilters ? `${list.count} sessions match` : `${list.count} recorded`}
          </span>
        </div>
      </header>

      <div className="att-filters">
        <SearchField
          id="admin-search"
          label="Search sessions"
          placeholder="Search class, subject or learner…"
          value={search}
          onChange={(value) => narrow(() => setSearch(value))}
          disabled={list.loading}
        />
        <DateField
          id="admin-from"
          label="From date"
          value={from}
          onChange={(value) => narrow(() => setFrom(value))}
          disabled={list.loading}
          max={to || undefined}
        />
        <DateField
          id="admin-to"
          label="To date"
          value={to}
          onChange={(value) => narrow(() => setTo(value))}
          disabled={list.loading}
          min={from || undefined}
        />
        <SelectField
          id="admin-status"
          label="Filter by status"
          value={status}
          onChange={(value) => narrow(() => setStatus(value))}
          disabled={list.loading}
          options={SESSION_STATUS_CHOICES}
        />
        <SelectField
          id="admin-sort"
          label="Sort sessions"
          value={ordering}
          onChange={(value) => narrow(() => setOrdering(value))}
          disabled={list.loading}
          options={DATE_SORT_OPTIONS}
        />
        <ClearFiltersButton
          onClick={() => {
            setSearch('')
            setDebounced('')
            setFrom('')
            setTo('')
            setStatus('')
            setPage(1)
          }}
          label="Clear session filters"
          hidden={!hasFilters}
        />
      </div>

      {list.error && (
        <div className="card-body">
          <ErrorMessage error={list.error} title="Could not load sessions" onRetry={list.reload} />
        </div>
      )}

      {!list.error && list.loading && list.rows.length === 0 && (
        <div className="card-body">
          <TableSkeleton
            headers={['Date', 'Class', 'Subject', 'Recorded', 'Status', 'Completion', 'Notes', 'Details']}
            rows={6}
            label="Loading sessions…"
          />
        </div>
      )}

      {!list.error && !list.loading && list.count === 0 && (
        <div className="card-body">
          <EmptyState
            icon={hasFilters ? 'search' : 'calendar'}
            title={hasFilters ? 'No sessions match your filters' : 'No sessions recorded'}
            message={
              hasFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'Sessions created by teachers will be listed here.'
            }
          />
        </div>
      )}

      {list.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table att-sessions">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Class</th>
                <th scope="col">Subject</th>
                <th scope="col" className="att-count">Records</th>
                <th scope="col">Status</th>
                <th scope="col">Completion</th>
                <th scope="col">Notes</th>
                <th scope="col" className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((session) => (
                <tr key={session.id}>
                  <td data-label="Date">{formatDate(session.date)}</td>
                  <td data-label="Class" className="cell-main">
                    {session.section_name || '—'}
                  </td>
                  <td data-label="Subject">{session.subject_name || '—'}</td>
                  <td data-label="Records" className="att-count">
                    {sessionCounts(session).marked}
                  </td>
                  <td data-label="Status">
                    <SessionBadge session={session} />
                  </td>
                  <td data-label="Completion">
                    <CompletionCell completion={completionOf(session)} />
                  </td>
                  <NoteCell value={session.notes} />
                  <td data-label="Details">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDetailFor(session)}
                      aria-label={`View session details for ${session.section_name} on ${formatDate(session.date)}`}
                    >
                      View details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.count > 0 && (
        <div className="att-pager">
          <Pagination
            idPrefix="att-admin"
            page={list.page}
            totalPages={list.totalPages}
            onPage={setPage}
            loading={list.loading}
            info={`Showing ${list.rows.length} of ${list.count} sessions`}
          />
        </div>
      )}

      {detailFor && (
        <SessionDetailModal session={detailFor} onClose={() => setDetailFor(null)} />
      )}
    </section>
  )
}
