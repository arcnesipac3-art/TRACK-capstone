import { useState } from 'react'
import Icon from '../Icon'
import Button from '../Button'
import ErrorMessage from '../ErrorMessage'
import ListSkeleton from '../loading/ListSkeleton'
import StatusBadge from '../StatusBadge'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'
import { formatDateTime } from '../../utils/format'
import './YourDataSection.css'

/**
 * The two rights in section 9 of the Privacy Notice that a person can use
 * without talking to an office first: take a copy of what TRACK holds about
 * them, and file a correction / objection / erasure ask.
 *
 * The second one files the ask and shows the written answer — it never
 * deletes anything, because whether a school record may be removed is the
 * school's decision, and the software pretending otherwise would be the
 * dark pattern this whole pass set out to remove.
 */

const KINDS = [
  { value: 'correction', label: 'Correct and update my record' },
  { value: 'objection', label: 'Object to how my data is used' },
  { value: 'erasure', label: 'Delete my record' },
]

// Mirrors DETAIL_MIN_LENGTH in core/privacy_views.py: catching a one-word ask
// here saves the person a round-trip, not the server its check.
const DETAIL_MIN_LENGTH = 15

const STATUS_TONE = { pending: 'amber', answered: 'green', refused: 'red' }

export default function YourDataSection({ username }) {
  const { data, loading, error, reload } = useFetch('/account/data-requests/', {
    list: true,
  })
  const [kind, setKind] = useState('correction')
  const [detail, setDetail] = useState('')
  const [formError, setFormError] = useState(null)
  const [filed, setFiled] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleDownload() {
    setBusy(true)
    setFormError(null)
    try {
      const payload = await api.get('/account/export/')
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `track-my-data-${username || 'account'}-${
        (payload.generated_at || '').slice(0, 10)
      }.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    setFiled(null)
    if (detail.trim().length < DETAIL_MIN_LENGTH) {
      setFormError(
        'Say what you are asking for in at least 15 characters, so the office can act on it.'
      )
      return
    }
    setBusy(true)
    try {
      const row = await api.post('/account/data-requests/', {
        kind,
        detail: detail.trim(),
      })
      setFiled(row)
      setDetail('')
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const requests = data || []

  return (
    <div className="stack stack-sm your-data">
      <p className="subtle">
        TRACK holds the records the school created about you: your account,
        your enrollment file, your classes and attendance, your messages, and
        the log of the changes you made. Two of your rights are used from this
        page.
      </p>

      <div className="your-data-row">
        <div className="your-data-cell">
          <h3>Take a copy of my record</h3>
          <p className="subtle">
            One JSON file with every row TRACK holds about you, saved to this
            device and nowhere else. Keep it, read it, or hand it to another
            school.
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            loadingLabel="Preparing…"
            onClick={handleDownload}
          >
            <Icon name="download" size={15} /> Download my data
          </Button>
        </div>

        <div className="your-data-cell">
          <h3>Ask the school to change or remove it</h3>
          <p className="subtle">
            The enrollment office answers in writing, and the answer appears
            below and in your notifications. Records the school is required by
            law to keep are not deleted — and the answer names them and says
            why, rather than going quiet.
          </p>
        </div>
      </div>

      {formError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span>{formError}</span>
        </div>
      )}

      <div className="your-data-requests">
        <h3>My requests</h3>
        {loading ? (
          <ListSkeleton items={2} lines={2} label="Loading your requests" />
        ) : error ? (
          <ErrorMessage error={error} onRetry={reload} compact />
        ) : requests.length === 0 ? (
          <p className="subtle">You have not asked the school for anything yet.</p>
        ) : (
          <ul className="your-data-list">
            {requests.map((row) => (
              <li key={row.id}>
                <div className="your-data-item-head">
                  <strong>{row.kind_display}</strong>
                  <StatusBadge
                    label={row.status_display}
                    tone={STATUS_TONE[row.status] || 'neutral'}
                  />
                  <span className="subtle">{formatDateTime(row.created_at)}</span>
                </div>
                <p>{row.detail}</p>
                {row.response_note ? (
                  <p className="your-data-answer">
                    <strong>
                      The school&rsquo;s answer
                      {row.handled_at ? ` · ${formatDateTime(row.handled_at)}` : ''}:
                    </strong>{' '}
                    {row.response_note}
                  </p>
                ) : (
                  <p className="subtle">Waiting for the enrollment office.</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="stack stack-sm your-data-form" onSubmit={handleSubmit} noValidate>
          <h3>New request</h3>
          {filed && (
            <div className="alert alert-info" role="status">
              <Icon name="check" size={16} />
              <span>
                Filed as request #{filed.id}. The office will answer in writing.
              </span>
            </div>
          )}
          <div className="field">
            <label htmlFor="data-request-kind">What are you asking for?</label>
            <select
              id="data-request-kind"
              className="select"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              disabled={busy}
            >
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="data-request-detail">Describe it</label>
            <textarea
              id="data-request-detail"
              className="textarea"
              rows={3}
              value={detail}
              placeholder="Which record is wrong, what should change, or what you are objecting to."
              onChange={(event) => setDetail(event.target.value)}
              disabled={busy}
              aria-invalid={formError ? 'true' : undefined}
            />
          </div>
          <div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={busy}
              loadingLabel="Filing…"
            >
              Send the request
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
