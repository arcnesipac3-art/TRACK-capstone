import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import { ButtonLoader, PageLoader } from '../../components/loading'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import api, { API_BASE, authHeader } from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  ENROLLMENT_TYPES,
  applicationStatus,
  documentStatus,
  downloadAuthorizedFile,
} from '../../utils/enrollment'
import { formatDate, formatDateTime } from '../../utils/format'
import './EnrollmentPages.css'

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx'

/** Applicant-facing configuration for each workflow action. `endpoint` maps
 *  the target-status key from available_actions onto the real URL segment. */
const ACTION_CONFIG = {
  submitted: {
    label: 'Submit application',
    title: 'Submit application?',
    body: 'Submit now? You can no longer edit the application until the Registrar reviews it.',
    confirmLabel: 'Submit now',
    endpoint: 'submit',
    buttonMod: 'btn-primary',
  },
  resubmitted: {
    label: 'Resubmit corrections',
    title: 'Resubmit corrections?',
    body: 'Submit now? You can no longer edit the application until the Registrar reviews it.',
    confirmLabel: 'Resubmit now',
    endpoint: 'resubmit',
    buttonMod: 'btn-primary',
  },
  withdrawn: {
    label: 'Withdraw application',
    title: 'Withdraw application?',
    body: 'Withdrawing takes this application out of the Registrar review queue. This cannot be undone.',
    confirmLabel: 'Withdraw',
    endpoint: 'withdraw',
    buttonMod: 'btn-danger',
  },
}

function humanize(value) {
  return String(value || '').replace(/_/g, ' ')
}

/**
 * Inline "create your account" panel shown on an enrolled application whose
 * one-time claim credential is still unconsumed. Exchanges it for a real
 * DRF token (stored exactly like a login), refreshes the session and drops
 * the applicant into the student enrollment portal.
 */
function ClaimAccountPanel({ claimToken }) {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const errors = {}
    if (!username.trim()) errors.username = 'Choose a username.'
    if (!password) errors.password = 'Choose a password.'
    else if (confirmPassword !== password) {
      errors.confirmPassword = 'The two passwords do not match.'
    }
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    try {
      await api.claimAccount({
        claim_token: claimToken,
        username: username.trim(),
        password,
      })
      await refreshUser()
      navigate('/student/enrollment')
    } catch (err) {
      // DRF may return per-field errors ({username: [...]} / {password: [...]}).
      const mapped = {}
      if (err && err.details && typeof err.details === 'object') {
        if (err.details.username) {
          mapped.username = Array.isArray(err.details.username)
            ? err.details.username.join(' ')
            : String(err.details.username)
        }
        if (err.details.password) {
          mapped.password = Array.isArray(err.details.password)
            ? err.details.password.join(' ')
            : String(err.details.password)
        }
      }
      setFieldErrors(mapped)
      setFormError(Object.keys(mapped).length > 0 ? null : err.message)
    } finally {
      setBusy(false)
    }
  }

  function fieldError(name) {
    return fieldErrors[name] ? (
      <span className="field-error" id={`claim-${name}-err`}>
        <Icon name="info" size={13} />
        {fieldErrors[name]}
      </span>
    ) : null
  }

  return (
    <section className="card card-pad stack stack-sm" aria-labelledby="claim-heading">
      <h2 id="claim-heading" style={{ fontSize: '1rem', margin: 0 }}>
        Create your account
      </h2>
      <p className="subtle" style={{ margin: 0 }}>
        Your enrollment is confirmed. Set up the TRACK account you will use from
        now on — it replaces the reference number you used to track this
        application.
      </p>

      {formError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{formError}</span>
        </div>
      )}

      <form className="stack stack-sm" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="claim-username">Username</label>
          <input
            id="claim-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            autoComplete="username"
            aria-invalid={fieldErrors.username ? 'true' : undefined}
            aria-describedby={fieldErrors.username ? 'claim-username-err' : undefined}
          />
          {fieldError('username')}
        </div>

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="claim-password">Password</label>
            <input
              id="claim-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'claim-password-err' : undefined}
            />
            {fieldError('password')}
          </div>
          <div className="field grow">
            <label htmlFor="claim-confirm-password">Confirm password</label>
            <input
              id="claim-confirm-password"
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
              aria-describedby={
                fieldErrors.confirmPassword ? 'claim-confirm-password-err' : undefined
              }
            />
            {fieldError('confirmPassword')}
          </div>
        </div>

        <div className="row row-end row-wrap">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <ButtonLoader />}
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </div>
      </form>
    </section>
  )
}

