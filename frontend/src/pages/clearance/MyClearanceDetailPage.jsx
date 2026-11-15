import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import DocumentUploader from '../../components/enrollment/DocumentUploader'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { API_BASE, authHeader } from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  departmentStatus,
  obligationStatus,
  overallStatus,
  submissionStatus,
} from '../../utils/clearance'
import { downloadAuthorizedFile } from '../../utils/enrollment'
import { formatDate, formatDateTime, deadlineInfo, formatCurrency } from '../../utils/format'
import './Clearance.css'

/** The decision statuses after which an office will not take a new file. */
const FINAL_DEPARTMENT_STATUS = ['approved', 'rejected', 'not_applicable']

/**
 * Upload or replace one clearance document.
 *
 * The shared api client JSON-serializes every body, so the multipart request
 * goes through fetch with the auth header — the same shape an enrollment
 * upload uses, because both endpoints take the same `file` field and apply the
 * same extension, size and magic-byte checks server-side.
 */
async function uploadClearanceFile(recordId, submissionId, file) {
  const headers = authHeader()
  const formData = new FormData()
  formData.append('file', file)

  let response
  try {
    response = await fetch(
      `${API_BASE}/clearance/my/${recordId}/documents/${submissionId}/upload/`,
      {
        method: 'POST',
        headers: Object.keys(headers).length ? headers : undefined,
        body: formData,
      }
    )
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.')
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
    if (typeof payload === 'string' && payload) throw new Error(payload)
    const detail = payload?.detail
    const fileError = payload?.file
    throw new Error(
      detail ||
      (Array.isArray(fileError) ? fileError.join(' ') : fileError) ||
      `Upload failed (${response.status}).`
    )
  }
  return null
}

/**
 * One learner's clearance checklist.
 *
 * Everything the page shows — the offices, their instructions, what each one
 * still wants, the reasons given and the history — comes from the learner
 * serializer, which is deliberately narrower than the officer's view: an
 * internal note never reaches it, and neither does who waived an obligation.
 * `/clearance/my/<id>/` answers 404 for a record the reader is not entitled
 * to, so a hand-typed id shows the same refusal as a learner who simply
 * has no clearance.
 */
