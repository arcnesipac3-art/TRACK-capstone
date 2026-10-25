import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import {
  formatDateTime,
  formatRelative,
  submissionStatus,
} from '../utils/format'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Awaiting verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'returned', label: 'Returned' },
]

/* ------------------------------------------------------------------ */
/* Student view                                                        */
/* ------------------------------------------------------------------ */

function StudentSubmissions() {
  const { data, loading, error, reload } = useFetch('/submissions/', {
    list: true,
    params: { page_size: 100 },
  })
  const items = data || []

  if (loading && !data) return <LoadingSpinner block label="Loading your submissions…" />
  if (error) {
    return (
      <ErrorMessage
        error={error}
        title="Could not load your submissions"
        onRetry={reload}
      />
    )
  }
  if (items.length === 0) {
    return (
      <section className="card card-pad">
        <EmptyState
          icon="file"
          title="No submissions yet"
          message="Work you submit from My Requirements will be listed here with its verification status."
        />
      </section>
    )
  }

  return (
    <section className="card">
      <div className="table-wrap">
        <table className="table responsive-table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Teacher feedback</th>
              <th>Work</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const meta = submissionStatus(item.status)
              return (
                <tr key={item.id}>
                  <td data-label="Requirement" className="cell-main">
                    {item.requirement_title}
                  </td>
                  <td data-label="Submitted">
                    {item.submitted_at ? formatDateTime(item.submitted_at) : '—'}
                  </td>
                  <td data-label="Status">
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </td>
                  <td data-label="Feedback">
                    {item.teacher_feedback ? (
                      <span title={item.teacher_feedback}>
                        {item.teacher_feedback.length > 70
                          ? `${item.teacher_feedback.slice(0, 70)}…`
                          : item.teacher_feedback}
                      </span>
                    ) : (
                      <span className="subtle">—</span>
                    )}
                  </td>
                  <td data-label="">
                    {item.link_url ? (
                      <a href={item.link_url} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    ) : (
                      <span className="subtle">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Teacher review view                                                 */
/* ------------------------------------------------------------------ */

function ReviewRow({ submission, onDone }) {
  const [mode, setMode] = useState(null) // null | 'return'
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function act(status) {
    setError(null)
    setBusy(true)
    try {
      await api.patch(`/submissions/${submission.id}/`, {
        status,
        ...(status === 'returned' ? { teacher_feedback: feedback.trim() } : {}),
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="list-card">
      <div className="row row-between row-wrap">
        <div className="grow stack stack-xs" style={{ minWidth: 200 }}>
          <span className="list-card-title">{submission.student_name}</span>
          <span className="list-card-meta">
            <span>{submission.requirement_title}</span>
            <span>
              {submission.submitted_at
                ? `submitted ${formatRelative(submission.submitted_at)}`
                : 'no submission time'}
            </span>
          </span>
          {submission.link_url && (
            <a href={submission.link_url} target="_blank" rel="noreferrer">
              Open submitted work
            </a>
          )}
        </div>

        <div className="row row-wrap">
          <StatusBadge
            label={submissionStatus(submission.status).label}
            tone={submissionStatus(submission.status).tone}
          />
          {submission.status === 'submitted' && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => act('verified')}
                disabled={busy}
              >
                {busy && mode === null && (
                  <span className="spinner spinner-sm" aria-hidden="true" />
                )}
                Verify
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setMode(mode === 'return' ? null : 'return')}
                disabled={busy}
                aria-expanded={mode === 'return'}
              >
                Return
              </button>
            </>
          )}
        </div>
      </div>

      {mode === 'return' && (
        <div className="stack stack-sm" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor={`feedback-${submission.id}`}>
              Feedback for the student
            </label>
            <textarea
              id={`feedback-${submission.id}`}
              className="textarea"
              style={{ minHeight: 74 }}
              placeholder="What should the student revise?"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              disabled={busy}
            />
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={15} />
              <span>{error}</span>
            </div>
          )}
          <div className="row row-end">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setMode(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (!feedback.trim()) {
                  setError('Add feedback before returning the work.')
                  return
                }
                act('returned')
              }}
              disabled={busy}
            >
              Return for revision
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TeacherReview() {
  const [filter, setFilter] = useState('submitted')
  const { data, loading, error, reload } = useFetch('/submissions/', {
    list: true,
    params: { page_size: 100 },
  })

  const items = (data || []).filter(
    (item) => filter === 'all' || item.status === filter
  )
  const pending = (data || []).filter((item) => item.status === 'submitted').length

  function refresh() {
    reload()
  }

  return (
    <>
      <div className="filter-bar">
        <div className="field grow">
          <label htmlFor="review-filter">Show</label>
          <select
            id="review-filter"
            className="select"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <span className="badge badge-amber" style={{ marginBottom: 2 }}>
          {pending} awaiting verification
        </span>
      </div>

      <section className="card">
        {loading && !data && <LoadingSpinner block label="Loading submissions…" />}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage error={error} title="Could not load submissions" onRetry={reload} />
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="checkSquare"
              title="Nothing to show"
              message="Submissions from your students will be listed here for verification."
            />
          </div>
        )}

        {!loading &&
          !error &&
          items.map((submission) => (
            <ReviewRow key={submission.id} submission={submission} onDone={refresh} />
          ))}
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */

export default function SubmissionsPage({ mode = 'mine' }) {
  const isReview = mode === 'review'

  return (
    <div className="stack stack-md">
      <PageHeader
        title={isReview ? 'Submission Review' : 'My Submissions'}
        subtitle={
          isReview
            ? 'Verify work that meets the requirements or return it with feedback.'
            : 'Every piece of work you have submitted, and what happened to it.'
        }
      />
      {isReview ? <TeacherReview /> : <StudentSubmissions />}
    </div>
  )
}
