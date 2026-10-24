import { useEffect, useMemo, useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

/**
 * The permission matrix for one department.
 *
 * Rows come from `GET /api/permissions/` (the registry in core/rbac.py,
 * mirrored into the database), the ticks come from
 * `GET /api/departments/:id/permissions/`, and saving replaces the whole set
 * with `PUT` — what you see is exactly what the database ends up holding.
 *
 * Administrators holding `departments.permissions` (the Super Administrator
 * by default) can edit; everyone else gets the read-only view of the same
 * dialog, because `departments.view` should be enough to *inspect* a
 * department's configuration.
 */
export default function PermissionMatrixModal({
  open,
  department,
  definitions = [],
  onClose,
  onSaved,
}) {
  const { can } = useAuth()
  const editable = can('departments.permissions')

  const [granted, setGranted] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Opening for a department shows its spinner and clears stale errors —
  // adjusted during render (react.dev "you might not need an effect") so the
  // effect body only talks to the network.
  const deptFetchKey = open && department ? department.id : null
  const [prevDeptFetchKey, setPrevDeptFetchKey] = useState(undefined)
  if (deptFetchKey !== prevDeptFetchKey) {
    setPrevDeptFetchKey(deptFetchKey)
    setLoading(deptFetchKey !== null)
    setError(null)
    setSaveError(null)
  }

  useEffect(() => {
    if (!open || !department) return undefined
    let cancelled = false
    api
      .get(`/departments/${department.id}/permissions/`)
      .then((data) => {
        if (!cancelled) setGranted(data.permissions || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, department])

  const grantedSet = useMemo(() => new Set(granted), [granted])

  // Group the registry into matrix rows, keeping registry (position) order.
  const modules = useMemo(() => {
    const groups = new Map()
    definitions.forEach((def) => {
      const key = def.module || 'other'
      if (!groups.has(key)) {
        groups.set(key, { key, label: def.module_label || key, perms: [] })
      }
      groups.get(key).perms.push(def)
    })
    return [...groups.values()]
  }, [definitions])

  function toggle(key) {
    setGranted((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      await api.put(`/departments/${department.id}/permissions/`, {
        permissions: granted,
      })
      onSaved?.()
      onClose?.()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`Permissions — ${department?.name || ''}`}
      onClose={onClose}
      dismissible={!busy}
      width={720}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            {editable ? 'Cancel' : 'Close'}
          </button>
          {editable && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={busy || loading}
            >
              {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
              {busy ? 'Saving…' : 'Save permissions'}
            </button>
          )}
        </>
      }
    >
      <div className="stack stack-sm">
        {saveError && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{saveError}</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>Could not load this department&rsquo;s permissions: {error.message}</span>
          </div>
        )}

        {loading && <p className="subtle">Loading permissions…</p>}

        {!loading && !error && (
          <>
            <p className="hint">
              Administrators in this department hold exactly the permissions
              ticked here — plus any granted to them personally. Super
              administrators hold every permission regardless.
              {!editable && ' You have view-only access to this matrix.'}
            </p>

            <div className="stack stack-sm">
              {modules.map((group) => (
                <fieldset key={group.key} className="stack stack-xs" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="subtle" style={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {group.label}
                  </legend>
                  {group.perms.map((perm) => (
                    <label key={perm.key} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={grantedSet.has(perm.key)}
                        onChange={() => toggle(perm.key)}
                        disabled={!editable || busy}
                      />
                      <span className="grow">
                        {perm.label}
                        <span className="hint" style={{ display: 'block' }}>
                          {perm.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
