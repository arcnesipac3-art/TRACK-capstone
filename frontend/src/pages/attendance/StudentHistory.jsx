import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import ListSkeleton from '../../components/loading/ListSkeleton'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useServerList from '../../hooks/useServerList'
import { SearchField, SelectField } from './parts'
import { SessionDetailModal } from './SessionHistory'
import { attendanceStatus, formatDate } from '../../utils/format'
import {
  DATE_SORT_OPTIONS,
  MARK_STATUSES,
  recordQuery,
  sessionRowFromRecord,
} from '../../utils/attendance'

const HITS = 8

/**
 * Attendance history for one learner.
 *
 * The picker searches the server, not a copy of the whole school in the
 * browser: the students endpoint is already scoped to the classes this teacher
 * teaches, so a name that is not theirs never comes back as a hit — and the
 * record list is one page at a time, same as the session history.
 */
export default function StudentHistory({ refreshKey = 0 }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const hits = useServerList('/students/', {
    params: { search: debounced, page: 1, page_size: HITS },
    enabled: Boolean(debounced),
  })

  const rows = useMemo(() => hits.rows, [hits.rows])

  function pick(student) {
    setSelected(student)
  }

  if (selected) {
    const name = selected.user?.full_name || selected.user?.username || '—'
    return (
      <section className="card">
        <header className="card-header">
          <div className="stack stack-xs student-head">
            <h2>{name}</h2>
            <span className="subtle text-truncate">
              {selected.lrn || selected.user?.username || '—'} · {selected.section_name || '—'}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelected(null)
              setSearch('')
              setDebounced('')
            }}
          >
            Another student
          </Button>
        </header>

        <div className="card-body">
          <StudentRecords student={selected} refreshKey={refreshKey} />
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <header className="card-header">
        <div className="stack stack-xs">
          <h2>Student history</h2>
          <span className="subtle">
            Search a student in one of your classes to review their records over time.
          </span>
        </div>
      </header>

      <div className="att-toolbar">
        <SearchField
          id="hist-student-search"
          label="Search students"
          placeholder="Search by name or student ID…"
          value={search}
          onChange={setSearch}
          disabled={false}
        />
      </div>

      {hits.error && (
        <div className="card-body">
          <ErrorMessage error={hits.error} title="Could not load students" onRetry={hits.reload} />
        </div>
      )}

      {hits.loading && rows.length === 0 && (
        <div className="card-body">
          <ListSkeleton items={4} lines={1} avatar label="Searching students…" />
        </div>
      )}

      {debounced && !hits.loading && rows.length === 0 && !hits.error && (
        <div className="card-body">
          <EmptyState
            icon="search"
            title="No students found"
            message="No student in your classes matches that search."
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="att-student-hits">
          {rows.map((student) => {
            const name = student.user?.full_name || student.user?.username || '—'
            return (
              <button
                key={student.id}
                type="button"
                className="att-student-hit"
                onClick={() => pick(student)}
              >
                <span className="att-name">{name}</span>
                <span className="hit-meta">{student.lrn || student.user?.username || '—'}</span>
              </button>
            )
          })}
        </div>
      )}

      {!debounced && (
        <div className="card-body">
          <EmptyState
            icon="users"
            title="Search for a student"
            message="Start typing a name or student ID from your classes."
          />
        </div>
      )}
    </section>
  )
}

/**
 * One learner's marks: filtered, sorted and paginated by the server, with the
 * session behind each mark one click away.
 */
export function StudentRecords({ student, refreshKey = 0, onEdit }) {
  const [status, setStatus] = useState('')
  const [ordering, setOrdering] = useState(DATE_SORT_OPTIONS[0].value)
  const [page, setPage] = useState(1)
  const [detailFor, setDetailFor] = useState(null)

  const list = useServerList('/attendance/records/', {
    params: recordQuery({ student: student.id, status, ordering, page }),
    refreshKey,
  })

  const marks = list.rows

  function narrow(apply) {
    apply()
    setPage(1)
  }

  return (
    <div className="stack stack-sm">
      <div className="att-filters">
        <SelectField
          id="stud-status"
          label="Filter records by status"
          value={status}
          onChange={(value) => narrow(() => setStatus(value))}
          disabled={list.loading}
          options={[
            { value: '', label: 'All statuses' },
            ...MARK_STATUSES.map((value) => ({ value, label: attendanceStatus(value).label })),
          ]}
        />
        <SelectField
          id="stud-sort"
          label="Sort records"
          value={ordering}
          onChange={(value) => narrow(() => setOrdering(value))}
          disabled={list.loading}
          options={DATE_SORT_OPTIONS}
        />
      </div>

      {list.error && (
        <ErrorMessage
          error={list.error}
          title="Could not load this student’s records"
          onRetry={list.reload}
        />
      )}

      {!list.error && list.loading && marks.length === 0 && (
        <TableSkeleton
          headers={['Date', 'Subject', 'Class', 'Status', 'Notes']}
          rows={5}
          label="Loading attendance records…"
        />
      )}

      {!list.error && !list.loading && list.count === 0 && (
        <EmptyState
          icon="calendar"
          title="No attendance recorded"
          message="This student has no saved attendance records yet."
        />
      )}

      {marks.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Subject</th>
                <th scope="col">Class</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((record) => (
                <tr key={record.id}>
                  <td data-label="Date">
                    <strong>{formatDate(record.session_detail?.date)}</strong>
                  </td>
                  <td data-label="Subject">{record.session_detail?.subject_name || '—'}</td>
                  <td data-label="Class" className="cell-main">
                    {record.session_detail?.section_name || '—'}
                  </td>
                  <td data-label="Status">
                    <StatusBadge
                      label={attendanceStatus(record.status).label}
                      tone={attendanceStatus(record.status).tone}
                    />
                  </td>
                  <td data-label="Notes" className="att-notes">
                    <span className="att-note-text" title={record.notes || ''}>
                      {record.notes || <span className="subtle">—</span>}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDetailFor(sessionRowFromRecord(record))}
                      aria-label={`View session of ${formatDate(record.session_detail?.date)}`}
                    >
                      View session
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
            idPrefix="att-stud"
            page={list.page}
            totalPages={list.totalPages}
            onPage={setPage}
            loading={list.loading}
            info={`Showing ${marks.length} of ${list.count} records`}
          />
        </div>
      )}

      {detailFor && (
        <SessionDetailModal
          session={detailFor}
          onClose={() => setDetailFor(null)}
          onEdit={
            onEdit
              ? (session) => {
                  setDetailFor(null)
                  onEdit(session)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
