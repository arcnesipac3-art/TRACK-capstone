import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import ButtonLoader from '../../components/loading/ButtonLoader'
import CardSkeleton from '../../components/loading/CardSkeleton'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { API_BASE } from '../../services/api'
import {
  ENROLLMENT_TYPES,
  applicationStatus,
  documentStatus,
  downloadAuthorizedFile,
} from '../../utils/enrollment'
import { formatDate, formatDateTime, formatNumber } from '../../utils/format'
import './RegistrarEnrollment.css'

/**
 * `available_actions` carries target statuses from the state machine (the
 * staff side of core/enrollment.py). This maps each one onto the action name
 * the /action/ endpoint accepts; plain action names pass through untouched,
 * and 'enrolled' is handled by the final-confirmation card instead.
 */
const ACTION_FOR_TARGET = {
  under_review: 'start_review',
  incomplete: 'request_corrections',
  accepted: 'accept',
  rejected: 'reject',
  waitlisted: 'waitlist',
  cancelled: 'cancel',
}

const ACTION_LABELS = {
  start_review: 'Start review',
  request_corrections: 'Request corrections',
  accept: 'Accept application',
  reject: 'Reject application',
  waitlist: 'Waitlist application',
  cancel: 'Cancel application',
}

const DANGER_ACTIONS = new Set(['reject', 'cancel'])

const SUCCESS_MESSAGES = {
  start_review: 'Review started.',
  request_corrections: 'Corrections requested — the applicant has been notified.',
  accept: 'Application accepted.',
  reject: 'Application rejected.',
  waitlist: 'Application waitlisted.',
  cancel: 'Application cancelled.',
}

/** Human-readable history lines for the audit events. */
const EVENT_LABELS = {
  submitted: 'Submitted the application',
  resubmitted: 'Resubmitted the application',
  withdrawn: 'Withdrew the application',
  start_review: 'Started the review',
  request_corrections: 'Requested corrections',
  accept: 'Accepted the application',
  reject: 'Rejected the application',
  waitlist: 'Waitlisted the application',
  cancel: 'Cancelled the application',
  enrolled: 'Confirmed the enrollment',
  student_linked: 'Linked an existing student record',
  document_verify: 'Verified a document',
  document_return: 'Returned a document',
  document_waive: 'Waived a document',
  section_assigned: 'Assigned a section',
}

