import { useMemo, useState } from 'react'
import ChildSelector from '../components/ChildSelector'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import AttendanceSummaryCard from '../components/dashboard/AttendanceSummaryCard'
import Card from '../components/dashboard/Card'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import {
  attendanceStatus,
  formatDate,
  formatRelative,
} from '../utils/format'
import { attendanceSummary } from '../utils/stats'

const STATUSES = ['present', 'absent', 'late', 'excused']

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
    subtitle: 'Create a session for a class, then mark each student present or absent.',
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
  const { data, loading, error, reload } = useFetch('/attendance/records/', {
    list: true,
    params,
    enabled,
  })
  const records = data || []
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

  return (
    <div className="two-col">
      <section className="card">
        {records.length === 0 ? (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title="No attendance records"
              message="Nothing has been recorded for this selection yet."
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
                {records.slice(0, 60).map((record) => (
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
        {records.length > 60 && (
          <p className="subtle">Showing the latest 60 records.</p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Teacher: sessions + record sheet                                    */
/* ------------------------------------------------------------------ */

function NewSessionForm({ onCreated }) {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const [open, setOpen] = useState(false)
  const [assignment, setAssignment] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    if (!assignment) return setError('Choose the class for this session.')
    if (!date) return setError('Pick a date for the session.')

    setBusy(true)
    try {
      const created = await api.post('/attendance/sessions/', {
        teacher_assignment: Number(assignment),
        date,
        notes: notes.trim(),
      })
      setOpen(false)
      setNotes('')
      onCreated(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
        disabled={assignments.loading}
      >
        <Icon name="plus" size={15} />
        New attendance session
      </button>
    )
  }

  return (
    <form className="card card-pad stack stack-sm" onSubmit={submit} aria-label="New attendance session">
      <div className="row row-wrap">
        <div className="field grow">
          <label htmlFor="session-class">Class and subject</label>
          <select
            id="session-class"
            className="select"
            value={assignment}
            onChange={(event) => setAssignment(event.target.value)}
            disabled={busy}
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
          <label htmlFor="session-date">Date</label>
          <input
            id="session-date"
            className="input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="session-notes">Notes (optional)</label>
        <input
          id="session-notes"
          className="input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="row row-end">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? 'Creating…' : 'Create session'}
        </button>
      </div>
    </form>
  )
}

function RecordSheet({ session, students, assignments, onChanged }) {
  const [busyStudent, setBusyStudent] = useState(null)
  const [error, setError] = useState(null)

  const assignment = assignments.find((a) => a.id === session.teacher_assignment)
  const classStudents = assignment
    ? students.filter((student) => student.section === assignment.section)
    : []
  const existing = new Map((session.records || []).map((r) => [r.student, r]))

  async function setStatus(student, status) {
    setError(null)
    setBusyStudent(student.id)
    try {
      const record = existing.get(student.id)
      if (record) {
        await api.patch(`/attendance/records/${record.id}/`, { status })
      } else {
        await api.post('/attendance/records/', {
          session: session.id,
          student: student.id,
          status,
        })
      }
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyStudent(null)
    }
  }

  if (!assignment) {
    return (
      <p className="muted">Class details for this session are unavailable.</p>
    )
  }

  if (classStudents.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No students in this section"
        message="Students enrolled in this section will appear here."
      />
    )
  }

  return (
    <div className="stack stack-sm">
      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={15} />
          <span>{error}</span>
        </div>
      )}

      {classStudents.map((student) => {
        const record = existing.get(student.id)
        const current = record?.status
        return (
          <div
            className="row row-between row-wrap"
            key={student.id}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-alt)',
            }}
          >
            <div className="grow" style={{ minWidth: 160 }}>
              <strong style={{ fontSize: '0.93rem' }}>{student.user?.full_name}</strong>
              <div className="subtle">{student.user?.username}</div>
            </div>
            <div className="row row-wrap" role="group" aria-label={`Attendance for ${student.user?.full_name}`}>
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`btn btn-sm ${current === status ? 'btn-primary' : 'btn-ghost'}`}
                  aria-pressed={current === status}
                  onClick={() => setStatus(student, status)}
                  disabled={busyStudent === student.id}
                >
                  {attendanceStatus(status).label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TeacherAttendance() {
  const [nonce, setNonce] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const sessions = useFetch('/attendance/sessions/', { list: true, deps: [nonce] })
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const students = useFetch('/students/', { list: true })

  const list = useMemo(() => sessions.data || [], [sessions.data])
  const selected =
    list.find((session) => session.id === selectedId) || null

  function refresh() {
    setNonce((n) => n + 1)
  }

  return (
    <div className="stack stack-md">
      <NewSessionForm
        onCreated={(created) => {
          refresh()
          if (created?.id) setSelectedId(created.id)
        }}
      />

      <section className="card">
        <header className="card-header">
          <h2>Sessions</h2>
          <span className="subtle">{list.length} recorded</span>
        </header>

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

        {!sessions.loading && !sessions.error && list.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title="No attendance sessions yet"
              message="Create your first session above to start recording attendance."
            />
          </div>
        )}

        {list.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Records</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 40).map((session) => (
                  <tr
                    key={session.id}
                    style={
                      selectedId === session.id
                        ? { background: 'var(--blue-50)' }
                        : undefined
                    }
                  >
                    <td data-label="Date">{formatDate(session.date)}</td>
                    <td data-label="Class" className="cell-main">
                      {session.section_name || '—'}
                    </td>
                    <td data-label="Subject">{session.subject_name || '—'}</td>
                    <td data-label="Records">
                      {(session.records || []).length}
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() =>
                          setSelectedId(selectedId === session.id ? null : session.id)
                        }
                        aria-expanded={selectedId === session.id}
                      >
                        {selectedId === session.id ? 'Close' : 'Take attendance'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <Card
          title={`Take attendance · ${selected.subject_name || ''} · ${formatDate(selected.date)}`}
          action={
            <span className="subtle">
              {(selected.records || []).length} recorded ·{' '}
              {formatRelative(selected.created_at)}
            </span>
          }
        >
          <RecordSheet
            session={selected}
            students={students.data || []}
            assignments={assignments.data || []}
            onChanged={refresh}
          />
        </Card>
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
