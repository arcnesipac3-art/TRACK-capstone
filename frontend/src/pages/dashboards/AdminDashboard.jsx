import { Link } from 'react-router-dom'
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
import { formatCurrency, formatRelative, roleLabel, TODAY_LABEL } from '../../utils/format'

const SUBMISSION_ROWS = [
  ['submitted', 'Awaiting verification', 'amber'],
  ['verified', 'Verified', 'green'],
  ['returned', 'Returned for revision', 'red'],
  ['overdue', 'Overdue', 'red'],
]

/**
 * Administrator dashboard.
 *
 * Django returns only the modules this administrator is authorized for
 * (`data.blocks` — see `_admin_dashboard_payload`); a missing block means
 * "not authorized", never "no data", so every card, statistic and shortcut
 * here is gated on the same permission keys the sidebar uses. The legacy
 * top-level figures remain in the payload for full administrators.
 */
export default function AdminDashboard() {
  const { user, can } = useAuth()
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
  const blocks = data.blocks || {}
  const accounts = blocks.accounts
  const structure = blocks.structure
  const requirements = blocks.requirements
  const attendance = blocks.attendance
  const fees = blocks.fees
  const announcements = blocks.announcements
  const audit = blocks.audit
  const departments = blocks.departments

  /* Shortcuts — only the pages this administrator's keys unlock. */
  const quickActions = [
    { label: 'Manage users', to: '/admin/users', icon: 'users', perm: 'users.view' },
    { label: 'Sections & subjects', to: '/admin/sections', icon: 'layers', perm: 'structure.manage' },
    { label: 'All requirements', to: '/admin/requirements', icon: 'clipboard', perm: 'requirements.view' },
    { label: 'School attendance', to: '/admin/attendance', icon: 'calendar', perm: 'attendance.view' },
    { label: 'Fee dashboard', to: '/admin/fees', icon: 'creditCard', perm: 'fees.view' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone', perm: 'announcements.view' },
    { label: 'Departments & roles', to: '/admin/departments', icon: 'shield', perm: 'departments.view' },
    { label: 'Audit log', to: '/admin/audit-logs', icon: 'clock', perm: 'audit.view' },
  ].filter((action) => can(action.perm))

  /* Statistic cards, in module priority order. */
  const statCards = []
  if (accounts) {
    statCards.push(
      <StatCard key="students" label="Students" value={accounts.total_students} hint="Enrolled learner accounts" />,
      <StatCard key="teachers" label="Teachers" value={accounts.total_teachers}
        hint={structure ? `${structure.total_sections} sections on record` : 'Teaching accounts on record'} />,
      <StatCard key="parents" label="Parents" value={accounts.total_parents} hint="Linked guardian accounts" />
    )
  }
  if (requirements) {
    statCards.push(
      <StatCard key="requirements" label="Active requirements" value={requirements.active_requirements}
        hint={`${requirements.total_requirements} total · ${requirements.total_submissions} submissions`} />
    )
  }
  if (fees) {
    statCards.push(
      <StatCard key="fees" label="Fees collected" value={formatCurrency(fees.total_collected)}
        hint={`of ${formatCurrency(fees.total_assessed)} assessed · ${formatCurrency(fees.total_outstanding)} outstanding`} />
    )
  }
  if (structure) {
    statCards.push(
      <StatCard key="sections" label="Sections" value={structure.total_sections}
        hint={structure.active_school_year ? `Active year ${structure.active_school_year}` : 'No active school year'} />
    )
  }
  if (departments) {
    statCards.push(
      <StatCard key="departments" label="Departments" value={departments.total}
        hint={`${departments.active} active · ${departments.super_admins} super admins`} />
    )
  }
  if (announcements) {
    statCards.push(
      <StatCard key="announcements" label="Announcements" value={announcements.total}
        hint={announcements.pinned ? `${announcements.pinned} pinned` : 'Published on the feed'} />
    )
  }

  /* Left column: submissions · audit trail · announcements. */
  const counts = requirements?.submission_status || {}
  const countTotal = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1
  const hasSubmissionCounts = SUBMISSION_ROWS.some(([key]) => (counts[key] || 0) > 0) || (counts.none || 0) > 0
  const activity = audit?.recent_activity || []

  const left = []
  if (requirements) {
    left.push(
      <Card key="submissions" title="Submission status overview">
        {!hasSubmissionCounts ? (
          <EmptyState
            icon="file"
            title="No submissions yet"
            message="Status breakdowns appear once students start submitting work."
          />
        ) : (
          <SummaryRows
            rows={SUBMISSION_ROWS.filter(([key]) => (counts[key] || 0) > 0).map(([key, label, tone]) => ({
              label,
              value: counts[key] || 0,
              tone,
              total: countTotal,
              showPercent: true,
            }))}
          />
        )}
        <p className="subtle" style={{ marginTop: 10 }}>
          {requirements.total_submissions} submissions recorded in total.
          {counts.none ? ` · ${counts.none} with nothing submitted yet.` : ''}
        </p>
      </Card>
    )
  }
  if (audit) {
    left.push(
      <Card key="activity" title="Recent system activity">
        {activity.length === 0 ? (
          <EmptyState
            icon="activity"
            title="No recorded activity yet"
            message="Account, department and permission changes are written to the audit log and will be listed here."
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
        {can('audit.view') && (
          <p style={{ marginTop: 10 }}>
            <Link className="btn btn-sm btn-ghost" to="/admin/audit-logs">
              Open audit logs
            </Link>
          </p>
        )}
      </Card>
    )
  }
  if (announcements) {
    left.push(
      <Card
        key="announcements"
        title="Latest announcements"
        action={
          <Link className="btn btn-sm btn-ghost" to="/announcements">
            View all
          </Link>
        }
        empty={
          announcements.latest.length === 0 ? (
            <EmptyState
              icon="megaphone"
              title="No announcements yet"
              message="Published announcements show up here for every audience."
            />
          ) : null
        }
      >
        <div className="activity-list">
          {announcements.latest.map((item) => (
            <div className="activity-item" key={item.id} style={{ padding: '11px 0' }}>
              <span className="activity-dot" aria-hidden="true" />
              <div className="grow">
                <div className="ai-title">{item.title}</div>
                <div className="ai-meta">
                  {item.audience}
                  {item.published_at ? ` · ${formatRelative(item.published_at)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  /* Right column: attendance · accounts · notifications. */
  const right = []
  if (attendance) {
    right.push(
      <AttendanceSummaryCard key="attendance" attendance={attendance} title="School attendance summary" />
    )
  }
  if (accounts) {
    right.push(
      <Card key="accounts" title="Accounts">
        <SummaryRows
          rows={[
            { label: 'Students', value: accounts.total_students || 0, tone: 'blue', total: accounts.total_users || 1 },
            { label: 'Teachers', value: accounts.total_teachers || 0, tone: 'blue', total: accounts.total_users || 1 },
            { label: 'Parents', value: accounts.total_parents || 0, tone: 'blue', total: accounts.total_users || 1 },
          ].map((row) => ({ ...row, showPercent: true }))}
        />
        <p className="subtle" style={{ marginTop: 10 }}>
          {accounts.total_users} user accounts in total.
        </p>
      </Card>
    )
  }
  right.push(<NotificationsCard key="notifications" />)

  return (
    <div className="dashboard">
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle={`${roleLabel(user.role)} · ${TODAY_LABEL} · Kiwalan National High School`}
      >
        {user.isSuperAdmin && <span className="badge badge-red">Super Administrator</span>}
        {!user.isSuperAdmin && user.departments?.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {user.departments.map((dept) => (
              <span className="badge badge-blue" key={dept.id}>
                {dept.name}
              </span>
            ))}
          </span>
        )}
      </PageHeader>

      {quickActions.length > 0 && <QuickActions actions={quickActions} />}

      {statCards.length > 0 && <div className="grid grid-4">{statCards}</div>}

      {statCards.length === 0 && left.length === 0 && (
        <EmptyState
          icon="shield"
          title="No modules granted yet"
          message="Your departments do not carry any permissions yet — a Super Administrator can grant them under Departments & Roles."
        />
      )}

      {left.length > 0 ? (
        <div className="two-col">
          <div className="stack stack-md">{left}</div>
          <div className="stack stack-md">{right}</div>
        </div>
      ) : (
        <div className="stack stack-md">{right}</div>
      )}
    </div>
  )
}
