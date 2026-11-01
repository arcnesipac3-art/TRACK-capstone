import { Link } from 'react-router-dom'
import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import NotificationsCard from '../dashboard/NotificationsCard'
import { PanelSection } from '../layout/ContextPanel'
import { CtxRow, CtxSkeleton } from './contextParts'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { formatCurrency, formatDate, formatNumber } from '../../utils/format'

/**
 * Contextual column for the administrator dashboard.
 *
 * Everything here comes from the same permission-gated payloads the dashboard
 * center already renders (`/dashboard/` blocks, `/enrollment/dashboard/`),
 * reframed as a pending-work checklist rather than a second copy of the KPI
 * tiles. The "Upcoming events" block the layout spec sketches has no events
 * endpoint behind it in TRACK, so it is deliberately not fabricated here.
 *
 * Notifications reuse `NotificationsCard`, which reads the shell's shared
 * fetch; the card itself was removed from the dashboard center so the two
 * columns never show the same feed twice.
 */
export default function AdminContextPanel() {
  const { can } = useAuth()
  const summary = useFetch('/dashboard/')
  const enrollment = useFetch('/enrollment/dashboard/', {
    enabled: can('enrollment.view'),
  })
  const schoolYears = useFetch('/school-years/', {
    list: true,
    params: { is_active: true },
  })

  if (summary.error) {
    return (
      <ErrorMessage
        error={summary.error}
        title="Context unavailable"
        onRetry={summary.reload}
      />
    )
  }

  const loading = summary.loading && !summary.data
  const blocks = (summary.data || {}).blocks || {}
  const requirements = blocks.requirements
  const attendanceToday = blocks.attendance_today
  const fees = blocks.fees
  const activeYear = (schoolYears.data || [])[0]

  /* Checklist rows, in the order an administrator triages them. */
  const tasks = []
  if (requirements) {
    if (requirements.awaiting_verification) {
      tasks.push(
        <CtxRow
          key="verify"
          icon="clipboard"
          tone="amber"
          label="Submissions to verify"
          value={formatNumber(requirements.awaiting_verification)}
          to="/admin/requirements"
        />
      )
    }
    if (requirements.submission_status?.overdue) {
      tasks.push(
        <CtxRow
          key="overdue"
          icon="clock"
          tone="red"
          label="Overdue submissions"
          value={formatNumber(requirements.submission_status.overdue)}
          to="/admin/requirements"
        />
      )
    }
  }
  if (can('enrollment.view')) {
    if (enrollment.loading && !enrollment.data) {
      tasks.push(<CtxSkeleton key="enroll-loading" rows={2} />)
    } else if (enrollment.error) {
      tasks.push(
        <CtxRow
          key="enroll-error"
          icon="info"
          tone="red"
          label="Enrollment figures unavailable"
          value="—"
        />
      )
    } else if (enrollment.data) {
      const stats = enrollment.data
      if (stats.under_review) {
        tasks.push(
          <CtxRow
            key="review"
            icon="userPlus"
            tone="amber"
            label="Applications in review"
            value={formatNumber(stats.under_review)}
            to="/admin/enrollment/applications"
          />
        )
      }
      if (stats.awaiting_corrections) {
        tasks.push(
          <CtxRow
            key="corrections"
            icon="undo"
            tone="red"
            label="Corrections requested"
            value={formatNumber(stats.awaiting_corrections)}
            to="/admin/enrollment/applications"
          />
        )
      }
      if (stats.pending_documents) {
        tasks.push(
          <CtxRow
            key="documents"
            icon="file"
            label="Documents to review"
            value={formatNumber(stats.pending_documents)}
            to="/admin/enrollment/overview"
          />
        )
      }
    }
  }
  if (fees && fees.total_outstanding > 0) {
    tasks.push(
      <CtxRow
        key="fees"
        icon="creditCard"
        tone="amber"
        label="Fee balance outstanding"
        value={formatCurrency(fees.total_outstanding)}
        to="/admin/fees"
      />
    )
  }
  if (attendanceToday && attendanceToday.total_records > 0) {
    const absent = attendanceToday.by_status?.absent || 0
    if (absent) {
      tasks.push(
        <CtxRow
          key="absent"
          icon="info"
          tone="red"
          label="Marked absent today"
          value={formatNumber(absent)}
          to="/admin/attendance"
        />
      )
    }
  }

  return (
    <>
      <PanelSection
        title="School year"
        action={
          <Link className="ctx-link" to="/admin/settings">
            Settings
          </Link>
        }
      >
        {schoolYears.loading && !schoolYears.data ? (
          <CtxSkeleton />
        ) : schoolYears.error ? (
          <ErrorMessage
            error={schoolYears.error}
            title="School year unavailable"
            onRetry={schoolYears.reload}
          />
        ) : activeYear ? (
          <div className="ctx-year">
            <div className="ctx-year-label">{activeYear.label}</div>
            <div className="ctx-year-meta">
              {formatDate(activeYear.start_date)} – {formatDate(activeYear.end_date)}
            </div>
            <div className="ctx-year-meta">
              {formatNumber(activeYear.section_count)} sections ·{' '}
              {formatNumber(activeYear.subject_count)} subjects
            </div>
          </div>
        ) : (
          <EmptyState
            icon="calendar"
            title="No active school year"
            message="Activate a school year to anchor dates and fee assessments."
          />
        )}
      </PanelSection>

      <PanelSection title="Pending tasks">
        {loading ? (
          <CtxSkeleton rows={3} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Nothing pending"
            message="No verification, enrollment or attendance work is waiting in the modules you can see."
          />
        ) : (
          <div className="ctx-rows">{tasks}</div>
        )}
      </PanelSection>

      {/* The card carries its own "Recent notifications" header, so it is
          placed directly rather than wrapped in another section title. */}
      <NotificationsCard limit={4} />
    </>
  )
}
