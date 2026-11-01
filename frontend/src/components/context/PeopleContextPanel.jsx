import { Link, useLocation } from 'react-router-dom'
import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import { PanelSection } from '../layout/ContextPanel'
import { CtxFeedRow, CtxRow, CtxSkeleton } from './contextParts'
import useFetch from '../../hooks/useFetch'
import { formatNumber, formatRelative } from '../../utils/format'

/** Which directory is open decides the headline count and its wording. */
const DIRECTORY = {
  '/admin/students': { key: 'total_students', label: 'Students' },
  '/admin/teachers': { key: 'total_teachers', label: 'Teachers' },
  '/admin/parents': { key: 'total_parents', label: 'Parents' },
}

/**
 * Contextual column for the people directories (`/admin/students` etc.).
 *
 * A "selected learner" summary is not possible yet: the directory is a table
 * with a per-row action menu, not a master-detail screen, and wiring a
 * selection into the shell would mean changing the already-approved page.
 * Until then the panel shows the directory-level snapshot the `/dashboard/`
 * accounts block really provides, plus recent account activity for anyone
 * holding `audit.view`.
 */
export default function PeopleContextPanel() {
  const location = useLocation()
  const directory = DIRECTORY[location.pathname] || DIRECTORY['/admin/students']
  const summary = useFetch('/dashboard/')

  if (summary.error) {
    return (
      <ErrorMessage error={summary.error} title="Directory context unavailable" onRetry={summary.reload} />
    )
  }

  const loading = summary.loading && !summary.data
  const data = summary.data || {}
  const blocks = data.blocks || {}
  const accounts = blocks.accounts
  const structure = blocks.structure
  const audit = blocks.audit

  const accountActivity = (audit?.recent_activity || [])
    .filter((entry) => String(entry.action).startsWith('user.'))
    .slice(0, 4)

  return (
    <>
      <PanelSection title="Directory snapshot">
        {loading ? (
          <CtxSkeleton rows={3} />
        ) : !accounts ? (
          /* No accounts block = this administrator's departments do not carry
             `users.view`; the directory itself would not have rendered, so
             this is a defensive line, not a normal state. */
          <EmptyState
            icon="shield"
            title="No school-wide figures"
            message="Your permissions scope the dashboard away from account totals."
          />
        ) : (
          <>
            <div className="ctx-figure">
              <div className="ctx-figure-value">{formatNumber(accounts[directory.key] || 0)}</div>
              <div className="ctx-figure-label">{directory.label} on record</div>
            </div>
            <div className="ctx-rows">
              <CtxRow
                icon="users"
                label="Accounts in total"
                value={formatNumber(accounts.total_users || 0)}
              />
              <CtxRow
                icon="gradCap"
                label="Students"
                value={formatNumber(accounts.total_students || 0)}
                to="/admin/students"
              />
              <CtxRow
                icon="book"
                label="Teachers"
                value={formatNumber(accounts.total_teachers || 0)}
                to="/admin/teachers"
              />
              <CtxRow
                icon="users"
                label="Parents"
                value={formatNumber(accounts.total_parents || 0)}
                to="/admin/parents"
              />
            </div>
            {structure ? (
              <p className="ctx-note">
                {formatNumber(structure.total_sections)} sections ·{' '}
                {formatNumber(structure.total_subjects)} subjects
                {structure.active_school_year ? ` · SY ${structure.active_school_year}` : ''}
              </p>
            ) : null}
          </>
        )}
      </PanelSection>

      {audit ? (
        <PanelSection
          title="Recent account activity"
          action={
            <Link className="ctx-link" to="/admin/audit-logs">
              Audit log
            </Link>
          }
        >
          {accountActivity.length === 0 ? (
            <p className="ctx-note">No account changes recorded recently.</p>
          ) : (
            <div className="ctx-feed">
              {accountActivity.map((entry) => (
                <CtxFeedRow
                  key={entry.id}
                  title={entry.description || entry.action}
                  meta={`${entry.actor ? `${entry.actor} · ` : ''}${formatRelative(entry.timestamp)}`}
                />
              ))}
            </div>
          )}
        </PanelSection>
      ) : null}
    </>
  )
}
