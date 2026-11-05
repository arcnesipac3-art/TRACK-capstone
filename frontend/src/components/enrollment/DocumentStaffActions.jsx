import Button from '../Button'
import ButtonLoader from '../loading/ButtonLoader'
import Icon from '../Icon'
import { useState } from 'react'
import api from '../../services/api'
import './DocumentStaffActions.css'

const RETURN_NOTE_NEEDED = 'Explain what must be corrected — the applicant sees this note.'

/**
 * Verify / Return / Waive, from inside the document viewer.
 *
 * The review screen already offers these on each document row; this is the
 * same write on the file itself, so a page that shows a learner's documents
 * does not have to send the Registrar back to the application to rule on one.
 * The three payloads and the note rule mirror
 * `/enrollment/applications/:id/documents/:docId/action/` exactly — the
 * server re-checks the permission and refuses a verify with no file.
 *
 * The note is asked for in the dialog rather than in a second one: two stacked
 * modals would fight over the focus trap and the scroll lock.
 */
export default function DocumentStaffActions({ applicationId, doc, onDone }) {
  const [mode, setMode] = useState(null) // null | 'return' | 'waive'
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(null)

  async function run(payload) {
    if (busy || !doc) return
    setBusy(payload.action === 'verify' ? 'verify' : 'confirm')
    setFailure(null)
    try {
      const updated = await api.post(
        `/enrollment/applications/${applicationId}/documents/${doc.id}/action/`,
        payload
      )
      setMode(null)
      setNote('')
      setNoteError(null)
      onDone?.(updated || {}, payload.action)
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(null)
    }
  }

  function openMode(next) {
    setFailure(null)
    setNoteError(null)
    setMode((current) => (current === next ? null : next))
  }

  function confirmNote() {
    if (mode === 'return' && !note.trim()) {
      setNoteError(RETURN_NOTE_NEEDED)
      return
    }
    if (mode === 'return') {
      run({ action: 'return', note: note.trim() })
      return
    }
    if (mode === 'waive') {
      // An empty note is what the review screen sends: the server files its
      // own standing wording for a waiver.
      run({ action: 'waive', note: '' })
    }
  }

  if (!doc) return null

  return (
    <>
      <span className="doc-staff-actions">
        {/* No file, nothing to verify — the endpoint says so as plainly. */}
        {doc.file && (
          <Button
            variant="primary"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => run({ action: 'verify' })}
          >
            {busy === 'verify' ? <ButtonLoader /> : <Icon name="check" size={14} />}
            Verify
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(busy)}
          aria-pressed={mode === 'return'}
          onClick={() => openMode('return')}
        >
          Return
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={Boolean(busy)}
          aria-pressed={mode === 'waive'}
          onClick={() => openMode('waive')}
        >
          Waive
        </Button>
      </span>

      {mode && (
        <div className="doc-staff-panel">
          {mode === 'return' ? (
            <div className="field">
              <label htmlFor="doc-staff-note">
                What must be corrected? (shown to the applicant)
              </label>
              <textarea
                id="doc-staff-note"
                className="textarea"
                rows={2}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value)
                  if (noteError) setNoteError(null)
                }}
                disabled={Boolean(busy)}
                aria-invalid={noteError ? 'true' : undefined}
              />
              {noteError && (
                <span className="field-error">
                  <Icon name="info" size={13} />
                  {noteError}
                </span>
              )}
            </div>
          ) : (
            <p className="doc-staff-question">
              Waive “{doc.name}”? The document counts as satisfied without an
              uploaded file.
            </p>
          )}

          <span className="doc-staff-panel-actions">
            <Button variant="primary" size="sm" disabled={Boolean(busy)} onClick={confirmNote}>
              {busy === 'confirm' && <ButtonLoader />}
              {mode === 'return' ? 'Return document' : 'Waive document'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() => {
                setMode(null)
                setNote('')
                setNoteError(null)
                setFailure(null)
              }}
            >
              Cancel
            </Button>
          </span>
        </div>
      )}

      {/* A refused Verify has no panel to live in, so it lands under the row. */}
      {failure && (
        <span className="field-error doc-staff-failure" role="alert">
          <Icon name="info" size={13} />
          {failure}
        </span>
      )}
    </>
  )
}

