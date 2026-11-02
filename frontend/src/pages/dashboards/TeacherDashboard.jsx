import { useEffect, useMemo, useState } from 'react'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import NotificationsCard from '../../components/dashboard/NotificationsCard'
import QuickActions from '../../components/dashboard/QuickActions'
import ButtonLink from '../../components/ButtonLink'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import CardSkeleton from '../../components/loading/CardSkeleton'
import StatCardSkeleton from '../../components/loading/StatCardSkeleton'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import {
  deadlineInfo,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTime,
  initials,
  TODAY_FULL_LABEL,
} from '../../utils/format'
import { greeting } from '../../utils/classes'
import {
  buildDeadlineRows,
  buildSubmissionOverview,
  buildTeachingSchedule,
  buildTodayAttendance,
  buildVerificationQueue,
  activityMeta,
  classLink,
} from '../../utils/teacherDashboard'
import './TeacherDashboard.css'

/** Slot clock state, in the teacher's words. */
const SLOT_STATE = {
  now: { label: 'In session', tone: 'green' },
  finished: { label: 'Finished', tone: 'neutral' },
  upcoming: { label: 'Upcoming', tone: 'blue' },
  scheduled: { label: 'Scheduled', tone: 'neutral' },
}

/** Submission statuses in overview order, with the bar segment each owns. */
const OVERVIEW_ROWS = [
  ['pending', 'Awaiting verification', 'amber'],
  ['verified', 'Verified', 'green'],
  ['returned', 'Returned for revision', 'red'],
]

function shortDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "7:30 AM – 8:30 AM" from the schedule's naive school times. */
function slotTime(slot) {
  const start = new Date(`${slot.date}T${slot.start}:00`)
  const end = new Date(`${slot.date}T${slot.end}:00`)
  return `${formatTime(start)} – ${formatTime(end)}`
}

/** What the class's attendance row looks like right now. */
function attendanceNote(slot, sessionFailed) {
  if (sessionFailed) return 'Attendance status unavailable.'
  if (!slot.session) return 'No attendance session is open for this class yet.'
  if (slot.session.recorded === 0) {
    return `${slot.session.statusDisplay.toLowerCase()} — nobody marked yet.`
  }
  return `${formatNumber(slot.session.recorded)} marked · ${slot.session.statusDisplay}`
}

function attendanceAction(slot) {
  if (!slot.session) {
    return { label: 'Take attendance', variant: 'primary' }
  }
  if (slot.session.recorded === 0) {
    return { label: 'Take attendance', variant: 'primary' }
  }
  if (slot.session.status === 'completed') {
    return { label: 'View marks', variant: 'ghost' }
  }
  return { label: 'Finish marks', variant: 'secondary' }
}

