import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import { PanelSection } from '../layout/ContextPanel'
import { CtxRow, CtxSkeleton } from './contextParts'
import useFetch from '../../hooks/useFetch'
import { attendanceStatus, formatNumber } from '../../utils/format'

/**
 * Contextual column for the attendance screens (admin + teacher).
 *
 * `/attendance/sessions/` accepts no date filter and returns every session
 * with its nested records, so this panel is built from `/dashboard/` instead:
 * the admin payload carries a genuine today-scoped block
 * (`blocks.attendance_today`), while the teacher payload carries the
 * teacher-scoped term summary. A "recent sessions" list would mean pulling
 * the whole unfiltered session table a second time next to the page that
 * already does it — deliberately not done.
 */
export default function AttendanceContextPanel() {
  const summary = useFetch('/dashboard/')

  if (summary.error) {
    return (
      <ErrorMessage error={summary.error} title="Attendance context unavailable" onRetry={summary.reload} />
    )
  }

  const loading = summary.loading && !summary.data
  const data = summary.data || {}
  const isTeacher = data.role === 'teacher'
  const blocks = data.blocks || {}

  const today = blocks.attendance_today
  const term = isTeacher ? data.attendance : blocks.attendance

  const statuses = ['present', 'absent', 'late', 'excused']

  return (
    <>
      <PanelSection title={isTeacher ? 'Attendance (term)' : 'Today'}>
        {loading ? (
          <CtxSkeleton rows={3} />
        ) : isTeacher ? (
          term?.total_records ? (
            <div className="ctx-rows">
              <CtxRow
                icon="checkCircle"
                tone="green"
                label="Present rate"
                value={`${term.present_rate}%`}
              />
              {statuses.map((key) =>
                term.by_status?.[key] ? (
                  <CtxRow
                    key={key}
                    icon="clock"
                    label={attendanceStatus(key).label}
                    value={formatNumber(term.by_status[key])}
                  />
                ) : null
              )}
            </div>
          ) : (
            <EmptyState
              icon="checkCircle"
              title="Nothing recorded yet"
              message="Attendance figures appear once sessions for your classes are recorded."
            />
          )
        ) : !today?.total_records ? (
          <EmptyState
            icon="calendar"
            title="No attendance today"
            message="No records have been filed for today yet. Open the attendance screen to take a session."
          />
        ) : (
          <div className="ctx-rows">
            <CtxRow
              icon="checkCircle"
              tone="green"
              label="Present rate"
              value={today.present_rate === null ? '—' : `${today.present_rate}%`}
            />
            {statuses.map((key) => (
              <CtxRow
                key={key}
                icon="clock"
                tone={today.by_status?.[key] ? attendanceStatus(key).tone : ''}
                label={attendanceStatus(key).label}
                value={formatNumber(today.by_status?.[key] || 0)}
              />
            ))}
          </div>
        )}
      </PanelSection>

      {!isTeacher && term ? (
        <PanelSection title="School year to date">
          {term.total_records ? (
            <div className="ctx-rows">
              <CtxRow
                icon="activity"
                label="Records filed"
                value={formatNumber(term.total_records)}
              />
              <CtxRow
                icon="checkCircle"
                tone="green"
                label="Present rate"
                value={term.present_rate === null ? '—' : `${term.present_rate}%`}
              />
            </div>
          ) : (
            <p className="ctx-note">Nothing has been filed this school year yet.</p>
          )}
        </PanelSection>
      ) : null}
    </>
  )
}
