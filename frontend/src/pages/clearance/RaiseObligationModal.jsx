import { useState } from 'react'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'

/**
 * Record something a learner owes this office.
 *
 * The kinds come from the school's configuration, but a kind is only wording:
 * choosing one fills the form, and the officer still decides the amount,
 * whether it blocks the sign-off, and the learner it is raised against.
 * Nothing here is derived from a fee, an enrollment or a grade — the workflow
 * refuses an obligation nobody wrote.
 */
export default function RaiseObligationModal({
  open,
  item,
  kinds = [],
  busy = false,
  error = null,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => ({
    obligation_type: '',
    title: '',
    detail: '',
    amount: '',
    is_blocking: true,
  }))
  const [complaint, setComplaint] = useState(null)

  if (!open || !item) return null

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function chooseKind(value) {
    const kind = kinds.find((one) => String(one.id) === String(value))
    setForm((prev) => ({
      ...prev,
      obligation_type: value,
      title: kind ? kind.name : prev.title,
      detail: kind ? kind.description || prev.detail : prev.detail,
      is_blocking: kind ? Boolean(kind.is_blocking) : prev.is_blocking,
    }))
  }

  function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setComplaint('Say what the learner owes.')
      return
    }
    onSubmit({
      title: form.title.trim(),
      detail: form.detail.trim(),
      amount: form.amount === '' ? null : Number(form.amount),
      is_blocking: form.is_blocking,
      obligation_type: form.obligation_type ? Number(form.obligation_type) : null,
    })
    setComplaint(null)
  }

  return (
    <Modal
      open={open}
      title={`Record an obligation for ${item.learner}`}
      onClose={onClose}
      dismissible={!busy}
      width={560}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="clr-raise-obligation"
            loading={busy}
          >
            Record it
          </Button>
        </>
      }
    >
      <form id="clr-raise-obligation" className="stack stack-md" onSubmit={submit}>
        <p className="clr-note">
          {item.department_name} · {item.period_name} ·{' '}
          {item.grade_level || 'no grade recorded'}
          {item.section ? ` · ${item.section}` : ''}
        </p>

        {(error || complaint) && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={17} />
            <span className="grow">{complaint || error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="clr-ro-kind">Kind (optional)</label>
          <select
            id="clr-ro-kind"
            className="select"
            value={form.obligation_type}
            onChange={(event) => chooseKind(event.target.value)}
          >
            <option value="">Write it myself</option>
            {kinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.name}
                {kind.is_blocking ? '' : ' (advisory)'}
              </option>
            ))}
          </select>
          {kinds.length === 0 && (
            <span className="subtle">
              This office has no configured kinds yet — an administrator adds them under
              Clearance configuration. You can still record the wording yourself.
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="clr-ro-title">What is owed</label>
          <input
            id="clr-ro-title"
            className="input"
            value={form.title}
            maxLength={150}
            onChange={(event) => set('title', event.target.value)}
            placeholder="Unreturned library book — 2 copies"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="clr-ro-detail">Detail</label>
          <textarea
            id="clr-ro-detail"
            className="textarea"
            rows={3}
            value={form.detail}
            maxLength={2000}
            onChange={(event) => set('detail', event.target.value)}
            placeholder="Call number, date due, who to see."
          />
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="clr-ro-amount">Amount (optional)</label>
            <input
              id="clr-ro-amount"
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => set('amount', event.target.value)}
              placeholder="0.00"
            />
          </div>
          <label className="checkbox-row" htmlFor="clr-ro-blocking">
            <input
              id="clr-ro-blocking"
              type="checkbox"
              checked={form.is_blocking}
              onChange={(event) => set('is_blocking', event.target.checked)}
            />
            <span>
              Blocks this office&apos;s sign-off
              <span className="subtle block">
                Unchecked records it for information; the learner can still be cleared
                with it open.
              </span>
            </span>
          </label>
        </div>
      </form>
    </Modal>
  )
}
