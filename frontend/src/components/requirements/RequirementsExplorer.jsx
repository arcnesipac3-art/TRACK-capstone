import ButtonLoader from '../../components/loading/ButtonLoader'
import { useMemo, useState } from 'react'
import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import Icon from '../Icon'
import ListSkeleton from '../loading/ListSkeleton'
import StatusBadge from '../StatusBadge'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  deadlineInfo,
  formatDateTime,
  formatRelative,
  requirementType,
  submissionStatus,
} from '../../utils/format'

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'not_submitted', label: 'Not submitted' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'submitted', label: 'Awaiting verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'returned', label: 'Returned for revision' },
]

const SORTS = [
  { value: 'deadline_asc', label: 'Deadline: soonest first' },
  { value: 'deadline_desc', label: 'Deadline: latest first' },
  { value: 'title', label: 'Title A–Z' },
]

/**
 * Requirement list shared by dashboards and list pages.
 *
 * - `params`        extra query params (e.g. `{ child: id }` for parents;
 *                   the backend enforces that only linked children work)
 * - `scope`         'student' shows submit/resubmit actions,
 *                   'teacher' | 'admin' | 'parent' show class information
 * - `limit`         optional cap for compact dashboard lists
 * - `showFilter`    status filter + deadline sorting controls
 */
export default function RequirementsExplorer({
  params,
  scope = 'student',
  limit,
  showFilter = true,
  refreshKey,
  childName,
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('deadline_asc')
  const [openFor, setOpenFor] = useState(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const studentScoped = scope === 'student' || scope === 'parent'
  const requirements = useFetch('/requirements/', {
    list: true,
    params,
    deps: [refreshKey],
  })
  const submissions = useFetch('/submissions/', {
    list: true,
    params,
    enabled: studentScoped,
    deps: [refreshKey],
  })

  const submissionFor = useMemo(() => {
    const map = new Map()
    ;(submissions.data || []).forEach((submission) => {
      map.set(submission.requirement, submission)
    })
    return map
  }, [submissions.data])

  function statusOf(requirement) {
    const existing = submissionFor.get(requirement.id)
    if (existing) return existing.status
    if (requirement.is_overdue) return 'overdue'
    return 'not_submitted'
  }

  const rows = useMemo(() => {
    let list = (requirements.data || []).map((requirement) => ({
      ...requirement,
      status: studentScoped ? statusOf(requirement) : null,
      submission: submissionFor.get(requirement.id) || null,
    }))

    if (statusFilter !== 'all') {
      list = list.filter((row) => row.status === statusFilter)
    }
    if (sort === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'deadline_desc') {
      list.sort(
        (a, b) => new Date(b.deadline) - new Date(a.deadline)
      )
    } else {
      list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    }
    if (limit) list = list.slice(0, limit)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements.data, submissionFor, statusFilter, sort, limit])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError(null)

    const value = linkUrl.trim()
    if (!value) {
      setSubmitError('Paste a link to your work before submitting.')
      return
    }
    if (!/^https?:\/\//i.test(value)) {
      setSubmitError('The link must start with http:// or https://')
      return
    }

    setSubmitting(true)
    try {
      await api.post('/submissions/', {
        requirement: openFor,
        link_url: value,
        status: 'submitted',
      })
      setOpenFor(null)
      setLinkUrl('')
      submissions.reload()
      requirements.reload()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const loading = requirements.loading || submissions.loading

  if (requirements.error) {
    return (
      <ErrorMessage
        error={requirements.error}
        title="Could not load requirements"
        onRetry={requirements.reload}
      />
    )
  }

  if (loading && !requirements.data) {
    // No card wrapper here: every call site renders this explorer inside a
    // card already, so nesting one would double-box the placeholder.
    return <ListSkeleton items={4} lines={3} label="Loading requirements…" />
  }

  return (
    <div className="stack stack-md">
      {showFilter && studentScoped && (
        <div className="filter-bar">
          <div className="field grow">
            <label htmlFor="req-status">Status</label>
            <select
              id="req-status"
              className="select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="req-sort">Sort by</label>
            <select
              id="req-sort"
              className="select"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {(statusFilter !== 'all' || sort !== 'deadline_asc') && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setStatusFilter('all')
                setSort('deadline_asc')
              }}
            >
              Reset
            </button>
          )}
        </div>
      )}

      {rows.length === 0 && !loading && (
        <EmptyState
          icon="clipboard"
          title="No requirements to show"
          message={
            statusFilter !== 'all'
              ? 'Nothing matches the selected status filter.'
              : 'When teachers post requirements, they will appear here.'
          }
        />
      )}

      <div className="stack stack-sm">
        {rows.map((row) => {
          const due = deadlineInfo(row.deadline)
          const meta = submissionStatus(row.status)
          const canSubmit =
            scope === 'student' &&
            (row.status === 'not_submitted' ||
              row.status === 'overdue' ||
              row.status === 'returned')

          return (
            <article className="record-card" key={row.id}>
              <div className="rc-top">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="rc-subject">{row.subject_name || 'Subject'}</div>
                  <div className="rc-title">{row.title}</div>
                </div>
                <StatusBadge
                  label={studentScoped ? meta.label : due.label}
                  tone={studentScoped ? meta.tone : due.tone}
                />
              </div>

              <div className="rc-meta">
                <span>
                  <strong>{requirementType(row.requirement_type)}</strong>
                </span>
                <span>
                  Due {formatDateTime(row.deadline)}
                  {' · '}
                  <span style={{ fontWeight: 600 }}>{due.label}</span>
                </span>
                {row.section_name && <span>{row.section_name}</span>}
                {childName && <span>{childName}</span>}
                {row.submission?.link_url && (
                  <span>
                    Submitted {formatRelative(row.submission.submitted_at)}
                  </span>
                )}
                {row.submission?.teacher_feedback && (
                  <span className="text-truncate" title={row.submission.teacher_feedback}>
                    Feedback: {row.submission.teacher_feedback}
                  </span>
                )}
              </div>

              {canSubmit && (
                <div className="rc-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    aria-expanded={openFor === row.id}
                    onClick={() => {
                      setOpenFor(openFor === row.id ? null : row.id)
                      setLinkUrl(row.submission?.link_url || '')
                      setSubmitError(null)
                    }}
                  >
                    <Icon name="send" size={14} />
                    {row.status === 'returned' ? 'Resubmit work' : 'Submit work'}
                  </button>
                </div>
              )}

              {openFor === row.id && (
                <form
                  className="stack stack-sm"
                  onSubmit={handleSubmit}
                  style={{
                    marginTop: 6,
                    padding: '14px',
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div className="field">
                    <label htmlFor={`link-${row.id}`}>
                      Link to your work
                    </label>
                    <input
                      id={`link-${row.id}`}
                      className="input"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.target.value)}
                      aria-describedby={`link-help-${row.id}`}
                      disabled={submitting}
                    />
                    <span className="hint" id={`link-help-${row.id}`}>
                      Paste a shareable link (Google Docs, Drive, or similar).
                    </span>
                  </div>

                  {submitError && (
                    <div className="alert alert-error" role="alert">
                      <Icon name="info" size={16} />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="row row-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setOpenFor(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-sm btn-primary"
                      disabled={submitting}
                    >
                      {submitting && (
                        <ButtonLoader />
                      )}
                      {submitting ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                </form>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