function eventLabel(action) {
  if (!action) return 'Updated the application'
  if (EVENT_LABELS[action]) return EVENT_LABELS[action]
  return String(action)
    .replace(/[._-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

/** Normalize one `available_actions` entry to an /action/ payload name. */
function staffAction(value) {
  if (ACTION_FOR_TARGET[value]) return ACTION_FOR_TARGET[value]
  if (ACTION_LABELS[value]) return value
  return null
}

function modalTitle(type, ctx) {
  switch (type) {
    case 'accept':
      return 'Accept this application?'
    case 'request_corrections':
      return 'Request corrections'
    case 'reject':
      return 'Reject this application'
    case 'waitlist':
      return 'Waitlist this application'
    case 'cancel':
      return 'Cancel this application'
    case 'returnDoc':
      return `Return “${ctx?.doc?.name || 'document'}”`
    case 'waiveDoc':
      return `Waive “${ctx?.doc?.name || 'document'}”?`
    case 'assign':
      return `Assign to ${ctx?.section?.name || 'this section'}?`
    case 'confirm':
      return 'Confirm enrollment'
    case 'link':
      return 'Link this student record?'
    default:
      return 'Confirm'
  }
}

/**
 * Registrar review workspace for one application: applicant identity,
 * document verification, staff review actions, section assignment, final
 * confirmation and the full history timeline.
 */
export default function RegistrarApplicationReviewPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const canManage = can('enrollment.manage')
  const canConfirm = can('enrollment.confirm')

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState(null)

  const [recs, setRecs] = useState(null)
  const [recsLoading, setRecsLoading] = useState(true)
  const [recsError, setRecsError] = useState(null)

  const [busy, setBusy] = useState(null)
  const [alert, setAlert] = useState(null)
  const [modal, setModal] = useState(null)
  const [notes, setNotes] = useState({ note: '', internal_note: '', reason: '' })
  const [modalErrors, setModalErrors] = useState({})

  const loadDetail = useCallback(async () => {
    if (!id) return
    setDetailLoading(true)
    setDetailError(null)
    try {
      const data = await api.get(`/enrollment/applications/${id}/`)
      setDetail(data)
    } catch (err) {
      if (err.name !== 'AbortError') setDetailError(err)
    } finally {
      setDetailLoading(false)
    }
  }, [id])

  const loadRecs = useCallback(async () => {
    if (!id) return
    setRecsLoading(true)
    setRecsError(null)
    try {
      const data = await api.get(
        `/enrollment/applications/${id}/section-recommendations/`
      )
      setRecs(Array.isArray(data) ? data : data?.recommendations || [])
    } catch (err) {
      if (err.name !== 'AbortError') {
        setRecsError(err)
        setRecs(null)
      }
    } finally {
      setRecsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadDetail()
    loadRecs()
  }, [loadDetail, loadRecs])

  function openModal(config) {
    setNotes({ note: '', internal_note: '', reason: '' })
    setModalErrors({})
    setAlert(null)
    setModal(config)
  }

  function closeModal() {
    if (busy) return
    setModal(null)
    setModalErrors({})
  }

  async function submitModal(event) {
    event.preventDefault()
    if (busy || !modal) return

    const type = modal.type
    if (type === 'request_corrections' && !notes.note.trim()) {
      setModalErrors({
        note: 'Explain the required corrections — the applicant sees this note.',
      })
      return
    }
    if (type === 'returnDoc' && !notes.note.trim()) {
      setModalErrors({
        note: 'Explain what must be corrected — the applicant sees this note.',
      })
      return
    }
    if ((type === 'reject' || type === 'cancel') && !notes.reason.trim()) {
      setModalErrors({ reason: 'A recorded reason is required for this action.' })
      return
    }
    setModalErrors({})
    setBusy('modal')

    try {
      if (ACTION_LABELS[type]) {
        const payload = { action: type }
        if (notes.note.trim()) payload.note = notes.note.trim()
        if (notes.internal_note.trim()) payload.internal_note = notes.internal_note.trim()
        if (notes.reason.trim()) payload.reason = notes.reason.trim()
        await api.post(`/enrollment/applications/${id}/action/`, payload)
        setModal(null)
        setAlert({ kind: 'success', text: SUCCESS_MESSAGES[type] || 'Saved.' })
        await loadDetail()
        return
      }

      if (type === 'returnDoc' || type === 'waiveDoc') {
        const doc = detail?.documents?.find((d) => d.id === modal.docId)
        await api.post(
          `/enrollment/applications/${id}/documents/${modal.docId}/action/`,
          {
            action: type === 'returnDoc' ? 'return' : 'waive',
            note: notes.note.trim(),
          }
        )
        setModal(null)
        setAlert({
          kind: 'success',
          text: `Document updated — ${doc?.name || 'file'}.`,
        })
        await loadDetail()
        return
      }

      if (type === 'assign') {
        try {
          await api.post(`/enrollment/applications/${id}/assign-section/`, {
            section: modal.section.section_id,
          })
          setModal(null)
          setAlert({
            kind: 'success',
            text: `Section assigned — ${modal.section.name}.`,
          })
          await Promise.all([loadDetail(), loadRecs()])
        } catch (err) {
          setModal(null)
          setAlert({ kind: 'error', text: err.message })
          // A 409 means the capacity moved under us — pull fresh numbers.
          loadRecs()
        }
        return
      }

      if (type === 'confirm') {
        const result = await api.post(
          `/enrollment/applications/${id}/confirm/`,
          {}
        )
        const enrollment = result?.enrollment || {}
        const who = enrollment.student_name || detail?.full_name || 'the student'
        const where =
          enrollment.section_display ||
          detail?.assigned_section_name ||
          'the assigned section'
        const year = enrollment.school_year_label || detail?.school_year_label || ''
        setModal(null)
        setAlert({
          kind: 'success',
          text:
            result?.created === false
              ? `Already confirmed — ${who} is enrolled in ${where}${year ? ` (${year})` : ''}.`
              : `Enrollment confirmed for ${who} in ${where}${year ? ` — ${year}` : ''}.`,
        })
        await loadDetail()
        return
      }

      if (type === 'link') {
        await api.post(`/enrollment/applications/${id}/link-student/`, {
          student: modal.match.student_id,
        })
        setModal(null)
        setAlert({
          kind: 'success',
          text: `Student record linked — ${modal.match.name}.`,
        })
        await loadDetail()
      }
    } catch (err) {
      setModal(null)
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  /** Direct "Verify" from a document row (no modal). */
  async function verifyDocument(doc) {
    if (busy) return
    setBusy('verify')
    setAlert(null)
    try {
      await api.post(
        `/enrollment/applications/${id}/documents/${doc.id}/action/`,
        { action: 'verify' }
      )
      setAlert({ kind: 'success', text: `Verified — ${doc.name}.` })
      await loadDetail()
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  async function downloadDocument(doc) {
    if (busy) return
    setBusy(`download-${doc.id}`)
    setAlert(null)
    try {
      await downloadAuthorizedFile(
        API_BASE,
        `enrollment/applications/${id}/documents/${doc.id}/download/`,
        doc.original_filename || doc.name
      )
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  /** start_review fires straight away — no extra confirmation needed. */
  async function submitDirectAction(action) {
    if (busy) return
    setBusy(`action-${action}`)
    setAlert(null)
    try {
      await api.post(`/enrollment/applications/${id}/action/`, { action })
      setAlert({ kind: 'success', text: SUCCESS_MESSAGES[action] || 'Saved.' })
      await loadDetail()
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  if (detailLoading && !detail) {
    return (
      <div className="stack stack-md">
        <CardSkeleton lines={2} label="Loading application…" />
        <div className="review-grid">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    )
  }

  if (detailError?.status === 403) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Application review" />
        <EmptyState
          icon="shield"
          title="You don't have permission"
          message="This screen needs the enrollment.view permission. Ask an administrator to grant it to your account."
        />
      </div>
    )
  }

  if (detailError || !detail) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Application review" />
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={18} />
          <div className="grow stack stack-xs">
            <strong className="alert-title">Could not load this application</strong>
            <span>{detailError?.message || 'The application could not be found.'}</span>
            <div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  loadDetail()
                  loadRecs()
                }}
              >
                <Icon name="refresh" size={14} />
                Try again
              </button>
            </div>
          </div>
        </div>
        <Link to="/admin/enrollment/applications" className="subtle">
          ← Back to applications
        </Link>
      </div>
    )
  }

  const status = applicationStatus(detail.status)
  const blockers = detail.verification_blockers || []
  const actions = (detail.available_actions || [])
    .map(staffAction)
    .filter(Boolean)
  const documents = detail.documents || []
  const events = detail.events || []
  const matches = detail.student_matches || []
  const linkedName =
    detail.linked_student_name ||
    detail.enrollments?.[0]?.student_name ||
    null

  const confirmReady =
    detail.status === 'accepted' &&
    Boolean(detail.assigned_section) &&
    canConfirm

  function alertNode() {
    if (!alert) return null
    return (
      <div
        className={`alert ${alert.kind === 'error' ? 'alert-error' : 'alert-success'}`}
        role="alert"
      >
        <Icon name={alert.kind === 'error' ? 'info' : 'checkCircle'} size={17} />
        <span className="grow">{alert.text}</span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => setAlert(null)}
        >
          Dismiss
        </button>
      </div>
    )
  }

  const modalCtx = modal
    ? {
        doc: documents.find((d) => d.id === modal.docId),
        section: modal.section,
        match: modal.match,
      }
    : {}

  const confirmBody =
    detail.status === 'accepted'
      ? `Confirm enrollment for ${detail.full_name} in ${
          detail.assigned_section_name || 'the assigned section'
        }? This creates the permanent enrollment record.`
      : ''

  return (
    <div className="stack stack-md">
      <PageHeader
        title={detail.reference}
        subtitle={`${detail.full_name} — ${detail.grade_level_name} · ${detail.school_year_label}`}
        actions={
          <>
            <Link to="/admin/enrollment/applications" className="btn btn-secondary btn-sm no-print">
              <Icon name="arrowLeft" size={14} />
              Back
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm no-print"
              onClick={() => {
                loadDetail()
                loadRecs()
              }}
              disabled={detailLoading}
            >
              <Icon name="refresh" size={14} />
              Refresh
            </button>
          </>
        }
      >
        <div className="row row-wrap" style={{ gap: 8 }}>
          <StatusBadge label={detail.status_display || status.label} tone={status.tone} />
          <span className="badge badge-blue">
            {ENROLLMENT_TYPES[detail.enrollment_type] || detail.enrollment_type}
          </span>
          {(detail.missing_documents || []).length > 0 && (
            <span className="badge badge-amber">
              {detail.missing_documents.length} document
              {detail.missing_documents.length === 1 ? '' : 's'} missing
            </span>
          )}
          {detail.assigned_section_name && (
            <span className="badge badge-green">
              Section: {detail.assigned_section_name}
            </span>
          )}
        </div>
      </PageHeader>

      {alertNode()}

      <div className="review-grid">
        {/* ------------------------ Left column ------------------------ */}
        <div className="review-col">
          <section className="card">
            <div className="card-header">
              <h2>Applicant</h2>
            </div>
            <div className="card-body stack stack-md">
              <div className="kv-grid">
                <div className="kv-item">
                  <span className="kv-label">LRN</span>
                  <span className="kv-value">{detail.lrn || '—'}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Date of birth</span>
                  <span className="kv-value">{formatDate(detail.date_of_birth)}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Sex</span>
                  <span className="kv-value">{detail.sex || '—'}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Contact</span>
                  <span className="kv-value">{detail.contact_number || '—'}</span>
                </div>
                <div className="kv-item kv-full">
                  <span className="kv-label">Address</span>
                  <span className="kv-value">{detail.address || '—'}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Previous school</span>
                  <span className="kv-value">
                    {detail.previous_school || <span className="subtle">—</span>}
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Strand</span>
                  <span className="kv-value">
                    {detail.strand || <span className="subtle">—</span>}
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Applicant account</span>
                  <span className="kv-value">
                    {detail.applicant_username || <span className="subtle">—</span>}
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Enrollment type</span>
                  <span className="kv-value">
                    {ENROLLMENT_TYPES[detail.enrollment_type] ||
                      detail.enrollment_type ||
                      '—'}
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Submitted</span>
                  <span className="kv-value">{formatDateTime(detail.submitted_at)}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Reviewed</span>
                  <span className="kv-value">{formatDateTime(detail.reviewed_at)}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Decided</span>
                  <span className="kv-value">{formatDateTime(detail.decided_at)}</span>
                </div>
                {detail.decision_reason && (
                  <div className="kv-item kv-full">
                    <span className="kv-label">Decision reason</span>
                    <span className="kv-value">{detail.decision_reason}</span>
                  </div>
                )}
              </div>

              <div className="kv-block">
                <span className="eyebrow">Guardian</span>
                <div className="kv-grid">
                  <div className="kv-item">
                    <span className="kv-label">Name</span>
                    <span className="kv-value">
                      {detail.guardian_name || <span className="subtle">—</span>}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Relationship</span>
                    <span className="kv-value">
                      {detail.guardian_relationship || <span className="subtle">—</span>}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Contact</span>
                    <span className="kv-value">
                      {detail.guardian_contact || <span className="subtle">—</span>}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Email</span>
                    <span className="kv-value">
                      {detail.guardian_email || <span className="subtle">—</span>}
                    </span>
                  </div>
                </div>
              </div>

              <div className="kv-block">
                <span className="eyebrow">Student record</span>
                {detail.student ? (
                  <div className="row row-wrap" style={{ gap: 8 }}>
                    <span className="badge badge-green">Already linked</span>
                    <span>
                      {linkedName || `Student record #${detail.student}`}
                    </span>
                  </div>
                ) : matches.length === 0 ? (
                  <p className="subtle">
                    No existing student matches this application yet — it links
                    automatically at confirmation.
                  </p>
                ) : (
                  <div className="match-list">
                    {matches.map((match) => (
                      <div className="match-item" key={match.student_id}>
                        <div className="row row-wrap" style={{ gap: 8 }}>
                          <strong>{match.name}</strong>
                          <span className="subtle">LRN {match.lrn || '—'}</span>
                        </div>
                        <span className="subtle">
                          {match.section ? `Section ${match.section}` : 'No section yet'}
                          {match.date_of_birth
                            ? ` · Born ${formatDate(match.date_of_birth)}`
                            : ''}
                        </span>
                        <span className="subtle">{match.reason}</span>
                        {canManage && (
                          <div>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                openModal({ type: 'link', match })
                              }
                            >
                              Link this student
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Documents</h2>
              <span className="subtle">{documents.length} total</span>
            </div>
            <div className="card-body">
              {documents.length === 0 ? (
                <p className="subtle">No document slots for this application.</p>
              ) : (
                <div className="doc-list">
                  {documents.map((doc) => {
                    const docStatus = documentStatus(doc.status)
                    const hasFile = Boolean(doc.file || doc.download_url)
                    return (
                      <article className="doc-item" key={doc.id}>
                        <div className="doc-head">
                          <span className="doc-name">{doc.name}</span>
                          <span className="row row-wrap" style={{ gap: 6 }}>
                            <span
                              className={`badge ${doc.is_required ? 'badge-amber' : 'badge-neutral'}`}
                            >
                              {doc.is_required ? 'Required' : 'Optional'}
                            </span>
                            {doc.requires_verification && (
                              <span className="badge badge-blue">Verification</span>
                            )}
                            <StatusBadge
                              label={doc.status_display || docStatus.label}
                              tone={docStatus.tone}
                            />
                          </span>
                        </div>
                        <div className="doc-meta">
                          <span>
                            {doc.original_filename || <span className="subtle">No file</span>}
                          </span>
                          {doc.submitted_at && (
                            <span>Submitted {formatDateTime(doc.submitted_at)}</span>
                          )}
                          {doc.verified_at && (
                            <span>Verified {formatDateTime(doc.verified_at)}</span>
                          )}
                          {doc.verified_by_name && <span>By {doc.verified_by_name}</span>}
                        </div>
                        {doc.review_note && (
                          <p className="subtle">Note: {doc.review_note}</p>
                        )}
                        {canManage && (
                          <div className="doc-actions">
                            {hasFile && (
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                disabled={Boolean(busy)}
                                onClick={() => downloadDocument(doc)}
                              >
                                <Icon name="download" size={13} />
                                {busy === `download-${doc.id}` ? 'Downloading…' : 'Download'}
                              </button>
                            )}
                            {hasFile && (
                              <button
                                type="button"
                                className="btn btn-xs btn-primary"
                                disabled={Boolean(busy)}
                                onClick={() => verifyDocument(doc)}
                              >
                                {busy === 'verify' ? <ButtonLoader /> : <Icon name="check" size={13} />}
                                Verify
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-xs btn-secondary"
                              disabled={Boolean(busy)}
                              onClick={() => openModal({ type: 'returnDoc', docId: doc.id })}
                            >
                              Return
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
                              disabled={Boolean(busy)}
                              onClick={() => openModal({ type: 'waiveDoc', docId: doc.id })}
                            >
                              Waive
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>History</h2>
            </div>
            <div className="card-body">
              {events.length === 0 ? (
                <p className="subtle">No recorded events yet.</p>
              ) : (
                <div className="timeline">
                  {events.map((ev) => {
                    const from = ev.from_status ? applicationStatus(ev.from_status) : null
                    const to = ev.to_status ? applicationStatus(ev.to_status) : null
                    return (
                      <div className="timeline-item" key={ev.id}>
                        <div className="timeline-head">
                          <span className="timeline-actor">
                            {ev.actor_name || 'System'}
                          </span>
                          <span>{eventLabel(ev.action)}</span>
                          <span className="subtle">
                            {formatDateTime(ev.created_at)}
                          </span>
                        </div>
                        {(from || to) && (
                          <div className="timeline-flow">
                            {from && <StatusBadge label={from.label} tone={from.tone} />}
                            {from && to && <Icon name="arrowRight" size={13} />}
                            {to && <StatusBadge label={to.label} tone={to.tone} />}
                          </div>
                        )}
                        {ev.note && <p className="subtle">{ev.note}</p>}
                        {ev.internal_note && (
                          <div className="internal-note">
                            <span className="internal-label">Internal</span>
                            {ev.internal_note}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ------------------------ Right column ----------------------- */}
        <div className="review-col">
          <section className="card">
            <div className="card-header">
              <h2>Review actions</h2>
            </div>
            <div className="card-body stack stack-sm">
              {blockers.length > 0 && (
                <div className="alert alert-warning" role="alert">
                  <Icon name="info" size={17} />
                  <div className="grow stack stack-xs">
                    <strong className="alert-title">Verify before accepting</strong>
                    <span>
                      Outstanding required documents: {blockers.join(', ')}.
                    </span>
                  </div>
                </div>
              )}

              {!canManage ? (
                <p className="subtle">
                  View only — your account does not hold the enrollment.manage
                  permission.
                </p>
              ) : actions.length === 0 ? (
                <p className="subtle">
                  No review actions are available from the current status.
                </p>
              ) : (
                <div className="row row-wrap">
                  {actions.map((action) => {
                    const primary =
                      action === 'start_review' || action === 'accept'
                    const danger = DANGER_ACTIONS.has(action)
                    return (
                      <button
                        key={action}
                        type="button"
                        className={`btn btn-sm ${
                          danger ? 'btn-danger' : primary ? 'btn-primary' : 'btn-secondary'
                        }`}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (action === 'start_review') {
                            submitDirectAction(action)
                          } else {
                            openModal({ type: action })
                          }
                        }}
                      >
                        {busy === `action-${action}` ? (
                          <ButtonLoader />
                        ) : null}
                        {ACTION_LABELS[action]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Section assignment</h2>
              <button
                type="button"
                className="btn btn-xs btn-ghost no-print"
                onClick={loadRecs}
                disabled={recsLoading}
                aria-label="Refresh section recommendations"
              >
                <Icon name="refresh" size={13} />
                Refresh
              </button>
            </div>
            <div className="card-body">
              {recsLoading && !recs && (
                <TableSkeleton
                  headers={['Section', 'Grade', 'Adviser', 'Slots', 'Action']}
                  rows={3}
                  label="Loading sections…"
                />
              )}

              {!recsLoading && recsError && (
                recsError.status === 403 ? (
                  <p className="subtle">
                    You don't have permission to list sections — the
                    enrollment.view permission is required.
                  </p>
                ) : (
                  <div className="alert alert-error" role="alert">
                    <Icon name="info" size={16} />
                    <span className="grow">{recsError.message}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={loadRecs}
                    >
                      Retry
                    </button>
                  </div>
                )
              )}

              {!recsLoading && !recsError && (!recs || recs.length === 0) && (
                <p className="subtle">
                  No sections available for {detail.grade_level_name} in{' '}
                  {detail.school_year_label}.
                </p>
              )}

              {!recsLoading && !recsError && recs && recs.length > 0 && (
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Section</th>
                        <th scope="col">Grade</th>
                        <th scope="col">Adviser</th>
                        <th scope="col">Capacity</th>
                        <th scope="col">Assigned</th>
                        <th scope="col">Available</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recs.map((row) => {
                        const eligible =
                          row.available === null || row.available > 0
                        return (
                          <tr key={row.section_id}>
                            <td data-label="Section" className="cell-main">
                              <span className="row" style={{ gap: 6 }}>
                                {row.name}
                                {row.currently_assigned && (
                                  <span className="badge badge-green">Approved</span>
                                )}
                              </span>
                            </td>
                            <td data-label="Grade">{row.grade_level}</td>
                            <td data-label="Adviser">
                              {row.adviser || <span className="subtle">—</span>}
                            </td>
                            <td data-label="Capacity">
                              {row.capacity ?? <span className="subtle">No limit</span>}
                            </td>
                            <td data-label="Assigned">{formatNumber(row.assigned)}</td>
                            <td data-label="Available">
                              {row.available ?? <span className="subtle">—</span>}
                            </td>
                            <td data-label="Action">
                              {row.currently_assigned ? (
                                <span className="subtle">Current section</span>
                              ) : eligible && canManage ? (
                                <button
                                  type="button"
                                  className="btn btn-xs btn-secondary"
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    openModal({ type: 'assign', section: row })
                                  }
                                >
                                  Assign
                                </button>
                              ) : (
                                <span className="badge badge-red">Full</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Final confirmation</h2>
            </div>
            <div className="card-body stack stack-sm">
              <div className="kv-grid">
                <div className="kv-item">
                  <span className="kv-label">Section</span>
                  <span className="kv-value">
                    {detail.assigned_section_name || (
                      <span className="subtle">Not assigned yet</span>
                    )}
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Status</span>
                  <span className="kv-value">
                    <StatusBadge label={status.label} tone={status.tone} />
                  </span>
                </div>
                {detail.section_assigned_at && (
                  <div className="kv-item">
                    <span className="kv-label">Section assigned</span>
                    <span className="kv-value">
                      {formatDateTime(detail.section_assigned_at)}
                    </span>
                  </div>
                )}
                {detail.section_approved_by_name && (
                  <div className="kv-item">
                    <span className="kv-label">Approved by</span>
                    <span className="kv-value">{detail.section_approved_by_name}</span>
                  </div>
                )}
                {(detail.enrollments || []).length > 0 && (
                  <div className="kv-item kv-full">
                    <span className="kv-label">Enrollment record</span>
                    <span className="kv-value">
                      {detail.enrollments[0].student_name} —{' '}
                      {detail.enrollments[0].section_display} ·{' '}
                      {detail.enrollments[0].school_year_label}
                    </span>
                  </div>
                )}
              </div>

              {confirmReady ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(busy)}
                  onClick={() => openModal({ type: 'confirm' })}
                >
                  Confirm enrollment
                </button>
              ) : (
                <p className="subtle">
                  {!canConfirm
                    ? 'Only an account with the enrollment.confirm permission can confirm enrollments.'
                    : detail.status !== 'accepted'
                      ? 'Confirmation unlocks once the application is accepted.'
                      : 'Assign a section before confirming the enrollment.'}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(modal)}
        title={modalTitle(modal?.type, modalCtx)}
        onClose={closeModal}
        dismissible={!busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={closeModal}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="review-action-form"
              className={`btn btn-sm ${
                modal?.type === 'reject' || modal?.type === 'cancel'
                  ? 'btn-danger'
                  : 'btn-primary'
              }`}
              disabled={Boolean(busy)}
            >
              {busy && <ButtonLoader />}
              {busy
                ? 'Working…'
                : modal?.type === 'returnDoc'
                  ? 'Return document'
                  : modal?.type === 'waiveDoc'
                    ? 'Waive document'
                    : modal?.type === 'assign'
                      ? 'Assign section'
                      : modal?.type === 'confirm'
                        ? 'Confirm enrollment'
                        : modal?.type === 'link'
                          ? 'Link student'
                          : 'Confirm'}
            </button>
          </>
        }
      >
        <form
          id="review-action-form"
          className="stack stack-sm"
          onSubmit={submitModal}
          noValidate
        >
          {modal?.type === 'confirm' && <p>{confirmBody}</p>}

          {modal?.type === 'accept' && (
            <p>
              Accept this application? Required documents must already be
              verified.
            </p>
          )}

          {modal?.type === 'waitlist' && (
            <p>
              Waitlist {detail.full_name}? They stay in the queue for{' '}
              {detail.grade_level_name} and can be accepted later if a slot opens.
            </p>
          )}

          {modal?.type === 'assign' && (
            <p>
              Assign {detail.full_name} to {modalCtx.section?.name}? Capacity will
              be re-checked.
            </p>
          )}

          {modal?.type === 'link' && (
            <p>
              Link {detail.full_name} to the student record for{' '}
              {modalCtx.match?.name} (LRN {modalCtx.match?.lrn || '—'})? Unlinking
              is not supported.
            </p>
          )}

          {modal?.type === 'waiveDoc' && (
            <p>
              Waive “{modalCtx.doc?.name}”? The document counts as satisfied
              without an uploaded file.
            </p>
          )}

          {(modal?.type === 'request_corrections' || modal?.type === 'returnDoc') && (
            <div className="field">
              <label htmlFor="rv-note">
                {modal.type === 'returnDoc'
                  ? 'What must be corrected? (shown to the applicant)'
                  : 'Required corrections (shown to the applicant)'}
              </label>
              <textarea
                id="rv-note"
                className="textarea"
                value={notes.note}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, note: e.target.value }))
                }
                disabled={Boolean(busy)}
                aria-invalid={modalErrors.note ? 'true' : undefined}
              />
              {modalErrors.note && (
                <span className="field-error">
                  <Icon name="info" size={13} />
                  {modalErrors.note}
                </span>
              )}
            </div>
          )}

          {modal?.type === 'request_corrections' && (
            <div className="field">
              <label htmlFor="rv-internal">Internal note (optional — staff only)</label>
              <textarea
                id="rv-internal"
                className="textarea"
                value={notes.internal_note}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, internal_note: e.target.value }))
                }
                disabled={Boolean(busy)}
              />
            </div>
          )}

          {(modal?.type === 'reject' || modal?.type === 'cancel') && (
            <>
              <div className="field">
                <label htmlFor="rv-reason">
                  Reason (recorded in the history and shown to the applicant)
                </label>
                <textarea
                  id="rv-reason"
                  className="textarea"
                  value={notes.reason}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  disabled={Boolean(busy)}
                  aria-invalid={modalErrors.reason ? 'true' : undefined}
                />
                {modalErrors.reason && (
                  <span className="field-error">
                    <Icon name="info" size={13} />
                    {modalErrors.reason}
                  </span>
                )}
              </div>
              {modal.type === 'reject' && (
                <div className="field">
                  <label htmlFor="rv-internal-reject">
                    Internal note (optional — staff only)
                  </label>
                  <textarea
                    id="rv-internal-reject"
                    className="textarea"
                    value={notes.internal_note}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, internal_note: e.target.value }))
                    }
                    disabled={Boolean(busy)}
                  />
                </div>
              )}
            </>
          )}
        </form>
      </Modal>
    </div>
  )
}
