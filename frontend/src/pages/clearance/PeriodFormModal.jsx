import { useState } from 'react'
import api from '../../services/api'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import { CLEARANCE_TYPE_OPTIONS } from '../../utils/clearance'

const SEMESTERS = [
  { value: '', label: 'Whole school year' },
  { value: '1', label: 'First semester' },
  { value: '2', label: 'Second semester' },
]

/** "2026-11-15T02:08:32.767520+08:00" → the value a datetime-local input wants. */
function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value) {
  return value || null
}

/** The school year the calendar is currently in, so a new period starts there. */
function activeSchoolYear(options) {
  const years = options?.school_years || []
  return years.find((year) => year.is_active)?.id || ''
}

/**
 * Create or edit one clearance period.
 *
 * The status is never in this form: activating a period provisions a queue for
 * every learner in its population, and that is a deliberate action on the
 * period row rather than a side effect of saving a field.
 *
 * `options` is `/clearance/options/` — the school's own school years, grade
 * levels and learner categories, so nothing here names a term or a level.
 */
export default function PeriodFormModal({ open, period, options, onClose, onSaved }) {
  const isEdit = Boolean(period?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(() => ({
    name: period?.name || '',
    school_year: period?.school_year || activeSchoolYear(options) || '',
    semester: period?.semester ? String(period.semester) : '',
    clearance_type: period?.clearance_type || 'end_of_year',
    custom_type_label: period?.custom_type_label || '',
    opens_at: toLocalInput(period?.opens_at),
    closes_at: toLocalInput(period?.closes_at),
    instructions: period?.instructions || '',
    grade_levels: period?.grade_levels || [],
    categories: period?.categories || [],
  }))

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleMember(key, id) {
    setForm((prev) => {
      const list = prev[key] || []
      return {
        ...prev,
        [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      }
    })
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const body = {
      ...form,
      semester: form.semester ? Number(form.semester) : null,
      opens_at: fromLocalInput(form.opens_at),
      closes_at: fromLocalInput(form.closes_at),
      school_year: Number(form.school_year),
    }
    try {
      const saved = isEdit
        ? await api.patch(`/clearance/periods/${period.id}/`, body)
        : await api.post('/clearance/periods/', body)
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
      title={isEdit ? 'Edit clearance period' : 'New clearance period'}
      onClose={onClose}
      dismissible={!busy}
      width={640}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
            {busy ? <Icon name="refresh" size={14} /> : null}
            {isEdit ? 'Save changes' : 'Create period'}
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
          <label htmlFor="clr-name">Name</label>
          <input
            id="clr-name"
            className="input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="SY 2026-2027 End of Year Clearance"
            required
          />
          <span className="subtle">
            Appears on the learner's page and in every report row.
          </span>
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="clr-year">School year</label>
            <select
              id="clr-year"
              className="select"
              value={form.school_year}
              onChange={(e) => set('school_year', e.target.value)}
              required
            >
              <option value="">Choose a school year</option>
              {(options?.school_years || []).map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="clr-semester">Semester</label>
            <select
              id="clr-semester"
              className="select"
              value={form.semester}
              onChange={(e) => set('semester', e.target.value)}
            >
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="clr-type">Clearance type</label>
            <select
              id="clr-type"
              className="select"
              value={form.clearance_type}
              onChange={(e) => set('clearance_type', e.target.value)}
            >
              {(options?.clearance_types || CLEARANCE_TYPE_OPTIONS).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {form.clearance_type === 'custom' && (
            <div className="field">
              <label htmlFor="clr-custom">Custom label</label>
              <input
                id="clr-custom"
                className="input"
                value={form.custom_type_label}
                onChange={(e) => set('custom_type_label', e.target.value)}
                placeholder="Moving-up clearance"
                required
              />
            </div>
          )}
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="clr-opens">Opens</label>
            <input
              id="clr-opens"
              type="datetime-local"
              className="input"
              value={form.opens_at}
              onChange={(e) => set('opens_at', e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="clr-closes">Closes</label>
            <input
              id="clr-closes"
              type="datetime-local"
              className="input"
              value={form.closes_at}
              onChange={(e) => set('closes_at', e.target.value)}
              required
            />
          </div>
        </div>

        <fieldset className="field">
          <legend className="field-legend">Grade levels covered</legend>
          <div className="check-scroll">
            {(options?.grade_levels || []).map((grade) => (
              <label className="checkbox-row" key={grade.id}>
                <input
                  type="checkbox"
                  checked={(form.grade_levels || []).includes(grade.id)}
                  onChange={() => toggleMember('grade_levels', grade.id)}
                />
                <span>{grade.name}</span>
              </label>
            ))}
          </div>
          <span className="subtle">Leave empty to cover every grade level.</span>
        </fieldset>

        {(options?.categories || []).length > 0 && (
          <fieldset className="field">
            <legend className="field-legend">Learner categories</legend>
            <div className="check-scroll">
              {options.categories.map((category) => (
                <label className="checkbox-row" key={category.id}>
                  <input
                    type="checkbox"
                    checked={(form.categories || []).includes(category.id)}
                    onChange={() => toggleMember('categories', category.id)}
                  />
                  <span>
                    {category.name}
                    <span className="subtle"> · {category.learners} learners</span>
                  </span>
                </label>
              ))}
            </div>
            <span className="subtle">
              Leave empty to cover every learner in the grade levels above.
            </span>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="clr-instructions">Instructions for learners</label>
          <textarea
            id="clr-instructions"
            className="textarea"
            rows={3}
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder="What the learner has to do, in the school's own words."
          />
        </div>
      </form>
    </Modal>
  )
}
