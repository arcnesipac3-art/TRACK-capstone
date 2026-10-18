import { useMemo, useState, useCallback } from 'react'
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
import { attendanceSummary, countBy } from '../utils/stats'

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

function NewSessionForm({ onCreated, existingSessions = [] }) {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const [open, setOpen] = useState(false)
  const [assignment, setAssignment] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Check for duplicate sessions
  const isDuplicate = useCallback(() => {
    if (!assignment || !date) return false
    return existingSessions.some(
      (s) => s.teacher_assignment === Number(assignment) && s.date === date
    )
  }, [assignment, date, existingSessions])

  async function submit(event) {
    event.preventDefault()
    setError(null)
    
    // Validation
    if (!assignment) return setError('Please select a class and subject.')
    if (!date) return setError('Please select a date for this session.')
    
    // Duplicate check
    if (isDuplicate()) {
      return setError('A session for this class on this date already exists.')
    }

    setBusy(true)
    try {
      const created = await api.post('/attendance/sessions/', {
        teacher_assignment: Number(assignment),
        date,
        notes: notes.trim(),
      })
      setOpen(false)
      setAssignment('')
      setDate('')
      setNotes('')
      onCreated(created)
    } catch (err) {
      // Handle backend duplicate constraint error
      if (err.message.includes('unique') || err.message.includes('duplicate')) {
        setError('A session for this class on this date already exists.')
      } else {
        setError(err.message)
      }
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
        aria-label="Create new attendance session"
      >
        <Icon name="plus" size={15} />
        New attendance session
      </button>
    )
  }

  const duplicate = isDuplicate()

  return (
    <form className="card card-pad stack stack-sm" onSubmit={submit} aria-label="New attendance session">
      <h3 style={{ fontSize: '1.1rem', margin: 0 }}>New attendance session</h3>
      
      <div className="row row-wrap" style={{ gap: '12px' }}>
        <div className="field grow" style={{ minWidth: '250px' }}>
          <label htmlFor="session-class">
            Class and subject <span style={{ color: 'var(--red-600)' }}>*</span>
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
            Date <span style={{ color: 'var(--red-600)' }}>*</span>
          </label>
          <input
            id="session-date"
            className="input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
            required
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      {duplicate && (
        <div className="alert alert-warning" role="alert">
          <Icon name="info" size={15} />
          <span>A session for this class on this date already exists.</span>
        </div>
      )}

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

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="row row-end" style={{ gap: '8px' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || duplicate}>
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? 'Creating…' : 'Create session'}
        </button>
      </div>
    </form>
  )
}

