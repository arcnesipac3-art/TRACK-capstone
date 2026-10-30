import ButtonLoader from '../../components/loading/ButtonLoader'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import { useEffect, useState } from 'react'
import api from '../../services/api'
import {
  ENROLLMENT_TYPE_OPTIONS,
  PERIOD_STATUS,
} from '../../utils/enrollment'

const STATUS_OPTIONS = Object.entries(PERIOD_STATUS).map(
  ([value, config]) => ({ value, label: config.label })
)

const EMPTY = {
  school_year: '',
  name: '',
  status: 'upcoming',
  opens_at: '',
  closes_at: '',
  grade_levels: [],
  allowed_types: [],
  allow_waitlist: false,
}

/** ISO timestamp → the local `YYYY-MM-DDTHH:mm` value datetime-local wants. */
function toInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** datetime-local value → ISO string the API accepts (null when empty). */
function fromInput(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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
 * Create/edit an enrollment period: `{open, period, onClose, onSaved}`.
 *
 * The parent keys the modal on the record id, so opening a different row
 * remounts the form with fresh state instead of syncing via an effect.
 */
export default function PeriodFormModal({ open, period, onClose, onSaved }) {
  const editing = Boolean(period)

  const [form, setForm] = useState(() =>
    period
      ? {
          school_year: period.school_year ? String(period.school_year) : '',
          name: period.name || '',
          status: period.status || 'upcoming',
          opens_at: toInput(period.opens_at),
          closes_at: toInput(period.closes_at),
          grade_levels: (period.grade_level_ids || []).map(Number),
          allowed_types: period.allowed_enrollment_types
            ? [...period.allowed_enrollment_types]
            : [],
          allow_waitlist: period.allow_waitlist === true,
        }
      : EMPTY
  )

  const [schoolYears, setSchoolYears] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [optionsError, setOptionsError] = useState(null)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // Options lists load once per dialog (the parent keys this component, so
  // every open starts from fresh state).
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    Promise.all([api.list('/school-years/'), api.list('/grade-levels/')])
      .then(([years, grades]) => {
        if (cancelled) return
        setSchoolYears(years)
        setGradeLevels(grades)
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

  function toggleInList(field, value, checked) {
    setForm((prev) => ({
      ...prev,
      [field]: checked
        ? [...prev[field], value]
        : prev[field].filter((item) => item !== value),
    }))
  }

  function validate() {
    const errors = {}
    if (!form.school_year) errors.school_year = 'Choose a school year.'
    if (!form.opens_at) errors.opens_at = 'Set when applications open.'
    if (!form.closes_at) errors.closes_at = 'Set when applications close.'
    if (form.opens_at && form.closes_at) {
      const opens = new Date(form.opens_at).getTime()
      const closes = new Date(form.closes_at).getTime()
      if (!Number.isNaN(opens) && !Number.isNaN(closes) && closes <= opens) {
        errors.closes_at = 'The closing date must be after the opening date.'
      }
    }
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
      school_year: Number(form.school_year),
      name: form.name.trim(),
      status: form.status,
      opens_at: fromInput(form.opens_at),
      closes_at: fromInput(form.closes_at),
      grade_level_ids: form.grade_levels.map(Number),
      allowed_enrollment_types: form.allowed_types.length
        ? [...form.allowed_types]
        : null,
      allow_waitlist: form.allow_waitlist,
    }

    try {
      if (editing) {
        await api.patch(`/enrollment/periods/${period.id}/`, payload)
      } else {
        await api.post('/enrollment/periods/', payload)
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

  function field(name, type = 'input') {
    return {
      id: `pf-${name}`,
      className: type,
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `pf-${name}-err` : undefined,
    }
  }

  const errorFor = (name) => (
    <FieldError id={`pf-${name}-err`} message={fieldErrors[name]} />
  )

  return (
    <Modal
      open={open}
      title={editing ? 'Edit enrollment period' : 'New enrollment period'}
      onClose={onClose}
      dismissible={!busy}
      width={640}
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
            form="period-form"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {busy && <ButtonLoader />}
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create period'}
          </button>
        </>
      }
    >
      <form id="period-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {(error || optionsError) && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error || optionsError}</span>
          </div>
        )}

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="pf-school_year">School year</label>
            <select
              {...field('school_year', 'select')}
              value={form.school_year}
              onChange={(e) => update('school_year', e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a school year…</option>
              {schoolYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                </option>
              ))}
            </select>
            {errorFor('school_year')}
          </div>
          <div className="field grow">
            <label htmlFor="pf-status">Status</label>
            <select
              id="pf-status"
              className="select"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              disabled={busy}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="pf-name">Name (optional)</label>
          <input
            {...field('name')}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            disabled={busy}
            placeholder="e.g. SY 2026-2027 Registration"
          />
        </div>

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="pf-opens_at">Opens at</label>
            <input
              {...field('opens_at')}
              type="datetime-local"
              value={form.opens_at}
              onChange={(e) => update('opens_at', e.target.value)}
              disabled={busy}
            />
            {errorFor('opens_at')}
          </div>
          <div className="field grow">
            <label htmlFor="pf-closes_at">Closes at</label>
            <input
              {...field('closes_at')}
              type="datetime-local"
              value={form.closes_at}
              onChange={(e) => update('closes_at', e.target.value)}
              disabled={busy}
            />
            {errorFor('closes_at')}
          </div>
        </div>

        <div className="field">
          <span className="field-legend">Grade levels accepted</span>
          <div className="check-scroll">
            {gradeLevels.length === 0 ? (
              <span className="subtle">
                {optionsError
                  ? `Could not load grade levels: ${optionsError}`
                  : 'No grade levels exist yet.'}
              </span>
            ) : (
              gradeLevels.map((grade) => (
                <label className="checkbox-row" key={grade.id}>
                  <input
                    type="checkbox"
                    checked={form.grade_levels.includes(grade.id)}
                    onChange={(e) =>
                      toggleInList('grade_levels', grade.id, e.target.checked)
                    }
                    disabled={busy}
                  />
                  <span className="grow">{grade.name}</span>
                </label>
              ))
            )}
          </div>
          <span className="hint">
            Leave every box unchecked to accept all grade levels.
          </span>
        </div>

        <div className="field">
          <span className="field-legend">Enrollment types allowed</span>
          <div>
            {ENROLLMENT_TYPE_OPTIONS.map((opt) => (
              <label className="checkbox-row" key={opt.value}>
                <input
                  type="checkbox"
                  checked={form.allowed_types.includes(opt.value)}
                  onChange={(e) =>
                    toggleInList('allowed_types', opt.value, e.target.checked)
                  }
                  disabled={busy}
                />
                <span className="grow">{opt.label}</span>
              </label>
            ))}
          </div>
          <span className="hint">
            Check none to allow every enrollment type (new, returning and
            transferee).
          </span>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.allow_waitlist}
            onChange={(e) => update('allow_waitlist', e.target.checked)}
            disabled={busy}
          />
          Allow waitlisting when a grade level is full
        </label>
      </form>
    </Modal>
  )
}
