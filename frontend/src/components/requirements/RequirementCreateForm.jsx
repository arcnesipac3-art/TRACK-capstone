import { useState } from 'react'
import Icon from '../Icon'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'

const TYPES = [
  ['assignment', 'Assignment'],
  ['project', 'Project'],
  ['activity', 'Activity'],
  ['quiz', 'Quiz'],
  ['performance', 'Performance task'],
  ['other', 'Other'],
]

/**
 * Create-requirement form for teachers. Posts to the real
 * `POST /api/requirements/` endpoint (ownership is enforced in Django).
 */
export default function RequirementCreateForm({ onCreated }) {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    teacher_assignment: '',
    title: '',
    description: '',
    requirement_type: 'assignment',
    deadline: '',
    allow_link_submission: true,
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const options = assignments.data || []

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError(null)

    if (!form.teacher_assignment) {
      setError('Choose the class this requirement belongs to.')
      return
    }
    if (!form.title.trim()) {
      setError('Enter a title for the requirement.')
      return
    }
    if (!form.deadline) {
      setError('Set a deadline.')
      return
    }
    const deadlineDate = new Date(form.deadline)
    if (Number.isNaN(deadlineDate.getTime())) {
      setError('The deadline is not a valid date and time.')
      return
    }

    setBusy(true)
    try {
      await api.post('/requirements/', {
        teacher_assignment: Number(form.teacher_assignment),
        title: form.title.trim(),
        description: form.description.trim(),
        requirement_type: form.requirement_type,
        deadline: deadlineDate.toISOString(),
        allow_link_submission: Boolean(form.allow_link_submission),
      })
      setForm({
        teacher_assignment: form.teacher_assignment,
        title: '',
        description: '',
        requirement_type: 'assignment',
        deadline: '',
        allow_link_submission: true,
      })
      setOpen(false)
      onCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
        disabled={assignments.loading}
      >
        <Icon name="plus" size={15} />
        {assignments.loading ? 'Loading classes…' : 'New requirement'}
      </button>
    )
  }

  return (
    <form
      className="card card-pad stack stack-sm"
      onSubmit={submit}
      style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}
      aria-label="New requirement"
    >
      <div className="field">
        <label htmlFor="req-class">Class and subject</label>
        <select
          id="req-class"
          className="select"
          value={form.teacher_assignment}
          onChange={(event) => update('teacher_assignment', event.target.value)}
          disabled={busy}
        >
          <option value="">Select a class…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.subject_name} — {option.section_name}
            </option>
          ))}
        </select>
        {options.length === 0 && !assignments.loading && (
          <span className="hint">
            No classes are assigned to you yet. Ask the administrator to
            assign your sections and subjects.
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="req-title">Title</label>
        <input
          id="req-title"
          className="input"
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
          placeholder="e.g. Fractions Worksheet 3"
          disabled={busy}
        />
      </div>

      <div className="row row-wrap">
        <div className="field grow">
          <label htmlFor="req-type">Type</label>
          <select
            id="req-type"
            className="select"
            value={form.requirement_type}
            onChange={(event) => update('requirement_type', event.target.value)}
            disabled={busy}
          >
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="req-deadline">Deadline</label>
          <input
            id="req-deadline"
            className="input"
            type="datetime-local"
            value={form.deadline}
            onChange={(event) => update('deadline', event.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="req-description">Instructions (optional)</label>
        <textarea
          id="req-description"
          className="textarea"
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          disabled={busy}
        />
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.allow_link_submission}
          onChange={(event) => update('allow_link_submission', event.target.checked)}
          disabled={busy}
        />
        Allow link submissions from students
      </label>

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="row row-end">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? 'Creating…' : 'Create requirement'}
        </button>
      </div>
    </form>
  )
}