function RecordSheet({ session, students, assignments, onChanged }) {
  const [busyStudent, setBusyStudent] = useState(null)
  const [busyBulk, setBusyBulk] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  const assignment = assignments.find((a) => a.id === session.teacher_assignment)
  const classStudents = assignment
    ? students.filter((student) => student.section === assignment.section)
    : []
  const existing = new Map((session.records || []).map((r) => [r.student, r]))

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
    classStudents.forEach((student) => {
      const record = existing.get(student.id)
      if (record) {
        counts[record.status] = (counts[record.status] || 0) + 1
      } else {
        counts.unmarked += 1
      }
    })
    return counts
  }, [classStudents, existing])

  async function setStatus(student, status) {
    setError(null)
    setSuccessMessage(null)
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
      setSuccessMessage('Attendance saved')
      setTimeout(() => setSuccessMessage(null), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyStudent(null)
    }
  }

  async function markAllPresent() {
    if (!window.confirm(
      `Mark all ${classStudents.length} students as present? You can change individual statuses after.`
    )) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    setBusyBulk(true)
    
    try {
      // Mark all students present
      const promises = classStudents.map(async (student) => {
        const record = existing.get(student.id)
        if (record) {
          // Only update if not already present
          if (record.status !== 'present') {
            await api.patch(`/attendance/records/${record.id}/`, { status: 'present' })
          }
        } else {
          await api.post('/attendance/records/', {
            session: session.id,
            student: student.id,
            status: 'present',
          })
        }
      })
      
      await Promise.all(promises)
      onChanged()
      setSuccessMessage('All students marked present')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(`Failed to mark all present: ${err.message}`)
    } finally {
      setBusyBulk(false)
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

  const hasUnsavedChanges = statusCounts.unmarked > 0

  return (
    <div className="stack stack-sm">
      {/* Status summary and bulk actions */}
      <div 
        style={{
          padding: '16px',
          background: 'var(--blue-50)',
          border: '1px solid var(--blue-200)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div className="row row-between row-wrap" style={{ gap: '16px', alignItems: 'center' }}>
          <div className="row row-wrap" style={{ gap: '16px', fontSize: '0.9rem' }}>
            <span><strong>{classStudents.length}</strong> students</span>
            <span className="badge badge-green">{statusCounts.present} Present</span>
            {statusCounts.absent > 0 && <span className="badge badge-red">{statusCounts.absent} Absent</span>}
            {statusCounts.late > 0 && <span className="badge badge-amber">{statusCounts.late} Late</span>}
            {statusCounts.excused > 0 && <span className="badge badge-blue">{statusCounts.excused} Excused</span>}
            {statusCounts.unmarked > 0 && (
              <span className="badge" style={{ background: 'var(--gray-200)', color: 'var(--gray-700)' }}>
                {statusCounts.unmarked} Unmarked
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={markAllPresent}
            disabled={busyBulk || busyStudent !== null}
            aria-label="Mark all students present"
          >
            {busyBulk && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busyBulk ? 'Marking all…' : 'Mark all present'}
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={15} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Student list */}
      <div className="stack stack-xs">
        {classStudents.map((student) => {
          const record = existing.get(student.id)
          const current = record?.status
          const isBusy = busyStudent === student.id || busyBulk
          return (
            <div
              className="row row-between row-wrap"
              key={student.id}
              style={{
                padding: '12px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-alt)',
                gap: '12px',
              }}
            >
              <div className="grow" style={{ minWidth: 160 }}>
                <strong style={{ fontSize: '0.93rem' }}>{student.user?.full_name}</strong>
                <div className="subtle" style={{ fontSize: '0.85rem' }}>
                  {student.lrn && `LRN: ${student.lrn}`}
                  {student.lrn && student.user?.username && ' · '}
                  {student.user?.username}
                </div>
              </div>
              <div className="row row-wrap" style={{ gap: '6px' }} role="group" aria-label={`Attendance for ${student.user?.full_name}`}>
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`btn btn-sm ${current === status ? 'btn-primary' : 'btn-ghost'}`}
                    aria-pressed={current === status}
                    onClick={() => setStatus(student, status)}
                    disabled={isBusy}
                    title={`Mark as ${status}`}
                  >
                    {attendanceStatus(status).label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {hasUnsavedChanges && (
        <div className="alert" style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-300)' }} role="status">
          <Icon name="info" size={15} />
          <span>
            <strong>{statusCounts.unmarked} student{statusCounts.unmarked === 1 ? '' : 's'}</strong> not yet marked.
            Select a status for each student to complete attendance.
          </span>
        </div>
      )}
    </div>
  )
}

function TeacherAttendance() {
  const [nonce, setNonce] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [filterClass, setFilterClass] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const sessions = useFetch('/attendance/sessions/', { list: true, deps: [nonce] })
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const students = useFetch('/students/', { list: true })

  const list = useMemo(() => {
    let filtered = sessions.data || []
    
    // Filter by class/subject
    if (filterClass) {
      const classId = Number(filterClass)
      filtered = filtered.filter((s) => s.teacher_assignment === classId)
    }
    
    // Filter by date
    if (filterDate) {
      filtered = filtered.filter((s) => s.date === filterDate)
    }
    
    return filtered
  }, [sessions.data, filterClass, filterDate])

  const selected =
    list.find((session) => session.id === selectedId) || null

  function refresh() {
    setNonce((n) => n + 1)
  }

  // Clear selection if filtered out
  useMemo(() => {
    if (selectedId && !list.find((s) => s.id === selectedId)) {
      setSelectedId(null)
    }
  }, [list, selectedId])

  return (
    <div className="stack stack-md">
      <NewSessionForm
        existingSessions={sessions.data || []}
        onCreated={(created) => {
          refresh()
          if (created?.id) setSelectedId(created.id)
        }}
      />

      <section className="card">
        <header className="card-header">
          <div className="row row-between row-wrap" style={{ gap: '12px', alignItems: 'center', width: '100%' }}>
            <div>
              <h2 style={{ margin: 0 }}>Sessions</h2>
              <span className="subtle">{list.length} of {(sessions.data || []).length} session{(sessions.data || []).length === 1 ? '' : 's'}</span>
            </div>
            
            <div className="row row-wrap" style={{ gap: '8px' }}>
              <div className="field" style={{ margin: 0, minWidth: '180px' }}>
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
              
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="filter-date" className="sr-only">Filter by date</label>
                <input
                  id="filter-date"
                  className="input input-sm"
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  disabled={sessions.loading}
                  aria-label="Filter by date"
                  style={{ minWidth: '140px' }}
                />
              </div>
              
              {(filterClass || filterDate) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setFilterClass('')
                    setFilterDate('')
                  }}
                  title="Clear filters"
                  aria-label="Clear filters"
                >
                  <Icon name="x" size={15} />
                </button>
              )}
            </div>
          </div>
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

        {!sessions.loading && !sessions.error && (sessions.data || []).length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title="No attendance sessions yet"
              message="Create your first session above to start recording attendance."
            />
          </div>
        )}

        {!sessions.loading && !sessions.error && list.length === 0 && (sessions.data || []).length > 0 && (
          <div className="card-body">
            <EmptyState
              icon="search"
              title="No sessions match your filters"
              message="Try adjusting the class or date filter."
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
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 40).map((session) => {
                  const recordCount = (session.records || []).length
                  const isOpen = selectedId === session.id
                  return (
                    <tr
                      key={session.id}
                      style={
                        isOpen
                          ? { background: 'var(--blue-50)' }
                          : undefined
                      }
                    >
                      <td data-label="Date">
                        <strong>{formatDate(session.date)}</strong>
                      </td>
                      <td data-label="Class" className="cell-main">
                        {session.section_name || '—'}
                      </td>
                      <td data-label="Subject">{session.subject_name || '—'}</td>
                      <td data-label="Records">
                        <span className={recordCount > 0 ? 'badge badge-blue' : 'subtle'}>
                          {recordCount} student{recordCount === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            setSelectedId(isOpen ? null : session.id)
                          }
                          aria-expanded={isOpen}
                        >
                          {isOpen ? 'Close' : 'Take attendance'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
              {(selected.records || []).length} student{(selected.records || []).length === 1 ? '' : 's'} recorded ·{' '}
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
