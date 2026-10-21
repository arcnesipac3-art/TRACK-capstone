import { useEffect, useMemo, useRef, useState } from 'react'
import ChildSelector from '../components/ChildSelector'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import AttendanceSummaryCard from '../components/dashboard/AttendanceSummaryCard'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import {
  attendanceStatus,
  formatDate,
  formatRelative,
} from '../utils/format'
import { attendanceSummary } from '../utils/stats'

const STATUSES = ['present', 'absent', 'late', 'excused']

/** Rows are capped so a long history never turns the list into a scroll wall. */
const SESSION_ROW_LIMIT = 50

/** Resolved once at module load so date inputs never recompute it while rendering. */
const TODAY_ISO = new Date().toISOString().split('T')[0]

const COPY = {
  student: {
    title: 'My Attendance',
    subtitle: 'Your recorded attendance across your classes.',
  },
  parent: {
    title: 'Attendance',
    subtitle: 'Attendance records for your selected child.',
  },
  teacher: {
    title: 'Attendance',
    subtitle: 'Create a session for a class, then open it to mark your roster.',
  },
  admin: {
    title: 'Attendance',
    subtitle: 'Attendance sessions recorded across the school.',
  },
}

/* ------------------------------------------------------------------ */
/* Records table (student & parent)                                    */
/* ------------------------------------------------------------------ */

function RecordsView({ params, enabled = true }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, loading, error, reload } = useFetch('/attendance/records/', {
    list: true,
    params,
    enabled,
  })

  // Filter records by date range and status
  const filteredRecords = useMemo(() => {
    let filtered = data || []

    if (startDate) {
      filtered = filtered.filter((r) => r.session_detail?.date >= startDate)
    }
    if (endDate) {
      filtered = filtered.filter((r) => r.session_detail?.date <= endDate)
    }
    if (statusFilter) {
      filtered = filtered.filter((r) => r.status === statusFilter)
    }

    return filtered
  }, [data, startDate, endDate, statusFilter])

  const records = filteredRecords
  const summary = attendanceSummary(records)

  if (loading && !data) return <LoadingSpinner block label="Loading attendance…" />
  if (error) {
    return (
      <ErrorMessage
        error={error}
        title="Could not load attendance"
        onRetry={reload}
      />
    )
  }

  const hasFilters = startDate || endDate || statusFilter
  const totalRecords = (data || []).length

  return (
    <div className="two-col">
      <section className="card">
        {/* Filter controls */}
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="stack stack-xs" style={{ width: '100%' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Filter Records</h3>
            <div className="row row-wrap" style={{ gap: '8px' }}>
              <div className="field" style={{ margin: 0, minWidth: '140px' }}>
                <label htmlFor="start-date" className="sr-only">From date</label>
                <input
                  id="start-date"
                  type="date"
                  className="input input-sm"
                  placeholder="From date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="Filter from date"
                />
              </div>
              <div className="field" style={{ margin: 0, minWidth: '140px' }}>
                <label htmlFor="end-date" className="sr-only">To date</label>
                <input
                  id="end-date"
                  type="date"
                  className="input input-sm"
                  placeholder="To date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-label="Filter to date"
                />
              </div>
              <div className="field" style={{ margin: 0, minWidth: '140px' }}>
                <label htmlFor="status-filter" className="sr-only">Status</label>
                <select
                  id="status-filter"
                  className="select select-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused</option>
                </select>
              </div>
              {hasFilters && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setStartDate('')
                    setEndDate('')
                    setStatusFilter('')
                  }}
                  title="Clear filters"
                >
                  <Icon name="close" size={15} />
                  Clear
                </button>
              )}
            </div>
            {hasFilters && (
              <p className="subtle" style={{ fontSize: '0.85rem', margin: 0 }}>
                Showing {records.length} of {totalRecords} records
              </p>
            )}
          </div>
        </div>

        {records.length === 0 ? (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title={hasFilters ? "No records match filters" : "No attendance records"}
              message={hasFilters ? "Try adjusting your filters." : "Nothing has been recorded for this selection yet."}
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 100).map((record) => (
                  <tr key={record.id}>
                    <td data-label="Date">{formatDate(record.session_detail?.date)}</td>
                    <td data-label="Class" className="cell-main">
                      {record.session_detail?.section_name || '—'}
                    </td>
                    <td data-label="Subject">
                      {record.session_detail?.subject_name || '—'}
                    </td>
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
        )}
      </section>

      <div className="stack stack-md">
        <AttendanceSummaryCard attendance={summary} />
        {records.length > 100 && (
          <p className="subtle">Showing the first 100 of {records.length} records. Use filters to narrow results.</p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shared dialogs                                                      */
/* ------------------------------------------------------------------ */

/** Confirmation dialog used before destructive/losing actions. */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = false,
}) {
  if (!open) return null

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      width={460}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.92rem' }}>
        {message}
      </p>
    </Modal>
  )
}

