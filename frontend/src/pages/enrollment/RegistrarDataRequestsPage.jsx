import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import { formatDateTime } from '../../utils/format'
import Button from '../../components/Button'
import './RegistrarEnrollment.css'

const STATUS_TONE = { pending: 'amber', answered: 'green', refused: 'red' }

/** The office's two possible replies. "Pending" is not one of them. */
const OUTCOMES = [
  { value: 'answered', label: 'Answered — something was done' },
  { value: 'refused', label: 'Refused — with the legal reason' },
]

const VIEWS = [
  { id: 'open', label: 'Open', match: (row) => row.status === 'pending' },
  {
    id: 'closed',
    label: 'Answered',
    match: (row) => row.status !== 'pending',
  },
  { id: 'all', label: 'All requests', match: () => true },
]

/**
 * The enrollment office's data-request queue.
 *
 * Section 9 of the Privacy Notice promises that a correction, an objection or
 * a deletion ask gets a written answer. This is where that answer is written:
 * the request arrives from the learner's or guardian's own profile, the office
 * records what it did or why it cannot, and the same screen shows the reply
 * back to the requester.
 *
 * Nothing here acts on a record. The queue is the promise that an ask is
 * seen and answered by a person with the authority to change a school record —
 * which is exactly why the software does not do it silently.
 */
export default function RegistrarDataRequestsPage() {
  const { can } = useAuth()
  const canManage = can('enrollment.manage')
  const queue = useFetch('/account/data-requests/queue/', { list: true })
  const [view, setView] = useState('open')
  const [answering, setAnswering] = useState(null)

  const rows = queue.data || []
  const denied = queue.error?.status === 403
  const open = rows.filter((row) => row.status === 'pending').length
  const visible = rows.filter(VIEWS.find((v) => v.id === view).match)

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Data requests"
        subtitle="Correction, objection and deletion asks filed from a learner’s or guardian’s own profile, and the office’s written answer to each."
        actions={
          <Button variant="secondary" size="sm" onClick={queue.reload} disabled={queue.loading}>
            <Icon name="refresh" size={14} />
            Refresh
          </Button>
        }
      >
        {rows.length > 0 && (
          <div className="row row-wrap gap-xs">
            <StatusBadge tone={open ? 'amber' : 'green'} label={`${open} open`} />
            <StatusBadge tone="neutral" label={`${rows.length} total`} />
          </div>
        )}
      </PageHeader>

      {queue.error && !denied && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">{queue.error.message}</span>
          <Button variant="secondary" size="sm" onClick={queue.reload}>
            Try again
          </Button>
        </div>
      )}

      <section className="card">
        {queue.loading && !queue.data ? (
          <TableSkeleton
            headers={['Requester', 'What they asked for', 'Filed', 'Status', 'Answer']}
            rows={5}
            label="Loading data requests…"
          />
        ) : denied ? (
          <div className="card-body">
            <EmptyState
              as="h2"
              icon="shield"
              title="You don’t have permission"
              message="This queue belongs to the enrollment office. Ask an administrator to grant your account the enrollment.view permission."
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-body">
            <EmptyState
              as="h2"
              icon="inbox"
              title="No requests waiting"
              message="Learners and guardians file these from their own profile, under My data. An empty queue is the normal state."
            />
          </div>
        ) : (
          <>
            <div className="card-header">
              <div className="enr-pills" role="group" aria-label="Request views">
                {VIEWS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={view === tab.id}
                    className={`enr-pill${view === tab.id ? ' active' : ''}`}
                    onClick={() => setView(tab.id)}
                  >
                    {tab.label}
                    {tab.id === 'open' && open > 0 ? ` (${open})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="card-body">
                <p className="subtle">Nothing in this view.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Requester</th>
                      <th scope="col">What they asked for</th>
                      <th scope="col">Filed</th>
                      <th scope="col">Status</th>
                      <th scope="col">Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Requester" className="cell-main">
                          {row.requester_name || (
                            <span className="subtle">Account closed</span>
                          )}
                          <span className="subtle block">
                            {row.requester_username || '—'}
                          </span>
                          {row.requester_email && (
                            <span className="subtle block">{row.requester_email}</span>
                          )}
                        </td>
                        <td data-label="What they asked for">
                          <strong>{row.kind_display}</strong>
                          <span className="subtle block">{row.detail}</span>
                        </td>
                        <td data-label="Filed">{formatDateTime(row.created_at)}</td>
                        <td data-label="Status">
                          <StatusBadge
                            label={row.status_display}
                            tone={STATUS_TONE[row.status] || 'neutral'}
                          />
                        </td>
                        <td data-label="Answer">
                          {row.response_note ? (
                            <div className="stack stack-xs">
                              {/* The office reads its own answer here, so it
                                  never has to reopen the dialog to remember
                                  what it told this person. */}
                              <span className="enr-answer-shown">{row.response_note}</span>
                              <span className="subtle">
                                {row.handled_at ? formatDateTime(row.handled_at) : ''}
                              </span>
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setAnswering(row)}
                                >
                                  Amend
                                </Button>
                              )}
                            </div>
                          ) : canManage ? (
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => setAnswering(row)}
                            >
                              Write the answer
                            </Button>
                          ) : (
                            <span className="subtle">Not answerable here</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {answering && (
        <AnswerModal
          key={answering.id}
          row={answering}
          onClose={() => setAnswering(null)}
          onSaved={() => {
            setAnswering(null)
            queue.reload()
          }}
        />
      )}
    </div>
  )
}

/**
 * The written answer. The note has a minimum length because the Privacy
 * Notice promises the requester a reason, not a status flip — and the server
 * enforces the same floor.
 */
function AnswerModal({ row, onClose, onSaved }) {
  const [status, setStatus] = useState(row.status === 'pending' ? 'answered' : row.status)
  const [note, setNote] = useState(row.response_note || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (note.trim().length < 15) {
      setError(
        'Write the answer the requester will read — at least 15 characters, including which records the school must keep and why.'
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post(`/account/data-requests/${row.id}/answer/`, {
        status,
        response_note: note.trim(),
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`${row.kind_display} — write the answer`}
      onClose={onClose}
      dismissible={!busy}
      width={620}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={busy} loadingLabel="Saving…" onClick={save}>
            Save the answer
          </Button>
        </>
      }
    >
      <div className="stack stack-sm">
        <div className="enr-answer-context">
          <strong>{row.requester_name || 'Account closed'}</strong>
          {row.requester_email ? ` · ${row.requester_email}` : ''}
          <p>{row.detail}</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="dr-outcome">Outcome</label>
          <select
            id="dr-outcome"
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={busy}
          >
            {OUTCOMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="dr-note">The answer the requester reads</label>
          <textarea
            id="dr-note"
            className="textarea"
            rows={5}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
            aria-invalid={error ? 'true' : undefined}
            placeholder="What was done, or what cannot be done and why — the notice the requester agreed to is the source of that rule."
          />
          <span className="subtle">
            This text is what appears on the requester’s profile and in their
            notifications.
          </span>
        </div>
      </div>
    </Modal>
  )
}
