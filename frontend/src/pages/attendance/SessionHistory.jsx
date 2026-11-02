import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useFetch from '../../hooks/useFetch'
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
import { attendanceStatus, formatDate } from '../../utils/format'
import {
  DATE_SORT_OPTIONS,
  MARK_STATUSES,
  SESSION_STATUS_CHOICES,
  completionOf,
  sessionCounts,
  sessionQuery,
  sessionTimeLabel,
} from '../../utils/attendance'


/**
 * Attendance history — every saved session, paged by the server.
 *
 * This screen used to pull the teacher's whole session list into the browser
 * (a hundred at a time, rosters and all) and slice it locally at a hard
 * thousand rows. Filtering, sorting and counting happen in the database now and
 * one page of flat rows arrives, so a teacher with four school years of
 * registers gets the same fast screen as one with four sessions.
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
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
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

  const list = useServerList('/attendance/sessions/', {
    params: sessionQuery({
      page,
      pageSize,
      dateAfter: from,
      dateBefore: to,
      assignment: classId,
      subject,
      status,
      search: debouncedSearch,
      ordering,
    }),
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
    Boolean(from) ||
    Boolean(to) ||
    Boolean(subject) ||
    Boolean(status) ||
    (!classLocked && Boolean(classId))

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setFrom('')
    setTo('')
    setClassIdState('')
    setSubject('')
    setStatus('')
    setPage(1)
  }

  function narrow(apply) {
    apply()
    setPage(1)
  }

  return (
    <section className="card">
      <header className="card-header">
        <div className="stack stack-xs">
          <h2>Saved sessions</h2>
          <span className="subtle">
            {hasFilters
              ? `${list.count} of your sessions match`
              : `${list.count} session${list.count === 1 ? '' : 's'} recorded`}
          </span>
        </div>
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
        <DateField
          id="hist-from"
          label="History from date"
          value={from}
          onChange={(value) => narrow(() => setFrom(value))}
          disabled={list.loading}
          max={to || undefined}
        />
        <DateField
          id="hist-to"
          label="History to date"
          value={to}
          onChange={(value) => narrow(() => setTo(value))}
          disabled={list.loading}
          min={from || undefined}
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
        <SelectField
          id="hist-sort"
          label="Sort history"
          value={ordering}
          onChange={(value) => narrow(() => setOrdering(value))}
          disabled={list.loading}
          options={DATE_SORT_OPTIONS}
        />
        <ClearFiltersButton onClick={clearFilters} label="Clear history filters" hidden={!hasFilters} />
      </div>

      {list.error && (
        <div className="card-body">
          <ErrorMessage
            error={list.error}
            title="Could not load attendance history"
            onRetry={list.reload}
          />
        </div>
      )}

      {!list.error && list.loading && list.rows.length === 0 && (
        <div className="card-body">
          <TableSkeleton
            headers={['Date', 'Class', 'Subject', 'Recorded', 'Status', 'Completion', 'Notes', 'Details']}
            rows={5}
            label="Loading attendance history…"
          />
        </div>
      )}

      {!list.error && !list.loading && list.count === 0 && (
        <div className="card-body">
          <EmptyState
            icon={hasFilters ? 'search' : 'calendar'}
            title={hasFilters ? 'No sessions match your filters' : 'No attendance history yet'}
            message={
              hasFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'Sessions you save from the Take attendance view appear here.'
            }
          />
        </div>
      )}

      {list.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table att-sessions att-history">
            <thead>
              <tr>
                <th scope="col">Date</th>
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
                  <td data-label="Date">
                    <strong>{formatDate(session.date)}</strong>
                  </td>
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

      {list.count > 0 && (
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
            info={`Showing ${list.rows.length} of ${list.count} sessions`}
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