export default function MyClearanceDetailPage({ scope = 'student' }) {
  const { id } = useParams()
  const record = useFetch(`/clearance/my/${id}/`)
  const [uploads, setUploads] = useState({})
  const [downloadError, setDownloadError] = useState(null)
  const [certificateError, setCertificateError] = useState(null)

  const data = record.data
  const departments = data?.departments || []
  const base = `/${scope}/clearance`

  async function handleUpload(submissionId, file) {
    if (uploads[submissionId]?.busy) return
    setUploads((prev) => ({ ...prev, [submissionId]: { busy: true, error: null } }))
    try {
      await uploadClearanceFile(Number(id), submissionId, file)
      record.reload()
      setUploads((prev) => ({ ...prev, [submissionId]: { busy: false, error: null } }))
    } catch (err) {
      setUploads((prev) => ({
        ...prev,
        [submissionId]: { busy: false, error: err.message },
      }))
    }
  }

  function handleDownload(submission) {
    setDownloadError(null)
    downloadAuthorizedFile(
      API_BASE,
      `clearance/my/${id}/documents/${submission.id}/download/`,
      submission.original_filename || submission.name
    ).catch((err) => setDownloadError(err.message))
  }

  function handleCertificate() {
    setCertificateError(null)
    downloadAuthorizedFile(
      API_BASE,
      `clearance/my/${id}/certificate/`,
      `clearance-${data?.reference || id}.pdf`
    ).catch((err) => setCertificateError(err.message))
  }

  if (record.loading && !data) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Clearance" subtitle="Loading this clearance…" />
        <Card loading />
      </div>
    )
  }

  if (record.error) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Clearance" actions={backLink(base)} />
        <Card>
          <ErrorMessage error={record.error} title="This clearance could not be opened" />
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Clearance" actions={backLink(base)} />
        <Card>
          <EmptyState
            as="h2"
            icon="inbox"
            title="No clearance to open"
            message="This record is not one you are entitled to see. Draft periods and other learners' clearances are never returned for this account."
          />
        </Card>
      </div>
    )
  }

  const status = overallStatus(data.overall_status)
  const due = deadlineInfo(data.closes_at)
  const isOpen = data.period_status === 'active' && data.overall_status !== 'cleared'

  // "What is holding this clearance back" is the same reading the server uses
  // to derive the overall status: an unsettled office, then a blocking
  // obligation, then a document the office sent back.
  const blockers = departments
    .filter((item) => !FINAL_DEPARTMENT_STATUS.includes(item.status))
    .map((item) => {
      const pending = item.submissions.filter(
        (doc) => doc.is_required && (doc.status === 'not_submitted' || doc.status === 'returned')
      )
      const blocking = item.obligations.filter(
        (obligation) => obligation.status === 'open' && obligation.is_blocking
      )
      if (blocking.length) {
        return `${item.name}: ${blocking.length} outstanding item(s) to settle at the office.`
      }
      if (pending.length) {
        return `${item.name}: ${pending.length} required document(s) not filed yet (${pending
          .map((doc) => doc.name)
          .join(', ')}).`
      }
      return `${item.name}: waiting on the office to record its decision.`
    })

  return (
    <div className="stack stack-md">
      <PageHeader
        title={data.period_name}
        subtitle={`${data.school_year_label} · ${data.type_label} · ${data.semester_label}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={record.reload}
              loading={record.loading}
            >
              <Icon name="refresh" size={14} />
              Refresh
            </Button>
            {data.can_download_certificate ? (
              <Button variant="primary" size="sm" onClick={handleCertificate}>
                <Icon name="download" size={14} />
                Certificate (PDF)
              </Button>
            ) : (
              backLink(base)
            )}
          </>
        }
      />

      {data.viewed_as === 'guardian' && (
        <div className="alert alert-info" role="status">
          <Icon name="users" size={15} />
          <span className="grow">
            You are reading the clearance of{' '}
            <strong>{data.learner}</strong>
            {data.lrn ? ` (${data.lrn})` : ''} as a linked parent or guardian.
            Filing a document here is the same as filing it on their device —
            the office sees who sent it.
          </span>
        </div>
      )}

      {certificateError && (
        <div className="alert alert-error" role="alert">
          <span className="grow">{certificateError}</span>
          <Button variant="secondary" size="sm" onClick={handleCertificate}>
            Try again
          </Button>
        </div>
      )}

      <Card title="Where this clearance stands">
        <div className="stack stack-sm">
          <div className="row row-wrap">
            <StatusBadge label={data.status_label} tone={status.tone} />
            <span className="subtle">
              {countSettled(departments)} of {departments.length} offices settled ·{' '}
              {data.progress}% complete
            </span>
            {data.reference && (
              <span className="clr-chip">Reference {data.reference}</span>
            )}
          </div>

          <div
            className="progress-track"
            role="img"
            aria-label={`${data.progress}% of this clearance is settled`}
          >
            <div
              className={`progress-fill ${data.overall_status === 'cleared' ? 'green' : 'blue'}`}
              style={{ width: `${data.progress}%` }}
            />
          </div>

          <dl className="profile-grid">
            <div>
              <dt>Learner</dt>
              <dd>
                {data.learner}
                {data.lrn ? <span className="subtle block">{data.lrn}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Grade &amp; section</dt>
              <dd>{[data.grade_level, data.section_name].filter(Boolean).join(' · ') || '—'}</dd>
            </div>
            <div>
              <dt>Open until</dt>
              <dd>
                {data.closes_at ? formatDate(data.closes_at) : 'No closing date set'}
                {/* `isOpen` is false for a cleared learner even while the period is
                    still open for everyone else, so the caption cannot be shared. */}
                <span className="subtle block">
                  {data.overall_status === 'cleared'
                    ? 'Nothing more to file'
                    : isOpen ? due.label : 'Submissions closed'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Still to settle</dt>
              <dd>
                {data.pending_count === 0
                  ? 'Nothing'
                  : `${data.pending_count} office${data.pending_count === 1 ? '' : 's'}`}
              </dd>
            </div>
          </dl>

          {data.instructions && (
            <p className="clr-note">{data.instructions}</p>
          )}

          {data.overall_status === 'cleared' && (
            <div className="alert alert-success" role="status">
              <Icon name="checkCircle" size={15} />
              <span className="grow">
                Cleared {data.cleared_at ? formatDateTime(data.cleared_at) : ''}.
                {data.final_note ? ` ${data.final_note}` : ''}
              </span>
            </div>
          )}

          {/* The cleared alert above already settles this; repeating "what remains
              is for the offices to record" underneath it reads as a contradiction. */}
          {data.overall_status !== 'cleared' && (
            blockers.length > 0 ? (
              <ul className="clr-blockers">
                {blockers.map((line) => (
                  <li key={line}>
                    <Icon name="alertTriangle" size={14} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="clr-blockers is-clear">
                <li>
                  <Icon name="checkCircle" size={14} />
                  <span>
                    Nothing is holding this back on your side. What remains is for
                    the offices and the Registrar to record.
                  </span>
                </li>
              </ul>
            )
          )}

          {!isOpen && data.overall_status !== 'cleared' && (
            <p className="clr-note">
              This period is {data.period_status === 'draft' ? 'still being prepared' : 'no longer open'},
              so no document can be filed against it. An office can still record
              its decision on what you already sent.
            </p>
          )}
        </div>
      </Card>

      {downloadError && (
        <div className="alert alert-error" role="alert">
          <span className="grow">{downloadError}</span>
          <Button variant="ghost" size="sm" onClick={() => setDownloadError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="clr-checklist">
        {departments.map((item) => (
          <OfficeCard
            key={item.id}
            item={item}
            isOpen={isOpen}
            uploads={uploads}
            onUpload={handleUpload}
            onDownload={handleDownload}
          />
        ))}
      </div>

      <Card title="History">
        {(data.history || []).length === 0 ? (
          <EmptyState
            icon="clock"
            title="Nothing recorded yet"
            message="Every decision an office makes on this clearance appears here, with the message it wrote for you."
          />
        ) : (
          <ul className="clr-events">
            {(data.history || []).map((event) => (
              <li key={event.id}>
                <strong>
                  {event.department || 'Registrar'}
                  <span className="subtle"> · {formatDateTime(event.created_at)}</span>
                </strong>
                <span>{event.note}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function countSettled(departments) {
  return departments.filter((item) => FINAL_DEPARTMENT_STATUS.includes(item.status)).length
}

function backLink(base) {
  return (
    <Link className="btn btn-secondary btn-sm" to={base}>
      <Icon name="arrowLeft" size={14} />
      All clearances
    </Link>
  )
}

/**
 * One office: its instructions, its checklist, its decision.
 *
 * The upload control is offered only when the server would take a file — the
 * period is open, the clearance is not finished, this office has not recorded a
 * final decision and the requirement accepts one. The same checks run again on
 * the endpoint, so a stale page still gets an honest refusal instead of a file
 * that is quietly dropped.
 */
function OfficeCard({ item, isOpen, uploads, onUpload, onDownload }) {
  const status = departmentStatus(item.status)
  const isFinal = FINAL_DEPARTMENT_STATUS.includes(item.status)
  const due = deadlineInfo(item.deadline)
  const openObligations = item.obligations.filter((obligation) => obligation.status === 'open')

  return (
    <section className="clr-office-card">
      <header>
        <div>
          <h3>{item.name}</h3>
          <span className="subtle">
            {item.is_required ? 'Required for this learner' : 'Optional'}
            {item.responsible_person_name ? ` · ${item.responsible_person_name}` : ''}
          </span>
        </div>
        <StatusBadge label={item.status_label || status.label} tone={status.tone} />
      </header>

      <div className="card-body">
        {item.instructions && <p className="clr-note">{item.instructions}</p>}

        {item.deadline && (
          <p className="clr-note">
            <strong>Deadline:</strong> {formatDate(item.deadline)} · {due.label}
          </p>
        )}

        {item.decision_note && (
          <div className="clr-rejection" role="status">
            <strong>{item.name} wrote:</strong> {item.decision_note}
            {item.decided_at ? (
              <span className="subtle block">{formatDateTime(item.decided_at)}</span>
            ) : null}
          </div>
        )}

        {item.submissions.map((doc) => {
          const docStatus = submissionStatus(doc.status)
          const upload = uploads[doc.id] || {}
          return (
            <div className="clr-item" key={doc.id}>
              <div className="clr-item-head">
                <div>
                  <strong>{doc.name}</strong>
                  {doc.is_required && (
                    <span className="subtle block">Required{doc.description ? ` — ${doc.description}` : ''}</span>
                  )}
                  {!doc.is_required && doc.description && (
                    <span className="subtle block">{doc.description}</span>
                  )}
                </div>
                <StatusBadge label={doc.status_label || docStatus.label} tone={docStatus.tone} />
              </div>

              {doc.has_file && (
                <p className="clr-note">
                  <Icon name="file" size={13} />{' '}
                  <strong>{doc.original_filename}</strong> · revision {doc.revision} ·{' '}
                  {doc.submitted_at ? formatDateTime(doc.submitted_at) : 'not dated'}
                  {!doc.allows_upload && ' · recorded by the office'}
                </p>
              )}

              {doc.review_note && (
                <div className="clr-rejection" role="status">
                  <strong>On review:</strong> {doc.review_note}
                </div>
              )}

              <div className="row row-wrap">
                {doc.allows_upload && (
                  <DocumentUploader
                    id={`clr-up-${doc.id}`}
                    docName={doc.name}
                    hasFile={doc.has_file}
                    busy={upload.busy}
                    error={upload.error}
                    disabled={!isOpen || isFinal}
                    onSelect={(file) => onUpload(doc.id, file)}
                  />
                )}
                {doc.has_file && (
                  <Button variant="ghost" size="sm" onClick={() => onDownload(doc)}>
                    <Icon name="download" size={14} />
                    Download my copy
                  </Button>
                )}
              </div>

              {!isOpen && doc.allows_upload && !doc.has_file && (
                <p className="clr-note">
                  Nothing can be filed while this period is not open.
                </p>
              )}
              {isOpen && isFinal && doc.allows_upload && (
                <p className="clr-note">
                  This office has recorded its decision, so the file is locked.
                  Ask {item.name} to re-open the item if something needs changing.
                </p>
              )}
            </div>
          )
        })}

        {item.submissions.length === 0 && (
          <p className="clr-note">
            {item.name} did not ask you for any document. They check their own
            record and sign you off here.
          </p>
        )}

        {openObligations.length > 0 && (
          <div className="stack stack-xs">
            <p className="clr-note">
              <strong>Outstanding at this office</strong>
            </p>
            {openObligations.map((obligation) => {
              const obligationTone = obligationStatus(obligation.status)
              return (
                <div className="clr-item" key={obligation.id}>
                  <div className="clr-item-head">
                    <div>
                      <strong>{obligation.title}</strong>
                      {obligation.detail && (
                        <span className="subtle block">{obligation.detail}</span>
                      )}
                      <span className="subtle block">
                        {obligation.is_blocking
                          ? 'Blocks this office until it is settled there.'
                          : 'Noted only — it does not hold your clearance back.'}
                      </span>
                    </div>
                    <span className="clr-chips">
                      {obligation.amount && Number(obligation.amount) > 0 && (
                        <span className="clr-chip">{formatCurrency(obligation.amount)}</span>
                      )}
                      <StatusBadge
                        label={obligation.status_label || obligationTone.label}
                        tone={obligationTone.tone}
                      />
                    </span>
                  </div>
                </div>
              )
            })}
            <p className="clr-note">
              Settling these happens at the office itself. Nothing was assumed
              against you — an officer recorded it and wrote why.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
