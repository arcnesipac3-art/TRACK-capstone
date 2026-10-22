import { useState } from 'react'
import Card from '../components/dashboard/Card'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { formatDate } from '../utils/format'

/**
 * System settings.
 *
 * The school-wide setting TRACK actually has is the school year calendar:
 * one year is active at a time (the model enforces it), and every fee
 * assessment, requirement and section hangs off it. Grade levels, sections,
 * subjects and class assignments live on the School Structure screen.
 */
export default function SystemSettingsPage() {
  const years = useFetch('/school-years/', { list: true })
  const health = useFetch('/health/')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [actionError, setActionError] = useState(null)

  const rows = years.data || []
  const activeYear = rows.find((y) => y.is_active)

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(year) {
    setEditing(year)
    setModalOpen(true)
  }

  /** Make one year active — Django deactivates the rest in the same save. */
  async function activate(year) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Set ${year.label} as the active school year?`)) return
    setBusyId(year.id)
    setActionError(null)
    try {
      await api.patch(`/school-years/${year.id}/`, { is_active: true })
      setNotice(`${year.label} is now the active school year.`)
      years.reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="System Settings"
        subtitle="School-wide configuration — the school year calendar and system status."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <Icon name="userPlus" size={15} />
            Add school year
          </button>
        }
      />

      {notice && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={17} />
          <span className="grow">{notice}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">{actionError}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <Card
        title="School year calendar"
        loading={years.loading && !years.data}
        error={years.error}
        onRetry={years.reload}
        action={
          activeYear ? (
            <span className="badge badge-green">Active: {activeYear.label}</span>
          ) : (
            <span className="badge badge-red">No active year</span>
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No school years yet"
            message="Create the first school year and mark it active."
          />
        ) : (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Runs</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((year) => (
                  <tr key={year.id}>
                    <td data-label="Year" className="cell-main">{year.label}</td>
                    <td data-label="Runs">
                      {formatDate(year.start_date)} — {formatDate(year.end_date)}
                    </td>
                    <td data-label="Status">
                      <StatusBadge
                        label={year.is_active ? 'Active' : 'Inactive'}
                        tone={year.is_active ? 'green' : 'neutral'}
                      />
                    </td>
                    <td data-label="Actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => openEdit(year)}
                          disabled={busyId === year.id}
                        >
                          <Icon name="pencil" size={14} />
                          Edit
                        </button>
                        {!year.is_active && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => activate(year)}
                            disabled={busyId === year.id}
                          >
                            {busyId === year.id ? (
                              <span className="spinner spinner-sm" aria-hidden="true" />
                            ) : (
                              <Icon name="check" size={14} />
                            )}
                            Set active
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="subtle" style={{ marginTop: 10 }}>
          One year is active at a time — activating a year switches the others
          off. Grade levels, sections, subjects and class assignments are
          managed under School Structure.
        </p>
      </Card>

      <Card
        title="System status"
        loading={health.loading && !health.data}
        error={health.error}
        onRetry={health.reload}
      >
        {health.data ? (
          <div className="stack stack-sm">
            <div className="row" style={{ gap: 8 }}>
              <StatusBadge
                label={health.data.status === 'success' ? 'API reachable' : 'Unexpected response'}
                tone={health.data.status === 'success' ? 'green' : 'amber'}
              />
              <span className="subtle">{health.data.project}</span>
            </div>
            <p className="subtle">{health.data.message}</p>
            <p className="subtle">
              Signed in as {health.data.project} Super Administrator — every
              permission change you make is recorded in the audit log.
            </p>
          </div>
        ) : (
          <p className="subtle">Waiting for the server…</p>
        )}
      </Card>

      <SchoolYearModal
        key={modalOpen ? (editing ? `edit-${editing.id}` : 'create') : 'closed'}
        open={modalOpen}
        year={editing}
        onClose={() => setModalOpen(false)}
        onSaved={(message) => {
          setNotice(message)
          years.reload()
        }}
      />
    </div>
  )
}

/** Create/edit dialog for a school year (settings.manage is the page gate). */
function SchoolYearModal({ open, year, onClose, onSaved }) {
  const editing = Boolean(year)
  const [form, setForm] = useState(() =>
    year
      ? {
          label: year.label || '',
          start_date: year.start_date || '',
          end_date: year.end_date || '',
          is_active: year.is_active === true,
        }
      : { label: '', start_date: '', end_date: '', is_active: false }
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
    if (!form.label.trim()) errors.label = 'Enter a label, e.g. 2026-2027.'
    if (!form.start_date) errors.start_date = 'Pick a start date.'
    if (!form.end_date) errors.end_date = 'Pick an end date.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const payload = {
        label: form.label.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        is_active: form.is_active,
      }
      if (editing) {
        await api.patch(`/school-years/${year.id}/`, payload)
        onSaved?.(`${payload.label} was updated.`)
      } else {
        await api.post('/school-years/', payload)
        onSaved?.(
          payload.is_active
            ? `${payload.label} was created and is now the active year.`
            : `${payload.label} was created.`
        )
      }
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

  const errorFor = (name) =>
    fieldErrors[name] ? (
      <span className="field-error" id={`sy-${name}-err`}>
        <Icon name="info" size={13} />
        {fieldErrors[name]}
      </span>
    ) : null

  return (
    <Modal
      open={open}
      title={editing ? `Edit ${year.label}` : 'Add a school year'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="school-year-form" className="btn btn-primary btn-sm" disabled={busy}>
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create school year'}
          </button>
        </>
      }
    >
      <form id="school-year-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="sy-label">Label</label>
          <input
            id="sy-label"
            className="input"
            value={form.label}
            onChange={(e) => update('label', e.target.value)}
            disabled={busy}
            placeholder="e.g. 2026-2027"
          />
          {errorFor('label')}
        </div>

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="sy-start">Start date</label>
            <input
              id="sy-start"
              className="input"
              type="date"
              value={form.start_date}
              onChange={(e) => update('start_date', e.target.value)}
              disabled={busy}
            />
            {errorFor('start_date')}
          </div>
          <div className="field grow">
            <label htmlFor="sy-end">End date</label>
            <input
              id="sy-end"
              className="input"
              type="date"
              value={form.end_date}
              onChange={(e) => update('end_date', e.target.value)}
              disabled={busy}
            />
            {errorFor('end_date')}
          </div>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => update('is_active', e.target.checked)}
            disabled={busy}
          />
          Active school year (activating one switches the others off)
        </label>
      </form>
    </Modal>
  )
}
