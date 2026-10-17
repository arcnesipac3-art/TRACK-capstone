import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import NotificationsCard from '../../components/dashboard/NotificationsCard'
import QuickActions from '../../components/dashboard/QuickActions'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { formatRelative, roleLabel, TODAY_LABEL } from '../../utils/format'

const SUBMISSION_ROWS = [
  ['submitted', 'Awaiting verification', 'amber'],
  ['verified', 'Verified', 'green'],
  ['returned', 'Returned for revision', 'red'],
  ['overdue', 'Overdue', 'red'],
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const summary = useFetch('/dashboard/')

  const firstName = (user.fullName || '').split(' ')[0] || user.fullName

  if (summary.loading && !summary.data) {
    return (
      <div className="dashboard" aria-hidden="true">
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton skeleton-stat" key={i} />
          ))}
        </div>
        <div className="two-col">
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
        </div>
      </div>
    )
  }

  if (summary.error) {
    return (
      <ErrorMessage
        error={summary.error}
        title="Could not load the dashboard"
        onRetry={summary.reload}
      />
    )
  }

  const data = summary.data || {}
  const counts = data.submission_status || {}
  const countTotal =
    Object.values(counts).reduce((sum, value) => sum + value, 0) || 1
  const activity = data.recent_activity || []

  return (
    <div className="dashboard">
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle={`${roleLabel(user.role)} · ${TODAY_LABEL} · Kiwalan National High School`}
      />

      <QuickActions
        actions={[
          { label: 'Manage users', to: '/admin/users', icon: 'users' },
          { label: 'Sections & subjects', to: '/admin/sections', icon: 'layers' },
          { label: 'All requirements', to: '/admin/requirements', icon: 'clipboard' },
          { label: 'School attendance', to: '/admin/attendance', icon: 'calendar' },
          { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
        ]}
      />

      <div className="grid grid-4">
        <StatCard
          label="Students"
          value={data.total_students ?? '—'}
          hint="Enrolled learner accounts"
        />
        <StatCard
          label="Teachers"
          value={data.total_teachers ?? '—'}
          hint={`${data.total_sections ?? 0} sections on record`}
        />
        <StatCard
          label="Parents"
          value={data.total_parents ?? '—'}
          hint="Linked guardian accounts"
        />
        <StatCard
          label="Active requirements"
          value={data.active_requirements ?? '—'}
          hint={`${data.total_requirements ?? 0} total · ${data.total_submissions ?? 0} submissions`}
        />
      </div>

      <div className="two-col">
        <div className="stack stack-md">
          <Card title="Submission status overview">
            {countTotal === 1 && !data.total_submissions ? (
              <EmptyState
                icon="file"
                title="No submissions yet"
                message="Status breakdowns appear once students start submitting work."
              />
            ) : (
              <SummaryRows
                rows={SUBMISSION_ROWS.filter(
                  ([key]) => (counts[key] || 0) > 0
                ).map(([key, label, tone]) => ({
                  label,
                  value: counts[key] || 0,
                  tone,
                  total: countTotal,
                  showPercent: true,
                }))}
              />
            )}
            <p className="subtle" style={{ marginTop: 10 }}>
              {data.total_submissions ?? 0} submissions recorded in total.
            </p>
          </Card>

          <Card title="Recent system activity">
            {activity.length === 0 ? (
              <EmptyState
                icon="activity"
                title="No recorded activity yet"
                message="Sign-ins and account changes are written to the audit log and will be listed here."
              />
            ) : (
              <div className="activity-list">
                {activity.map((entry) => (
                  <div className="activity-item" key={entry.id} style={{ padding: '11px 0' }}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div className="grow">
                      <div className="ai-title">
                        {entry.action}
                        {entry.actor ? ` · ${entry.actor}` : ''}
                      </div>
                      <div className="ai-meta">
                        {entry.description || '—'} · {formatRelative(entry.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack stack-md">
          <AttendanceSummaryCard
            attendance={data.attendance}
            title="School attendance summary"
          />

          <Card title="Accounts">
            <SummaryRows
              rows={[
                { label: 'Students', value: data.total_students || 0, tone: 'blue', total: data.total_users || 1 },
                { label: 'Teachers', value: data.total_teachers || 0, tone: 'blue', total: data.total_users || 1 },
                { label: 'Parents', value: data.total_parents || 0, tone: 'blue', total: data.total_users || 1 },
              ].map((row) => ({ ...row, showPercent: true }))}
            />
            <p className="subtle" style={{ marginTop: 10 }}>
              {data.total_users ?? 0} user accounts in total.
            </p>
          </Card>

          <NotificationsCard />
        </div>
      </div>
    </div>
  )
}
