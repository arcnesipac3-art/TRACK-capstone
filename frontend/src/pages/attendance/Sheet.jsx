import { useEffect, useMemo, useRef, useState } from 'react'
import ButtonLoader from '../../components/loading/ButtonLoader'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import Button from '../../components/Button'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'
import ConfirmDialog, { NotesDialog } from './dialogs'
import StatusSegment from './StatusSegment'
import { CompletionCell, MarkCounters, SessionBadge } from './parts'
import { attendanceStatus, formatDate, formatRelative } from '../../utils/format'
import {
  bulkResult,
  changedMarks,
  completionOf,
  isoDay,
  markAllPresentDraft,
  rejectionMessage,
  searchRoster,
  sessionTimeLabel,
  windowOf,
} from '../../utils/attendance'

const ROSTER_PAGE = 100
const ROSTER_WINDOW = 40

/**
 * The roster of one section, loaded in pages of 100 and kept in the browser
 * only while the sheet is open.
 *
 * A register is the working set of the recording screen — every learner in it
 * has to be reachable from one save — so it is not a list to paginate through
 * on screen. It is still fetched from the server one page at a time, which
 * `api.list()`'s ten-page crawl does on a much smaller budget and which a
 * section of four hundred learners would break. `loadMore` appends the next
 * hundred and `remaining` says how many the server still holds.
 */
