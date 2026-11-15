import { useState } from 'react'
import api from '../../services/api'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'

/** "2026-11-15T02:08:32.767520+08:00" → the value a datetime-local input wants. */
function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const FIELDS = [
  ['is_required', 'Learners must pass this office', 'Off means this office is advisory: a learner can be cleared while it still holds an opinion.'],
  ['is_active', 'Participates in this period', 'Deactivating keeps the office and its decisions on record but takes it out of new learners’ queues.'],
]

/**
 * Add or edit one department of one clearance period.
 *
 * The department itself is the existing TRACK Department registry — this form
 * only says how it takes part in this period, which is what keeps the
 * clearance configurable per school instead of written into the code.
 */
export default function PeriodDepartmentModal({
  open,
  periodDepartment,
  period,
  options,
  takenIds,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(periodDepartment?.id)
  const departments = options?.departments || []
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(() => ({
    department: periodDepartment?.department || '',
    responsible_person: periodDepartment?.responsible_person || '',
    instructions: periodDepartment?.instructions || '',
    deadline: toLocalInput(periodDepartment?.deadline),
    is_required: periodDepartment ? Boolean(periodDepartment.is_required) : true,
    is_active: periodDepartment ? Boolean(periodDepartment.is_active) : true,
    position: periodDepartment?.position ?? '',
  }))

  const chosen = departments.find((d) => String(d.id) === String(form.department))
  // The officer list belongs to the department, so "who verifies" is answered
  // by the same registry that already owns the office — not a free-text name.
  const personnel = chosen?.personnel || []
  const offered = departments.filter(
    (d) => isEdit || !(takenIds || []).includes(d.id)
  )

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
      responsible_person: form.responsible_person ? Number(form.responsible_person) : null,
      instructions: form.instructions,
      deadline: form.deadline || null,
      is_required: form.is_required,
      is_active: form.is_active,
      position: form.position === '' ? undefined : Number(form.position),
    }
    try {
      const saved = isEdit
        ? await api.patch(`/clearance/period-departments/${periodDepartment.id}/`, body)
        : await api.post(`/clearance/periods/${period.id}/departments/`, body)
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
      title={isEdit ? `Edit ${periodDepartment?.department_name || 'department'}` : 'Add a department'}
      onClose={onClose}
      dismissible={!busy}
      width={620}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy} loading={busy}>
            {isEdit ? 'Save changes' : 'Add to period'}
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
          <label htmlFor="clr-pd-department">Department</label>
          {isEdit ? (
            <input className="input" value={periodDepartment?.department_name || ''} readOnly />
          ) : (
            <select
              id="clr-pd-department"
              className="select"
              value={form.department}
              onChange={(e) => {
                set('department', e.target.value)
                set('responsible_person', '')
              }}
              required
            >
              <option value="">Choose an existing department</option>
              {offered.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.code ? ` (${d.code})` : ''}
                </option>
              ))}
            </select>
          )}
          <span className="subtle">
            Departments come from Departments &amp; Roles. Add one there first if this
            school has an office that is not listed.
          </span>
        </div>

        <div className="field">
          <label htmlFor="clr-pd-person">Responsible person</label>
          <select
            id="clr-pd-person"
            className="select"
            value={form.responsible_person}
            onChange={(e) => set('responsible_person', e.target.value)}
            disabled={!chosen}
          >
            <option value="">Not assigned</option>
            {personnel.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <span className="subtle">
            {chosen
              ? `${personnel.length} officer(s) belong to ${chosen.name}. Only they see this office’s queue.`
              : 'Choose the department to see its officers.'}
          </span>
        </div>

        <div className="field">
          <label htmlFor="clr-pd-deadline">Deadline for learners</label>
          <input
            id="clr-pd-deadline"
            type="datetime-local"
            className="input"
            value={form.deadline}
            onChange={(e) => set('deadline', e.target.value)}
          />
          <span className="subtle">
            Leave empty for no separate deadline; the period’s own closing date then applies.
          </span>
        </div>

        <div className="field">
          <label htmlFor="clr-pd-instructions">Instructions for learners</label>
          <textarea
            id="clr-pd-instructions"
            className="textarea"
            rows={3}
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder="What to bring, where to go, whom to ask."
          />
        </div>

        <div className="grid grid-2">
          {FIELDS.map(([key, label, hint]) => (
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
          <label htmlFor="clr-pd-position">Order learners see it in</label>
          <input
            id="clr-pd-position"
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
