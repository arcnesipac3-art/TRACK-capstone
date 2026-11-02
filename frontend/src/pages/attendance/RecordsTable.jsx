import { useEffect, useMemo, useState } from 'react'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import useServerCounts from '../../hooks/useServerCounts'
import useServerList from '../../hooks/useServerList'
import { ClearFiltersButton, DateField, SelectField } from './parts'
import { attendanceStatus, formatDate } from '../../utils/format'
import { DATE_SORT_OPTIONS, MARK_STATUSES, recordQuery } from '../../utils/attendance'

/**
 * A count read: the same filters as the table, with the rows themselves
 * dropped, because `useServerCounts` only reads the page's total.
 */
const counted = (filters) => ({ ...recordQuery(filters), page: 1, page_size: 1 })

/**
 * The learner's own attendance: one page of records, one page of counts.
 *
 * Both come from the same filtered query, so the summary beside the table and
 * the table itself are answers to the same question — a student who sets
 * "this term, absent only" sees term figures and absent rows, not a lifetime
 * total next to a filtered list. The record list is the server's, so a full
 * school year is reachable even though the browser holds twenty rows.
 */
export default function RecordsTable({ studentId = null, refreshKey = 0 }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [ordering, setOrdering] = useState(DATE_SORT_OPTIONS[0].value)
  const [page, setPage] = useState(1)

  const scope = {
    student: studentId,
    dateAfter: from,
    dateBefore: to,
    ordering,
  }

  const list = useServerList('/attendance/records/', {
    params: recordQuery({ ...scope, status, page }),
    refreshKey,
  })

  const summaryQueries = useMemo(
    () => [
      { id: 'total', path: '/attendance/records/', params: counted(scope) },
      ...MARK_STATUSES.map((value) => ({
        id: value,
        path: '/attendance/records/',
        params: counted({ ...scope, status: value }),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(scope)]
  )
  const summary = useServerCounts(summaryQueries, { refreshKey })

  const attendance = {
    total_records: summary.counts.total ?? 0,
    by_status: MARK_STATUSES.reduce((acc, value) => {
      acc[value] = summary.counts[value] ?? 0
      return acc
    }, {}),
    present_rate: summary.counts.total
      ? Math.round((100 * (summary.counts.present ?? 0)) / summary.counts.total)
      : null,
  }

  const hasFilters = Boolean(from) || Boolean(to) || Boolean(status)

  function narrow(apply) {
    apply()
    setPage(1)
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setStatus('')
    setPage(1)
  }

  useEffect(() => {
    // A child switch changes whose records are on screen; page three of one
    // child is not page three of another.
    setPage(1)
  }, [studentId])

  return (
    <div className="two-col">
      <div className="stack stack-md">
        <div className="att-filters">
          <DateField
            id="att-from"
            label="From"
            value={from}
            onChange={(value) => narrow(() => setFrom(value))}
            disabled={list.loading}
            max={to || undefined}
          />
          <DateField
            id="att-to"
            label="To"
            value={to}
            onChange={(value) => narrow(() => setTo(value))}
            disabled={list.loading}
            min={from || undefined}
          />
          <SelectField
            id="att-status"
            label="Status"
            value={status}
            onChange={(value) => narrow(() => setStatus(value))}
            disabled={list.loading}
            options={[
              { value: '', label: 'All statuses' },
              ...MARK_STATUSES.map((value) => ({
                value,
                label: attendanceStatus(value).label,
              })),
            ]}
          />
          <SelectField
            id="att-sort"
            label="Sort records"
            value={ordering}
            onChange={(value) => narrow(() => setOrdering(value))}
            disabled={list.loading}
            options={DATE_SORT_OPTIONS}
          />
          <ClearFiltersButton onClick={clearFilters} label="Clear filters" hidden={!hasFilters} />
        </div>

        <Card
          title="Attendance records"
          action={<span className="subtle">{list.count} record{list.count === 1 ? '' : 's'}</span>}
          loading={list.loading && list.rows.length === 0}
          error={list.error}
          onRetry={list.reload}
          empty={
            list.count === 0 ? (
              <EmptyState
                icon={hasFilters ? 'search' : 'calendar'}
                title={hasFilters ? 'No records match filters' : 'No attendance records'}
                message={
                  hasFilters
                    ? 'Try adjusting your filters.'
                    : 'Nothing has been recorded for this selection yet.'
                }
              />
            ) : null
          }
          flush={list.rows.length > 0}
        >
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Class</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Date">{formatDate(record.session_detail?.date)}</td>
                    <td data-label="Class" className="cell-main">
                      {record.session_detail?.section_name || '—'}
                    </td>
                    <td data-label="Subject">{record.session_detail?.subject_name || '—'}</td>
                    <td data-label="Status">
                      <StatusBadge
                        label={attendanceStatus(record.status).label}
                        tone={attendanceStatus(record.status).tone}
                      />
                    </td>
                    <td data-label="Notes">{record.notes || <span className="subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {list.count > 0 && (
            <div className="att-pager">
              <Pagination
                idPrefix="att-records"
                page={list.page}
                totalPages={list.totalPages}
                onPage={setPage}
                loading={list.loading}
                info={`Showing ${list.rows.length} of ${list.count} records`}
              />
            </div>
          )}
        </Card>
      </div>

      <div className="stack stack-md">
        <AttendanceSummaryCard attendance={attendance} />
      </div>
    </div>
  )
}
