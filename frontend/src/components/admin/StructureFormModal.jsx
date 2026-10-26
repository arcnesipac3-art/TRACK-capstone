import ButtonLoader from '../../components/loading/ButtonLoader'
import { useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'
import { fieldsFor, nounFor, endpointFor } from '../../config/structure'

const EMPTY = {
  name: '',
  code: '',
  description: '',
  grade_level: '',
  school_year: '',
  adviser: '',
  label: '',
  start_date: '',
  end_date: '',
  is_active: false,
  order: '',
}

/** Inline field error; hoisted so it is not remounted on every render. */
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
 * Create/edit a section, subject, school year or grade level.
 *
 * State is seeded lazily and the modal is keyed on the record id by the
 * caller, so no effect is needed to re-seed on open.
 */
export default function StructureFormModal({ open, kind, item, options = {}, onClose, onSaved }) {
  const noun = nounFor(kind)
  const isStructure = fieldsFor(kind) === 'structure'
  const title = item
    ? `Edit ${noun} ${item.name || item.label}`
    : `Add ${noun}`

  const [form, setForm] = useState(() => {
    if (!item) {
      if (kind === 'section' || kind === 'subject') {
        // Default to the active school year so the admin rarely picks it.
        const active = (options.schoolYears || []).find((y) => y.is_active)
        return { ...EMPTY, school_year: active ? String(active.id) : '' }
      }
      return { ...EMPTY }
    }
    return {
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      grade_level: item.grade_level ? String(item.grade_level) : '',
      school_year: item.school_year ? String(item.school_year) : '',
      adviser: item.adviser ? String(item.adviser) : '',
      label: item.label || '',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      is_active: Boolean(item.is_active),
      order: item.order === undefined || item.order === null ? '' : String(item.order),
    }
  })
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /** Client-side validation. The server re-validates every rule. */
  function validate() {
    const errors = {}

    if (isStructure) {
      if (!form.name.trim()) errors.name = 'Enter a name.'
      if (!form.grade_level) errors.grade_level = 'Choose a grade level.'
      if (!form.school_year) errors.school_year = 'Choose a school year.'
    } else if (kind === 'schoolYear') {
      if (!form.label.trim()) errors.label = 'Enter a label, e.g. 2026-2027.'
      if (!form.start_date) errors.start_date = 'Choose a start date.'
      if (!form.end_date) errors.end_date = 'Choose an end date.'
      if (
        form.start_date &&
        form.end_date &&
        form.end_date <= form.start_date
      ) {
        errors.end_date = 'The end date must be after the start date.'
      }
    } else if (kind === 'gradeLevel') {
      if (!form.name.trim()) errors.name = 'Enter a name, e.g. Grade 7.'
      if (String(form.order).trim() === '') {
        errors.order = 'Enter a sort order, e.g. 7.'
      } else if (Number.isNaN(Number(form.order)) || Number(form.order) < 0) {
        errors.order = 'The sort order must be a whole number of 0 or more.'
      }
    }

    return errors
  }

  async function submit(event) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setError(null)
    try {
      let payload
      if (isStructure) {
        payload = {
          name: form.name.trim(),
          grade_level: Number(form.grade_level),
          school_year: Number(form.school_year),
        }
        if (kind === 'section') {
          payload.adviser = form.adviser ? Number(form.adviser) : null
        } else {
          payload.code = form.code.trim()
          payload.description = form.description.trim()
        }
      } else if (kind === 'schoolYear') {
        payload = {
          label: form.label.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          is_active: form.is_active,
        }
      } else {
        payload = { name: form.name.trim(), order: Number(form.order) }
      }

      const path = `/${endpointFor(kind)}/${item ? `${item.id}/` : ''}`
      if (item) await api.patch(path, payload)
      else await api.post(path, payload)

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

  function fieldProps(name) {
    return {
      id: `sf-${name}`,
      className: 'input',
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `sf-${name}-err` : undefined,
    }
  }

  /** Returns the error node for a field (plain call, not a component). */
  const errorFor = (name) => (
    <FieldError id={`sf-${name}-err`} message={fieldErrors[name]} />
  )

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      dismissible={!busy}
      width={520}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="structure-form"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {busy && <ButtonLoader />}
            {busy ? 'Saving…' : item ? 'Save changes' : `Add ${noun}`}
          </button>
        </>
      }
    >
      <form id="structure-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Sections & subjects ─────────────────────────────────────── */}
        {isStructure && (
          <>
            <div className="field">
              <label htmlFor="sf-name">Name</label>
              <input
                {...fieldProps('name')}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                disabled={busy}
                placeholder={kind === 'section' ? 'e.g. Sampaguita' : 'e.g. Mathematics'}
              />
              {errorFor('name')}
            </div>

            {kind === 'subject' && (
              <div className="field">
                <label htmlFor="sf-code">Code (optional)</label>
                <input {...fieldProps('code')} value={form.code}
                  onChange={(e) => update('code', e.target.value)} disabled={busy}
                  placeholder="e.g. MATH7" />
              </div>
            )}

            <div className="row row-wrap">
              <div className="field grow">
                <label htmlFor="sf-grade_level">Grade level</label>
                <select {...fieldProps('grade_level')} className="select"
                  value={form.grade_level} onChange={(e) => update('grade_level', e.target.value)}
                  disabled={busy}>
                  <option value="">Select…</option>
                  {(options.gradeLevels || []).map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {errorFor('grade_level')}
              </div>
              <div className="field grow">
                <label htmlFor="sf-school_year">School year</label>
                <select {...fieldProps('school_year')} className="select"
                  value={form.school_year} onChange={(e) => update('school_year', e.target.value)}
                  disabled={busy}>
                  <option value="">Select…</option>
                  {(options.schoolYears || []).map((y) => (
                    <option key={y.id} value={y.id}>{y.label}</option>
                  ))}
                </select>
                {errorFor('school_year')}
              </div>
            </div>

            {kind === 'section' ? (
              <div className="field">
                <label htmlFor="sf-adviser">Adviser (optional)</label>
                <select {...fieldProps('adviser')} className="select" value={form.adviser}
                  onChange={(e) => update('adviser', e.target.value)} disabled={busy}>
                  <option value="">No adviser yet</option>
                  {(options.teachers || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="sf-description">Description (optional)</label>
                <textarea id="sf-description" className="textarea" value={form.description}
                  onChange={(e) => update('description', e.target.value)} disabled={busy} />
              </div>
            )}
          </>
        )}

        {/* ── School years ────────────────────────────────────────────── */}
        {kind === 'schoolYear' && (
          <>
            <div className="field">
              <label htmlFor="sf-label">Label</label>
              <input {...fieldProps('label')} value={form.label}
                onChange={(e) => update('label', e.target.value)} disabled={busy}
                placeholder="e.g. 2026-2027" />
              {errorFor('label')}
            </div>

            <div className="row row-wrap">
              <div className="field grow">
                <label htmlFor="sf-start_date">Start date</label>
                <input {...fieldProps('start_date')} type="date" className="input"
                  value={form.start_date} onChange={(e) => update('start_date', e.target.value)}
                  disabled={busy} />
                {errorFor('start_date')}
              </div>
              <div className="field grow">
                <label htmlFor="sf-end_date">End date</label>
                <input {...fieldProps('end_date')} type="date" className="input"
                  value={form.end_date} onChange={(e) => update('end_date', e.target.value)}
                  disabled={busy} />
                {errorFor('end_date')}
              </div>
            </div>

            <label className="checkbox-row">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => update('is_active', e.target.checked)} disabled={busy} />
              This is the current school year
            </label>
            <p className="subtle">
              Only one school year can be current — marking this one active
              switches the previous one off.
            </p>
          </>
        )}

        {/* ── Grade levels ────────────────────────────────────────────── */}
        {kind === 'gradeLevel' && (
          <>
            <div className="field">
              <label htmlFor="sf-name">Name</label>
              <input {...fieldProps('name')} value={form.name}
                onChange={(e) => update('name', e.target.value)} disabled={busy}
                placeholder="e.g. Grade 7" />
              {errorFor('name')}
            </div>

            <div className="field">
              <label htmlFor="sf-order">Sort order</label>
              <input {...fieldProps('order')} type="number" min="0" step="1"
                className="input" value={form.order}
                onChange={(e) => update('order', e.target.value)} disabled={busy}
                placeholder="e.g. 7" />
              {errorFor('order')}
              <span className="subtle">Lower numbers are listed first.</span>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}
