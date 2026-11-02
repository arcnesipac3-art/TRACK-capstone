import Button from '../../components/Button'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import api from '../../services/api'
import { isoDay } from '../../utils/attendance'
import { useState } from 'react'

/**
 * Dialogs used by the attendance screens.
 *
 * A session is never deleted from here: the history is a record of what was
 * marked, the API has no delete route for a session, and the marks inside it
 * belong to the school year. Editing the date and the note is what the modal
 * does.
 */

/** Confirmation dialog used before an action that would lose work. */
export default function ConfirmDialog({
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
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted confirm-copy">{message}</p>
    </Modal>
  )
}

/** Per-student note editor, mounted only while a row is being edited. */
export function NotesDialog({ student, value, onApply, onClose, busy }) {
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText('')
              onApply('')
            }}
            disabled={busy}
          >
            Clear note
          </Button>
          <span className="grow" />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => onApply(text.trim())} disabled={busy}>
            Apply
          </Button>
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

/** Date and note of an existing session — the only two fields a teacher may change. */
export function EditSessionModal({ session, onClose, onUpdated }) {
  const [date, setDate] = useState(session?.date || '')
  const [notes, setNotes] = useState(session?.notes || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!session) return null

  async function save(event) {
    event?.preventDefault?.()
    if (busy) return
    setError(null)
    if (!date) {
      setError('Date is required.')
      return
    }
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

  return (
    <Modal
      open
      title="Edit attendance session"
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={busy} loadingLabel="Saving…">
            Save changes
          </Button>
        </>
      }
    >
      <form className="stack stack-sm" onSubmit={save} aria-label="Edit attendance session">
        <div className="field">
          <label htmlFor="edit-session-class">Class and subject</label>
          <input
            id="edit-session-class"
            className="input"
            value={`${session.subject_name || '—'} — ${session.section_name || '—'}`}
            disabled
            readOnly
          />
          <p className="hint">Class and subject cannot be changed for an existing session.</p>
        </div>

        <div className="field">
          <label htmlFor="edit-session-date">
            Date <span className="req">*</span>
          </label>
          <input
            id="edit-session-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
            max={isoDay()}
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
