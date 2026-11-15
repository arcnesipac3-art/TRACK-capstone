import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import ObligationActionModal from './ObligationActionModal'
import PageHeader from '../../components/PageHeader'
import RaiseObligationModal from './RaiseObligationModal'
import StatusBadge from '../../components/StatusBadge'
import api, { API_BASE } from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  DECISION_OPTIONS,
  departmentStatus,
  obligationStatus,
  overallStatus,
  statusWord,
  submissionStatus,
} from '../../utils/clearance'
import { downloadAuthorizedFile } from '../../utils/enrollment'
import {
  deadlineInfo,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelative,
} from '../../utils/format'
import './Clearance.css'

/**
 * One learner, one office, one decision.
 *
 * This is the whole verification portal for a department: the checklist the
 * learner was given when their row was created, the documents on it, what the
 * office holds against them, and the sign-off. The transitions are the
 * server's — approving with a required document still unreviewed is refused
 * here exactly as it is refused in the database, and the sentence explaining
 * why is the server's own.
 */
export default function ClearanceQueueItemPage() {
  const { id } = useParams()

  const item = useFetch(`/clearance/queue/${id}/`)
  const options = useFetch('/clearance/options/')
  const record = item.data

  const [decision, setDecision] = useState('approved')
  const [note, setNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [obligationAction, setObligationAction] = useState(null)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenNote, setReopenNote] = useState('')

  const kinds = useFetch('/clearance/obligation-types/', {
    list: true,
    params: { department: record?.department },
    enabled: Boolean(record?.department),
  })

  // The scope of this screen is the officer's own membership, and the server
  // answers it per department in the options payload — the same predicate that
  // guards the writes. An administrator who configures clearance but is not
  // personnel of this office can read the item and cannot decide it.
  const office = (options.data?.departments || []).find(
    (department) => department.id === record?.department
  )
  const canReview = Boolean(office?.can_verify)

  function say(text) {
    setNotice(text)
    setError(null)
  }

  function fail(text) {
    setError(text)
    setNotice(null)
  }

  async function run(work, successText) {
    setBusy(true)
    setError(null)
    try {
      const result = await work()
      item.reload()
      if (successText) say(successText(result))
      return true
    } catch (err) {
      fail(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function submitDecision(event) {
    event.preventDefault()
    const chosen = DECISION_OPTIONS.find((option) => option.value === decision)
    if (chosen && decision !== 'approved' && !note.trim()) {
      fail('This decision needs an explanation the learner can read.')
      return
    }
    run(
      () =>
        api.post(`/clearance/queue/${id}/decision/`, {
          status: decision,
          note: note.trim(),
          internal_note: internalNote.trim(),
        }),
      (result) =>
        `Recorded ${result.status_label || statusWord(result.status)} for ${result.learner}.`
    )
    setNote('')
    setInternalNote('')
  }

  function reviewSubmission(submission, outcome) {
    if (outcome === 'return' && !note.trim()) {
      fail('Say what the learner has to fix before this can be accepted.')
      return
    }
    run(
      () =>
        api.post(`/clearance/queue/${id}/documents/${submission.id}/review/`, {
          decision: outcome,
          note: note.trim(),
        }),
      () =>
        outcome === 'accept'
          ? `“${submission.name}” accepted.`
          : `“${submission.name}” returned to the learner.`
    )
    setNote('')
  }

  function openDocument(submission) {
    setBusy(true)
    downloadAuthorizedFile(
      API_BASE,
      `clearance/queue/${id}/documents/${submission.id}/download/`,
      submission.original_filename || 'clearance-document'
    )
      .then(() => setError(null))
      .catch((err) => fail(err.message))
      .finally(() => setBusy(false))
  }

  async function raiseObligation(body) {
    const ok = await run(
      () => api.post(`/clearance/queue/${id}/obligations/`, body),
      () => `Recorded against ${record.learner} at ${record.department_name}.`
    )
    if (ok) setRaiseOpen(false)
  }

  async function actOnObligation(body) {
    const ok = await run(
      () =>
        api.post(
          `/clearance/obligations/${obligationAction.obligation.id}/action/`,
          body
        ),
      (result) =>
        `“${result.title}” is now ${obligationStatus(result.status).label.toLowerCase()}.`
    )
    if (ok) setObligationAction(null)
  }

  function confirmReopen() {
    if (!reopenNote.trim()) {
      fail('A reopening needs the reason recorded.')
      return
    }
    run(
      () => api.post(`/clearance/queue/${id}/reopen/`, { note: reopenNote.trim() }),
      () => 'Reopened — this learner is back in the queue for a decision.'
    )
    setReopenOpen(false)
    setReopenNote('')
  }

  if (item.loading && !record) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Clearance item" subtitle="Opening this office’s file…" />
        <Card loading title="Learner">
          <span className="subtle">Reading this item…</span>
        </Card>
      </div>
    )
  }

  if (item.error && !record) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Clearance item" />
        <ErrorMessage
          error={item.error}
          title={
            item.error.status === 404
              ? 'This item is not in a queue you hold'
              : 'Could not open this item'
          }
          onRetry={item.reload}
        />
        <Link className="clr-chip" to="/admin/clearance/queue">
          <Icon name="arrowLeft" size={14} />
          Back to your queue
        </Link>
      </div>
    )
  }

  const status = departmentStatus(record.status)
  const standing = overallStatus(record.overall_status)
  const due = deadlineInfo(record.deadline)
  const submissions = record.submissions || []
  const obligations = record.obligations || []
  const open = obligations.filter((one) => one.status === 'open')
  const blocking = open.filter((one) => one.is_blocking)
  const settled = Boolean(record.is_final)
  const held = [
    blocking.length ? `${blocking.length} blocking obligation(s) still outstanding` : '',
    open.length - blocking.length
      ? `${open.length - blocking.length} advisory obligation(s) noted`
      : '',
    record.awaiting_document ? 'A document is waiting for your review' : '',
  ].filter(Boolean)

  return (
    <div className="stack stack-md">
      <PageHeader
        title={record.learner}
        subtitle={`${record.department_name} · ${record.period_name} · ${
          record.grade_level || 'no grade recorded'
        }${record.section ? ` · ${record.section}` : ''}`}
        actions={
          <>
            <StatusBadge label={record.status_label || status.label} tone={status.tone} />
            <Link className="clr-chip" to="/admin/clearance/queue">
              <Icon name="arrowLeft" size={14} />
              Your queue
            </Link>
          </>
        }
      />

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorMessage error={error} title="The office could not record that" />}

      <section className="clr-setup">
        <div className="stack stack-md">
          <Card title="Learner">
            <dl className="profile-grid">
              <div className="profile-field">
                <dt>LRN</dt>
                <dd>{record.lrn || '—'}</dd>
              </div>
              <div className="profile-field">
                <dt>Grade &amp; section</dt>
                <dd>
                  {record.grade_level || '—'}
                  {record.section ? ` · ${record.section}` : ''}
                </dd>
              </div>
              <div className="profile-field">
                <dt>Whole clearance</dt>
                <dd>{standing.label}</dd>
              </div>
              <div className="profile-field">
                <dt>Required of this learner</dt>
                <dd>{record.is_required ? 'Yes' : 'No — advisory office'}</dd>
              </div>
              <div className="profile-field">
                <dt>Deadline here</dt>
                <dd>
                  {record.deadline ? formatDate(record.deadline) : 'None set'}
                  <span className="subtle block">{due.label}</span>
                </dd>
              </div>
              <div className="profile-field">
                <dt>Opened by officers</dt>
                <dd>{record.reviewed_count ?? 0} time(s)</dd>
              </div>
            </dl>

            <p className="clr-note">
              {record.instructions || 'This office left no instructions for learners.'}
            </p>

            {record.decided_at && (
              <p className="clr-note">
                <strong>{record.decided_by_name || 'An officer'}</strong> decided{' '}
                {formatRelative(record.decided_at)}
                {record.decision_note ? `: “${record.decision_note}”` : '.'}
              </p>
            )}
          </Card>

          <Card title="What is holding this office">
            {held.length === 0 ? (
              <p className="subtle">
                Nothing at this office needs settling — the decision below is the
                remaining work.
              </p>
            ) : (
              <ul className="clr-blockers">
                {held.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack stack-md">
          <div className="clr-office-card">
            <header>
              <h3>Checklist and documents</h3>
              <span className="subtle">{submissions.length} item(s)</span>
            </header>
            <div className="card-body">
              {submissions.length === 0 ? (
                <EmptyState
                  icon="checkSquare"
                  title="This office asks for no documents"
                  message="It verifies learners from its own records, so the decision below is the whole of the work."
                />
              ) : (
                <div className="clr-checklist">
                  {submissions.map((submission) => {
                    const sub = submissionStatus(submission.status)
                    return (
                      <div className="clr-item" key={submission.id}>
                        <div className="clr-item-head">
                          <div>
                            <strong>{submission.name}</strong>
                            <span className="subtle block">
                              {submission.is_required ? 'Required' : 'Optional'}
                              {submission.revision > 1
                                ? ` · revision ${submission.revision}`
                                : ''}
                            </span>
                          </div>
                          <StatusBadge
                            label={submission.status_label || sub.label}
                            tone={sub.tone}
                          />
                        </div>

                        {submission.original_filename && (
                          <div className="row row-wrap gap-sm">
                            <span className="subtle">
                              {submission.original_filename} ·{' '}
                              {formatDateTime(submission.submitted_at)}
                            </span>
                            {submission.has_file && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openDocument(submission)}
                                disabled={busy}
                              >
                                <Icon name="download" size={14} />
                                Open document
                              </Button>
                            )}
                            {submission.reviewed_by_name && (
                              <span className="subtle">
                                reviewed by {submission.reviewed_by_name}
                              </span>
                            )}
                          </div>
                        )}

                        {submission.review_note && (
                          <p className="clr-rejection">
                            Your office said: “{submission.review_note}”
                          </p>
                        )}

                        {submission.status === 'submitted' && canReview && (
                          <div className="clr-decision">
                            <div className="field">
                              <label
                                htmlFor={`clr-doc-note-${submission.id}`}
                                className="subtle"
                              >
                                Note for the learner (needed to return this)
                              </label>
                              <input
                                id={`clr-doc-note-${submission.id}`}
                                className="input"
                                value={note}
                                onChange={(event) => {
                                  setNote(event.target.value)
                                  setError(null)
                                }}
                                placeholder="What is wrong with it, in one sentence."
                              />
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busy}
                              onClick={() => reviewSubmission(submission, 'accept')}
                            >
                              <Icon name="check" size={14} />
                              Accept
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy}
                              onClick={() => reviewSubmission(submission, 'return')}
                            >
                              <Icon name="undo" size={14} />
                              Return
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="clr-office-card">
            <header>
              <h3>Decision</h3>
              <span className="subtle">
                {settled ? 'Recorded — reopen to change it' : 'This office’s answer'}
              </span>
            </header>
            <div className="card-body">
              {blocking.length > 0 && (
                <div className="alert alert-error" role="alert">
                  {blocking.length} blocking obligation(s) are still outstanding.
                  Settling or waiving one is the usual way through; approving with it
                  open is a decision this office has to explain in the note.
                </div>
              )}

              {canReview && !settled && (
                <form className="stack" onSubmit={submitDecision}>
                  <div className="clr-chips" role="radiogroup" aria-label="Decision">
                    {DECISION_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={
                          decision === option.value
                            ? 'clr-chip clr-chip-button is-on'
                            : 'clr-chip clr-chip-button'
                        }
                        aria-pressed={decision === option.value}
                        onClick={() => {
                          setDecision(option.value)
                          setError(null)
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="subtle">
                    {DECISION_OPTIONS.find((option) => option.value === decision)?.hint}
                  </p>

                  <div className="field">
                    <label htmlFor="clr-decision-note">
                      Explanation the learner reads
                    </label>
                    <textarea
                      id="clr-decision-note"
                      className="textarea"
                      rows={3}
                      value={note}
                      maxLength={2000}
                      onChange={(event) => {
                        setNote(event.target.value)
                        setError(null)
                      }}
                      placeholder="Needed for a rejection, a correction or a ‘not applicable’."
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="clr-internal-note" className="subtle">
                      Internal note — never shown to the learner
                    </label>
                    <input
                      id="clr-internal-note"
                      className="input"
                      value={internalNote}
                      maxLength={2000}
                      onChange={(event) => setInternalNote(event.target.value)}
                      placeholder="Which register, receipt or file you checked."
                    />
                  </div>

                  <div className="row row-wrap gap-sm">
                    <Button variant="primary" size="sm" type="submit" loading={busy}>
                      <Icon name="checkSquare" size={14} />
                      Record decision
                    </Button>
                    {['submitted', 'pending_submission'].includes(record.status) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api.post(`/clearance/queue/${id}/review-start/`, {}),
                            () =>
                              'Marked under review — other officers can see you have this one.'
                          )
                        }
                      >
                        <Icon name="eye" size={14} />
                        Start review
                      </Button>
                    )}
                  </div>
                </form>
              )}

              {canReview && settled && (
                <div className="row row-wrap gap-sm">
                  <Button variant="secondary" size="sm" onClick={() => setReopenOpen(true)}>
                    <Icon name="undo" size={14} />
                    Reopen this item
                  </Button>
                  <span className="subtle">
                    A recorded decision is changed deliberately: reopening writes the
                    reason into the learner&apos;s history and moves the clearance back to
                    this office.
                  </span>
                </div>
              )}

              {!canReview && (
                <p className="clr-note">
                  You are reading this as an administrator who configures the clearance.
                  Only personnel of {record.department_name} records its decision, and the
                  server answers nobody else.
                </p>
              )}
            </div>
          </div>

          <div className="clr-office-card">
            <header>
              <h3>What this office holds against {record.learner}</h3>
              <span className="subtle">{obligations.length} record(s)</span>
            </header>
            <div className="card-body">
              {obligations.length === 0 ? (
                <p className="subtle">
                  Nothing is recorded against this learner at this office.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Obligation</th>
                        <th scope="col">Status</th>
                        <th scope="col">Recorded by</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {obligations.map((obligation) => (
                        <tr key={obligation.id}>
                          <td data-label="Obligation" className="cell-main">
                            {obligation.title}
                            <span className="subtle block">
                              {[
                                Number(obligation.amount) > 0
                                  ? formatCurrency(obligation.amount)
                                  : '',
                                obligation.is_blocking
                                  ? 'blocks the sign-off'
                                  : 'advisory',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            {obligation.detail && (
                              <span className="subtle block">{obligation.detail}</span>
                            )}
                          </td>
                          <td data-label="Status">
                            <StatusBadge
                              label={obligation.status_label}
                              tone={obligationStatus(obligation.status).tone}
                            />
                            {obligation.waiver_reason && (
                              <span className="subtle block">
                                waived by {obligation.waived_by_name}: “
                                {obligation.waiver_reason}”
                              </span>
                            )}
                            {obligation.resolution_note && (
                              <span className="subtle block">
                                settled by {obligation.resolved_by_name}: “
                                {obligation.resolution_note}”
                              </span>
                            )}
                          </td>
                          <td data-label="Recorded by">
                            {obligation.created_by_name || '—'}
                            <span className="subtle block">
                              {formatDateTime(obligation.created_at)}
                            </span>
                          </td>
                          <td data-label="Actions" className="text-right">
                            {canReview ? (
                              <div className="row-actions">
                                {obligation.status === 'open' ? (
                                  <>
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() =>
                                        setObligationAction({
                                          obligation,
                                          mode: 'resolve',
                                        })
                                      }
                                    >
                                      Settle
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() =>
                                        setObligationAction({
                                          obligation,
                                          mode: 'waive',
                                        })
                                      }
                                    >
                                      Waive
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      setObligationAction({
                                        obligation,
                                        mode: 'reopen',
                                      })
                                    }
                                  >
                                    Reopen
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setObligationAction({ obligation, mode: 'update' })
                                  }
                                >
                                  Edit
                                </Button>
                              </div>
                            ) : (
                              <span className="subtle">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canReview && (
                <div className="row row-wrap gap-sm">
                  <Button variant="secondary" size="sm" onClick={() => setRaiseOpen(true)}>
                    <Icon name="plus" size={14} />
                    Record an obligation
                  </Button>
                  <span className="subtle">
                    Nothing is raised automatically — an obligation exists because this
                    office wrote it against this learner.
                  </span>
                </div>
              )}
            </div>
          </div>

          <Card
            title="History of this item"
            action={
              <span className="subtle">
                {(record.events || []).length} entr{(record.events || []).length === 1 ? 'y' : 'ies'}
              </span>
            }
          >
            {(record.events || []).length === 0 ? (
              <p className="subtle">Nothing has been recorded on this item yet.</p>
            ) : (
              <ul className="clr-events">
                {[...(record.events || [])]
                  .reverse()
                  .slice(0, 40)
                  .map((event) => (
                    <li key={event.id}>
                      <div className="row row-between">
                        <strong>{event.actor_name || 'The workflow'}</strong>
                        <span className="subtle">{formatRelative(event.created_at)}</span>
                      </div>
                      <span>
                        {event.from_status
                          ? `${statusWord(event.from_status)} → ${statusWord(event.to_status)}`
                          : statusWord(event.to_status) || event.action}
                      </span>
                      {event.note && (
                        <span className="subtle block">“{event.note}”</span>
                      )}
                      {event.internal_note && (
                        <span className="subtle block">internal: {event.internal_note}</span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <RaiseObligationModal
        open={raiseOpen}
        item={record}
        kinds={(kinds.data || []).filter((kind) => kind.is_active)}
        busy={busy}
        error={error}
        onClose={() => setRaiseOpen(false)}
        onSubmit={raiseObligation}
      />

      <ObligationActionModal
        open={Boolean(obligationAction)}
        mode={obligationAction?.mode}
        obligation={obligationAction?.obligation}
        busy={busy}
        error={error}
        onClose={() => setObligationAction(null)}
        onSubmit={actOnObligation}
      />

      <Modal
        open={reopenOpen}
        title="Reopen this office's decision?"
        onClose={() => setReopenOpen(false)}
        width={520}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReopenOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmReopen}
              loading={busy}
              type="submit"
              form="clr-reopen-form"
            >
              Reopen it
            </Button>
          </>
        }
      >
        <form id="clr-reopen-form" className="stack" onSubmit={(event) => {
          event.preventDefault()
          confirmReopen()
        }}>
          <p className="clr-note">
            {record.department_name} currently says{' '}
            <strong>{record.status_label || statusWord(record.status)}</strong>. Reopening
            puts the learner back in this office&apos;s queue and takes the sign-off off
            their clearance — the reason goes into their history.
          </p>
          <div className="field">
            <label htmlFor="clr-reopen-note">Why is it reopened?</label>
            <textarea
              id="clr-reopen-note"
              className="textarea"
              rows={3}
              value={reopenNote}
              maxLength={2000}
              onChange={(event) => setReopenNote(event.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
