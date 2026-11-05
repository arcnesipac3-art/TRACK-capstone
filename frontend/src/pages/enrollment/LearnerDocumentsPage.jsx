import Button from '../../components/Button'
import ButtonLink from '../../components/ButtonLink'
import DocumentViewerModal from '../../components/enrollment/DocumentViewerModal'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { API_BASE } from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  documentDownloadPath,
  documentStatus,
  downloadAuthorizedFile,
} from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import './RegistrarEnrollment.css'

/**
 * Every document this account owns, in one read-only list.
 *
 * An application's detail page shows its own checklist, so a learner who filed
 * papers across two school years had to open each application to find them.
 * This is the same data collected in one place — the applicant-side mirror of
 * the Registrar's student record, without the ruling controls: nothing here
 * writes. The reads are the applicant list plus each application's own detail,
 * both already scoped server-side to the applicant, the enrolled learner and a
 * parent's linked children, so no new endpoint is needed.
 */
export default function LearnerDocumentsPage() {
  const { user } = useAuth()
  const isParent = user?.role === 'parent'
  const applications = useFetch('/enrollment/applications/my/', { list: true })
  const [groups, setGroups] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [viewing, setViewing] = useState(null)

  const apps = applications.data || []
  const filedCount = (groups || []).reduce(
    (total, group) =>
      total + group.documents.filter((doc) => doc.file || doc.download_url).length,
    0
  )

  const loadChecklists = useCallback(async (list) => {
    setBusy(true)
    setFailure(null)
    try {
      const detailed = await Promise.all(
        list.map((app) => api.get(`/enrollment/applications/my/${app.id}/`))
      )
      setGroups(
        detailed.map((detail) => ({
          id: detail.id,
          reference: detail.reference,
          status: detail.status,
          learner: [detail.first_name, detail.last_name]
            .filter(Boolean)
            .join(' ')
            .trim(),
          documents: detail.documents || [],
        }))
      )
    } catch (err) {
      setFailure(err.message || 'The documents could not be loaded.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (groups || busy || applications.loading) return
    const list = applications.data || []
    if (list.length === 0) return
    // The loader flips its own flag before the first await, so the request is
    // kicked off outside this effect's render pass.
    queueMicrotask(() => loadChecklists(list))
  }, [groups, busy, applications.loading, applications.data, loadChecklists])

  function refresh() {
    setGroups(null)
    setFailure(null)
    applications.reload()
  }

  async function download(applicationId, doc) {
    try {
      await downloadAuthorizedFile(
        API_BASE,
        documentDownloadPath(applicationId, doc.id),
        doc.original_filename || doc.name
      )
    } catch (err) {
      setFailure(err.message)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title={isParent ? 'Filed documents' : 'My documents'}
        subtitle={
          isParent
            ? 'Every document filed for the learners linked to this account, with the Registrar’s decision on each.'
            : 'Every document filed with your applications, with the Registrar’s decision on each.'
        }
        actions={
          <>
            <ButtonLink variant="secondary" size="sm" to="../applications">
              My applications
            </ButtonLink>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={applications.loading}>
              <Icon name="refresh" size={14} />
              Refresh
            </Button>
          </>
        }
      >
        {groups && groups.length > 0 && (
          <div className="row row-wrap gap-xs">
            <StatusBadge tone="blue" label={`${filedCount} filed`} />
            {isParent && <StatusBadge tone="neutral" label="Across your linked children" />}
          </div>
        )}
      </PageHeader>

      <section className="card">
        <div className="card-header">
          <h2>Checklists by application</h2>
        </div>
        <div className="card-body stack stack-md">
          {failure && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={17} />
              <span className="grow">{failure}</span>
              {apps.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => loadChecklists(apps)} disabled={busy}>
                  <Icon name="refresh" size={14} />
                  Try again
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setFailure(null)}>
                Dismiss
              </Button>
            </div>
          )}

          {applications.error && (
            <ErrorMessage
              error={applications.error}
              title="Could not load your applications"
              onRetry={applications.reload}
            />
          )}

          {(busy || (applications.loading && !groups)) && <TableSkeleton rows={3} />}

          {!busy && !applications.loading && apps.length === 0 && (
            <EmptyState
              as="h2"
              icon="file"
              title="No documents on record"
              message="Documents belong to an application. Start one during an open enrollment period and the files you attach will be listed here."
              action={
                <ButtonLink variant="primary" size="sm" to="../new">
                  Start an application
                </ButtonLink>
              }
            />
          )}

          {!busy && groups?.length === 0 && (
            <EmptyState
              as="h2"
              icon="file"
              title="No documents on record"
              message="None of your applications has a document requirement yet."
            />
          )}

          {!busy &&
            groups?.map((group) => {
              const filed = group.documents.filter((doc) => doc.file || doc.download_url)
              // Uploading stays where the form lives; this screen only points at it.
              const canAdd = group.status === 'draft' || group.status === 'incomplete'
              return (
                <div className="stack stack-xs" key={group.id}>
                  <div className="row row-wrap gap-xs">
                    <span className="eyebrow">
                      {group.reference}
                      {group.learner ? ` · ${group.learner}` : ''} · {filed.length} filed
                    </span>
                    {canAdd && (
                      <ButtonLink variant="ghost" size="xs" to={`../applications/${group.id}`}>
                        <Icon name="plus" size={13} />
                        Upload here
                      </ButtonLink>
                    )}
                  </div>
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
                                {doc.original_filename || <span className="subtle">No file yet</span>}
                              </span>
                              {doc.submitted_at && (
                                <span>Uploaded {formatDateTime(doc.submitted_at)}</span>
                              )}
                              {doc.verified_at && (
                                <span>Verified {formatDateTime(doc.verified_at)}</span>
                              )}
                            </div>
                            {doc.review_note && (
                              <p className="subtle">Reviewer note: {doc.review_note}</p>
                            )}
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

      <p className="subtle">
        Read only — the Registrar records each decision. Attachments are uploaded from the
        application itself while it is still open.
      </p>

      <DocumentViewerModal
        open={Boolean(viewing)}
        doc={viewing}
        applicationId={viewing?.applicationId}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}
