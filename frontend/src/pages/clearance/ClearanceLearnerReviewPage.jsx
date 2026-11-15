import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import api, { API_BASE } from '../../services/api'
import {
  departmentStatus,
  obligationStatus,
  overallStatus,
  statusWord,
} from '../../utils/clearance'
import { downloadAuthorizedFile } from '../../utils/enrollment'
import { formatDate, formatDateTime } from '../../utils/format'
import './Clearance.css'

/** One row of the history, in the words a person reading a file expects. */
function eventLine(event) {
  return {
    who: event.actor_name || 'The workflow',
    moved:
      event.from_status && event.to_status
        ? `${statusWord(event.from_status)} → ${statusWord(event.to_status)}`
        : statusWord(event.to_status) || event.action,
    note: event.note || event.internal_note || '',
  }
}

/**
 * One learner's whole clearance, from the Registrar's side.
 *
 * The final approval is the point of this screen, so it is the one action that
 * is never taken on faith: the blockers are read from the server, the button is
 * offered only when `can_finalize` says the record is ready for *this*
 * requester, and the workflow re-checks all of it inside the write — a queue
 * that moved while the page sat open comes back refused rather than approved
 * over.
 */
export default function ClearanceLearnerReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const canFinalize = can('clearance.finalize')

  const read = useFetch(`/clearance/records/${id}/`)
  const [note, setNote] = useState('')
  const [withdraw, setWithdraw] = useState(null)
  const [busy, setBusy] = useState(false)
  const [alert, setAlert] = useState(null)
  // Signing a learner off issues a reference and notifies the household, so
  // the click that does it asks first — the same two-step the withdrawal uses.
  const [confirmClear, setConfirmClear] = useState(false)

  const record = read.data
  const status = overallStatus(record?.overall_status)

  async function signOff() {
    setBusy(true)
    setAlert(null)
    try {
      await api.post(`/clearance/records/${id}/finalize/`, { note })
      setNote('')
      setAlert({ kind: 'success', text: 'Cleared. The learner and their guardian have been notified.' })
      read.reload()
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
      read.reload()
    } finally {
      setBusy(false)
    }
  }

  async function confirmWithdraw() {
    setBusy(true)
    setAlert(null)
    try {
      await api.delete(`/clearance/records/${id}/finalize/`, { reason: withdraw.reason })
      setWithdraw(null)
      setAlert({ kind: 'success', text: 'Clearance withdrawn and recorded.' })
      read.reload()
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function downloadCertificate() {
    setAlert(null)
    try {
      await downloadAuthorizedFile(
        API_BASE,
        `clearance/my/${record.id}/certificate/`,
        `clearance-${record.reference}.pdf`
      )
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
    }
  }

  if (read.loading && !record) {
    return (
      <div className="stack stack-md">
        <Card loading title="Clearance record">
          <span className="subtle">Loading this learner’s clearance…</span>
        </Card>
      </div>
    )
  }

  if (read.error) {
    return (
      <div className="stack stack-md">
        <ErrorMessage error={read.error} title="Could not open this clearance" onRetry={read.reload} />
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/clearance/learners')}>
          <Icon name="arrowLeft" size={14} />
          Back to the learner list
        </Button>
      </div>
    )
  }

  const blockers = record?.blockers || []

  return (
    <div className="stack stack-md">
      <PageHeader
        title={record?.learner || 'Clearance record'}
        subtitle={
          <>
            {[record?.lrn, record?.grade_level, record?.section_name].filter(Boolean).join(' · ')}
            {' — '}
            <Link to={`/admin/clearance/learners?period=${record?.period}`}>{record?.period_name}</Link>
          </>
        }
        actions={
          <>
            <StatusBadge label={status.label} tone={status.tone} />
            {record?.has_certificate && (
              <Button variant="secondary" size="sm" onClick={downloadCertificate}>
                <Icon name="download" size={14} />
                Certificate
              </Button>
            )}
            {canFinalize && record?.overall_status === 'cleared' && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => setWithdraw({ reason: '' })}
              >
                Withdraw
              </Button>
            )}
          </>
        }
      />

      {alert && (
        <div
          className={`alert ${alert.kind === 'error' ? 'alert-error' : 'alert-success'}`}
          role="alert"
        >
          <Icon name={alert.kind === 'error' ? 'info' : 'checkCircle'} size={17} />
          <span className="grow">{alert.text}</span>
          <Button variant="secondary" size="sm" onClick={() => setAlert(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="clr-setup">
        <div className="stack stack-md">
          <Card title="Final approval">
            <ul className={`clr-blockers${blockers.length ? '' : ' is-clear'}`}>
              {blockers.length === 0 ? (
                <li>
                  <Icon name="checkCircle" size={16} />
                  <span>
                    Every department has signed off and nothing is outstanding. This record is
                    ready for the Registrar.
                  </span>
                </li>
              ) : (
                blockers.map((blocker) => (
                  <li key={blocker}>
                    <Icon name="alertTriangle" size={16} />
                    <span>{blocker}</span>
                  </li>
                ))
              )}
            </ul>

            {canFinalize ? (
              record?.overall_status === 'cleared' ? (
                <div className="stack stack-xs">
                  <p className="subtle">
                    Cleared {formatDateTime(record.cleared_at)} by {record.cleared_by_name}.
                    {record.final_note ? ` “${record.final_note}”` : ''}
                  </p>
                  {record.reference && (
                    <p className="subtle">
                      Reference {record.reference}. Withdrawing keeps the decision history and
                      notifies the learner.
                    </p>
                  )}
                </div>
              ) : (
                <div className="stack stack-xs">
                  <div className="field">
                    <label htmlFor="clr-final-note">Note on the decision</label>
                    <textarea
                      id="clr-final-note"
                      className="textarea"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional. The learner and their guardian see this."
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || !record?.can_finalize}
                    title={
                      record?.can_finalize
                        ? undefined
                        : 'The server still sees something outstanding on this record.'
                    }
                    onClick={() => setConfirmClear(true)}
                  >
                    <Icon name="check" size={14} />
                    Mark as cleared
                  </Button>
                </div>
              )
            ) : (
              <p className="subtle mt-xs">
                You may read this record, but only an office holding the
                clearance.finalize permission gives the final clearance.
              </p>
            )}
          </Card>

          <Card
            title="Departments"
            action={
              <span className="subtle">
                {record?.settled ? 'All required offices settled' : 'Not all offices settled'}
              </span>
            }
            flush={(record?.departments || []).length > 0}
          >
            {(record?.departments || []).length === 0 ? (
              <EmptyState
                icon="building"
                title="No department queues"
                message="This period has no department taking part, so no learner can be cleared by it. Add the offices in the period's configuration."
              />
            ) : (
              <div className="table-wrap">
                <table className="table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Department</th>
                      <th scope="col">Status</th>
                      <th scope="col">Decision</th>
                      <th scope="col">Obligations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.departments.map((item) => {
                      const itemStatus = departmentStatus(item.status)
                      return (
                        <tr key={item.id}>
                          <td data-label="Department" className="cell-main">
                            {item.department_name}
                            <span className="subtle block">
                              {item.decided_by_name
                                ? `${item.decided_by_name} · ${formatDate(item.decided_at)}`
                                : item.deadline
                                  ? `Deadline ${formatDate(item.deadline)}`
                                  : 'No decision recorded'}
                            </span>
                          </td>
                          <td data-label="Status">
                            <StatusBadge label={itemStatus.label} tone={itemStatus.tone} />
                            {item.awaiting_document && (
                              <span className="subtle block">A filing awaits review</span>
                            )}
                          </td>
                          <td data-label="Decision">
                            {item.decision_note || <span className="subtle">—</span>}
                          </td>
                          <td data-label="Obligations">
                            {item.outstanding_obligations || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Obligations"
            action={
              <span className="subtle">
                {(record?.obligations || []).length} recorded
              </span>
            }
            flush={(record?.obligations || []).length > 0}
          >
            {(record?.obligations || []).length === 0 ? (
              <p className="subtle">
                Nothing has been raised against this learner. Obligations are recorded one
                learner at a time by the office that holds the debt — never in bulk, and never
                because of what a learner is assumed to owe.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Raised by</th>
                      <th scope="col">What</th>
                      <th scope="col">Status</th>
                      <th scope="col">Settled by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.obligations.map((obligation) => {
                      const obligationMeta = obligationStatus(obligation.status)
                      return (
                        <tr key={obligation.id}>
                          <td data-label="Raised by">
                            {obligation.department}
                            <span className="subtle block">
                              {obligation.created_by_name} · {formatDate(obligation.created_at)}
                            </span>
                          </td>
                          <td data-label="What" className="cell-main">
                            {obligation.title}
                            {obligation.amount && (
                              <span className="subtle block">₱{obligation.amount}</span>
                            )}
                            <span className="subtle block">{obligation.detail}</span>
                          </td>
                          <td data-label="Status">
                            <StatusBadge
                              label={obligationMeta.label}
                              tone={obligationMeta.tone}
                            />
                            {obligation.is_blocking && obligation.status === 'open' && (
                              <span className="subtle block">Blocks this sign-off</span>
                            )}
                          </td>
                          <td data-label="Settled by">
                            {obligation.status === 'waived' ? (
                              <>
                                {obligation.waived_by_name}
                                <span className="subtle block">{obligation.waiver_reason}</span>
                              </>
                            ) : obligation.status === 'resolved' ? (
                              <>
                                {obligation.resolved_by_name}
                                <span className="subtle block">{obligation.resolution_note}</span>
                              </>
                            ) : (
                              <span className="subtle">Outstanding</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack stack-md">
          <Card title="Progress">
            <div className="progress-row">
              <div className="pr-top">
                <span className="pr-label">{status.label}</span>
                <span className="pr-value">{record?.progress}%</span>
              </div>
              <div
                className="progress-track"
                role="img"
                aria-label={`${record?.progress} percent complete`}
              >
                <div
                  className={`progress-fill ${status.tone}`}
                  style={{ width: `${record?.progress || 0}%` }}
                />
              </div>
            </div>
            <dl className="stack stack-xs mt-xs">
              <div className="row row-between">
                <dt className="subtle">Period</dt>
                <dd>{record?.period_name}</dd>
              </div>
              <div className="row row-between">
                <dt className="subtle">Reference</dt>
                <dd>{record?.reference || <span className="subtle">Not issued</span>}</dd>
              </div>
              <div className="row row-between">
                <dt className="subtle">Cleared</dt>
                <dd>{record?.cleared_at ? formatDateTime(record.cleared_at) : '—'}</dd>
              </div>
              <div className="row row-between">
                <dt className="subtle">Last change</dt>
                <dd>{formatDateTime(record?.updated_at)}</dd>
              </div>
            </dl>
            <p className="subtle mt-xs">
              The officer-side work happens in the{' '}
              <Link to="/admin/clearance/queue">verification queue</Link>; each department sees
              only its own learners.
            </p>
          </Card>

          <Card
            title="Decision history"
            empty={(record?.events || []).length === 0 ? (
              <EmptyState
                icon="clock"
                title="Nothing recorded yet"
                message="Every status change, filing and decision is written here as it happens."
              />
            ) : null}
          >
            <ul className="stack stack-xs">
              {(record?.events || []).slice(0, 40).map((event) => {
                const line = eventLine(event)
                return (
                  <li key={event.id} className="stack stack-xs">
                    <div className="row row-between">
                      <strong>{line.moved}</strong>
                      <span className="subtle">{formatDateTime(event.created_at)}</span>
                    </div>
                    <span className="subtle">
                      {line.who}
                      {event.department ? ` · department item ${event.department_clearance}` : ''}
                    </span>
                    {line.note && <span>{line.note}</span>}
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(withdraw)}
        title="Withdraw this clearance?"
        onClose={() => !busy && setWithdraw(null)}
        dismissible={!busy}
        width={520}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setWithdraw(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmWithdraw}
              disabled={busy || !withdraw?.reason?.trim()}
              loading={busy}
            >
              Withdraw clearance
            </Button>
          </>
        }
      >
        <div className="stack stack-md">
          <p>
            The learner stops being cleared and the record returns to the departments' queues.
            Your reason, your name and the date are written into the history and sent to the
            learner.
          </p>
          <div className="field">
            <label htmlFor="clr-withdraw-reason">Why is this clearance withdrawn?</label>
            <textarea
              id="clr-withdraw-reason"
              className="textarea"
              rows={3}
              value={withdraw?.reason || ''}
              onChange={(e) => setWithdraw((prev) => ({ ...prev, reason: e.target.value }))}
              required
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClear}
        title="Give final clearance"
        tone="primary"
        confirmLabel="Clear this learner"
        cancelLabel="Not yet"
        message={`Sign ${record?.learner} off for ${record?.period_name}?`}
        detail="A unique reference is issued, the certificate becomes downloadable, and the learner and their guardian are notified. Withdrawing it later stays on the record."
        onConfirm={() => {
          setConfirmClear(false)
          signOff()
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
