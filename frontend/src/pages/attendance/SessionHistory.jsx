import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useFetch from '../../hooks/useFetch'
import useRecordedDay from '../../hooks/useRecordedDay'
import useServerList from '../../hooks/useServerList'
import {
  ClearFiltersButton,
  CompletionCell,
  DateStepper,
  NoteCell,
  SearchField,
  SelectField,
  SessionBadge,
} from './parts'
import { attendanceStatus, formatDate } from '../../utils/format'
import {
  DATE_SORT_OPTIONS,
  MARK_STATUSES,
  SESSION_STATUS_CHOICES,
  completionOf,
  dayHeading,
  sessionCounts,
  sessionDaySteps,
  sessionQuery,
  sessionTimeLabel,
} from '../../utils/attendance'


/**
 * Attendance history — one recorded day at a time.
 *
 * The list used to be a paged table of every session, newest first, and the
 * only way to read a particular day was to page or filter towards it. A
 * teacher now lands on the newest day that has records and walks the calendar
 * with `<` and `>`; the walk steps between days that actually have sessions, so
 * a weekend or a holiday is passed over instead of opened as an empty card.
 *
 * The walk costs three `page_size: 1` reads per stop (the landing day and the
 * two neighbours) and nothing else, because the same server-side filters that
 * narrowed the old table narrow the walk — the database still does the
 * filtering, sorting and counting, and the browser never holds a day's rows
 * until it shows them.
 */
