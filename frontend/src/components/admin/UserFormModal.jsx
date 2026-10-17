import { useEffect, useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'

const ROLES = [
  ['student', 'Student'],
  ['teacher', 'Teacher'],
  ['parent', 'Parent'],
  ['admin', 'Administrator'],
]

const EMPTY = {
  username: '',
  password: '',
  email: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  role: 'student',
  lrn: '',
  section: '',
  contact_number: '',
  is_active: true,
}

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
 * Create/edit a user account.
 *
 * Posts to the real admin endpoints (`POST /api/users/` and
 * `PATCH /api/users/:id/`). Students pick a section + LRN, parents pick which
 * children to link — Django creates and links the matching profile rows.
 *
 * The parent modal is keyed on the record id so opening a different row
 * remounts the form with fresh state instead of syncing via an effect.
 */
export default function UserFormModal({ open, user, sections = [], onClose, onSaved }) {
  const editing = Boolean(user)

  // Seed the form from the record being edited (or reset for a new one).
  const [form, setForm] = useState(() =>
    user
      ? {
          username: user.username || '',
          password: '',
          email: user.email || '',
          first_name: user.first_name || '',
          middle_name: user.middle_name || '',
          last_name: user.last_name || '',
          role: user.role || 'student',
          lrn: user.lrn || '',
          section: user.section ? String(user.section) : '',
          contact_number: user.contact_number || '',
          is_active: user.is_active !== false,
        }
      : EMPTY
  )
  const [children, setChildren] = useState(() => (user ? user.children || [] : []))
  const [allStudents, setAllStudents] = useState([])
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // Parents need the student list to link children.
  useEffect(() => {
    if (!open || form.role !== 'parent') return undefined
    let cancelled = false
    api
      .list('/students/')
      .then((rows) => {
        if (!cancelled) setAllStudents(rows)
      })
      .catch(() => {
        if (!cancelled) setAllStudents([])
      })
    return () => {
      cancelled = true
    }
  }, [open, form.role])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate() {
    const errors = {}
    if (!form.username.trim()) errors.username = 'Enter a username.'
    if (!editing && !form.password) errors.password = 'Set an initial password.'
    if (!form.first_name.trim()) errors.first_name = 'Enter the first name.'
    if (!form.last_name.trim()) errors.last_name = 'Enter the last name.'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      errors.email = 'Enter a valid email address.'
    }
    if (!editing && form.role === 'student' && !form.lrn.trim()) {
      errors.lrn = 'A Learner Reference Number is required for students.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function submit(event) {
    event.preventDefault()
    if (!validate()) return

    setBusy(true)
    setError(null)
    try {
      const payload = {
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
      }
      if (!editing) {
        payload.username = form.username.trim()
        payload.password = form.password
      }
      if (form.role === 'student') {
        payload.lrn = form.lrn.trim()
        payload.section = form.section ? Number(form.section) : null
      }
      if (form.role === 'parent') {
        payload.children = children.map(Number)
      }
      payload.contact_number = form.contact_number.trim()
      // Only send is_active on edit so create never fights the default.
      if (editing) payload.is_active = form.is_active

      if (editing) {
        await api.patch(`/users/${user.id}/`, payload)
      } else {
        await api.post('/users/', payload)
      }
      onSaved?.()
      onClose?.()
    } catch (err) {
      // DRF returns {field: [messages]} — surface them against the inputs.
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
      id: `uf-${name}`,
      className: 'input',
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `uf-${name}-err` : undefined,
    }
  }

  /** Returns the error node for a field (plain call, not a component). */
  const errorFor = (name) => (
    <FieldError id={`uf-${name}-err`} message={fieldErrors[name]} />
  )

  return (
    <Modal
      open={open}
      title={editing ? `Edit ${user.full_name || user.username}` : 'Add an account'}
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
            form="user-form"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="user-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="uf-first_name">First name</label>
            <input {...field('first_name')} value={form.first_name}
              onChange={(e) => update('first_name', e.target.value)} disabled={busy} />
            {errorFor('first_name')}
          </div>
          <div className="field grow">
            <label htmlFor="uf-middle_name">Middle name (optional)</label>
            <input id="uf-middle_name" className="input" value={form.middle_name}
              onChange={(e) => update('middle_name', e.target.value)} disabled={busy} />
          </div>
          <div className="field grow">
            <label htmlFor="uf-last_name">Last name</label>
            <input {...field('last_name')} value={form.last_name}
              onChange={(e) => update('last_name', e.target.value)} disabled={busy} />
            {errorFor('last_name')}
          </div>
        </div>

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="uf-username">Username</label>
            <input
              {...field('username')}
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              disabled={busy || editing}
              autoComplete="off"
              placeholder="e.g. juana.delacruz"
            />
            {editing && <span className="hint">Usernames cannot be changed.</span>}
            {errorFor('username')}
          </div>
          <div className="field grow">
            <label htmlFor="uf-email">Email</label>
            <input
              {...field('email')}
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              disabled={busy}
              placeholder="name@knhs.edu.ph"
            />
            {errorFor('email')}
          </div>
        </div>

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="uf-role">Role</label>
            <select id="uf-role" className="select" value={form.role}
              onChange={(e) => update('role', e.target.value)} disabled={busy || editing}>
              {ROLES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {editing && <span className="hint">Roles cannot be changed after creation.</span>}
            {errorFor('role')}
          </div>
          {!editing && (
            <div className="field grow">
              <label htmlFor="uf-password">Initial password</label>
              <input
                {...field('password')}
                type="text"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              {errorFor('password')}
            </div>
          )}
        </div>

        {form.role === 'student' && (
          <div className="row row-wrap">
            <div className="field grow">
              <label htmlFor="uf-lrn">Learner Reference Number</label>
              <input {...field('lrn')} value={form.lrn}
                onChange={(e) => update('lrn', e.target.value)} disabled={busy}
                maxLength={12} placeholder="12-digit LRN" />
              {errorFor('lrn')}
            </div>
            <div className="field grow">
              <label htmlFor="uf-section">Section</label>
              <select id="uf-section" className="select" value={form.section}
                onChange={(e) => update('section', e.target.value)} disabled={busy}>
                <option value="">No section yet</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.grade_level_name} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {form.role === 'parent' && (
          <div className="field">
            <label htmlFor="uf-children">Linked children</label>
            <select
              id="uf-children"
              className="select"
              multiple
              size={Math.min(6, Math.max(3, allStudents.length))}
              value={children.map(String)}
              onChange={(e) =>
                setChildren([...e.target.selectedOptions].map((o) => Number(o.value)))
              }
              disabled={busy}
              style={{ minHeight: 120 }}
            >
              {allStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.user?.full_name || s.user?.username}
                  {s.section_name ? ` — ${s.section_name}` : ''}
                </option>
              ))}
            </select>
            <span className="hint">
              Hold Ctrl (Cmd on Mac) to select more than one. Parents only ever
              see the children selected here.
            </span>
            {allStudents.length === 0 && (
              <span className="hint">No student accounts exist yet.</span>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="uf-contact_number">Contact number (optional)</label>
          <input id="uf-contact_number" className="input" value={form.contact_number}
            onChange={(e) => update('contact_number', e.target.value)} disabled={busy}
            placeholder="e.g. 0917 123 4567" />
        </div>

        {editing && (
          <label className="checkbox-row">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => update('is_active', e.target.checked)} disabled={busy} />
            Account is active (can sign in)
          </label>
        )}
      </form>
    </Modal>
  )
}
