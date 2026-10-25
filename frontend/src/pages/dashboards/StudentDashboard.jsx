import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import NotificationsCard from '../../components/dashboard/NotificationsCard'
import RequirementsExplorer from '../../components/requirements/RequirementsExplorer'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { attendanceStatus, formatDate, TODAY_LABEL } from '../../utils/format'

function DashboardSkeleton() {
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

export default function StudentDashboard() {
  const { user } = useAuth()
  const summary = useFetch('/dashboard/')
  const records = useFetch('/attendance/records/', { list: true })

  const firstName = user.fullName.split(' ')[0] || user.fullName

  if (summary.loading && !summary.data) return <DashboardSkeleton />
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
  const recentRecords = (records.data || []).slice(0, 5)

  return (
    <div className="dashboard">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${data.section || 'Student'} · ${TODAY_LABEL}`}
      />

      <div className="grid grid-4">
        <StatCard
          label="Requirements"
          value={data.total_requirements ?? '—'}
          hint="Assigned to your section"
        />
        <StatCard
          label="Overdue"
          value={data.overdue ?? '—'}
          tone={data.overdue > 0 ? 'red' : 'default'}
          hint="Past deadline, not submitted"
        />
        <StatCard
          label="Awaiting check"
          value={data.awaiting_verification ?? '—'}
          tone="amber"
          hint="Submitted, pending verification"
        />
        <StatCard
          label="Verified"
          value={data.verified ?? '—'}
          tone="green"
          hint="Accepted by your teacher"
        />
      </div>

      <div className="two-col">
        <div className="stack stack-md">
          <section className="card">
            <header className="card-header">
              <h2>Your requirements</h2>
              <Link className="btn btn-sm btn-ghost" to="/student/requirements">
                View all
              </Link>
            </header>
            <div className="card-body">
              <RequirementsExplorer
                scope="student"
                limit={6}
                showFilter
              />
            </div>
          </section>

          <Card
            title="Recent attendance"
            loading={records.loading}
            error={records.error}
            onRetry={records.reload}
            empty={
              !records.loading && recentRecords.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No attendance recorded yet"
                  message="Your attendance for each class will be listed here once teachers start recording it."
                />
              ) : null
            }
            flush
          >
            <div className="table-wrap">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Subject</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRecords.map((record) => (
                    <tr key={record.id}>
                      <td data-label="Date">
                        {formatDate(record.session_detail?.date)}
                      </td>
                      <td data-label="Class" className="cell-main">
                        {record.session_detail?.section_name || '—'}
                      </td>
                      <td data-label="Subject">
                        {record.session_detail?.subject_name || '—'}
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={attendanceStatus(record.status).label}
                          tone={attendanceStatus(record.status).tone}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="stack stack-md">
          <AttendanceSummaryCard attendance={data.attendance} />
          <SubmissionStatusCard data={data} />
          <NotificationsCard />
        </div>
      </div>
    </div>
  )
}

function SubmissionStatusCard({ data }) {
  const total = data.total_requirements || 1
  const rows = [
    {
      label: 'Returned for revision',
      value: data.returned,
      tone: 'red',
      total,
    },
    {
      label: 'Awaiting verification',
      value: data.awaiting_verification,
      tone: 'amber',
      total,
    },
    { label: 'Verified', value: data.verified, tone: 'green', total },
  ]
  return (
    <Card title="Submission status">
      <SummaryRows rows={rows} />
      <p className="subtle" style={{ marginTop: 10 }}>
        Returned work needs a revision before the deadline —{' '}
        <Link to="/student/submissions">open my submissions</Link>.
      </p>
    </Card>
  )
}
