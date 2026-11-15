import { useState } from 'react'
import api from '../../services/api'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'

/**
 * One kind of obligation an office can raise against a learner.
 *
 * A kind is only a description of the debt. Nothing in the workflow raises one
 * because a learner belongs to a category or owes a fee: an obligation exists
 * only after an authorised officer records it against a named learner, which is
 * why the school configures the wording here and the officer decides the case
 * there.
 */
export default function ObligationTypeModal({
  open,
  obligationType,
  options,
  defaultDepartment,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(obligationType?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(() => ({
    department: obligationType?.department || defaultDepartment || '',
    name: obligationType?.name || '',
    description: obligationType?.description || '',
    is_blocking: obligationType ? Boolean(obligationType.is_blocking) : true,
    is_active: obligationType ? Boolean(obligationType.is_active) : true,
    position: obligationType?.position ?? '',
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
      department: Number(form.department),
      name: form.name,
      description: form.description,
      is_blocking: form.is_blocking,
      is_active: form.is_active,
      position: form.position === '' ? undefined : Number(form.position),
    }
    try {
      const saved = isEdit
        ? await api.patch(`/clearance/obligation-types/${obligationType.id}/`, body)
        : await api.post('/clearance/obligation-types/', body)
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
      title={isEdit ? 'Edit obligation kind' : 'New obligation kind'}
      onClose={onClose}
      dismissible={!busy}
      width={560}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy} loading={busy}>
            {isEdit ? 'Save changes' : 'Create kind'}
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
          <label htmlFor="clr-ot-department">Office that raises it</label>
          <select
            id="clr-ot-department"
            className="select"
            value={form.department}
            onChange={(e) => set('department', e.target.value)}
            required
          >
            <option value="">Choose a department</option>
            {(options?.departments || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="clr-ot-name">Name</label>
          <input
            id="clr-ot-name"
            className="input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Unreturned library book"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="clr-ot-description">When it applies</label>
          <textarea
            id="clr-ot-description"
            className="textarea"
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Wording the officer sees when raising this against a learner."
          />
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_blocking}
            onChange={(e) => set('is_blocking', e.target.checked)}
          />
          <span>
            Blocks the sign-off while outstanding
            <span className="subtle block">
              Unchecked records the debt for information: the office can still clear the
              learner with it open.
            </span>
          </span>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
          />
          <span>
            Offered to officers
            <span className="subtle block">
              Obligations already raised keep their own wording if this is switched off.
            </span>
          </span>
        </label>

        <div className="field">
          <label htmlFor="clr-ot-position">Order in the picker</label>
          <input
            id="clr-ot-position"
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