function useRoster(sectionId) {
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  // Starts true: a sheet that has not fetched yet must not read as
  // "no students in this section" for the frame before the first page lands.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Which page the next request should bring back. Page 1 replaces the
  // register, anything after it appends. Only the two buttons change it.
  const [request, setRequest] = useState({ page: 1 })

  useEffect(() => {
    if (!sectionId) return undefined
    const controller = new AbortController()
    let active = true
    const append = request.page > 1

    // State changes arrive with the response, not from the effect body, so the
    // sheet renders once for the request instead of twice.
    api
      .paged('/students/', {
        params: { section: sectionId, page: request.page, page_size: ROSTER_PAGE },
        signal: controller.signal,
      })
      .then((result) => {
        if (!active) return
        setCount(result.count)
        setRows((previous) =>
          append
            ? [...previous, ...result.rows.filter((row) => !previous.some((s) => s.id === row.id))]
            : result.rows
        )
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return
        setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [sectionId, request])

  function start(page) {
    // The click, not the effect, puts the sheet back into its loading state.
    setLoading(true)
    setError(null)
    setRequest(page)
  }

  // Without a section there is no register: derive the empty state instead of
  // leaving the previous section's rows in state where the sheet would mark them.
  const ready = Boolean(sectionId)
  return {
    rows: ready ? rows : [],
    count: ready ? count : 0,
    loading: ready ? loading : false,
    error: ready ? error : null,
    remaining: ready ? Math.max(0, count - rows.length) : 0,
    reload: () => start({ page: 1 }),
    loadMore: () => start({ page: request.page + 1 }),
  }
}

/**
 * The recording sheet for one session.
 *
 * Nothing is written until "Save attendance" is pressed, and then it is written
 * as one bulk request inside one database transaction: a 40-learner class used
 * to be 40 round trips that could half-fail, and a retry could re-create a mark
 * that had already landed. The endpoint keys on (session, student), so sending
 * the same payload twice updates the same rows.
 *
 * The row it is handed is a list row (`?brief=1`), which carries no roster —
 * so the saved marks come from the session's own detail and the register from
 * the section, two bounded reads, instead of one unbounded list.
 */
export default function AttendanceSheet({
  session,
  onChanged,
  onBack,
  title = 'Take attendance',
  backLabel = 'Attendance sessions',
}) {
  const [pending, setPending] = useState({})
  const [mirror, setMirror] = useState(() => new Map())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(ROSTER_WINDOW)
  const [notesFor, setNotesFor] = useState(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const flashTimer = useRef(null)
  const savingRef = useRef(false)

  const detail = useFetch(`/attendance/sessions/${session.id}/`)
  const sectionId = session.section_id ?? detail.data?.section_id ?? null
  const roster = useRoster(sectionId)

  const students = roster.rows
  const savedById = useMemo(() => {
    const map = new Map()
    ;(detail.data?.records || []).forEach((record) => {
      map.set(record.student, {
        id: record.id,
        status: record.status,
        notes: record.notes || '',
      })
    })
    // Rows this sheet has already written, before the refreshed detail lands.
    mirror.forEach((value, key) => map.set(key, value))
    return map
  }, [detail.data?.records, mirror])

  const dirtyRows = useMemo(
    () => changedMarks({ roster: students, pending, savedById }),
    [students, pending, savedById]
  )
  const dirtyCount = dirtyRows.length
  const isDirty = dirtyCount > 0

  function clearFlash() {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = null
  }

  useEffect(() => clearFlash, [])

  // A teacher must not close the tab on a review-first sheet and lose it.
  useEffect(() => {
    if (!isDirty) return undefined
    const handler = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  function announce(message) {
    clearFlash()
    setFlash(message)
    flashTimer.current = setTimeout(() => setFlash(null), 5000)
  }

  function statusOf(student) {
    return pending[student.id]?.status ?? savedById.get(student.id)?.status ?? null
  }

  function notesOf(student) {
    return pending[student.id]?.notes ?? savedById.get(student.id)?.notes ?? ''
  }

  /** Stage an edit, or un-stage it when it matches the saved mark again. */
  function stage(student, patch) {
    setPending((previous) => {
      const base = savedById.get(student.id)
      const merged = { ...previous[student.id], ...patch }
      const status = merged.status ?? base?.status ?? null
      const notes = merged.notes ?? base?.notes ?? ''
      const changed = status !== (base?.status ?? null) || notes !== (base?.notes || '')
      const next = { ...previous }
      if (changed) next[student.id] = { ...merged, status, notes }
      else delete next[student.id]
      return next
    })
  }

  const counts = useMemo(() => {
    const tally = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
    students.forEach((student) => {
      const value = statusOf(student)
      if (value && tally[value] !== undefined) tally[value] += 1
      else tally.unmarked += 1
    })
    return tally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, pending, savedById])

  const filtered = useMemo(() => searchRoster(students, query), [students, query])
  const windowed = useMemo(() => windowOf(filtered, visible), [filtered, visible])

  // A new search replaces the list the window was counted against.
  useEffect(() => setVisible(ROSTER_WINDOW), [query])

  const enrolled = roster.count || session.enrolled || students.length
  const marked = students.length - counts.unmarked
  const completion = completionOf({ record_count: marked, enrolled })
  const wouldComplete = students.length > 0 && counts.unmarked === 0 && session.status !== 'completed'

  async function persist() {
    if (savingRef.current || dirtyCount === 0) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    clearFlash()
    setFlash(null)

    const records = dirtyRows
    try {
      const response = await api.post(`/attendance/sessions/${session.id}/records/`, {
        records,
      })
      const result = bulkResult(response)
      setMirror((previous) => {
        const next = new Map(previous)
        records.forEach((entry) => {
          next.set(entry.student, { id: null, status: entry.status, notes: entry.notes })
        })
        return next
      })
      setPending({})
      setConfirmFinalize(false)
      detail.reload()
      onChanged()
      const written = result.written
      const parts = []
      if (written) parts.push(`${written} mark${written === 1 ? '' : 's'} saved`)
      if (result.unchanged) parts.push(`${result.unchanged} unchanged`)
      announce(
        `${parts.join(' · ') || 'Nothing to save'}${
          result.session?.status === 'completed' ? ' · session completed' : ''
        }`
      )
    } catch (err) {
      // The whole batch is rejected together, so the drafts stay staged and
      // the teacher can fix the marks and press Save again.
      setError(err.details ? rejectionMessage(err.details) : err.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function requestSave() {
    if (wouldComplete) setConfirmFinalize(true)
    else persist()
  }

  function requestBack() {
    if (isDirty) setConfirmLeave(true)
    else onBack()
  }

  function leaveDiscarding() {
    setPending({})
    setConfirmLeave(false)
    onBack()
  }

  function discardChanges() {
    setPending({})
    setConfirmDiscard(false)
  }

  const headerLeft = (
    <div className="row row-wrap sheet-head-left">
      <Button
        variant="secondary"
        size="sm"
        onClick={requestBack}
        disabled={saving}
        aria-label={`Back to ${backLabel}`}
      >
        <Icon name="arrowLeft" size={15} />
        {backLabel === 'Attendance sessions' ? 'Sessions' : backLabel}
      </Button>
      <div className="stack stack-xs sheet-head-title">
        <h2>{title}</h2>
        <span className="subtle text-truncate">
          {session.subject_name || '—'} · {session.section_name || '—'} ·{' '}
          {formatDate(session.date)}
        </span>
      </div>
    </div>
  )

  const headerRight = (
    <div className="row row-wrap sheet-head-meta">
      <SessionBadge session={session} today={isoDay()} />
      <span className="subtle">{sessionTimeLabel(detail.data || session)}</span>
      <span className="subtle">{enrolled ? `${enrolled} enrolled` : 'No register yet'}</span>
      {session.notes && (
        <StatusBadge tone="neutral" label="Session note" title={session.notes} />
      )}
      {detail.data?.created_at && (
        <span className="subtle">Created {formatRelative(detail.data.created_at)}</span>
      )}
    </div>
  )

  const sectionShell = (body) => (
    <section className="card att-sheet">
      <header className="card-header att-sheet-head">
        {headerLeft}
        {headerRight}
      </header>
      {body}
    </section>
  )

  if ((roster.loading || detail.loading) && students.length === 0) {
    return sectionShell(
      <div className="card-body">
        <TableSkeleton
          headers={['#', 'Student', 'Student ID', 'Attendance status', 'Notes']}
          rows={6}
          label="Loading class roster…"
        />
      </div>
    )
  }

  if (roster.error) {
    return sectionShell(
      <div className="card-body">
        <ErrorMessage
          error={roster.error}
          title="Could not load the class roster"
          onRetry={roster.reload}
        />
      </div>
    )
  }

  if (students.length === 0) {
    return sectionShell(
      <div className="card-body">
        <EmptyState
          icon="users"
          title="No students in this section"
          message="Students enrolled in this section will appear here."
        />
      </div>
    )
  }

  return (
    <section className="card att-sheet">
      <header className="card-header att-sheet-head">
        {headerLeft}
        {headerRight}
      </header>

      <div className="att-toolbar">
        <MarkCounters
          total={students.length}
          counts={counts}
          searching={Boolean(query.trim())}
          shown={windowed.shown}
        />
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPending(markAllPresentDraft({ roster: students, savedById, pending }))
              announce(
                `All ${students.length} students marked present — select Save attendance to record.`
              )
            }}
            disabled={saving}
            title={`Mark all ${students.length} students present`}
          >
            Mark all present
          </Button>
        </div>
      </div>

      {(error || flash || detail.error) && (
        <div className="att-alerts">
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={15} />
              <span>{error}</span>
            </div>
          )}
          {detail.error && (
            <div className="alert alert-warning" role="alert">
              <Icon name="info" size={15} />
              <span>The marks already saved for this session could not be loaded.</span>
              <Button variant="ghost" size="xs" onClick={detail.reload}>
                Retry
              </Button>
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

      {roster.remaining > 0 && (
        <div className="att-note-strip">
          <span className="subtle">
            This section has {roster.count} learners; the sheet holds the first{' '}
            {students.length}.
          </span>
          <Button variant="ghost" size="sm" onClick={roster.loadMore} disabled={roster.loading}>
            Load {Math.min(ROSTER_PAGE, roster.remaining)} more
          </Button>
        </div>
      )}

      {windowed.rows.length === 0 ? (
        <div className="card-body">
          <EmptyState icon="search" title="No students found" message="Try a different search term." />
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
              {windowed.rows.map((student, index) => {
                const status = statusOf(student)
                const note = notesOf(student)
                const changed = pending[student.id] !== undefined
                const savedStatus = savedById.get(student.id)?.status
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
                          <span className="att-dirty-dot" title="Unsaved change" aria-hidden="true" />
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
                        <span className="att-was">was {attendanceStatus(savedStatus).label}</span>
                      )}
                    </td>
                    <td data-label="Notes" className="att-notes">
                      <Button
                        variant="ghost"
                        size="xs"
                        className={`att-note-btn${note ? ' has-note' : ''}`}
                        onClick={() => setNotesFor(student)}
                        disabled={saving}
                        title={note ? `Edit note: ${note}` : `Add a note for ${name}`}
                      >
                        <Icon name="pencil" size={13} />
                        <span className="att-note-text">{note || 'Add note'}</span>
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {windowed.hidden > 0 && (
        <div className="att-more">
          <Button variant="secondary" size="sm" onClick={() => setVisible(visible + ROSTER_WINDOW)}>
            Show {Math.min(ROSTER_WINDOW, windowed.hidden)} more
          </Button>
          <span className="subtle">
            {windowed.shown} of {windowed.total} learners shown
          </span>
        </div>
      )}

      <footer className="att-foot">
        <div className="att-foot-status" role="status" aria-live="polite">
          {saving ? (
            <span className="att-saved">
              <ButtonLoader />
              Saving…
            </span>
          ) : isDirty ? (
            <StatusBadge
              tone="amber"
              label={`${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}`}
            />
          ) : (
            <span className="att-saved">
              <Icon name="check" size={14} />
              All changes saved
            </span>
          )}
        </div>
        <div className="row row-wrap sheet-foot-actions">
          <CompletionCell completion={completion} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmDiscard(true)}
            disabled={!isDirty || saving}
          >
            Discard
          </Button>
          <Button variant="primary" size="sm" onClick={requestSave} disabled={!isDirty || saving}>
            {saving && <ButtonLoader />}
            Save attendance
          </Button>
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

      <ConfirmDialog
        open={confirmFinalize}
        title="Finalize this session?"
        message={`Every one of the ${students.length} enrolled learners is marked. Saving records the session as completed and notifies the parents of any absent or late learner.`}
        confirmLabel="Save and finalize"
        busy={saving}
        onCancel={() => setConfirmFinalize(false)}
        onConfirm={persist}
      />
    </section>
  )
}
