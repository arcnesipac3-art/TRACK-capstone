import { useState } from 'react'
import api from '../../services/api'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'

const SWITCHES = [
  ['is_required', 'Required', 'Until every required item is settled, this office cannot sign the learner off.'],
  ['needs_review', 'An officer checks it', 'Unchecked means the upload itself settles the item — the learner is trusted with it.'],
  ['allows_upload', 'The learner files a document', 'Off means the item is settled at the office counter, with no file.'],
  ['is_active', 'Applies to this period', 'Deactivating keeps the requirement and what was filed against it on record.'],
]

/**
 * One requirement on one department's checklist for one period.
 *
 * Once a learner has filed against a requirement its terms are frozen — the
 * server answers 409 — because a checklist that changes under a submission
 * rewrites what that learner was asked for. Name, order and the flags that
 * change the debt are the frozen set; this form says so rather than letting
 * the click fail in silence.
 */
export default function RequirementModal({
  open,
  requirement,
  periodDepartment,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(requirement?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(() => ({
    name: requirement?.name || '',
    description: requirement?.description || '',
    is_required: requirement ? Boolean(requirement.is_required) : true,
    needs_review: requirement ? Boolean(requirement.needs_review) : true,
    allows_upload: requirement ? Boolean(requirement.allows_upload) : true,
    is_active: requirement ? Boolean(requirement.is_active) : true,
    position: requirement?.position ?? '',
  }))

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const body = {
      name: form.name,
      description: form.description,
      is_required: form.is_required,
      needs_review: form.needs_review,
      allows_upload: form.allows_upload,
      is_active: form.is_active,
      position: form.position === '' ? undefined : Number(form.position),
    }
    try {
      const saved = isEdit
        ? await api.patch(`/clearance/requirements/${requirement.id}/`, body)
        : await api.post(
            `/clearance/period-departments/${periodDepartment.id}/requirements/`,
            body
          )
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit requirement' : 'New requirement'}
      onClose={onClose}
      dismissible={!busy}
      width={600}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy} loading={busy}>
            {isEdit ? 'Save changes' : 'Add requirement'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="stack stack-md">
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={17} />
            <span className="grow">{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="clr-req-name">What the learner must settle</label>
          <input
            id="clr-req-name"
            className="input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Return of borrowed books"
            required
          />
          <span className="subtle">
            For {periodDepartment?.department_name}. Learners see this wording on their checklist.
          </span>
        </div>

        <div className="field">
          <label htmlFor="clr-req-detail">Instructions</label>
          <textarea
            id="clr-req-detail"
            className="textarea"
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Where to go, what to bring, what counts as done."
          />
        </div>

        <div className="grid grid-2">
          {SWITCHES.map(([key, label, hint]) => (
            <label className="checkbox-row" key={key}>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              <span>
                {label}
                <span className="subtle block">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="field">
          <label htmlFor="clr-req-position">Order on the checklist</label>
          <input
            id="clr-req-position"
            type="number"
            className="input"
            min="0"
            step="10"
            value={form.position}
            onChange={(e) => set('position', e.target.value)}
            placeholder="leave empty to append"
          />
        </div>
      </form>
    </Modal>
  )
}
