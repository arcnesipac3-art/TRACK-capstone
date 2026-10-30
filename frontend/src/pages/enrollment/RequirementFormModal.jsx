import ButtonLoader from '../../components/loading/ButtonLoader'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import { useEffect, useState } from 'react'
import api from '../../services/api'
import { ENROLLMENT_TYPE_OPTIONS } from '../../utils/enrollment'

const EMPTY = {
  period: '',
  grade_level: '',
  enrollment_type: '',
  name: '',
  description: '',
  is_required: true,
  requires_verification: true,
  is_active: true,
  position: 0,
}

/** Inline field error rendered as a plain call (never remounted). */
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
 * Create/edit a document requirement: `{open, requirement, onClose, onSaved}`.
 *
 * The parent keys the modal on the record id so a different row remounts
 * with fresh state. A requirement that already collected documents can only
 * be deactivated — the delete button then shows the reason instead.
 */
export default function RequirementFormModal({
  open,
  requirement,
  onClose,
  onSaved,
}) {
  const editing = Boolean(requirement)

  const [form, setForm] = useState(() =>
    requirement
      ? {
          period: requirement.period ? String(requirement.period) : '',
          grade_level: requirement.grade_level
            ? String(requirement.grade_level)
            : '',
          enrollment_type: requirement.enrollment_type || '',
          name: requirement.name || '',
          description: requirement.description || '',
          is_required: requirement.is_required !== false,
          requires_verification: requirement.requires_verification === true,
          is_active: requirement.is_active !== false,
          position:
            typeof requirement.position === 'number' ? requirement.position : 0,
        }
      : EMPTY
  )

  const [periods, setPeriods] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [optionsError, setOptionsError] = useState(null)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    Promise.all([api.list('/enrollment/periods/'), api.list('/grade-levels/')])
      .then(([periodRows, gradeRows]) => {
        if (cancelled) return
        setPeriods(periodRows)
        setGradeLevels(gradeRows)
      })
      .catch((err) => {
        if (!cancelled) setOptionsError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate() {
    const errors = {}
    if (!form.period) errors.period = 'Choose an enrollment period.'
    if (!form.name.trim()) errors.name = 'Enter a document name.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!validate()) return

    setBusy(true)
    setError(null)
    setFieldErrors({})

    const payload = {
      period: Number(form.period),
      grade_level: form.grade_level ? Number(form.grade_level) : null,
      enrollment_type: form.enrollment_type || null,
      name: form.name.trim(),
      description: form.description.trim(),
      is_required: form.is_required,
      requires_verification: form.requires_verification,
      is_active: form.is_active,
      position: Number(form.position) || 0,
    }

    try {
      if (editing) {
        await api.patch(`/enrollment/requirements/${requirement.id}/`, payload)
      } else {
        await api.post('/enrollment/requirements/', payload)
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

  async function remove() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/enrollment/requirements/${requirement.id}/`)
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err.message)
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  function field(name, type = 'input') {
    return {
      id: `rf-${name}`,
      className: type,
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `rf-${name}-err` : undefined,
    }
  }

  const errorFor = (name) => (
    <FieldError id={`rf-${name}-err`} message={fieldErrors[name]} />
  )

  return (
    <Modal
      open={open}
      title={editing ? `Edit ${requirement.name}` : 'New requirement'}
      onClose={onClose}
      dismissible={!busy}
      width={640}
      footer={
        <>
          {editing && !requirement.has_documents && !confirmDelete && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Icon name="trash" size={14} />
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {!confirmDelete && (
            <button
              type="submit"
              form="requirement-form"
              className="btn btn-primary btn-sm"
              disabled={busy}
            >
              {busy && <ButtonLoader />}
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create requirement'}
            </button>
          )}
        </>
      }
    >
      {confirmDelete ? (
        <div className="stack stack-sm">
          <p>
            Delete “{requirement.name}”? This cannot be undone. The server will
            refuse if any application already references this requirement.
          </p>
          <div className="row row-end gap-sm">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={remove}
              disabled={busy}
            >
              {busy && <ButtonLoader />}
              {busy ? 'Deleting…' : 'Delete requirement'}
            </button>
          </div>
        </div>
      ) : (
        <form
          id="requirement-form"
          className="stack stack-sm"
          onSubmit={submit}
          noValidate
        >
          {(error || optionsError) && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={16} />
              <span>{error || optionsError}</span>
            </div>
          )}

          <div className="row row-wrap">
            <div className="field grow">
              <label htmlFor="rf-period">Enrollment period</label>
              <select
                {...field('period', 'select')}
                value={form.period}
                onChange={(e) => update('period', e.target.value)}
                disabled={busy}
              >
                <option value="">Choose a period…</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.school_year_label}
                  </option>
                ))}
              </select>
              {errorFor('period')}
            </div>
            <div className="field grow">
              <label htmlFor="rf-grade_level">Grade level</label>
              <select
                id="rf-grade_level"
                className="select"
                value={form.grade_level}
                onChange={(e) => update('grade_level', e.target.value)}
                disabled={busy}
              >
                <option value="">All grade levels</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row row-wrap">
            <div className="field grow">
              <label htmlFor="rf-enrollment_type">Enrollment type</label>
              <select
                id="rf-enrollment_type"
                className="select"
                value={form.enrollment_type}
                onChange={(e) => update('enrollment_type', e.target.value)}
                disabled={busy}
              >
                <option value="">All types</option>
                {ENROLLMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow">
              <label htmlFor="rf-position">Position</label>
              <input
                {...field('position')}
                type="number"
                value={form.position}
                onChange={(e) => update('position', e.target.value)}
                disabled={busy}
                min={0}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="rf-name">Document name</label>
            <input
              {...field('name')}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              disabled={busy}
              placeholder="e.g. Birth certificate (PSA)"
            />
            {errorFor('name')}
          </div>

          <div className="field">
            <label htmlFor="rf-description">Description (optional)</label>
            <textarea
              id="rf-description"
              className="textarea"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              disabled={busy}
              placeholder="What counts as acceptable evidence…"
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={(e) => update('is_required', e.target.checked)}
              disabled={busy}
            />
            Required — blocks acceptance until verified or waived
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.requires_verification}
              onChange={(e) => update('requires_verification', e.target.checked)}
              disabled={busy}
            />
            Requires Registrar verification
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update('is_active', e.target.checked)}
              disabled={busy}
            />
            Active — requested from new applicants
          </label>

          {editing && requirement.has_documents && (
            <span className="subtle">
              Deactivate instead — applications already reference it.
            </span>
          )}
        </form>
      )}
    </Modal>
  )
}
