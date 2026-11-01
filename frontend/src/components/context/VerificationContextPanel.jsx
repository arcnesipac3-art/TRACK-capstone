import { Link } from 'react-router-dom'
import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import { PanelSection } from '../layout/ContextPanel'
import { CtxFeedRow, CtxRow, CtxSkeleton } from './contextParts'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { formatDate, formatNumber, formatRelative } from '../../utils/format'

/**
 * Contextual column for the requirements / submission-review screens.
 *
 * Pending verification comes from `/submissions/?status=submitted` — asked
 * one page at a time so the server's `count` is the real queue length, not a
 * client-side tally of a truncated list. Overdue and upcoming deadlines are
 * read from `/requirements/` fields the serializer already computes
 * (`is_overdue`, `deadline`), scoped the same way the endpoint scopes them
 * per role.
 */
export default function VerificationContextPanel() {
  const { user } = useAuth()
  const reviewPath = user?.role === 'teacher' ? '/teacher/review' : '/admin/requirements'
  const requirementsPath = user?.role === 'teacher' ? '/teacher/requirements' : '/admin/requirements'

  const pending = useFetch('/submissions/', {
    params: { status: 'submitted', page_size: 5 },
  })
  const requirements = useFetch('/requirements/', { list: true })

  const pendingPage = pending.data || {}
  const pendingItems = pendingPage.results || []
  const pendingCount = typeof pendingPage.count === 'number' ? pendingPage.count : pendingItems.length

  const reqList = requirements.data || []
  /* `is_overdue` is the server's clock comparison (Requirement.is_overdue),
     and the queryset is ordered by `deadline` ascending, so the panel needs
     no render-time `Date.now()` of its own. */
  const overdue = reqList.filter((item) => item.is_overdue)
  const upcoming = reqList.filter((item) => !item.is_overdue && item.deadline).slice(0, 3)

  return (
    <>
      <PanelSection
        title="Awaiting verification"
        action={
          pending.loading || pending.error ? null : (
            <Link className="ctx-link" to={reviewPath}>
              Review queue
            </Link>
          )
        }
      >
        {pending.loading && !pending.data ? (
          <CtxSkeleton rows={3} />
        ) : pending.error ? (
          <ErrorMessage error={pending.error} title="Queue unavailable" onRetry={pending.reload} />
        ) : pendingCount === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Queue is clear"
            message="No submissions are waiting for verification right now."
          />
        ) : (
          <>
            <div className="ctx-rows">
              <CtxRow
                icon="inbox"
                tone="amber"
                label="Submissions in queue"
                value={formatNumber(pendingCount)}
              />
            </div>
            <div className="ctx-feed">
              {pendingItems.slice(0, 4).map((item) => (
                <CtxFeedRow
                  key={item.id}
                  title={item.student_name || 'Student'}
                  meta={`${item.requirement_title || 'Requirement'} · ${formatRelative(
                    item.submitted_at
                  )}`}
                  to={reviewPath}
                />
              ))}
            </div>
          </>
        )}
      </PanelSection>

      <PanelSection title="Overdue & deadlines">
        {requirements.loading && !requirements.data ? (
          <CtxSkeleton rows={2} />
        ) : requirements.error ? (
          <ErrorMessage
            error={requirements.error}
            title="Requirements unavailable"
            onRetry={requirements.reload}
          />
        ) : (
          <>
            <div className="ctx-rows">
              <CtxRow
                icon="clock"
                tone={overdue.length ? 'red' : ''}
                label="Overdue requirements"
                value={formatNumber(overdue.length)}
                to={requirementsPath}
              />
            </div>
            {upcoming.length > 0 ? (
              <div className="ctx-feed">
                {upcoming.map((item) => (
                  <CtxFeedRow
                    key={item.id}
                    title={item.title}
                    meta={`Due ${formatDate(item.deadline)}${
                      item.section_name ? ` · ${item.section_name}` : ''
                    }`}
                  />
                ))}
              </div>
            ) : (
              <p className="ctx-note">No open deadlines on the horizon.</p>
            )}
          </>
        )}
      </PanelSection>
    </>
  )
}
