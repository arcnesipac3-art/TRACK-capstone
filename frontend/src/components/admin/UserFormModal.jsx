import { useEffect, useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

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
  const { user: me, can } = useAuth()
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

  // Administrator accounts: department assignment, the super-administrator
  // flag (only a Super Administrator may grant it) and personal permission
  // grants on top of the department matrix.
  const [departments, setDepartments] = useState([])
  const [departmentsError, setDepartmentsError] = useState(null)
  const [selectedDepts, setSelectedDepts] = useState(() =>
    user?.department_detail ? user.department_detail.map((d) => d.id) : []
  )
  const [isSuper, setIsSuper] = useState(user?.is_super_admin === true)
  const [permDefs, setPermDefs] = useState([])
  // null = not loaded; a save must never PUT a grant list we failed to read.
  const [extraPerms, setExtraPerms] = useState(null)
  const [grantsError, setGrantsError] = useState(null)

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

  // Administrator accounts need the department list to be assigned to.
  // Stale errors reset with the fetch trigger itself — adjusted during render
  // (react.dev "you might not need an effect") so no effect pass starts a
  // cascading commit; the effect below only synchronizes with the network.
  const deptFetchKey = open && form.role === 'admin' ? 'admin' : null
  const [prevDeptFetchKey, setPrevDeptFetchKey] = useState(null)
  if (deptFetchKey !== prevDeptFetchKey) {
    setPrevDeptFetchKey(deptFetchKey)
    if (deptFetchKey) setDepartmentsError(null)
  }
  useEffect(() => {
    if (!open || form.role !== 'admin') return undefined
    let cancelled = false
    api
      .list('/departments/')
      .then((rows) => {
        if (!cancelled) setDepartments(rows)
      })
      .catch((err) => {
        if (!cancelled) setDepartmentsError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, form.role])

  // Personal grants on top of the department matrix — read once per dialog,
  // and only for administrators, only with the permission to see them.
  // The error resets when that trigger changes (render-time adjustment), and
  // again on a successful read so a mid-dialog identity change self-heals.
  const grantsFetchKey =
    open && editing && user?.role === 'admin' && can('departments.permissions')
      ? user.id
      : null
  const [prevGrantsFetchKey, setPrevGrantsFetchKey] = useState(null)
  if (grantsFetchKey !== prevGrantsFetchKey) {
    setPrevGrantsFetchKey(grantsFetchKey)
    if (grantsFetchKey) setGrantsError(null)
  }
  useEffect(() => {
    if (!open || !editing || user?.role !== 'admin') return undefined
    if (!can('departments.permissions')) return undefined
    let cancelled = false
    Promise.all([
      api.get(`/users/${user.id}/permissions/`),
      api.list('/permissions/'),
    ])
      .then(([perms, defs]) => {
        if (cancelled) return
        setExtraPerms(perms.permissions || [])
        setPermDefs(defs)
        setGrantsError(null)
      })
      .catch((err) => {
        if (cancelled) return
        // Leave extraPerms as null so a save never clobbers grants we
        // could not read.
        setGrantsError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, editing, user, can])

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
    // Mirror the backend rule: every new administrator must be reachable —
    // a department, or the Super Administrator flag.
    if (!editing && form.role === 'admin' && selectedDepts.length === 0 && !isSuper) {
      errors.departments =
        'Assign the new administrator to at least one department, or make them a Super Administrator.'
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
      if (form.role === 'admin') {
        payload.departments = selectedDepts.map(Number)
        // Only a Super Administrator may grant (or revoke) the flag — sending
        // it otherwise would be rejected by Django anyway.
        if (me?.isSuperAdmin) payload.is_super_admin = isSuper
      }
      payload.contact_number = form.contact_number.trim()
      // Only send is_active on edit so create never fights the default.
      if (editing) payload.is_active = form.is_active

      let targetId = user?.id
      if (editing) {
        await api.patch(`/users/${user.id}/`, payload)
      } else {
        const created = await api.post('/users/', payload)
        targetId = created?.id
      }

      // Personal grants ride along for administrators once the account
      // exists; skipped when they were never loaded (see the effect above).
      if (
        form.role === 'admin' &&
        targetId &&
        extraPerms !== null &&
        can('departments.permissions')
      ) {
        await api.put(`/users/${targetId}/permissions/`, {
          permissions: extraPerms,
        })
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

        {form.role === 'admin' && (
          <div className="stack stack-xs">
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Department assignment
            </span>
            {departmentsError ? (
              <span className="hint">
                Could not list departments: {departmentsError}
              </span>
            ) : departments.length === 0 ? (
              <span className="hint">
                No departments exist yet — create one under Departments &amp;
                Roles.
              </span>
            ) : (
              departments.map((d) => (
                <label className="checkbox-row" key={d.id}>
                  <input
                    type="checkbox"
                    checked={selectedDepts.includes(d.id)}
                    onChange={(e) =>
                      setSelectedDepts((prev) =>
                        e.target.checked
                          ? [...prev, d.id]
                          : prev.filter((id) => id !== d.id)
                      )
                    }
                    disabled={busy}
                  />
                  <span className="grow">
                    {d.name}
                    {!d.is_active && (
                      <span className="subtle"> (inactive — grants nothing)</span>
                    )}
                  </span>
                </label>
              ))
            )}
            {errorFor('departments')}
            <span className="hint">
              The administrator holds exactly the permissions of the
              departments ticked here — least privilege by construction.
            </span>

            {me?.isSuperAdmin ? (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={isSuper}
                  onChange={(e) => setIsSuper(e.target.checked)}
                  disabled={busy}
                />
                <span className="grow">
                  Super Administrator — holds every permission
                </span>
              </label>
            ) : (
              user?.is_super_admin && (
                <span className="hint">
                  This account is a Super Administrator — only another Super
                  Administrator can change that.
                </span>
              )
            )}
          </div>
        )}

        {form.role === 'admin' && editing && can('departments.permissions') && (
          <div className="stack stack-xs">
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Personal permission grants
            </span>
            {grantsError && (
              <span className="hint">
                Could not load personal grants: {grantsError}
              </span>
            )}
            {extraPerms === null && !grantsError && (
              <span className="hint">Loading permissions…</span>
            )}
            {extraPerms !== null && (
              <div
                style={{
                  maxHeight: 170,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                }}
              >
                {permDefs.map((perm) => (
                  <label className="checkbox-row" key={perm.key}>
                    <input
                      type="checkbox"
                      checked={extraPerms.includes(perm.key)}
                      onChange={(e) =>
                        setExtraPerms((prev) =>
                          e.target.checked
                            ? [...prev, perm.key]
                            : prev.filter((k) => k !== perm.key)
                        )
                      }
                      disabled={busy}
                    />
                    <span className="grow">
                      {perm.module_label} — {perm.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <span className="hint">
              Granted to this administrator only, whatever departments they sit
              in. Everything else comes from their departments&rsquo; matrix.
            </span>
          </div>
        )}

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