export default function SessionHistory({
  assignments = [],
  classLocked = false,
  initialClassId = '',
  onOpen,
  onRevise,
  refreshKey = 0,
}) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [classIdState, setClassIdState] = useState(initialClassId)
  // Same rule as the board: a locked class is read from the route each render,
  // so the workspace cannot keep the previous class's id.
  const classId = classLocked ? String(initialClassId || '') : classIdState
  const [subject, setSubject] = useState('')
  const [status, setStatus] = useState('')
  const [ordering, setOrdering] = useState('-date')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detailFor, setDetailFor] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Everything except the date: the walk and the day's rows must agree on it,
  // or the arrows would step through days the filter bar has already hidden.
  const filters = { assignment: classId, subject, status, search: debouncedSearch }

  const walk = useRecordedDay('/attendance/sessions/', {
    probesFor: (day) => {
      const steps = sessionDaySteps({ day, filters })
      // "First" follows the sort: newest for Newest first, oldest for Oldest
      // first, so the screen opens on the end of the term the teacher asked for.
      return {
        landing: ordering === 'date' ? steps.oldest : steps.newest,
        earlier: steps.earlier,
        later: steps.later,
      }
    },
    refreshKey,
  })

  const list = useServerList('/attendance/sessions/', {
    params: sessionQuery({ page, pageSize, ordering, date: walk.day, ...filters }),
    enabled: Boolean(walk.day),
    refreshKey,
  })

  const subjects = useMemo(() => {
    const map = new Map()
    assignments.forEach((a) => {
      if (a.subject && a.subject_name) map.set(String(a.subject), a.subject_name)
    })
    return [...map].sort((a, b) => a[1].localeCompare(b[1]))
  }, [assignments])

  const hasFilters =
    Boolean(debouncedSearch) ||
    Boolean(subject) ||
    Boolean(status) ||
    (!classLocked && Boolean(classId))

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setClassIdState('')
    setSubject('')
    setStatus('')
    setPage(1)
  }

  function narrow(apply) {
    apply()
    setPage(1)
  }

  const dayCount = list.count
  const showLatest = Boolean(walk.landing) && walk.day !== walk.landing

  return (
    <section className="card">
      <header className="card-header">
        <div className="stack stack-xs">
          <h2>Attendance history</h2>
          <span className="subtle">
            {walk.day
              ? hasFilters
                ? `${dayCount} session${dayCount === 1 ? '' : 's'} match on this day`
                : `${dayCount} session${dayCount === 1 ? '' : 's'} recorded on this day`
              : 'One day at a time — the arrows move between days that have records'}
          </span>
        </div>
        {walk.day ? (
          <DateStepper
            day={walk.day}
            onStep={walk.go}
            canEarlier={Boolean(walk.neighbours.earlier)}
            canLater={Boolean(walk.neighbours.later)}
            busy={walk.walking || list.loading}
            onLanding={showLatest ? walk.jumpToLanding : undefined}
          />
        ) : null}
      </header>

      <div className="att-filters">
        <SearchField
          id="hist-search"
          label="Search history"
          placeholder="Search class, subject or learner…"
          value={search}
          onChange={(value) => narrow(() => setSearch(value))}
          disabled={list.loading}
        />
        {!classLocked && (
          <SelectField
            id="hist-class"
            label="History class filter"
            value={classId}
            onChange={(value) => narrow(() => setClassIdState(value))}
            disabled={list.loading}
            options={[
              { value: '', label: 'All classes' },
              ...assignments.map((a) => ({
                value: String(a.id),
                label: `${a.subject_name} — ${a.section_name}`,
              })),
            ]}
          />
        )}
        <SelectField
          id="hist-subject"
          label="History subject filter"
          value={subject}
          onChange={(value) => narrow(() => setSubject(value))}
          disabled={list.loading}
          options={[
            { value: '', label: 'All subjects' },
            ...subjects.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <SelectField
          id="hist-status"
          label="History status filter"
          value={status}
          onChange={(value) => narrow(() => setStatus(value))}
          disabled={list.loading}
          options={SESSION_STATUS_CHOICES}
        />
        {/* The sort no longer orders a long table — it decides which end of the
            walk you open on, which is what the arrows then walk away from. */}
        <SelectField
          id="hist-sort"
          label="Start history from"
          value={ordering}
          onChange={(value) => narrow(() => setOrdering(value))}
          disabled={list.loading}
          options={DATE_SORT_OPTIONS}
        />
        <ClearFiltersButton onClick={clearFilters} label="Clear history filters" hidden={!hasFilters} />
      </div>

      {(walk.error || list.error) && (
        <div className="card-body">
          <ErrorMessage
            error={walk.error || list.error}
            title="Could not load attendance history"
            onRetry={() => {
              walk.reload()
              list.reload()
            }}
          />
        </div>
      )}

      {!walk.error && !list.error && (!walk.landed || walk.walking || (list.loading && list.rows.length === 0)) && (
        <div className="card-body">
          <TableSkeleton
            headers={['Class', 'Subject', 'Recorded', 'Status', 'Completion', 'Notes', 'Details']}
            rows={5}
            label="Loading attendance history…"
          />
        </div>
      )}

      {!walk.error && !list.error && walk.landed && !walk.day && !walk.walking && (
        <div className="card-body">
          <EmptyState
            icon={hasFilters ? 'search' : 'calendar'}
            title={hasFilters ? 'No day matches your filters' : 'No attendance history yet'}
            message={
              hasFilters
                ? 'Clear a filter, or search for another class or learner.'
                : 'Sessions you save from the Take attendance view appear here, one day at a time.'
            }
          />
        </div>
      )}

      {list.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table att-sessions att-history">
            <caption className="sr-only">
              {`${dayHeading(walk.day)} — ${dayCount} session${dayCount === 1 ? '' : 's'}`}
            </caption>
            <thead>
              <tr>
                {/* No Date column: every row on screen is the day in the heading. */}
                <th scope="col">Class</th>
                <th scope="col">Subject</th>
                <th scope="col" className="att-count">Recorded</th>
                <th scope="col">Status</th>
                <th scope="col">Completion</th>
                <th scope="col">Notes</th>
                <th scope="col" className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((session) => (
                <tr key={session.id}>
                  <td data-label="Class" className="cell-main">
                    {session.section_name || '—'}
                  </td>
                  <td data-label="Subject">{session.subject_name || '—'}</td>
                  <td data-label="Recorded" className="att-count">
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
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDetailFor(session)}
                        aria-label={`View session details for ${session.section_name} on ${formatDate(session.date)}`}
                      >
                        View details
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* A day normally fits one screen, so the pager appears only when it
          genuinely does not — a school-wide day can hold more classes than a
          page. The arrows move between days; this moves within one. */}
      {list.count > list.rows.length && (
        <div className="att-pager">
          <Pagination
            idPrefix="att-hist"
            page={list.page}
            totalPages={list.totalPages}
            onPage={setPage}
            loading={list.loading}
            pageSize={pageSize}
            onPageSize={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            info={`Showing ${list.rows.length} of ${list.count} sessions on ${dayHeading(walk.day)}`}
          />
        </div>
      )}

      {detailFor && (
        <SessionDetailModal
          session={detailFor}
          onClose={() => setDetailFor(null)}
          onEdit={(session) => {
            setDetailFor(null)
            onOpen(session)
          }}
          onRevise={
            onRevise
              ? (session) => {
                  setDetailFor(null)
                  onRevise(session)
                }
              : undefined
          }
        />
      )}
    </section>
  )
}

/**
 * A saved session, read without editing it.
 *
 * The history asks for inspection rather than modification, so a row opens this
 * instead of dropping into the sheet. Correcting a mark stays one deliberate
 * click away — a register that cannot be fixed is one the teacher stops
 * trusting.
 */
export function SessionDetailModal({ session, onClose, onEdit, onRevise }) {
  const detail = useFetch(`/attendance/sessions/${session.id}/`)
  const records = detail.data?.records || []
  const counts = sessionCounts(detail.data || session)
  const canEdit = Boolean(onEdit)
  const canRevise = Boolean(onRevise)

  return (
    <Modal
      open
      title={`${session.subject_name || 'Session'} · ${formatDate(session.date)}`}
      onClose={onClose}
      width={720}
      footer={
        canEdit || canRevise ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <span className="grow" />
            {canRevise && (
              <Button variant="secondary" size="sm" onClick={() => onRevise(detail.data || session)}>
                Fix date or note
              </Button>
            )}
            {canEdit && (
              <Button variant="primary" size="sm" onClick={() => onEdit(detail.data || session)}>
                Correct marks
              </Button>
            )}
          </>
        ) : null
      }
    >
      <div className="stack stack-sm">
        <p className="subtle">
          {session.section_name || '—'}
          {detail.data ? ` · ${sessionTimeLabel(detail.data)}` : ''}
        </p>

        <div className="att-summary" role="group" aria-label="Session totals">
          {detail.data && <SessionBadge session={detail.data} />}
          <StatusBadge tone="neutral" label={`${counts.marked} marked`} />
          {MARK_STATUSES.map((status) => (
            <StatusBadge
              key={status}
              tone={attendanceStatus(status).tone}
              label={`${counts[status]} ${attendanceStatus(status).label}`}
            />
          ))}
        </div>

        {session.notes && <p className="muted">{session.notes}</p>}

        {detail.loading && records.length === 0 && (
          <TableSkeleton headers={['Student', 'Status', 'Notes']} rows={4} label="Loading marks…" />
        )}

        {detail.error && (
          <ErrorMessage error={detail.error} title="Could not load this session" onRetry={detail.reload} />
        )}

        {!detail.loading && !detail.error && records.length === 0 && (
          <EmptyState
            icon="calendar"
            title="No marks recorded"
            message="This session was created but nobody has been marked yet."
          />
        )}

        {records.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Student" className="cell-main">
                      {record.student_name || '—'}
                    </td>
                    <td data-label="Status">
                      <StatusBadge
                        label={attendanceStatus(record.status).label}
                        tone={attendanceStatus(record.status).tone}
                      />
                    </td>
                    <NoteCell value={record.notes} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
