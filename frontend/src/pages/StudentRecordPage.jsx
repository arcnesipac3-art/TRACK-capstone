import Button from '../components/Button'
import CardSkeleton from '../components/loading/CardSkeleton'
import DocumentViewerModal from '../components/enrollment/DocumentViewerModal'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import TableSkeleton from '../components/loading/TableSkeleton'
import Tabs from '../components/Tabs'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { API_BASE } from '../services/api'
import useFetch from '../hooks/useFetch'
import {
  ENROLLMENT_TYPES,
  applicationStatus,
  documentDownloadPath,
  documentStatus,
  downloadAuthorizedFile,
} from '../utils/enrollment'
import { formatDate, formatDateTime } from '../utils/format'
import './enrollment/RegistrarEnrollment.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
]

/**
 * One learner's record: who they are, how they were enrolled, and every
 * document filed against their applications.
 *
 * The three reads below are the directory and Registrar list endpoints
 * narrowed with `?id=` / `?student=`. There is no student-detail endpoint, and
 * each list applies its scoping before the narrowing, so this page can never
 * reach a learner the directory would not already have shown.
 */
export default function StudentRecordPage() {
  const { id } = useParams()
  const { can } = useAuth()
  // The record belongs to the students directory (`users.view`), but the
  // enrollment half of it stays behind the enrollment key that guards every
  // other Registrar screen.
  const canEnrollment = can('enrollment.view')
  const [tab, setTab] = useState('overview')
  const [viewing, setViewing] = useState(null)

  const student = useFetch('/students/', { list: true, params: { id } })
  const applications = useFetch('/enrollment/applications/', {
    list: true,
    params: { student: id },
    enabled: canEnrollment,
  })
  const enrollments = useFetch('/enrollment/enrollments/', {
    list: true,
    params: { student: id },
    enabled: canEnrollment,
  })

  const apps = applications.data || []
  const enrollmentRows = enrollments.data || []
  const profile = (student.data || [])[0] || null

  // The checklist lives on each application, so the documents tab pays for the
  // detail reads only once it is actually opened.
  const [docGroups, setDocGroups] = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState(null)

  const loadDocuments = useCallback(async (list) => {
    setDocLoading(true)
    setDocError(null)
    try {
      const detailed = await Promise.all(
        list.map((app) => api.get(`/enrollment/applications/${app.id}/`)),
      )
      setDocGroups(
        detailed.map((detail) => ({
          id: detail.id,
          reference: detail.reference,
          documents: detail.documents || [],
        })),
      )
    } catch (err) {
      setDocError(err.message || 'The documents could not be loaded.')
    } finally {
      setDocLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'documents' || !canEnrollment || docGroups || docLoading) return
    const list = applications.data || []
    if (applications.loading || list.length === 0) return
    // The loader flips its own loading flag synchronously before the first
    // await — queueMicrotask runs that kickoff outside the effect's render pass.
    queueMicrotask(() => loadDocuments(list))
  }, [tab, canEnrollment, docGroups, docLoading, applications.loading, applications.data, loadDocuments])

  function refresh() {
    setDocGroups(null)
    student.reload()
    if (canEnrollment) {
      applications.reload()
      enrollments.reload()
    }
  }

  async function download(applicationId, doc) {
    try {
      await downloadAuthorizedFile(
        API_BASE,
        documentDownloadPath(applicationId, doc.id),
        doc.original_filename,
      )
    } catch (err) {
      setDocError(err.message)
    }
  }

  if (student.error?.status === 403) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Student record" />
        <EmptyState
          as="h2"
          icon="shield"
          title="You don't have permission"
          message="This screen needs the students.view permission. Ask an administrator to grant it to your account."
        />
      </div>
    )
  }

  if (student.loading && !profile) {
    return (
      <div className="stack stack-md">
        <CardSkeleton lines={2} label="Loading student…" />
        <div className="review-grid">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    )
  }

  if (student.error || !profile) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Student record" />
        <div className="card">
          <div className="card-body">
            {student.error ? (
              <ErrorMessage
                error={student.error}
                title="Could not load this student"
                onRetry={student.reload}
              />
            ) : (
              <EmptyState
                as="h2"
                icon="users"
                title="Student not found"
                message="This learner is not on record, or is not visible to your account."
              />
            )}
            <Link to="/admin/students" className="subtle">
              ← Back to students
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const account = profile.user || {}
  const name = account.full_name || account.username || `Student ${profile.id}`

  return (
    <div className="stack stack-md">
      <PageHeader
        title={name}
        subtitle={`Student record · LRN ${profile.lrn || '—'}`}
        actions={
          <>
            <Link to="/admin/students" className="btn btn-secondary btn-sm">
              <Icon name="arrowLeft" size={14} />
              Back
            </Link>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={student.loading}>
              <Icon name="refresh" size={14} />
              Refresh
            </Button>
          </>
        }
      >
        <div className="row row-wrap gap-xs">
          <StatusBadge
            label={account.is_active === false ? 'Inactive account' : 'Active account'}
            tone={account.is_active === false ? 'red' : 'green'}
          />
          {profile.section_name && <StatusBadge tone="blue" label={profile.section_name} />}
          {!canEnrollment && (
            <StatusBadge tone="neutral" label="Enrollment view only" />
          )}
        </div>
      </PageHeader>

      <Tabs
        tabs={canEnrollment ? TABS : TABS.slice(0, 1)}
        value={tab}
        onChange={setTab}
        label="Student record sections"
        idPrefix="student-record"
        className="tabs--pill"
      />

      {tab === 'overview' && (
        <div
          className="review-grid"
          role="tabpanel"
          id="student-record-panel-overview"
          aria-labelledby="student-record-tab-overview"
        >
          <div className="review-col">
            <section className="card">
              <div className="card-header">
                <h2>Learner</h2>
              </div>
              <div className="card-body">
                <div className="kv-grid">
                  <div className="kv-item">
                    <span className="kv-label">LRN</span>
                    <span className="kv-value">{profile.lrn || <span className="subtle">—</span>}</span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Section</span>
                    <span className="kv-value">
                      {profile.section_name || <span className="subtle">Unassigned</span>}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Date of birth</span>
                    <span className="kv-value">{formatDate(profile.date_of_birth)}</span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Contact</span>
                    <span className="kv-value">
                      {profile.contact_number || <span className="subtle">—</span>}
                    </span>
                  </div>
                  <div className="kv-item kv-full">
                    <span className="kv-label">Address</span>
                    <span className="kv-value">
                      {profile.address || <span className="subtle">—</span>}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Sign-in name</span>
                    <span className="kv-value">{account.username || <span className="subtle">—</span>}</span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-label">Email</span>
                    <span className="kv-value">{account.email || <span className="subtle">—</span>}</span>
                  </div>
                </div>
              </div>
            </section>

            {canEnrollment && (
              <section className="card">
                <div className="card-header">
                  <h2>Applications</h2>
                </div>
                <div className="card-body">
                  {applications.loading && <TableSkeleton rows={2} />}

                  {!applications.loading && applications.error && (
                    <ErrorMessage
                      error={applications.error}
                      title="Could not load the applications"
                      onRetry={applications.reload}
                    />
                  )}

                  {!applications.loading && !applications.error && apps.length === 0 && (
                    <EmptyState
                      icon="clipboard"
                      title="No applications"
                      message="This learner has no admission application on record."
                    />
                  )}

                  {!applications.loading && !applications.error && apps.length > 0 && (
                    <div className="doc-list">
                      {apps.map((app) => {
                        const status = applicationStatus(app.status)
                        return (
                          <article className="doc-item" key={app.id}>
                            <div className="doc-head">
                              <span className="doc-name">{app.reference}</span>
                              <span className="row row-wrap gap-xs">
                                <StatusBadge
                                  label={app.status_display || status.label}
                                  tone={status.tone}
                                />
                                <StatusBadge
                                  tone="neutral"
                                  label={ENROLLMENT_TYPES[app.enrollment_type] || app.enrollment_type}
                                />
                              </span>
                            </div>
                            <div className="doc-meta">
                              <span>{app.grade_level_name}</span>
                              <span>{app.school_year_label}</span>
                              {app.submitted_at && (
                                <span>Submitted {formatDateTime(app.submitted_at)}</span>
                              )}
                              {app.outstanding_documents > 0 && (
                                <span>{app.outstanding_documents} document(s) outstanding</span>
                              )}
                            </div>
                            <div className="doc-actions">
                              <Link
                                to={`/admin/enrollment/applications/${app.id}`}
                                className="btn btn-secondary btn-xs"
                              >
                                <Icon name="eye" size={13} />
                                Open review
                              </Link>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="review-col">
            {canEnrollment ? (
              <section className="card">
                <div className="card-header">
                  <h2>Enrollments</h2>
                </div>
                <div className="card-body">
                  {enrollments.loading && <TableSkeleton rows={2} />}

                  {!enrollments.loading && enrollments.error && (
                    <ErrorMessage
                      error={enrollments.error}
                      title="Could not load the enrollments"
                      onRetry={enrollments.reload}
                    />
                  )}

                  {!enrollments.loading && !enrollments.error && enrollmentRows.length === 0 && (
                    <EmptyState
                      icon="gradCap"
                      title="Not enrolled yet"
                      message="A confirmed enrollment appears here once the Registrar finalises one."
                    />
                  )}

                  {!enrollments.loading && !enrollments.error && enrollmentRows.length > 0 && (
                    <div className="doc-list">
                      {enrollmentRows.map((row) => (
                        <article className="doc-item" key={row.id}>
                          <div className="doc-head">
                            <span className="doc-name">
                              {row.school_year_label} · {row.grade_level_name}
                            </span>
                            <StatusBadge
                              label={row.status === 'active' ? 'Active' : row.status}
                              tone={row.status === 'active' ? 'green' : 'neutral'}
                            />
                          </div>
                          <div className="doc-meta">
                            <span>{row.section_display || 'No section'}</span>
                            {row.confirmed_at && (
                              <span>Confirmed {formatDateTime(row.confirmed_at)}</span>
                            )}
                            {row.confirmed_by_name && <span>By {row.confirmed_by_name}</span>}
                            {row.application_reference && (
                              <span>From {row.application_reference}</span>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="card">
                <div className="card-header">
                  <h2>Admissions</h2>
                </div>
                <div className="card-body stack stack-xs">
                  <p className="subtle">
                    View only — your account does not hold the enrollment.view permission, so
                    applications, enrollments and filed documents are not shown on this record.
                  </p>
                  <Link to="/admin/students" className="subtle">
                    ← Back to the students directory
                  </Link>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && canEnrollment && (
        <section
          className="card"
          role="tabpanel"
          id="student-record-panel-documents"
          aria-labelledby="student-record-tab-documents"
        >
          <div className="card-header">
            <h2>Filed documents</h2>
          </div>
          <div className="card-body stack stack-md">
            {docError && (
              <div className="alert alert-error" role="alert">
                <Icon name="info" size={17} />
                <span className="grow">{docError}</span>
                {apps.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadDocuments(apps)}
                    disabled={docLoading}
                  >
                    <Icon name="refresh" size={14} />
                    Try again
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setDocError(null)}>
                  Dismiss
                </Button>
              </div>
            )}

            {applications.error && (
              <ErrorMessage
                error={applications.error}
                title="Could not load the applications"
                onRetry={applications.reload}
              />
            )}

            {(docLoading || applications.loading) && <TableSkeleton rows={3} />}

            {!docLoading && !applications.loading && apps.length === 0 && (
              <EmptyState
                as="h2"
                icon="file"
                title="No filed documents"
                message="Documents are filed against an application. This learner has none on record."
              />
            )}

            {!docLoading && !applications.loading && docGroups?.length > 0 && docGroups.map((group) => {
              const filed = group.documents.filter((doc) => doc.file || doc.download_url)
              return (
                <div className="stack stack-xs" key={group.id}>
                  <span className="eyebrow">
                    {group.reference} · {filed.length} filed
                  </span>
                  {group.documents.length === 0 ? (
                    <p className="subtle">This application has no document checklist.</p>
                  ) : (
                    <div className="doc-list">
                      {group.documents.map((doc) => {
                        const status = documentStatus(doc.status)
                        const hasFile = Boolean(doc.file || doc.download_url)
                        return (
                          <article className="doc-item" key={doc.id}>
                            <div className="doc-head">
                              <span className="doc-name">{doc.name}</span>
                              <span className="row row-wrap gap-xs">
                                <StatusBadge
                                  tone={doc.is_required ? 'amber' : 'neutral'}
                                  label={doc.is_required ? 'Required' : 'Optional'}
                                />
                                <StatusBadge
                                  label={doc.status_display || status.label}
                                  tone={status.tone}
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
                            {doc.review_note && <p className="subtle">Note: {doc.review_note}</p>}
                            <div className="doc-actions">
                              {hasFile && (
                                <>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={() => setViewing({ ...doc, applicationId: group.id })}
                                  >
                                    <Icon name="eye" size={13} />
                                    View
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={() => download(group.id, doc)}
                                  >
                                    <Icon name="download" size={13} />
                                    Download
                                  </Button>
                                </>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <DocumentViewerModal
        open={Boolean(viewing)}
        doc={viewing}
        applicationId={viewing?.applicationId}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}
