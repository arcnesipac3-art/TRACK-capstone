import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import CardSkeleton from '../../components/loading/CardSkeleton'
import StatCardSkeleton from '../../components/loading/StatCardSkeleton'
import NotificationsCard from '../../components/dashboard/NotificationsCard'
import QuickActions from '../../components/dashboard/QuickActions'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { formatDateTime, formatRelative, submissionStatus, TODAY_LABEL } from '../../utils/format'

const SUBMISSION_ROWS = [
  ['submitted', 'Awaiting verification', 'amber'],
  ['verified', 'Verified', 'green'],
  ['returned', 'Returned for revision', 'red'],
  ['overdue', 'Overdue', 'red'],
]

export default function TeacherDashboard() {
  const { user } = useAuth()
  const summary = useFetch('/dashboard/')
  const pending = useFetch('/submissions/', {
    list: true,
    params: { status: 'submitted' },
  })

  const firstName = (user.fullName || '').split(' ')[0] || user.fullName

  if (summary.loading && !summary.data) {
    return (
      <>
        <span className="sr-only" role="status">
          Loading your dashboard…
        </span>
        <div className="dashboard" aria-hidden="true">
          <div className="grid grid-4">
            {[0, 1, 2, 3].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="two-col">
            <CardSkeleton />
            <CardSkeleton />
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
  const statusCounts = data.submission_status || {}
  const statusTotal =
    Object.values(statusCounts).reduce((sum, value) => sum + value, 0) || 1
  const pendingItems = (pending.data || []).slice(0, 5)
  const upcoming = data.upcoming_deadlines || []
  const activity = data.recent_activity || []

  return (
    <div className="dashboard">
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle={`${data.assigned_classes ?? 0} assigned ${
          data.assigned_classes === 1 ? 'class' : 'classes'
        } · ${TODAY_LABEL}`}
      />

      <QuickActions
        actions={[
          { label: 'New requirement', to: '/teacher/requirements', icon: 'plus' },
          { label: 'Record attendance', to: '/teacher/attendance', icon: 'calendar' },
          { label: 'Review submissions', to: '/teacher/review', icon: 'checkSquare' },
          { label: 'My classes', to: '/teacher/classes', icon: 'book' },
        ]}
      />

      <div className="grid grid-4">
        <StatCard
          label="Assigned classes"
          value={data.assigned_classes ?? '—'}
          hint="Subjects and sections"
        />
        <StatCard
          label="Requirements"
          value={data.total_requirements ?? '—'}
          hint="Posted to your classes"
        />
        <StatCard
          label="Pending verification"
          value={data.pending_verification ?? '—'}
          tone={data.pending_verification > 0 ? 'amber' : 'default'}
          hint="Submissions waiting for you"
        />
        <StatCard
          label="Present rate"
          value={
            data.attendance?.present_rate !== null &&
            data.attendance?.present_rate !== undefined
              ? `${data.attendance.present_rate}%`
              : '—'
          }
          tone="green"
          hint="Across your recorded classes"
        />
      </div>

      <div className="two-col">
        <div className="stack stack-md">
          <Card
            title="Requirements awaiting verification"
            loading={pending.loading}
            error={pending.error}
            onRetry={pending.reload}
            empty={
              !pending.loading && pendingItems.length === 0 ? (
                <EmptyState
                  icon="checkSquare"
                  title="Nothing waiting"
                  message="Submitted work that needs your check will appear here."
                />
              ) : null
            }
            action={
              <Link className="btn btn-sm btn-ghost" to="/teacher/review">
                Open review
              </Link>
            }
          >
            <div className="activity-list">
              {pendingItems.map((submission) => {
                const meta = submissionStatus(submission.status)
                return (
                  <div className="activity-item" key={submission.id} style={{ padding: '11px 0' }}>
                    <div className="grow">
                      <div className="ai-title">{submission.student_name}</div>
                      <div className="ai-meta">
                        {submission.requirement_title} ·{' '}
                        {formatRelative(submission.submitted_at)}
                      </div>
                    </div>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                )
              })}
            </div>
          </Card>

          <Card
            title="Upcoming deadlines"
            empty={
              upcoming.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="No upcoming deadlines"
                  message="Requirements you create will be tracked here by due date."
                />
              ) : null
            }
          >
            <div className="activity-list">
              {upcoming.map((item) => (
                <div className="activity-item" key={item.id} style={{ padding: '11px 0' }}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div className="grow">
                    <div className="ai-title">{item.title}</div>
                    <div className="ai-meta">
                      {item.subject} · {item.section} · due{' '}
                      {formatDateTime(item.deadline)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="stack stack-md">
          <Card title="Submission overview">
            <SummaryRows
              rows={SUBMISSION_ROWS.filter(
                ([key]) => (statusCounts[key] || 0) > 0
              ).map(([key, label, tone]) => ({
                label,
                value: statusCounts[key] || 0,
                tone,
                total: statusTotal,
                showPercent: true,
              }))}
            />
            {statusCounts.none > 0 && (
              <p className="subtle" style={{ marginTop: 10 }}>
                {statusCounts.none} requirement
                {statusCounts.none === 1 ? '' : 's'} across your classes{' '}
                {statusCounts.none === 1 ? 'has' : 'have'} no submission yet.
              </p>
            )}
          </Card>

          <AttendanceSummaryCard attendance={data.attendance} />

          <Card
            title="Recent class activity"
            empty={
              activity.length === 0 ? (
                <EmptyState
                  icon="activity"
                  title="No activity yet"
                  message="Submissions from your students will be listed here."
                />
              ) : null
            }
          >
            <div className="activity-list">
              {activity.map((item) => (
                <div className="activity-item" key={item.id} style={{ padding: '11px 0' }}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div className="grow">
                    <div className="ai-title">
                      {item.student_name} — {item.requirement_title}
                    </div>
                    <div className="ai-meta">
                      {submissionStatus(item.status).label} ·{' '}
                      {formatRelative(item.updated_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <NotificationsCard />
        </div>
      </div>
    </div>
  )
}