function TeachingSchedule({ schedule, loading, error, onRetry, sessionFailed, hasClasses }) {
  const { today, next, hasSchedule } = schedule

  return (
    <Card
      className="dt-7"
      title="Today’s teaching schedule"
      loading={loading}
      error={error}
      onRetry={onRetry}
      action={
        <span className="row row-wrap gap-xs">
          <StatusBadge
            tone={today.length > 0 ? 'blue' : 'neutral'}
            label={
              today.length === 0
                ? 'No class today'
                : `${formatNumber(today.length)} ${today.length === 1 ? 'class' : 'classes'} today`
            }
          />
          <ButtonLink variant="ghost" size="sm" to="/teacher/attendance">
            All classes
          </ButtonLink>
        </span>
      }
    >
      {today.length === 0 && (
        <EmptyState
          icon="calendar"
          title={
            !hasClasses
              ? 'No classes assigned yet'
              : hasSchedule
                ? 'No classes scheduled today'
                : 'No timetable on file'
          }
          message={
            !hasClasses
              ? 'Your sections appear here once an administrator assigns a subject to you.'
              : hasSchedule
                ? 'Nothing is timetabled for today. Your next class is listed below.'
                : 'A timetable is set on Class Schedules. Until then, attendance opens from each class.'
          }
          action={
            hasClasses ? (
              <ButtonLink variant="secondary" size="sm" to="/teacher/classes">
                My classes
              </ButtonLink>
            ) : null
          }
        />
      )}

      {today.length > 0 && (
        <ul className="dt-slots">
          {today.map((slot) => {
            const state = SLOT_STATE[slot.state]
            const action = attendanceAction(slot)
            // A class that has already ended with nothing marked is the one
            // thing on this card the teacher still owes somebody.
            const needsAttention = slot.state === 'finished' && !slot.attendanceRecorded
            return (
              <li key={slot.id} className={`dt-slot${needsAttention ? ' is-attention' : ''}`}>
                <div className="dt-slot-when">
                  <span className="dt-slot-time">{slotTime(slot)}</span>
                  <StatusBadge tone={state.tone} label={state.label} />
                </div>
                <div className="dt-slot-main">
                  <p className="dt-slot-class">{slot.subject}</p>
                  <p className="dt-slot-section">{slot.section}</p>
                  <p className="dt-slot-meta">
                    {slot.room ? `${slot.room} · ` : ''}
                    {attendanceNote(slot, sessionFailed)}
                  </p>
                </div>
                <div className="dt-slot-action">
                  <ButtonLink variant={action.variant} size="sm" to={classLink('attendance', slot.assignmentId)}>
                    {action.label}
                  </ButtonLink>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {next.length > 0 && (
        <>
          <p className="dt-sub-label">Next classes</p>
          <ul className="dt-next">
            {next.map((slot) => (
              <li key={`${slot.id}-${slot.date}`} className="dt-next-row">
                <span className="dt-next-when">
                  <Icon name="clock" size={13} />
                  {slot.dayOffset === 1 ? 'Tomorrow' : shortDateKey(slot.date)}
                </span>
                <span className="dt-next-class">
                  {slot.subject} · {slot.section}
                </span>
                <span className="dt-next-time">{slotTime(slot)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function VerificationQueue({ queue, loading, error, onRetry }) {
  return (
    <Card
      className="dt-7"
      title="Requirements awaiting verification"
      loading={loading}
      error={error}
      onRetry={onRetry}
      action={
        <span className="row row-wrap gap-xs">
          {queue.total > 0 && (
            <StatusBadge
              tone="amber"
              label={`${formatNumber(queue.total)} ${queue.total === 1 ? 'submission' : 'submissions'} waiting`}
            />
          )}
          <ButtonLink variant="ghost" size="sm" to="/teacher/review">
            Open review
          </ButtonLink>
        </span>
      }
    >
      {queue.rows.length === 0 ? (
        <EmptyState
          icon="checkDouble"
          title="You’re all caught up"
          message="No submission is waiting for your verification right now."
        />
      ) : (
        <ul className="dt-queue">
          {queue.rows.map((row) => (
            <li key={row.id} className={`dt-queue-row${row.pastDeadline ? ' is-attention' : ''}`}>
              <span className="dt-avatar" aria-hidden="true">
                {initials(row.studentName)}
              </span>
              <div className="dt-row-main">
                <p className="dt-row-title">{row.studentName}</p>
                <p className="dt-row-sub">{row.requirementTitle}</p>
                <p className="dt-row-meta">
                  {row.subject ? `${row.subject} · ${row.section}` : row.section || 'Your class'} ·{' '}
                  {row.submittedAt ? `submitted ${formatRelative(row.submittedAt)}` : 'no submit time'}
                  {row.waitingDays > 2 ? ` · waiting ${row.waitingDays} days` : ''}
                </p>
              </div>
              <div className="dt-row-side">
                {row.pastDeadline && <StatusBadge tone="red" label="Past deadline" />}
                <ButtonLink variant="primary" size="sm" to={row.reviewHref}>
                  Review
                </ButtonLink>
              </div>
            </li>
          ))}
          {queue.total > queue.rows.length && (
            <li className="dt-more">
              {formatNumber(queue.total - queue.rows.length)} more waiting in the review queue.
            </li>
          )}
        </ul>
      )}
    </Card>
  )
}

function SubmissionOverview({ overview }) {
  const rows = OVERVIEW_ROWS.map(([key, label, tone]) => ({
    label,
    value: overview[key],
    tone,
    total: overview.onRecord,
    showPercent: true,
  })).filter((row) => row.value > 0)

  return (
    <Card
      className="dt-5"
      title="Submission overview"
      action={
        <ButtonLink variant="ghost" size="sm" to="/teacher/requirements">
          Requirements
        </ButtonLink>
      }
    >
      {overview.onRecord === 0 ? (
        <EmptyState
          icon="inbox"
          title="No submissions yet"
          message="Work your students turn in is counted here as it arrives."
        />
      ) : (
        <>
          <p className="dt-total">
            <span className="dt-total-value">{formatNumber(overview.onRecord)}</span>
            <span className="dt-total-label">
              {overview.onRecord === 1 ? 'submission' : 'submissions'} handed in
            </span>
          </p>
          <div
            className="dt-stack"
            role="img"
            aria-label={rows.map((row) => `${row.label}: ${row.value}`).join(', ')}
          >
            {rows.map((row) => (
              <span
                key={row.label}
                className={`dt-seg dt-seg-${row.tone}`}
                style={{ flexGrow: row.value }}
                title={`${row.label}: ${row.value}`}
              />
            ))}
          </div>
          <SummaryRows rows={rows} />
          {overview.overdue > 0 && (
            <p className="subtle dt-note">
              {formatNumber(overview.overdue)} past their deadline without work on record.
            </p>
          )}
          {overview.outstanding > 0 && (
            <p className="subtle dt-note">
              {formatNumber(overview.outstanding)} requirement
                {overview.outstanding === 1 ? '' : 's'} still showing nothing handed in.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function UpcomingDeadlines({ deadlines }) {
  return (
    <Card
      className="dt-7"
      title="Upcoming deadlines"
      action={
        deadlines.length > 0 && (
          <StatusBadge tone="neutral" label={`${formatNumber(deadlines.length)} next`} />
        )
      }
    >
      {deadlines.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No upcoming deadlines"
          message="Requirements you post appear here, closest due date first."
        />
      ) : (
        <ul className="dt-deadlines">
          {deadlines.map((item) => {
            const info = deadlineInfo(item.deadline)
            const isSoon = info.tone !== 'neutral'
            return (
              <li key={item.id} className={`dt-deadline${isSoon ? ` is-${info.tone}` : ''}`}>
                <div className="dt-row-main">
                  <p className="dt-row-title">{item.title}</p>
                  <p className="dt-row-meta">
                    {item.subject} · {item.section} · due {formatDateTime(item.deadline)}
                  </p>
                </div>
                <div className="dt-row-side">
                  <StatusBadge tone={info.tone} label={info.label} />
                  <ButtonLink variant="ghost" size="sm" to={item.href}>
                    Open class
                  </ButtonLink>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function ActivityFeed({ activity }) {
  return (
    <Card
      className="dt-12"
      title="Recent class activity"
      action={
        activity.length > 0 && (
          <StatusBadge tone="neutral" label={`${formatNumber(activity.length)} updates`} />
        )
      }
    >
      {activity.length === 0 ? (
        <EmptyState
          icon="activity"
          title="No class activity yet"
          message="Class activities will appear here as submissions and verifications move."
        />
      ) : (
        <ul className="dt-feed">
          {activity.map((item) => {
            const meta = activityMeta(item.status)
            return (
              <li key={item.id} className="dt-feed-row">
                <span className={`dt-act-icon${meta.tone ? ` ${meta.tone}` : ''}`} aria-hidden="true">
                  <Icon name={meta.icon} size={15} />
                </span>
                <div className="dt-row-main">
                  <p className="dt-row-title">
                    {item.student_name} — {item.requirement_title}
                  </p>
                  <p className="dt-row-meta">
                    {meta.label} · {formatRelative(item.updated_at)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/**
 * Teacher dashboard.
 *
 * One aggregate call (`/dashboard/`) carries the server-side figures; the
 * day-shaped widgets need rows Django does not summarise per day — the weekly
 * timetable, this day's attendance sessions, the class each requirement belongs
 * to — and those come from the same teacher-scoped list endpoints the class
 * workspace already reads. Nothing here is invented: an absent figure renders
 * as an em dash, never as zero.
 */
export default function TeacherDashboard() {
  const { user } = useAuth()

  const summary = useFetch('/dashboard/')
  const schedules = useFetch('/schedules/', { list: true })
  const sessions = useFetch('/attendance/sessions/', { list: true })
  const requirements = useFetch('/requirements/', { list: true })
  const pending = useFetch('/submissions/', { list: true, params: { status: 'submitted' } })
  const schoolYears = useFetch('/school-years/', { list: true, params: { is_active: true } })

  // A class slot's state is a clock question, so the page re-reads the clock
  // every minute instead of letting "Upcoming" sit there after the bell.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const firstName = (user?.fullName || '').split(' ')[0]

  const teachingSchedule = useMemo(
    () =>
      buildTeachingSchedule({
        schedules: schedules.data || [],
        sessions: sessions.data || [],
        now,
      }),
    [schedules.data, sessions.data, now]
  )

  const todayAttendance = useMemo(
    () => buildTodayAttendance({ sessions: sessions.data || [], now }),
    [sessions.data, now]
  )

  const queue = useMemo(
    () => buildVerificationQueue({ submissions: pending.data || [], requirements: requirements.data || [], now }),
    [pending.data, requirements.data, now]
  )

  const deadlines = useMemo(
    () => buildDeadlineRows({ deadlines: summary.data?.upcoming_deadlines || [], requirements: requirements.data || [], now }),
    [summary.data, requirements.data, now]
  )

  if (summary.loading && !summary.data) {
    return (
      <>
        <span className="sr-only" role="status">
          Loading your dashboard…
        </span>
        <div className="dashboard dash-teacher" aria-hidden="true">
          <div className="skeleton dt-skeleton-hero" />
          <div className="quick-actions">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton dt-skeleton-action" key={i} />
            ))}
          </div>
          <div className="kpi-grid">
            {[0, 1, 2, 3].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="dt-grid">
            <CardSkeleton className="dt-7" />
            <CardSkeleton className="dt-5" />
            <CardSkeleton className="dt-7" />
            <CardSkeleton className="dt-5" />
            <CardSkeleton className="dt-7" />
            <CardSkeleton className="dt-5" />
            <CardSkeleton className="dt-12" />
          </div>
        </div>
      </>
    )
  }

  if (summary.error) {
    return (
      <ErrorMessage
        error={summary.error}
        title="Could not load your dashboard"
        onRetry={summary.reload}
      />
    )
  }

  const data = summary.data || {}
  const classes = data.classes || []
  const sections = new Set(classes.map((item) => item.section_id).filter(Boolean)).size
  const overview = buildSubmissionOverview(data.submission_status || {})
  const activity = data.recent_activity || []
  const attendance = data.attendance

  const rateValue =
    attendance && attendance.present_rate !== null && attendance.present_rate !== undefined
      ? `${attendance.present_rate}%`
      : '—'

  const requirementsLoading = requirements.loading && !requirements.data
  const requirementsFailed = Boolean(requirements.error)
  const activeRequirements = (requirements.data || []).filter(
    (item) => new Date(item.deadline) >= now
  ).length

  const schoolYear = schoolYears.data?.[0]?.label || null

  const subtitle =
    queue.total > 0
      ? `${formatNumber(queue.total)} ${queue.total === 1 ? 'submission' : 'submissions'} awaiting your verification${
          teachingSchedule.today.length
            ? ` · ${formatNumber(teachingSchedule.today.length)} ${
                teachingSchedule.today.length === 1 ? 'class' : 'classes'
              } today`
            : ''
        }.`
      : teachingSchedule.today.length
        ? `${formatNumber(teachingSchedule.today.length)} ${
            teachingSchedule.today.length === 1 ? 'class' : 'classes'
          } on your timetable today, and nothing awaits verification.`
        : 'Nothing awaits your verification, and no class is timetabled for today.'

  return (
    <div className="dashboard dash-teacher">
      <PageHeader
        className="dash-hero"
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        subtitle={subtitle}
      >
        <div className="dash-meta">
          <span className="role-chip">Teacher</span>
          <span className="dash-meta-item">
            <Icon name="calendar" size={14} />
            {TODAY_FULL_LABEL}
          </span>
          <span className="dash-meta-item">
            <Icon name="book" size={14} />
            {data.assigned_classes === null || data.assigned_classes === undefined
              ? 'Class load unavailable'
              : `${formatNumber(data.assigned_classes)} assigned ${
                  data.assigned_classes === 1 ? 'class' : 'classes'
                }`}
          </span>
          <span className="dash-meta-item">
            <Icon name="gradCap" size={14} />
            {schoolYear ? `School year ${schoolYear}` : 'No active school year'}
          </span>
        </div>
      </PageHeader>

      <QuickActions
        actions={[
          { label: 'Create new requirement', to: '/teacher/requirements', icon: 'plus', primary: true },
          { label: 'Record attendance', to: '/teacher/attendance', icon: 'calendar' },
          {
            label: 'Review submissions',
            to: '/teacher/review',
            icon: 'checkSquare',
          },
          { label: 'My classes', to: '/teacher/classes', icon: 'book' },
        ]}
      />

      <section className="kpi-grid" aria-label="Key metrics">
        <StatCard
          icon="book"
          label="Assigned classes"
          value={
            data.assigned_classes === null || data.assigned_classes === undefined
              ? '—'
              : formatNumber(data.assigned_classes)
          }
          to="/teacher/classes"
          hint={
            classes.length === 0
              ? 'No subject assigned to you yet'
              : `${formatNumber(sections)} ${sections === 1 ? 'section' : 'sections'} taught`
          }
        />
        {requirementsLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            icon="clipboard"
            label="Active requirements"
            value={requirementsFailed ? '—' : formatNumber(activeRequirements)}
            to="/teacher/requirements"
            hint={
              requirementsFailed
                ? 'Requirements could not be loaded.'
                : `${formatNumber(data.total_requirements ?? (requirements.data || []).length)} posted in total`
            }
          />
        )}
        <StatCard
          icon="inbox"
          label="Pending submissions"
          tone={data.pending_verification > 0 ? 'amber' : 'default'}
          value={
            data.pending_verification === null || data.pending_verification === undefined
              ? '—'
              : formatNumber(data.pending_verification)
          }
          to="/teacher/review"
          hint={
            data.pending_verification > 0
              ? 'Waiting for your verification'
              : 'Nothing waiting on you'
          }
        />
        <StatCard
          icon="checkCircle"
          label="Attendance rate"
          value={rateValue}
          to="/teacher/attendance"
          hint={
            attendance && attendance.total_records
              ? `${formatNumber(attendance.total_records)} records across your classes`
              : 'No attendance recorded yet'
          }
        />
      </section>

      <div className="dt-grid">
        <TeachingSchedule
          schedule={teachingSchedule}
          loading={schedules.loading && !schedules.data}
          error={schedules.error}
          onRetry={schedules.reload}
          sessionFailed={Boolean(sessions.error)}
          hasClasses={classes.length > 0}
        />

        <div className="dt-5">
          <AttendanceSummaryCard
            attendance={attendance}
            today={todayAttendance}
            title="Attendance snapshot"
            emptyMessage="Attendance data will appear after your first recorded session."
            emptyAction={
              <ButtonLink variant="secondary" size="sm" to="/teacher/attendance">
                Record attendance
              </ButtonLink>
            }
            link={
              <ButtonLink variant="ghost" size="sm" to="/teacher/attendance">
                Manage
              </ButtonLink>
            }
          />
          {sessions.loading && !sessions.data && (
            <p className="subtle dt-footnote">Loading today’s attendance marks…</p>
          )}
          {sessions.error && (
            <ErrorMessage
              compact
              error="Today’s attendance marks could not be loaded, so the figures below are all-time only."
              onRetry={sessions.reload}
            />
          )}
        </div>

        <VerificationQueue
          queue={queue}
          loading={pending.loading && !pending.data}
          error={pending.error}
          onRetry={pending.reload}
        />

        <SubmissionOverview overview={overview} />

        <UpcomingDeadlines deadlines={deadlines} />

        <div className="dt-5">
          <NotificationsCard limit={4} />
        </div>

        <ActivityFeed activity={activity} />
      </div>

      <p className="dt-source-note">
        Every figure comes from your own classes: counts of your assigned
        sections, the submissions waiting on you, and the attendance you have
        recorded. A figure with no data behind it shows an em dash instead.
      </p>
    </div>
  )
}
