import { useMemo, useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'

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
 * Create or edit a teacher's class assignment (teacher + subject + section).
 *
 * Posts to the real endpoints (`POST /api/teacher-assignments/` and
 * `PATCH|DELETE /api/teacher-assignments/:id/`). Picking a section narrows the
 * subject list to that section's grade level and school year, so an admin
 * cannot select a mismatched pairing — Django validates it again on submit.
 */
export default function AssignmentFormModal({
  open,
  item,
  teachers = [],
  sections = [],
  subjects = [],
  onClose,
  onSaved,
}) {
  const editing = Boolean(item)

  const [teacher, setTeacher] = useState(item ? String(item.teacher) : '')
  const [section, setSection] = useState(item ? String(item.section) : '')
  const [subject, setSubject] = useState(item ? String(item.subject) : '')
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const chosenSection = sections.find((s) => String(s.id) === section)

  // Only subjects that actually belong to the selected section's grade level
  // and school year. Without a section selected, show every subject.
  const subjectOptions = useMemo(() => {
    if (!chosenSection) return subjects
    return subjects.filter(
      (s) =>
        s.grade_level === chosenSection.grade_level &&
        s.school_year === chosenSection.school_year
    )
  }, [subjects, chosenSection])

  // If the currently selected subject stops matching, clear it so the admin
  // is never silently posting a mismatched pairing.
  const effectiveSubject =
    subjectOptions.some((s) => String(s.id) === subject) ? subject : ''

  function sectionLabel(s) {
    return `${s.grade_level_name} — ${s.name}`
  }

  async function submit(event) {
    event.preventDefault()
    const errors = {}
    if (!teacher) errors.teacher = 'Choose a teacher.'
    if (!section) errors.section = 'Choose a section.'
    if (!effectiveSubject) errors.subject = 'Choose a subject.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const payload = {
        teacher: Number(teacher),
        section: Number(section),
        subject: Number(effectiveSubject),
      }
      if (editing) {
        await api.patch(`/teacher-assignments/${item.id}/`, payload)
      } else {
        await api.post('/teacher-assignments/', payload)
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

  function fieldProps(name) {
    return {
      id: `af-${name}`,
      className: 'select',
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `af-${name}-err` : undefined,
    }
  }

  const errorFor = (name) => (
    <FieldError id={`af-${name}-err`} message={fieldErrors[name]} />
  )

  return (
    <Modal
      open={open}
      title={editing ? 'Edit class assignment' : 'Assign a class'}
      onClose={onClose}
      dismissible={!busy}
      width={520}
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
            form="assignment-form"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Assign class'}
          </button>
        </>
      }
    >
      <form id="assignment-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="af-teacher">Teacher</label>
          <select
            {...fieldProps('teacher')}
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            disabled={busy}
          >
            <option value="">Select a teacher…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || t.username}
              </option>
            ))}
          </select>
          {teachers.length === 0 && (
            <span className="hint">No teacher accounts exist yet.</span>
          )}
          {errorFor('teacher')}
        </div>

        <div className="field">
          <label htmlFor="af-section">Section</label>
          <select
            {...fieldProps('section')}
            value={section}
            onChange={(e) => {
              setSection(e.target.value)
              setSubject('')
            }}
            disabled={busy}
          >
            <option value="">Select a section…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s)}
              </option>
            ))}
          </select>
          {sections.length === 0 && (
            <span className="hint">Add a section first.</span>
          )}
          {errorFor('section')}
        </div>

        <div className="field">
          <label htmlFor="af-subject">Subject</label>
          <select
            {...fieldProps('subject')}
            value={effectiveSubject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy || !chosenSection}
          >
            <option value="">
              {chosenSection ? 'Select a subject…' : 'Pick a section first'}
            </option>
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ''}
              </option>
            ))}
          </select>
          {chosenSection && subjectOptions.length === 0 && (
            <span className="hint">
              No subjects are offered in {chosenSection.grade_level_name} for{' '}
              {chosenSection.school_year_label}. Add one on School Structure.
            </span>
          )}
          {errorFor('subject')}
        </div>

        <p className="subtle">
          This is what lets a teacher post requirements and take attendance for
          the class. A teacher can hold several assignments.
        </p>
      </form>
    </Modal>
  )
}