function EditSessionModal({ session, onClose, onUpdated, onDeleted }) {
  const [date, setDate] = useState(session?.date || '')
  const [notes, setNotes] = useState(session?.notes || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function submit(event) {
    event?.preventDefault?.()
    if (busy) return
    handleUpdate()
  }

  async function handleUpdate() {
    setError(null)
    if (!date) return setError('Date is required.')

    setBusy(true)
    try {
      const updated = await api.patch(`/attendance/sessions/${session.id}/`, {
        date,
        notes: notes.trim(),
      })
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await api.delete(`/attendance/sessions/${session.id}/`)
      onDeleted(session.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!session) return null

  return (
    <Modal
      open
      title="Edit attendance session"
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      footer={
        <>
          <button
            type="button"
            className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`}
            onClick={handleDelete}
            disabled={busy}
          >
            {confirmDelete ? 'Confirm delete?' : 'Delete session'}
          </button>
          <span className="grow" />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form className="stack stack-sm" onSubmit={submit} aria-label="Edit attendance session">
        <div className="field">
          <label htmlFor="edit-session-class">Class and subject</label>
          <input
            id="edit-session-class"
            className="input"
            value={`${session.subject_name} — ${session.section_name}`}
            disabled
            readOnly
          />
          <p className="hint">
            Class and subject cannot be changed for an existing session.
          </p>
        </div>

        <div className="field">
          <label htmlFor="edit-session-date">
            Date <span style={{ color: 'var(--red-700)' }}>*</span>
          </label>
          <input
            id="edit-session-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
            max={TODAY_ISO}
          />
        </div>

        <div className="field">
          <label htmlFor="edit-session-notes">Notes</label>
          <textarea
            id="edit-session-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="e.g., Make-up class, Special schedule"
          />
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={15} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}

function NewSessionDialog({ onCreated, existingSessions = [] }) {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const [open, setOpen] = useState(false)
  const [assignment, setAssignment] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Check for duplicate sessions
  const isDuplicate = () => {
    if (!assignment || !date) return false
    return existingSessions.some(
      (s) => s.teacher_assignment === Number(assignment) && s.date === date
    )
  }

  function close() {
    if (busy) return
    setOpen(false)
    setError(null)
  }

  function submit(event) {
    event?.preventDefault?.()
    if (busy) return

    setError(null)
    if (!assignment) return setError('Please select a class and subject.')
    if (!date) return setError('Please select a date for this session.')
    if (isDuplicate()) {
      return setError('A session for this class on this date already exists.')
    }

    setBusy(true)
    api
      .post('/attendance/sessions/', {
        teacher_assignment: Number(assignment),
        date,
        notes: notes.trim(),
      })
      .then((created) => {
        setOpen(false)
        setAssignment('')
        setDate('')
        setNotes('')
        onCreated(created)
      })
      .catch((err) => {
        // Handle backend duplicate constraint error
        if (/unique|duplicate/i.test(err.message)) {
          setError('A session for this class on this date already exists.')
        } else {
          setError(err.message)
        }
      })
      .finally(() => setBusy(false))
  }

  const duplicate = isDuplicate()

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
        disabled={assignments.loading}
        aria-haspopup="dialog"
        aria-label="Create new attendance session"
      >
        <Icon name="plus" size={15} />
        New attendance session
      </button>

      <Modal
        open={open}
        title="New attendance session"
        onClose={close}
        dismissible={!busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={busy || duplicate}
            >
              {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
              {busy ? 'Creating…' : 'Create session'}
            </button>
          </>
        }
      >
        <form
          className="stack stack-sm"
          onSubmit={submit}
          aria-label="New attendance session"
        >
          <div className="field">
            <label htmlFor="session-class">
              Class and subject <span style={{ color: 'var(--red-700)' }}>*</span>
            </label>
            <select
              id="session-class"
              className="select"
              value={assignment}
              onChange={(event) => setAssignment(event.target.value)}
              disabled={busy}
              required
            >
              <option value="">Select a class…</option>
              {(assignments.data || []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.subject_name} — {option.section_name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="session-date">
              Date <span style={{ color: 'var(--red-700)' }}>*</span>
            </label>
            <input
              id="session-date"
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
              required
              max={TODAY_ISO}
            />
          </div>

          <div className="field">
            <label htmlFor="session-notes">Notes (optional)</label>
            <input
              id="session-notes"
              className="input"
              placeholder="e.g., Make-up class, Special schedule"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
            />
          </div>

          {duplicate && (
            <div className="alert alert-warning" role="alert">
              <Icon name="info" size={15} />
              <span>A session for this class on this date already exists.</span>
            </div>
          )}

          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={15} />
              <span>{error}</span>
            </div>
          )}
        </form>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Teacher: attendance-taking sheet                                    */
/* ------------------------------------------------------------------ */

/**
 * Compact four-way status control. Real radio inputs keep the whole group
 * keyboard operable (Tab to enter, arrow keys to move between statuses) and
 * expose correct semantics to screen readers.
 */
function StatusSegment({ student, value, onChange, disabled }) {
  const name = student.user?.full_name || student.user?.username || 'this student'

  return (
    <div
      className="seg-group"
      role="group"
      aria-label={`Attendance status for ${name}`}
    >
      {STATUSES.map((status) => {
        const meta = attendanceStatus(status)
        const id = `att-${student.id}-${status}`
        return (
          <label className={`seg seg-${status}`} key={status} htmlFor={id}>
            <input
              className="seg-input"
              type="radio"
              id={id}
              name={`att-status-${student.id}`}
              value={status}
              checked={value === status}
              onChange={() => onChange(status)}
              disabled={disabled}
            />
            <span className="seg-face">{meta.label}</span>
          </label>
        )
      })}
    </div>
  )
}

/** Per-student note editor. Mounted only while a row is being edited, so the
 *  draft always starts from the note's current value. */
function NotesDialog({ student, value, onApply, onClose, busy }) {
  const [text, setText] = useState(value || '')

  const name = student.user?.full_name || student.user?.username || 'student'

  return (
    <Modal
      open
      title={`Notes · ${name}`}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      width={480}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setText('')
              onApply('')
            }}
            disabled={busy}
          >
            Clear note
          </button>
          <span className="grow" />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onApply(text.trim())}
            disabled={busy}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="student-note">Note for {name}</label>
        <textarea
          id="student-note"
          className="textarea"
          rows={4}
          maxLength={200}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={busy}
          placeholder="e.g., Doctor's appointment, family emergency"
        />
        <p className="hint">
          {text.length}/200 · applied to the sheet, then recorded with Save attendance.
        </p>
      </div>
    </Modal>
  )
}

/**
 * The attendance-taking view for one session: compact roster table, live
 * summary, search, bulk marking and a sticky save bar. Nothing is written
 * until "Save attendance" is pressed, so the sheet can be reviewed first.
 */
function AttendanceSheet({
  session,
  students,
  assignments,
  onChanged,
  onBack,
  title = 'Take attendance',
  backLabel = 'Attendance sessions',
}) {
  const [pending, setPending] = useState({})
  const [applied, setApplied] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [query, setQuery] = useState('')
  const [notesFor, setNotesFor] = useState(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const flashTimer = useRef(null)

  const assignment = assignments.find((a) => a.id === session.teacher_assignment)
  const roster = useMemo(
    () => (assignment ? students.filter((s) => s.section === assignment.section) : []),
    [students, assignment]
  )
  const records = useMemo(
    () => new Map((session.records || []).map((r) => [r.student, r])),
    [session.records]
  )

  const dirtyCount = Object.keys(pending).length
  const isDirtyState = dirtyCount > 0

  function clearFlash() {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = null
  }

  useEffect(() => clearFlash, [])

  // Rows saved a moment ago wait in `applied` until the refreshed session
  // payload carries them; then the server copy is the source of truth again.
  useEffect(() => {
    setApplied({})
  }, [session.records])

  // Navigating away from the page (close/refresh) must not lose a review-first
  // sheet silently; the in-app back button has its own confirm dialog.
  useEffect(() => {
    if (!isDirtyState) return undefined
    const handler = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirtyState])

  function announce(message) {
    clearFlash()
    setFlash(message)
    flashTimer.current = setTimeout(() => setFlash(null), 4000)
  }

  /** Last known server-side state for a student (live row or just-saved row). */
  function stored(id) {
    const record = records.get(id)
    if (record) {
      return { id: record.id, status: record.status, notes: record.notes || '' }
    }
    const mirror = applied[id]
    if (mirror) {
      return { id: mirror.recordId ?? null, status: mirror.status, notes: mirror.notes || '' }
    }
    return null
  }

  function statusOf(student) {
    return pending[student.id]?.status ?? stored(student.id)?.status ?? null
  }

  function notesOf(student) {
    return pending[student.id]?.notes ?? stored(student.id)?.notes ?? ''
  }

  /** Stage a change (or drop it when it matches the saved state again). */
  function stage(student, patch) {
    const base = stored(student.id)
    const merged = { ...pending[student.id], ...patch }
    const nextStatus = merged.status ?? base?.status ?? null
    const nextNotes = merged.notes ?? base?.notes ?? ''
    const changed =
      nextStatus !== (base?.status ?? null) || nextNotes !== (base?.notes || '')

    setPending((prev) => {
      const next = { ...prev }
      if (changed) next[student.id] = merged
      else delete next[student.id]
      return next
    })
  }

  const counts = useMemo(() => {
    const tally = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
    roster.forEach((student) => {
      const value = statusOf(student)
      if (value && tally[value] !== undefined) tally[value] += 1
      else tally.unmarked += 1
    })
    return tally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, pending, applied, records])

  const filtered = useMemo(() => {
    if (!query.trim()) return roster
    const needle = query.trim().toLowerCase()
    return roster.filter((student) => {
      const name = student.user?.full_name?.toLowerCase() || ''
      const lrn = student.lrn?.toLowerCase() || ''
      const username = student.user?.username?.toLowerCase() || ''
      return name.includes(needle) || lrn.includes(needle) || username.includes(needle)
    })
  }, [roster, query])

  function markAllPresent() {
    const next = { ...pending }
    roster.forEach((student) => {
      if (statusOf(student) !== 'present') {
        next[student.id] = { ...next[student.id], status: 'present' }
      }
    })
    setPending(next)
    announce(
      `All ${roster.length} students marked present — select Save attendance to record.`
    )
  }

  async function save() {
    const entries = Object.entries(pending)
    if (!entries.length || saving) return

    setSaving(true)
    setError(null)
    clearFlash()
    setFlash(null)

    const nextApplied = { ...applied }
    const failed = []

    await Promise.all(
      entries.map(async ([key, patch]) => {
        const studentId = Number(key)
        try {
          const current = stored(studentId)
          const nextStatus = patch.status ?? current?.status ?? 'present'
          const nextNotes = patch.notes ?? current?.notes ?? ''
          let saved

          if (current?.id) {
            const body = {}
            if (patch.status !== undefined && patch.status !== current.status) {
              body.status = patch.status
            }
            if (patch.notes !== undefined && patch.notes !== current.notes) {
              body.notes = patch.notes
            }
            saved = Object.keys(body).length
              ? await api.patch(`/attendance/records/${current.id}/`, body)
              : { id: current.id, status: nextStatus, notes: nextNotes }
          } else {
            saved = await api.post('/attendance/records/', {
              session: session.id,
              student: studentId,
              status: nextStatus,
              ...(patch.notes !== undefined ? { notes: nextNotes } : {}),
            })
          }

          nextApplied[studentId] = {
            recordId: saved?.id ?? current?.id ?? null,
            status: saved?.status ?? nextStatus,
            notes: saved?.notes ?? nextNotes,
          }
        } catch (err) {
          failed.push({ studentId, message: err.message })
        }
      })
    )

    setApplied(nextApplied)
    setPending(
      entries.reduce((keep, [key, patch]) => {
        if (failed.some((f) => f.studentId === Number(key))) keep[key] = patch
        return keep
      }, {})
    )
    setSaving(false)
    onChanged()

    if (failed.length === 0) {
      announce(
        `Attendance saved · ${entries.length} change${entries.length === 1 ? '' : 's'}`
      )
    } else if (failed.length === 1) {
      setError(`Could not save a change: ${failed[0].message}`)
    } else {
      setError(
        `Could not save ${failed.length} changes. They are still marked unsaved — try again.`
      )
    }
  }

  function requestBack() {
    if (isDirtyState) setConfirmLeave(true)
    else onBack()
  }

  /** Leaving the sheet: drop staged edits and go back. */
  function leaveDiscarding() {
    setPending({})
    setConfirmLeave(false)
    onBack()
  }

  /** Footer Discard: drop staged edits but stay on the sheet. */
  function discardChanges() {
    setPending({})
    setConfirmDiscard(false)
  }

  const headerLeft = (
    <div className="row row-wrap" style={{ gap: 12, minWidth: 0 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={requestBack}
        disabled={saving}
        aria-label={`Back to ${backLabel}`}
      >
        <Icon name="arrowLeft" size={15} />
        {backLabel === 'Attendance sessions' ? 'Sessions' : backLabel}
      </button>
      <div className="stack stack-xs" style={{ minWidth: 0 }}>
        <h2>{title}</h2>
        <span className="subtle text-truncate">
          {session.subject_name || '—'} · {session.section_name || '—'} ·{' '}
          {formatDate(session.date)}
        </span>
      </div>
    </div>
  )

  const headerRight = (
    <div className="row row-wrap" style={{ gap: 10 }}>
      {session.notes && (
        <span className="badge badge-neutral" title={session.notes}>
          Session note
        </span>
      )}
      <span className="subtle">Created {formatRelative(session.created_at)}</span>
    </div>
  )

  /* ---- loading & data problems ---------------------------------- */

  const rosterLoading =
    (!assignments.data && assignments.loading) || (!students.data && students.loading)
  const rosterError = assignments.error || students.error

  if (rosterLoading) {
    return (
      <section className="card">
        <header className="card-header">
          {headerLeft}
          {headerRight}
        </header>
        <LoadingSpinner block label="Loading class roster…" />
      </section>
    )
  }

  if (rosterError) {
    return (
      <section className="card">
        <header className="card-header">
          {headerLeft}
          {headerRight}
        </header>
        <div className="card-body">
          <ErrorMessage
            error={rosterError}
            title="Could not load the class roster"
            onRetry={() => {
              assignments.reload()
              students.reload()
            }}
          />
        </div>
      </section>
    )
  }

  if (!assignment) {
    return (
      <section className="card">
        <header className="card-header">
          {headerLeft}
          {headerRight}
        </header>
        <div className="card-body">
          <p className="muted">Class details for this session are unavailable.</p>
        </div>
      </section>
    )
  }

  if (roster.length === 0) {
    return (
      <section className="card">
        <header className="card-header">
          {headerLeft}
          {headerRight}
        </header>
        <div className="card-body">
          <EmptyState
            icon="users"
            title="No students in this section"
            message="Students enrolled in this section will appear here."
          />
        </div>
      </section>
    )
  }

  /* ---- sheet ----------------------------------------------------- */

  return (
    <section className="card att-sheet">
      <header className="card-header att-sheet-head">
        {headerLeft}
        {headerRight}
      </header>

      <div className="att-toolbar">
        <div className="att-summary" role="group" aria-label="Attendance summary">
          <span className="att-total">{roster.length} students</span>
          <span className="badge badge-green">{counts.present} Present</span>
          <span className="badge badge-red">{counts.absent} Absent</span>
          <span className="badge badge-amber">{counts.late} Late</span>
          <span className="badge badge-blue">{counts.excused} Excused</span>
          <span className="badge badge-neutral">{counts.unmarked} Unmarked</span>
          {query.trim() && (
            <span className="subtle">
              · showing {filtered.length} of {roster.length}
            </span>
          )}
        </div>

        <div className="att-tools">
          <div className="att-search">
            <label htmlFor="att-student-search" className="sr-only">
              Search students
            </label>
            <Icon name="search" size={15} />
            <input
              id="att-student-search"
              type="search"
              className="input input-sm"
              placeholder="Search students…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={saving}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={markAllPresent}
            disabled={saving}
            title={`Mark all ${roster.length} students present`}
          >
            Mark all present
          </button>
        </div>
      </div>

      {(error || flash) && (
        <div className="att-alerts">
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={15} />
              <span>{error}</span>
            </div>
          )}
          {flash && (
            <div className="alert alert-success" role="status">
              <Icon name="check" size={15} />
              <span>{flash}</span>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card-body">
          <EmptyState
            icon="search"
            title="No students found"
            message="Try a different search term."
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table responsive-table att-roster">
            <colgroup>
              <col style={{ width: '44px' }} />
              <col />
              <col style={{ width: '15%' }} />
              <col style={{ width: '300px' }} />
              <col style={{ width: '19%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Student</th>
                <th scope="col">Student ID</th>
                <th scope="col">Attendance status</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, index) => {
                const status = statusOf(student)
                const note = notesOf(student)
                const changed = pending[student.id] !== undefined
                const savedStatus = stored(student.id)?.status
                const name = student.user?.full_name || student.user?.username || '—'
                const identifier = student.lrn || student.user?.username || '—'

                return (
                  <tr key={student.id} className={changed ? 'is-pending' : undefined}>
                    <td className="att-idx" data-label="">
                      {index + 1}
                    </td>
                    <td data-label="Student" className="cell-main">
                      <span className="att-name-wrap">
                        {changed && (
                          <span
                            className="att-dirty-dot"
                            title="Unsaved change"
                            aria-hidden="true"
                          />
                        )}
                        <span className="att-name" title={name}>
                          {name}
                        </span>
                      </span>
                    </td>
                    <td data-label="Student ID" className="att-id" title={identifier}>
                      {identifier}
                    </td>
                    <td data-label="Status">
                      <StatusSegment
                        student={student}
                        value={status}
                        onChange={(next) => stage(student, { status: next })}
                        disabled={saving}
                      />
                      {changed && savedStatus && (
                        <span className="att-was">
                          was {attendanceStatus(savedStatus).label}
                        </span>
                      )}
                    </td>
                    <td data-label="Notes" className="att-notes">
                      <button
                        type="button"
                        className={`btn btn-ghost btn-xs att-note-btn${note ? ' has-note' : ''}`}
                        onClick={() => setNotesFor(student)}
                        disabled={saving}
                        title={note ? `Edit note: ${note}` : `Add a note for ${name}`}
                      >
                        <Icon name="pencil" size={13} />
                        <span className="att-note-text">{note || 'Add note'}</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="att-foot">
        <div className="att-foot-status" role="status" aria-live="polite">
          {saving ? (
            <span className="att-saved">
              <span className="spinner spinner-sm" aria-hidden="true" />
              Saving…
            </span>
          ) : isDirtyState ? (
            <span className="badge badge-amber">
              {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="att-saved">
              <Icon name="check" size={14} />
              All changes saved
            </span>
          )}
        </div>
        <div className="row row-wrap" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmDiscard(true)}
            disabled={!isDirtyState || saving}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={!isDirtyState || saving}
          >
            {saving && <span className="spinner spinner-sm" aria-hidden="true" />}
            Save attendance
          </button>
        </div>
      </footer>

      {notesFor && (
        <NotesDialog
          student={notesFor}
          value={notesOf(notesFor)}
          busy={saving}
          onClose={() => setNotesFor(null)}
          onApply={(text) => {
            stage(notesFor, { notes: text })
            setNotesFor(null)
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        message={`This session has ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}. Discarding returns the sheet to the last saved state.`}
        confirmLabel="Discard changes"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={discardChanges}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Discard unsaved changes?"
        message={`This session has ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'} that will be lost when you leave.`}
        confirmLabel="Discard changes"
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={leaveDiscarding}
      />
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Teacher: sessions list                                              */
/* ------------------------------------------------------------------ */

function CompletionCell({ completion }) {
  if (!completion) return <span className="subtle">—</span>

  const { recordedCount, totalCount, percentage, isComplete } = completion
  return (
    <div
      className="att-completion"
      title={`${recordedCount} of ${totalCount} students marked`}
    >
      {isComplete ? (
        <span className="badge badge-green">Complete</span>
      ) : (
        <span className="att-bar" aria-hidden="true">
          <span style={{ width: `${percentage}%` }} />
        </span>
      )}
      <span className="att-frac">
        {recordedCount}/{totalCount}
      </span>
    </div>
  )
}

/** Per-status tallies derived from a session's persisted records. */
function sessionStats(session) {
  const tally = { recorded: 0, present: 0, absent: 0, late: 0, excused: 0 }
  ;(session.records || []).forEach((record) => {
    tally.recorded += 1
    if (tally[record.status] !== undefined) tally[record.status] += 1
  })
  return tally
}

/** Completion of a session against the students enrolled in its section. */
function completionInfo(session, assignments, students) {
  const assignment = assignments.find((a) => a.id === session.teacher_assignment)
  if (!assignment) return null

  const totalCount = students.filter((s) => s.section === assignment.section).length
  if (totalCount === 0) return null

  const recordedCount = (session.records || []).length
  return {
    recordedCount,
    totalCount,
    percentage: Math.round((recordedCount / totalCount) * 100),
    isComplete: recordedCount === totalCount,
  }
}

/**
 * Pill tablist used to switch the teacher between the two attendance views.
 * Follows the same chip pattern as the parent child selector.
 */
function ViewTabs({ value, onChange, views, label }) {
  return (
    <div className="att-tabs" role="tablist" aria-label={label}>
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          id={`att-tab-${view.id}`}
          aria-selected={value === view.id}
          aria-controls={`att-panel-${view.id}`}
          className="att-tab"
          onClick={() => onChange(view.id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}

const HISTORY_PAGE_SIZE = 15

/**
 * Attendance history — saved sessions with the counts read back from the
 * records the teacher already has access to. Filtering and paging happen
 * client-side over the teacher-scoped session list the API returns.
 */
function SessionHistory({ sessions, assignments, students, loading, error, onRetry, onOpen }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [classId, setClassId] = useState('')
  const [subject, setSubject] = useState('')
  const [page, setPage] = useState(1)

  const subjects = useMemo(() => {
    const names = new Set()
    sessions.forEach((session) => {
      if (session.subject_name) names.add(session.subject_name)
    })
    return [...names].sort()
  }, [sessions])

  const filtered = useMemo(() => {
    return sessions.filter((session) => {
      if (from && !(session.date >= from)) return false
      if (to && !(session.date <= to)) return false
      if (classId && session.teacher_assignment !== Number(classId)) return false
      if (subject && session.subject_name !== subject) return false
      return true
    })
  }, [sessions, from, to, classId, subject])

  const pageCount = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const offset = (current - 1) * HISTORY_PAGE_SIZE
  const visible = filtered.slice(offset, offset + HISTORY_PAGE_SIZE)

  const hasFilters = Boolean(from || to || classId || subject)
  const start = filtered.length === 0 ? 0 : offset + 1
  const end = Math.min(offset + HISTORY_PAGE_SIZE, filtered.length)

  return (
    <section className="card">
      <header className="card-header">
        <div className="stack stack-xs">
          <h2>Saved sessions</h2>
          <span className="subtle">
            {hasFilters
              ? `${filtered.length} of ${sessions.length} sessions`
              : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </header>

      <div className="att-filters">
        <div className="field">
          <label htmlFor="hist-from" className="sr-only">From date</label>
          <input
            id="hist-from"
            className="input input-sm"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            disabled={loading}
            aria-label="History from date"
            max={to || undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="hist-to" className="sr-only">To date</label>
          <input
            id="hist-to"
            className="input input-sm"
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            disabled={loading}
            aria-label="History to date"
            min={from || undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="hist-class" className="sr-only">Filter by class</label>
          <select
            id="hist-class"
            className="select select-sm"
            value={classId}
            onChange={(e) => { setClassId(e.target.value); setPage(1) }}
            disabled={loading}
            aria-label="History class filter"
          >
            <option value="">All classes</option>
            {(assignments || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.subject_name} — {a.section_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hist-subject" className="sr-only">Filter by subject</label>
          <select
            id="hist-subject"
            className="select select-sm"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setPage(1) }}
            disabled={loading}
            aria-label="History subject filter"
          >
            <option value="">All subjects</option>
            {subjects.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFrom('')
              setTo('')
              setClassId('')
              setSubject('')
              setPage(1)
            }}
            aria-label="Clear history filters"
          >
            <Icon name="close" size={14} />
            Clear
          </button>
        )}
      </div>

      {loading && !sessions.length && (
        <div className="card-body">
          <LoadingSpinner block label="Loading attendance history…" />
        </div>
      )}

      {error && (
        <div className="card-body">
          <ErrorMessage
            error={error}
            title="Could not load attendance history"
            onRetry={onRetry}
          />
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="card-body">
          <EmptyState
            icon="calendar"
            title="No attendance history yet"
            message="Sessions you save from the Take attendance view appear here."
          />
        </div>
      )}

      {!loading && !error && sessions.length > 0 && filtered.length === 0 && (
        <div className="card-body">
          <EmptyState
            icon="search"
            title="No sessions match your filters"
            message="Try widening the date range or clearing a filter."
          />
        </div>
      )}

      {visible.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table att-sessions att-history">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Class</th>
                <th scope="col">Subject</th>
                <th scope="col" className="att-count">Recorded</th>
                <th scope="col" className="att-count">Present</th>
                <th scope="col" className="att-count">Absent</th>
                <th scope="col" className="att-count">Late</th>
                <th scope="col" className="att-count">Excused</th>
                <th scope="col">Completion</th>
                <th scope="col" className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((session) => {
                const stats = sessionStats(session)
                return (
                  <tr key={session.id}>
                    <td data-label="Date">
                      <strong>{formatDate(session.date)}</strong>
                    </td>
                    <td data-label="Class" className="cell-main">
                      {session.section_name || '—'}
                    </td>
                    <td data-label="Subject">{session.subject_name || '—'}</td>
                    <td data-label="Recorded" className="att-count">{stats.recorded}</td>
                    <td data-label="Present" className="att-count att-count-present">{stats.present}</td>
                    <td data-label="Absent" className="att-count att-count-absent">{stats.absent}</td>
                    <td data-label="Late" className="att-count att-count-late">{stats.late}</td>
                    <td data-label="Excused" className="att-count att-count-excused">{stats.excused}</td>
                    <td data-label="Completion">
                      <CompletionCell
                        completion={completionInfo(session, assignments || [], students || [])}
                      />
                    </td>
                    <td data-label="Details">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onOpen(session)}
                          aria-label={`View session details for ${session.section_name} on ${formatDate(session.date)}`}
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="att-pager">
          <span className="subtle">
            Showing {start}–{end} of {filtered.length} session
            {filtered.length === 1 ? '' : 's'}
          </span>
          {pageCount > 1 && (
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                <Icon name="arrowLeft" size={14} />
                Previous
              </button>
              <span className="subtle">Page {current} of {pageCount}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={current >= pageCount}
                onClick={() => setPage(current + 1)}
              >
                Next
                <Icon name="arrowRight" size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Attendance history for one student: search across the students enrolled in
 * this teacher's classes, then read their records back through the same
 * records endpoint the student view uses (the backend scopes it).
 */
function StudentHistory({ students, assignments, sessions, loading, error, onRetry, onOpenSession }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  // Only students inside this teacher's assigned sections are searchable.
  const sections = useMemo(
    () => new Set((assignments || []).map((a) => a.section)),
    [assignments]
  )
  const authorized = useMemo(
    () => students.filter((student) => sections.has(student.section)),
    [students, sections]
  )

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return authorized
      .filter((student) => {
        const name = (student.user?.full_name || '').toLowerCase()
        const username = (student.user?.username || '').toLowerCase()
        const lrn = (student.lrn || '').toLowerCase()
        return name.includes(needle) || username.includes(needle) || lrn.includes(needle)
      })
      .slice(0, 8)
  }, [authorized, query])

  const selected = authorized.find((s) => s.id === selectedId) || null

  const records = useFetch('/attendance/records/', {
    list: true,
    params: selected ? { student: selected.id } : null,
    enabled: Boolean(selected),
  })

  const rows = records.data || []
  const summary = attendanceSummary(rows)

  if (loading && !students.length) {
    return (
      <section className="card">
        <LoadingSpinner block label="Loading students…" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="card">
        <div className="card-body">
          <ErrorMessage error={error} title="Could not load students" onRetry={onRetry} />
        </div>
      </section>
    )
  }

  /* ---- pick a student --------------------------------------------- */

  if (!selected) {
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
          <div className="att-search att-search-wide">
            <label htmlFor="hist-student-search" className="sr-only">
              Search students
            </label>
            <Icon name="search" size={15} />
            <input
              id="hist-student-search"
              className="input input-sm"
              type="search"
              placeholder="Search by name, username or student ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {query.trim() && matches.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="search"
              title="No students found"
              message="No student in your classes matches that search."
            />
          </div>
        )}

        {matches.length > 0 && (
          <div className="att-student-hits">
            {matches.map((student) => {
              const name = student.user?.full_name || student.user?.username || '—'
              return (
                <button
                  key={student.id}
                  type="button"
                  className="att-student-hit"
                  onClick={() => setSelectedId(student.id)}
                >
                  <span className="att-name">{name}</span>
                  <span className="hit-meta">
                    {student.lrn || student.user?.username || '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {!query.trim() && (
          <div className="card-body">
            <EmptyState
              icon="users"
              title="Search for a student"
              message="Start typing a name, username or student ID from your classes."
            />
          </div>
        )}
      </section>
    )
  }

  /* ---- records for the selected student --------------------------- */

  const name = selected.user?.full_name || selected.user?.username || '—'

  return (
    <section className="card">
      <header className="card-header">
        <div className="stack stack-xs" style={{ minWidth: 0 }}>
          <h2>{name}</h2>
          <span className="subtle text-truncate">
            {selected.lrn || selected.user?.username || '—'}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setSelectedId(null)
            setQuery('')
          }}
        >
          <Icon name="arrowLeft" size={15} />
          Another student
        </button>
      </header>

      <div className="att-toolbar">
        <div className="att-summary" role="group" aria-label="Attendance totals">
          <span className="att-total">
            {summary.total_records} record{summary.total_records === 1 ? '' : 's'}
          </span>
          <span className="badge badge-green">{summary.by_status.present} Present</span>
          <span className="badge badge-red">{summary.by_status.absent} Absent</span>
          <span className="badge badge-amber">{summary.by_status.late} Late</span>
          <span className="badge badge-blue">{summary.by_status.excused} Excused</span>
          <span className="badge badge-neutral">
            {summary.present_rate !== null
              ? `${summary.present_rate}% present`
              : 'No records'}
          </span>
        </div>
      </div>

      {records.loading && !records.data && (
        <div className="card-body">
          <LoadingSpinner block label="Loading attendance records…" />
        </div>
      )}

      {records.error && (
        <div className="card-body">
          <ErrorMessage
            error={records.error}
            title="Could not load this student's records"
            onRetry={records.reload}
          />
        </div>
      )}

      {!records.loading && !records.error && rows.length === 0 && (
        <div className="card-body">
          <EmptyState
            icon="calendar"
            title="No attendance recorded"
            message="This student has no saved attendance records yet."
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table">
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '16%' }} />
              <col />
            </colgroup>
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
              {rows.map((record) => {
                const session = sessions.find((s) => s.id === record.session)
                return (
                  <tr key={record.id}>
                    <td data-label="Date">
                      <strong>{formatDate(record.session_detail?.date)}</strong>
                    </td>
                    <td data-label="Subject">
                      {record.session_detail?.subject_name || '—'}
                    </td>
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
                      <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <span className="att-note-text" title={record.notes || ''}>
                          {record.notes || <span className="subtle">—</span>}
                        </span>
                        {session && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => onOpenSession(session)}
                            aria-label={`View session of ${formatDate(record.session_detail?.date)}`}
                          >
                            View session
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TeacherAttendance() {
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState('take')
  const [historyTab, setHistoryTab] = useState('sessions')
  const [openId, setOpenId] = useState(null)
  const [openFrom, setOpenFrom] = useState('take')
  const [createdSession, setCreatedSession] = useState(null)
  const [editingSession, setEditingSession] = useState(null)
  const [filterClass, setFilterClass] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const sessions = useFetch('/attendance/sessions/', { list: true, deps: [nonce] })
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const students = useFetch('/students/', { list: true })
  const schedules = useFetch('/schedules/', { list: true })

  const all = useMemo(() => sessions.data || [], [sessions.data])

  // Auto-generate sessions on mount (once schedules are loaded)
  useEffect(() => {
    async function autoGenerate() {
      // Wait for schedules to finish loading
      if (schedules.loading || !schedules.data) return
      
      // Skip if no schedules configured
      if (schedules.data.length === 0) return

      // Skip if already generating
      if (generating) return

      setGenerating(true)
      setGenerateError(null)

      try {
        const today = new Date().toISOString().split('T')[0]
        const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        
        await api.post('/attendance/generate/', {
          start_date: today,
          end_date: endDate,
        })
        
        // Refresh sessions after generation
        refresh()
      } catch (err) {
        setGenerateError(err.message)
      } finally {
        setGenerating(false)
      }
    }

    autoGenerate()
  }, [schedules.loading, schedules.data]) // Run when schedules finish loading

  const list = useMemo(() => {
    let filtered = all

    if (filterClass) {
      const classId = Number(filterClass)
      filtered = filtered.filter((s) => s.teacher_assignment === classId)
    }
    if (filterDate) {
      filtered = filtered.filter((s) => s.date === filterDate)
    }

    return filtered
  }, [all, filterClass, filterDate])

  // Group sessions by today/upcoming/past
  const groupedSessions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const todaySessions = []
    const upcomingSessions = []
    const pastSessions = []

    list.forEach((session) => {
      if (session.date === today) {
        todaySessions.push(session)
      } else if (session.date > today) {
        upcomingSessions.push(session)
      } else {
        pastSessions.push(session)
      }
    })

    // Sort: today and upcoming by start time (if available), past by date desc
    const sortByTime = (a, b) => {
      if (a.schedule_time && b.schedule_time) {
        return a.schedule_time.start_time.localeCompare(b.schedule_time.start_time)
      }
      return a.date.localeCompare(b.date)
    }

    todaySessions.sort(sortByTime)
    upcomingSessions.sort(sortByTime)
    pastSessions.sort((a, b) => b.date.localeCompare(a.date))

    return { todaySessions, upcomingSessions, pastSessions }
  }, [list])

  // A brand-new session is opened straight from its create response; the
  // refreshed list replaces it as soon as it arrives.
  const openSession = openId
    ? all.find((session) => session.id === openId) ||
      (createdSession?.id === openId ? createdSession : null)
    : null

  function refresh() {
    setNonce((n) => n + 1)
  }

  function handleSessionDeleted(deletedId) {
    if (openId === deletedId) setOpenId(null)
    if (createdSession?.id === deletedId) setCreatedSession(null)
    refresh()
  }

  // Calculate completion percentage for a session
  const getCompletionInfo = (session) =>
    completionInfo(session, assignments.data || [], students.data || [])

  /** Open a session sheet, remembering which view to return to. */
  function openSheet(session, from) {
    setOpenFrom(from)
    setOpenId(session.id)
  }

  const hasFilters = Boolean(filterClass || filterDate)
  const visible = list.slice(0, SESSION_ROW_LIMIT)

  /* ---- taking attendance: dedicated view ------------------------- */
  if (openSession) {
    const fromHistory = openFrom === 'history'
    return (
      <div className="stack stack-md">
        <AttendanceSheet
          key={openSession.id}
          session={openSession}
          students={students.data || []}
          assignments={assignments.data || []}
          onChanged={refresh}
          onBack={() => setOpenId(null)}
          title={fromHistory ? 'Session details' : 'Take attendance'}
          backLabel={fromHistory ? 'History' : 'Attendance sessions'}
        />
      </div>
    )
  }

  /* ---- session list ---------------------------------------------- */
  return (
    <div className="stack stack-md">
      {editingSession && (
        <EditSessionModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onUpdated={refresh}
          onDeleted={handleSessionDeleted}
        />
      )}

      <ViewTabs
        value={view}
        onChange={setView}
        label="Attendance view"
        views={[
          { id: 'take', label: 'Take attendance' },
          { id: 'history', label: 'Attendance history' },
        ]}
      />

      {view === 'take' && (
      <section
        className="card"
        role="tabpanel"
        id="att-panel-take"
        aria-labelledby="att-tab-take"
      >
        <header className="card-header">
          <div className="stack stack-xs">
            <h2>Attendance sessions</h2>
            <span className="subtle">
              {list.length === all.length
                ? `${all.length} session${all.length === 1 ? '' : 's'}`
                : `${list.length} of ${all.length} sessions`}
            </span>
          </div>
        </header>

        {generateError && (
          <div className="alert alert-warning" role="alert" style={{ margin: '12px 16px' }}>
            <Icon name="info" size={15} />
            <span>Could not auto-generate sessions: {generateError}</span>
          </div>
        )}

        {/* Debug info - show schedule status */}
        {schedules.loading && (
          <div className="alert alert-info" role="alert" style={{ margin: '12px 16px' }}>
            <Icon name="info" size={15} />
            <span>Loading your class schedules...</span>
          </div>
        )}
        
        {schedules.error && (
          <div className="alert alert-error" role="alert" style={{ margin: '12px 16px' }}>
            <Icon name="info" size={15} />
            <span>Error loading schedules: {schedules.error}</span>
          </div>
        )}

        {schedules.data && schedules.data.length > 0 && (
          <div className="alert alert-success" role="alert" style={{ margin: '12px 16px' }}>
            <Icon name="check" size={15} />
            <span>✅ {schedules.data.length} class schedule{schedules.data.length === 1 ? '' : 's'} configured</span>
          </div>
        )}

        <div className="att-filters">
          <div className="field">
            <label htmlFor="filter-class" className="sr-only">Filter by class</label>
            <select
              id="filter-class"
              className="select select-sm"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              disabled={sessions.loading}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {(assignments.data || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.subject_name} — {a.section_name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-date" className="sr-only">Filter by date</label>
            <input
              id="filter-date"
              className="input input-sm"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              disabled={sessions.loading}
              aria-label="Filter by date"
            />
          </div>

          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setFilterClass('')
                setFilterDate('')
              }}
              aria-label="Clear filters"
            >
              <Icon name="close" size={14} />
              Clear
            </button>
          )}

          <span className="subtle att-filter-meta">
            {hasFilters ? `Showing ${list.length}` : 'Newest first'}
          </span>
        </div>

        {sessions.loading && !sessions.data && (
          <div className="card-body">
            <LoadingSpinner block label="Loading sessions…" />
          </div>
        )}

        {sessions.error && (
          <div className="card-body">
            <ErrorMessage
              error={sessions.error}
              title="Could not load sessions"
              onRetry={sessions.reload}
            />
          </div>
        )}

        {/* Empty state when no schedules configured */}
        {!sessions.loading && !sessions.error && schedules.data && schedules.data.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title="No class schedules configured"
              message="Ask your administrator to configure your class schedule. Attendance sessions are automatically generated based on your schedule."
            />
          </div>
        )}

        {!sessions.loading && !sessions.error && schedules.data && schedules.data.length > 0 && all.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title="No attendance sessions yet"
              message="Attendance sessions will be automatically generated based on your class schedule."
            />
          </div>
        )}

        {!sessions.loading && !sessions.error && all.length > 0 && list.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="search"
              title="No sessions match your filters"
              message="Try adjusting the class or date filter."
            />
          </div>
        )}

        {/* Today's sessions */}
        {groupedSessions.todaySessions.length > 0 && (
          <>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>
                Today's Sessions ({groupedSessions.todaySessions.length})
              </h3>
            </div>
            <div className="table-wrap">
              <table className="table responsive-table att-sessions">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Class</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Status</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Notes</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSessions.todaySessions.map((session) => (
                    <tr key={session.id}>
                      <td data-label="Time">
                        {session.schedule_time ? (
                          <strong>{session.schedule_time.start_time}</strong>
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td data-label="Class" className="cell-main">
                        {session.section_name || '—'}
                      </td>
                      <td data-label="Subject">{session.subject_name || '—'}</td>
                      <td data-label="Status">
                        <StatusBadge
                          label={session.status_display || 'Not Started'}
                          tone={
                            session.status === 'completed' ? 'green' :
                            session.status === 'in_progress' ? 'blue' :
                            'gray'
                          }
                        />
                      </td>
                      <td data-label="Completion">
                        <CompletionCell completion={getCompletionInfo(session)} />
                      </td>
                      <td data-label="Notes" className="att-notes">
                        {session.notes ? (
                          <span className="att-note-text" title={session.notes}>
                            {session.notes}
                          </span>
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => setEditingSession(session)}
                            title="Edit session"
                            aria-label={`Edit session on ${formatDate(session.date)}`}
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => openSheet(session, 'take')}
                            aria-label={`Take attendance for ${session.section_name}`}
                          >
                            Take attendance
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Upcoming sessions */}
        {groupedSessions.upcomingSessions.length > 0 && (
          <>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>
                Upcoming Sessions ({groupedSessions.upcomingSessions.length})
              </h3>
            </div>
            <div className="table-wrap">
              <table className="table responsive-table att-sessions">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Time</th>
                    <th scope="col">Class</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Status</th>
                    <th scope="col">Notes</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSessions.upcomingSessions.slice(0, 10).map((session) => (
                    <tr key={session.id}>
                      <td data-label="Date">
                        <strong>{formatDate(session.date)}</strong>
                      </td>
                      <td data-label="Time">
                        {session.schedule_time ? (
                          session.schedule_time.start_time
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td data-label="Class" className="cell-main">
                        {session.section_name || '—'}
                      </td>
                      <td data-label="Subject">{session.subject_name || '—'}</td>
                      <td data-label="Status">
                        <StatusBadge
                          label={session.status_display || 'Not Started'}
                          tone="gray"
                        />
                      </td>
                      <td data-label="Notes" className="att-notes">
                        {session.notes ? (
                          <span className="att-note-text" title={session.notes}>
                            {session.notes}
                          </span>
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => setEditingSession(session)}
                            title="Edit session"
                            aria-label={`Edit session on ${formatDate(session.date)}`}
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openSheet(session, 'take')}
                            aria-label={`View session for ${session.section_name} on ${formatDate(session.date)}`}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {groupedSessions.upcomingSessions.length > 10 && (
              <div className="card-body att-more">
                <p className="subtle">
                  Showing the next 10 upcoming sessions — use filters to see more.
                </p>
              </div>
            )}
          </>
        )}

        {/* Past sessions - limited preview */}
        {groupedSessions.pastSessions.length > 0 && (
          <>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>
                Recent History ({groupedSessions.pastSessions.length})
              </h3>
            </div>
            <div className="table-wrap">
              <table className="table responsive-table att-sessions">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Class</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Status</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Notes</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSessions.pastSessions.slice(0, 5).map((session) => (
                    <tr key={session.id}>
                      <td data-label="Date">
                        <strong>{formatDate(session.date)}</strong>
                      </td>
                      <td data-label="Class" className="cell-main">
                        {session.section_name || '—'}
                      </td>
                      <td data-label="Subject">{session.subject_name || '—'}</td>
                      <td data-label="Status">
                        <StatusBadge
                          label={session.status_display || 'Not Started'}
                          tone={
                            session.status === 'completed' ? 'green' :
                            session.status === 'in_progress' ? 'blue' :
                            'gray'
                          }
                        />
                      </td>
                      <td data-label="Completion">
                        <CompletionCell completion={getCompletionInfo(session)} />
                      </td>
                      <td data-label="Notes" className="att-notes">
                        {session.notes ? (
                          <span className="att-note-text" title={session.notes}>
                            {session.notes}
                          </span>
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openSheet(session, 'take')}
                            aria-label={`View session details for ${session.section_name} on ${formatDate(session.date)}`}
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {groupedSessions.pastSessions.length > 5 && (
              <div className="card-body att-more">
                <p className="subtle">
                  Showing the 5 most recent past sessions — switch to History tab for complete records.
                </p>
              </div>
            )}
          </>
        )}
      </section>
      )}

      {view === 'history' && (
        <div
          role="tabpanel"
          id="att-panel-history"
          aria-labelledby="att-tab-history"
          className="stack stack-md"
        >
          <ViewTabs
            value={historyTab}
            onChange={setHistoryTab}
            label="Attendance history sections"
            views={[
              { id: 'sessions', label: 'Sessions' },
              { id: 'students', label: 'Students' },
            ]}
          />

          {historyTab === 'sessions' && (
            <div
              role="tabpanel"
              id="att-panel-sessions"
              aria-labelledby="att-tab-sessions"
            >
              <SessionHistory
                sessions={all}
                assignments={assignments.data || []}
                students={students.data || []}
                loading={sessions.loading}
                error={sessions.error}
                onRetry={sessions.reload}
                onOpen={(session) => openSheet(session, 'history')}
              />
            </div>
          )}

          {historyTab === 'students' && (
            <div
              role="tabpanel"
              id="att-panel-students"
              aria-labelledby="att-tab-students"
            >
              <StudentHistory
                students={students.data || []}
                assignments={assignments.data || []}
                sessions={all}
                loading={students.loading}
                error={students.error}
                onRetry={students.reload}
                onOpenSession={(session) => openSheet(session, 'history')}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Parent view                                                         */
/* ------------------------------------------------------------------ */

function ParentAttendance() {
  const summary = useFetch('/dashboard/')
  const [selectedId, setSelectedId] = useState(null)
  const children = summary.data?.children || []
  const activeChild =
    children.find((child) => child.student_id === selectedId) || children[0] || null

  if (summary.loading && !summary.data) return <LoadingSpinner block label="Loading…" />
  if (summary.error) {
    return (
      <ErrorMessage error={summary.error} title="Could not load your children" onRetry={summary.reload} />
    )
  }
  if (children.length === 0) {
    return (
      <section className="card card-pad">
        <EmptyState
          icon="users"
          title="No linked children"
          message="Your account is not connected to a student record yet."
        />
      </section>
    )
  }

  return (
    <div className="stack stack-md">
      <ChildSelector
        items={children}
        selectedId={activeChild?.student_id}
        onSelect={setSelectedId}
      />
      <RecordsView
        params={activeChild ? { student: activeChild.student_id } : null}
        enabled={Boolean(activeChild)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Admin view                                                          */
/* ------------------------------------------------------------------ */

function AdminAttendance() {
  const { data, loading, error, reload } = useFetch('/attendance/sessions/', {
    list: true,
  })
  const sessions = data || []

  if (loading && !data) return <LoadingSpinner block label="Loading sessions…" />
  if (error) {
    return (
      <ErrorMessage error={error} title="Could not load sessions" onRetry={reload} />
    )
  }

  return (
    <section className="card">
      <header className="card-header">
        <h2>Attendance sessions</h2>
        <span className="subtle">{sessions.length} recorded</span>
      </header>

      {sessions.length === 0 ? (
        <div className="card-body">
          <EmptyState
            icon="calendar"
            title="No sessions recorded"
            message="Sessions created by teachers will be listed here."
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Records</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td data-label="Date">{formatDate(session.date)}</td>
                  <td data-label="Class" className="cell-main">
                    {session.section_name || '—'}
                  </td>
                  <td data-label="Subject">{session.subject_name || '—'}</td>
                  <td data-label="Records">{(session.records || []).length}</td>
                  <td data-label="Notes">
                    {session.notes || <span className="subtle">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */

export default function AttendancePage({ mode = 'student' }) {
  const copy = COPY[mode] || COPY.student

  return (
    <div className="stack stack-md">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      {mode === 'student' && <RecordsView params={null} />}
      {mode === 'parent' && <ParentAttendance />}
      {mode === 'teacher' && <TeacherAttendance />}
      {mode === 'admin' && <AdminAttendance />}
    </div>
  )
}
