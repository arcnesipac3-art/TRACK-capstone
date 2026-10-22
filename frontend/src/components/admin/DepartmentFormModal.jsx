import { useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'

const EMPTY = { name: '', code: '', description: '', is_active: true }

/** Inline field error; rendered as a function so it is not remounted per render. */
function FieldError({ id, message }) {
  if (!message) return null
  return (
    <span className="field-error" id={id}>
      <Icon name="info" size={13} />
      {message}
    </span>
  )
}

/**
 * Create or edit a department.
 *
 * The code is the stable identifier the permission matrix and audit log refer
 * to, so it is only offered when the department does not exist yet. Renaming,
 * rewording and deactivating all stay available afterwards — departments are
 * configuration, not archive material, which is why retiring one means
 * switching it off rather than deleting it.
 */
export default function DepartmentFormModal({ open, department, onClose, onSaved }) {
  const editing = Boolean(department)
  const [form, setForm] = useState(() =>
    department
      ? {
          name: department.name || '',
          code: department.code || '',
          description: department.description || '',
          is_active: department.is_active !== false,
        }
      : EMPTY
  )
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    const errors = {}
    if (!form.name.trim()) errors.name = 'Enter a department name.'
    if (!editing && !form.code.trim()) {
      errors.code = 'Enter a short code, e.g. REGISTRAR.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
      }
      if (!editing) payload.code = form.code.trim().toUpperCase()
      if (editing) payload.is_active = form.is_active

      if (editing) {
        await api.patch(`/departments/${department.id}/`, payload)
      } else {
        await api.post('/departments/', payload)
      }
      onSaved?.()
      onClose?.()
    } catch (err) {
      if (err.details && typeof err.details === 'object') {
        const mapped = {}
        Object.entries(err.details).forEach(([key, value]) => {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value)
        })
        setFieldErrors(mapped)
      }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function field(name) {
    return {
      id: `dep-${name}`,
      className: 'input',
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `dep-${name}-err` : undefined,
    }
  }

  const errorFor = (name) => (
    <FieldError id={`dep-${name}-err`} message={fieldErrors[name]} />
  )

  return (
    <Modal
      open={open}
      title={editing ? `Edit ${department.name}` : 'Add a department'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="department-form"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create department'}
          </button>
        </>
      }
    >
      <form id="department-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="dep-name">Department name</label>
          <input
            {...field('name')}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            disabled={busy}
            placeholder="e.g. Registrar — Student Records"
          />
          {errorFor('name')}
          <span className="hint">
            Names are yours to choose — these departments are configurable
            starting points, not the school&rsquo;s official structure.
          </span>
        </div>

        <div className="field">
          <label htmlFor="dep-code">Code</label>
          <input
            {...field('code')}
            value={form.code}
            onChange={(e) => update('code', e.target.value)}
            disabled={busy || editing}
            placeholder="e.g. REGISTRAR"
            maxLength={40}
          />
          {editing && <span className="hint">Codes cannot be changed after creation.</span>}
          {errorFor('code')}
        </div>

        <div className="field">
          <label htmlFor="dep-description">Description (optional)</label>
          <textarea
            id="dep-description"
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            disabled={busy}
            placeholder="What this department is responsible for."
          />
        </div>

        {editing && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update('is_active', e.target.checked)}
              disabled={busy}
            />
            Department is active (its permissions apply to its administrators)
          </label>
        )}
      </form>
    </Modal>
  )
}
