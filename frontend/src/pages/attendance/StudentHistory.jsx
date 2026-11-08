import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import ListSkeleton from '../../components/loading/ListSkeleton'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useRecordedDay from '../../hooks/useRecordedDay'
import useServerList from '../../hooks/useServerList'
import { DateStepper, SearchField, SelectField } from './parts'
import { SessionDetailModal } from './SessionHistory'
import { attendanceStatus, formatDate } from '../../utils/format'
import {
  DATE_SORT_OPTIONS,
  MARK_STATUSES,
  dayHeading,
  recordDaySteps,
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
/**
 * One learner's marks, a single day at a time.
 *
 * The same walk as the session history, on the same rules: the arrows move
 * between days that actually hold a mark for this learner, because a learner's
 * register is mostly days with nothing to see. The record endpoint narrows on
 * the session's date through the same filter helper the session list uses, so
 * no new surface is needed for it.
 */
export function StudentRecords({ student, refreshKey = 0, onEdit }) {
  const [status, setStatus] = useState('')
  const [ordering, setOrdering] = useState(DATE_SORT_OPTIONS[0].value)
  const [page, setPage] = useState(1)
  const [detailFor, setDetailFor] = useState(null)

  const filters = { student: student.id, status }

  const walk = useRecordedDay('/attendance/records/', {
    probesFor: (day) => {
      const steps = recordDaySteps({ day, filters })
      return {
        landing: ordering === 'date' ? steps.oldest : steps.newest,
        earlier: steps.earlier,
        later: steps.later,
      }
    },
    // A mark is not dated itself; the day it belongs to is its session's.
    dateOf: (row) => row?.session_detail?.date,
    refreshKey,
  })

  const list = useServerList('/attendance/records/', {
    params: recordQuery({ page, ordering, date: walk.day, ...filters }),
    enabled: Boolean(walk.day),
    refreshKey,
  })

  const marks = list.rows

  function narrow(apply) {
    apply()
    setPage(1)
  }

  return (
    <div className="stack stack-sm">
      <div className="att-day-head">
        {walk.day ? (
          <DateStepper
            day={walk.day}
            onStep={walk.go}
            canEarlier={Boolean(walk.neighbours.earlier)}
            canLater={Boolean(walk.neighbours.later)}
            busy={walk.walking || list.loading}
            onLanding={walk.landing && walk.day !== walk.landing ? walk.jumpToLanding : undefined}
          />
        ) : null}
        <span className="subtle" aria-live="polite">
          {walk.day
            ? `${list.count} mark${list.count === 1 ? '' : 's'} on this day`
            : 'One day at a time'}
        </span>
      </div>

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
          label="Start records from"
          value={ordering}
          onChange={(value) => narrow(() => setOrdering(value))}
          disabled={list.loading}
          options={DATE_SORT_OPTIONS}
        />
      </div>

      {(walk.error || list.error) && (
        <ErrorMessage
          error={walk.error || list.error}
          title="Could not load this student’s records"
          onRetry={() => {
            walk.reload()
            list.reload()
          }}
        />
      )}

      {!walk.error && !list.error && (!walk.landed || walk.walking || (list.loading && marks.length === 0)) && (
        <TableSkeleton
          headers={['Subject', 'Class', 'Status', 'Notes']}
          rows={5}
          label="Loading attendance records…"
        />
      )}

      {!walk.error && !list.error && walk.landed && !walk.day && !walk.walking && (
        <EmptyState
          icon="calendar"
          title="No attendance recorded"
          message="This student has no saved attendance records yet."
        />
      )}

      {marks.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table">
            <caption className="sr-only">
              {`${dayHeading(walk.day)} — ${list.count} mark${list.count === 1 ? '' : 's'}`}
            </caption>
            <thead>
              <tr>
                {/* The day is in the heading above, so it is not a column. */}
                <th scope="col">Subject</th>
                <th scope="col">Class</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((record) => (
                <tr key={record.id}>
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

      {list.count > marks.length && (
        <div className="att-pager">
          <Pagination
            idPrefix="att-stud"
            page={list.page}
            totalPages={list.totalPages}
            onPage={setPage}
            loading={list.loading}
            info={`Showing ${marks.length} of ${list.count} marks on ${dayHeading(walk.day)}`}
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
