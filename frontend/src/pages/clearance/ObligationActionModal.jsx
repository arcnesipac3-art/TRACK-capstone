import { useState } from 'react'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import { obligationStatus } from '../../utils/clearance'
import { formatCurrency } from '../../utils/format'

/**
 * What each closing action needs from the person taking it.
 *
 * The server refuses all three without a sentence — "Record how the obligation
 * was settled", "A waiver needs the reason for waiving it", "Say why the
 * obligation is reopened" — so the screen asks for the same words before it
 * sends anything, instead of letting the officer discover the rule as an error.
 */
const ASKS = {
  resolve: {
    title: 'Settle an obligation',
    verb: 'Mark as settled',
    tone: 'primary',
    label: 'How was it settled?',
    help: 'Payment received, the book returned, the form signed — whatever the office actually saw.',
    empty: 'Say how the obligation was settled.',
  },
  waive: {
    title: 'Waive an obligation',
    verb: 'Waive it',
    tone: 'danger',
    label: 'Reason for waiving',
    help: 'A waiver is the school letting go of something it recorded. The reason and your name stay on the row.',
    empty: 'A waiver needs the reason for waiving it.',
  },
  reopen: {
    title: 'Reopen an obligation',
    verb: 'Reopen it',
    tone: 'secondary',
    label: 'Why is it outstanding again?',
    help: 'Bringing it back re-blocks the learner at this office until it is settled or waived again.',
    empty: 'Say why the obligation is reopened.',
  },
}

/**
 * One obligation, one decision.
 *
 * `update` edits what the debt is; the other three move it through its
 * lifecycle. Both shapes live here because the officer is answering one
 * question either way — "what does this row say about this learner?"
 */
export default function ObligationActionModal({
  open,
  mode = 'resolve',
  obligation,
  busy = false,
  error = null,
  onClose,
  onSubmit,
}) {
  const [note, setNote] = useState('')
  const [form, setForm] = useState(() => ({
    title: obligation?.title || '',
    detail: obligation?.detail || '',
    amount: obligation?.amount ?? '',
    is_blocking: Boolean(obligation?.is_blocking),
  }))
  const [complaint, setComplaint] = useState(null)

  if (!open || !obligation) return null

  const editing = mode === 'update'
  const ask = ASKS[mode]

  function submit(event) {
    event.preventDefault()
    setComplaint(null)
    if (editing) {
      if (!form.title.trim()) {
        setComplaint('An obligation needs a name.')
        return
      }
      onSubmit({
        action: 'update',
        title: form.title.trim(),
        detail: form.detail.trim(),
        amount: form.amount === '' ? null : form.amount,
        is_blocking: form.is_blocking,
      })
      return
    }
    if (!note.trim()) {
      setComplaint(ask.empty)
      return
    }
    onSubmit({ action: mode, note: note.trim() })
  }

  const status = obligationStatus(obligation.status)

  return (
    <Modal
      open={open}
      title={editing ? 'Edit what this obligation says' : ask.title}
      onClose={onClose}
      dismissible={!busy}
      width={560}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={editing ? 'primary' : ask.tone}
            size="sm"
            type="submit"
            form="clr-obligation-action"
            loading={busy}
          >
            {editing ? 'Save' : ask.verb}
          </Button>
        </>
      }
    >
      <form id="clr-obligation-action" className="stack" onSubmit={submit}>
        <p className="clr-note">
          <strong>{obligation.learner}</strong> · {obligation.department} ·{' '}
          {status.label}
          {obligation.is_blocking ? ' · blocks this office' : ' · advisory'}
        </p>

        {editing ? (
          <>
            <div className="field">
              <label htmlFor="clr-oa-title">What is owed</label>
              <input
                id="clr-oa-title"
                className="input"
                value={form.title}
                maxLength={150}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="clr-oa-detail">Detail</label>
              <textarea
                id="clr-oa-detail"
                className="textarea"
                rows={3}
                value={form.detail}
                maxLength={2000}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, detail: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="clr-oa-amount">Amount (optional)</label>
                <input
                  id="clr-oa-amount"
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                />
              </div>
              <label className="checkbox-row" htmlFor="clr-oa-blocking">
                <input
                  id="clr-oa-blocking"
                  type="checkbox"
                  checked={form.is_blocking}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_blocking: event.target.checked }))
                  }
                />
                <span>Blocks the sign-off at this office</span>
              </label>
            </div>
            {obligation.amount && form.amount !== '' && (
              <p className="subtle">Recorded as {formatCurrency(obligation.amount)}.</p>
            )}
          </>
        ) : (
          <>
            <p className="stack-xs">
              <strong>{obligation.title}</strong>
              {obligation.detail && <span className="subtle block">{obligation.detail}</span>}
            </p>
            <div className="field">
              <label htmlFor="clr-oa-note">{ask.label}</label>
              <textarea
                id="clr-oa-note"
                className="textarea"
                rows={3}
                value={note}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
              <span className="subtle">{ask.help}</span>
            </div>
          </>
        )}

        {(complaint || error) && (
          <div className="alert alert-error" role="alert">
            {complaint || error}
          </div>
        )}
      </form>
    </Modal>
  )
}