/**
 * Upload one requirement file. The shared api client always sends JSON, so
 * the multipart body goes through fetch directly with the shared auth header
 * (Token for signed-in users, Guest for account-less applicants).
 */
async function uploadDocumentFile(applicationId, docId, file) {
  const headers = authHeader()
  const formData = new FormData()
  formData.append('file', file)

  let response
  try {
    response = await fetch(
      `${API_BASE}/enrollment/applications/my/${applicationId}/documents/${docId}/upload/`,
      {
        method: 'POST',
        headers: Object.keys(headers).length ? headers : undefined,
        body: formData,
      }
    )
  } catch {
    throw new Error('Cannot reach the TRACK server. Check that Django is running.')
  }

  if (!response.ok) {
    let payload = null
    const text = await response.text()
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
    let message = `Upload failed (${response.status}).`
    if (typeof payload === 'string' && payload) message = payload
    else if (payload && payload.detail) message = payload.detail
    throw new Error(message)
  }
  return null
}

/** Single enrollment application: summary, timeline, documents, actions. */
export default function ApplicationDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const justSubmitted = searchParams.get('submitted') === '1'

  const { data: app, loading, error, reload } = useFetch(
    `/enrollment/applications/my/${id}/`
  )

  const [pendingAction, setPendingAction] = useState(null)
  const [busyAction, setBusyAction] = useState(null)
  const [actionError, setActionError] = useState(null)
  const busyRef = useRef(false)

  const [uploads, setUploads] = useState({})
  const [downloadError, setDownloadError] = useState(null)

  async function confirmAction() {
    if (busyRef.current || !pendingAction) return
    busyRef.current = true
    setBusyAction(pendingAction)
    setActionError(null)
    try {
      await api.post(
        `/enrollment/applications/my/${id}/${ACTION_CONFIG[pendingAction].endpoint}/`
      )
      setPendingAction(null)
      reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  async function handleUpload(docId, file) {
    if (!file || uploads[docId]?.busy) return
    setUploads((prev) => ({ ...prev, [docId]: { busy: true, error: null } }))
    try {
      await uploadDocumentFile(Number(id), docId, file)
      reload()
      setUploads((prev) => ({ ...prev, [docId]: { busy: false, error: null } }))
    } catch (err) {
      setUploads((prev) => ({
        ...prev,
        [docId]: { busy: false, error: err.message },
      }))
    }
  }

  async function handleDownload(doc) {
    setDownloadError(null)
    try {
      await downloadAuthorizedFile(
        API_BASE,
        `enrollment/applications/${id}/documents/${doc.id}/download/`,
        doc.original_filename
      )
    } catch (err) {
      setDownloadError(err.message)
    }
  }

  if (loading && !app) {
    return <PageLoader label="Loading your application…" minHeight={280} />
  }

  if (error && !app) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Enrollment application" />
        <ErrorMessage
          error={error}
          title="Could not load this application"
          onRetry={reload}
        />
        <div>
          <Link className="btn btn-secondary btn-sm" to="..">
            Back to enrollment
          </Link>
        </div>
      </div>
    )
  }

  if (!app) return null

  const status = applicationStatus(app.status)
  const missing = app.missing_documents || []
  const available = app.available_actions || []
  const editableDocs = app.status === 'draft' || app.status === 'incomplete'
  const events = app.events || []
  const documents = app.documents || []

  return (
    <div className="stack stack-md">
      <PageHeader
        title={`Application ${app.reference}`}
        subtitle={`${app.grade_level_name} — ${app.school_year_label}${
          app.assigned_section_name ? ` · Section ${app.assigned_section_name}` : ''
        }`}
        actions={
          <StatusBadge label={status.label} tone={status.tone} />
        }
      />

      {justSubmitted && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={16} />
          <span>
            Application {app.reference} was submitted. The Registrar will review it —
            you will see any requested corrections here.
          </span>
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{actionError}</span>
        </div>
      )}

      {downloadError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{downloadError}</span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="alert alert-info" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">
            Missing required documents: {missing.join(', ')}. Upload them below before
            submitting.
          </span>
        </div>
      )}

      {available.length > 0 && (
        <section className="card card-pad">
          <div className="row row-wrap" style={{ gap: 10, alignItems: 'center' }}>
            <span className="grow subtle">
              {busyAction
                ? 'Working…'
                : 'You still have actions available on this application.'}
            </span>
            {available.includes('submitted') && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPendingAction('submitted')}
                disabled={Boolean(busyAction)}
              >
                Submit application
              </button>
            )}
            {available.includes('resubmitted') && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPendingAction('resubmitted')}
                disabled={Boolean(busyAction)}
              >
                Resubmit corrections
              </button>
            )}
            {available.includes('withdrawn') && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setPendingAction('withdrawn')}
                disabled={Boolean(busyAction)}
              >
                Withdraw application
              </button>
            )}
          </div>
        </section>
      )}

      {/* Account-less applicants: claim the account minted at confirmation,
          or point sign-in seekers at the login page. */}
      {app.account_claim_available && <ClaimAccountPanel claimToken={app.claim_token} />}
      {app.status === 'enrolled' && !app.account_claim_available && !user && (
        <div className="alert alert-info" role="status">
          <Icon name="info" size={16} />
          <span className="grow">
            An account already exists for this student —{' '}
            <Link to="/login">sign in</Link> with your existing credentials instead.
          </span>
        </div>
      )}

      <div className="enr-grid-2">
        <section className="card">
          <header className="card-header">
            <h2>Applicant</h2>
          </header>
          <div className="card-body">
            <dl className="enr-dl">
              <div>
                <dt>Full name</dt>
                <dd>
                  {[app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ') || '—'}
                </dd>
              </div>
              <div>
                <dt>LRN</dt>
                <dd>{app.lrn || '—'}</dd>
              </div>
              <div>
                <dt>Date of birth</dt>
                <dd>{app.date_of_birth ? formatDate(app.date_of_birth) : '—'}</dd>
              </div>
              <div>
                <dt>Sex</dt>
                <dd>
                  {app.sex ? app.sex.charAt(0).toUpperCase() + app.sex.slice(1) : '—'}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{app.address || '—'}</dd>
              </div>
              <div>
                <dt>Contact number</dt>
                <dd>{app.contact_number || '—'}</dd>
              </div>
              <div>
                <dt>Enrollment type</dt>
                <dd>{ENROLLMENT_TYPES[app.enrollment_type] || app.enrollment_type}</dd>
              </div>
              <div>
                <dt>Enrollment period</dt>
                <dd>{app.period_label || '—'}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>Parent / guardian</h2>
          </header>
          <div className="card-body">
            <dl className="enr-dl">
              <div>
                <dt>Full name</dt>
                <dd>{app.guardian_name || '—'}</dd>
              </div>
              <div>
                <dt>Relationship</dt>
                <dd>{app.guardian_relationship || '—'}</dd>
              </div>
              <div>
                <dt>Contact number</dt>
                <dd>{app.guardian_contact || '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{app.guardian_email || '—'}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <section className="card">
        <header className="card-header">
          <h2>Documents</h2>
        </header>
        <div className="card-body stack stack-sm">
          {documents.length === 0 && (
            <p className="subtle">No document requirements for this period.</p>
          )}
          {documents.map((doc) => {
            const badge = documentStatus(doc.status)
            const upload = uploads[doc.id] || {}
            return (
              <div className="enr-doc" key={doc.id}>
                <div className="enr-doc-main">
                  <span className="enr-doc-name">{doc.name}</span>
                  <div className="row row-wrap" style={{ gap: 6 }}>
                    <StatusBadge
                      label={doc.is_required ? 'Required' : 'Optional'}
                      tone={doc.is_required ? 'blue' : 'neutral'}
                    />
                    <StatusBadge label={badge.label} tone={badge.tone} />
                    {doc.original_filename && (
                      <span className="subtle">{doc.original_filename}</span>
                    )}
                  </div>
                  {doc.review_note && (
                    <span className="subtle">Reviewer note: {doc.review_note}</span>
                  )}
                  {upload.error && (
                    <span className="enr-doc-error" role="alert">
                      {upload.error}
                    </span>
                  )}
                </div>
                <div className="row row-wrap" style={{ gap: 8 }}>
                  {doc.original_filename && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDownload(doc)}
                    >
                      <Icon name="download" size={14} /> Download
                    </button>
                  )}
                  {editableDocs && (
                    <input
                      type="file"
                      accept={FILE_ACCEPT}
                      aria-label={`Upload ${doc.name}`}
                      disabled={upload.busy}
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0]
                        if (file) handleUpload(doc.id, file)
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Progress</h2>
        </header>
        <div className="card-body">
          {events.length === 0 ? (
            <p className="subtle">No activity recorded yet.</p>
          ) : (
            <ol className="enr-timeline">
              {events.map((event) => {
                const from = event.from_status
                  ? applicationStatus(event.from_status)
                  : null
                const to = event.to_status ? applicationStatus(event.to_status) : null
                return (
                  <li className="enr-timeline-item" key={event.id}>
                    <div className="row row-wrap" style={{ gap: 8, alignItems: 'center' }}>
                      <strong style={{ textTransform: 'capitalize' }}>
                        {humanize(event.action)}
                      </strong>
                      {from && (
                        <>
                          <StatusBadge label={from.label} tone={from.tone} />
                          <Icon name="chevronRight" size={13} />
                        </>
                      )}
                      {to && <StatusBadge label={to.label} tone={to.tone} />}
                    </div>
                    {event.note && <p style={{ margin: '4px 0 0' }}>{event.note}</p>}
                    <span className="enr-timeline-meta">
                      {formatDateTime(event.created_at)}
                      {event.actor_name ? ` · ${event.actor_name}` : ''}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>

      <dl className="enr-dl" style={{ padding: '0 4px' }}>
        <div>
          <dt>Submitted</dt>
          <dd>{app.submitted_at ? formatDateTime(app.submitted_at) : '—'}</dd>
        </div>
        <div>
          <dt>Last reviewed</dt>
          <dd>{app.reviewed_at ? formatDateTime(app.reviewed_at) : '—'}</dd>
        </div>
        {app.decision_reason && (
          <div>
            <dt>Decision note</dt>
            <dd>{app.decision_reason}</dd>
          </div>
        )}
      </dl>

      <div>
        <Link className="btn btn-secondary btn-sm" to="..">
          Back to enrollment
        </Link>
      </div>

      <Modal
        open={Boolean(pendingAction)}
        title={pendingAction ? ACTION_CONFIG[pendingAction].title : ''}
        onClose={() => !busyAction && setPendingAction(null)}
        dismissible={!busyAction}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPendingAction(null)}
              disabled={Boolean(busyAction)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
                pendingAction ? ACTION_CONFIG[pendingAction].buttonMod : 'btn-primary'
              }`}
              onClick={confirmAction}
              disabled={Boolean(busyAction)}
            >
              {busyAction && <ButtonLoader />}
              {busyAction
                ? 'Working…'
                : pendingAction
                  ? ACTION_CONFIG[pendingAction].confirmLabel
                  : ''}
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {pendingAction ? ACTION_CONFIG[pendingAction].body : ''}
        </p>
      </Modal>
    </div>
  )
}
