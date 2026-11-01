import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import { PanelSection } from '../layout/ContextPanel'
import { CtxRow, CtxSkeleton } from './contextParts'
import useFetch from '../../hooks/useFetch'
import { formatNumber } from '../../utils/format'

/**
 * Contextual column for the enrollment module (`/admin/enrollment/*`).
 *
 * Reads `/enrollment/dashboard/` — the same registrar payload the overview
 * screen uses, minus the school-year parameter, so the queue figures shown
 * here are the global counts and never claim a per-year scope the request
 * does not have. Section capacity is intentionally absent: it only exists on
 * the year-scoped request the overview screen itself already renders, and
 * duplicating that guess here would show numbers that may not match the year
 * the registrar picked on screen.
 */
export default function EnrollmentContextPanel() {
  const stats = useFetch('/enrollment/dashboard/')

  if (stats.error) {
    return (
      <ErrorMessage error={stats.error} title="Enrollment context unavailable" onRetry={stats.reload} />
    )
  }

  const loading = stats.loading && !stats.data
  const data = stats.data || {}

  const pipeline = [
    { key: 'submitted', label: 'Submitted', icon: 'inbox', tone: '' },
    { key: 'under_review', label: 'In review', icon: 'eye', tone: 'amber' },
    { key: 'resubmitted', label: 'Resubmitted', icon: 'refresh', tone: '' },
    { key: 'awaiting_corrections', label: 'Awaiting corrections', icon: 'undo', tone: 'red' },
    { key: 'waitlisted', label: 'Waitlisted', icon: 'clock', tone: '' },
    { key: 'accepted', label: 'Accepted', icon: 'check', tone: 'green' },
    { key: 'enrolled', label: 'Enrolled', icon: 'gradCap', tone: 'green' },
  ]

  return (
    <>
      <PanelSection title="Application pipeline">
        {loading ? (
          <CtxSkeleton rows={4} />
        ) : (
          <div className="ctx-rows">
            {pipeline.map((row) => (
              <CtxRow
                key={row.key}
                icon={row.icon}
                tone={row.tone}
                label={row.label}
                value={formatNumber(data[row.key] || 0)}
              />
            ))}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Review reminders">
        {loading ? (
          <CtxSkeleton rows={2} />
        ) : (
          <div className="ctx-rows">
            <CtxRow
              icon="userPlus"
              label="Drafts in progress"
              value={formatNumber(data.drafts || 0)}
            />
            <CtxRow
              icon="file"
              label="Documents pending"
              value={formatNumber(data.pending_documents || 0)}
            />
            <CtxRow
              icon="calendar"
              label="Periods open now"
              value={formatNumber(data.open_periods || 0)}
            />
          </div>
        )}
      </PanelSection>

      {!loading && !data.total_applications ? (
        <EmptyState
          icon="inbox"
          title="No applications yet"
          message="The pipeline fills up as soon as the first application is submitted."
        />
      ) : null}
    </>
  )
}
