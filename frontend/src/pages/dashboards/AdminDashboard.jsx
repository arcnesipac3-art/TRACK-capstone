import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import NotificationsCard from '../../components/dashboard/NotificationsCard'
import QuickActions from '../../components/dashboard/QuickActions'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import {
  AUDIENCE_LABELS,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelative,
  roleLabel,
  TODAY_FULL_LABEL,
} from '../../utils/format'
import './AdminDashboard.css'

/** Requirements submission statuses in chart order; zero counts are dropped. */
const SUBMISSION_ROWS = [
  ['none', 'Not submitted', 'navy'],
  ['submitted', 'Awaiting verification', 'amber'],
  ['verified', 'Verified', 'green'],
  ['returned', 'Returned for revision', 'red'],
  ['overdue', 'Overdue', 'red'],
]

/**
 * Audit action key → icon, tone and human group. Django writes dotted keys
 * (`user.created`); the group line makes the feed scannable without leading
 * with the raw key. Deletions/archives get the only red/amber tones because
 * they are genuine status signals.
 */
function auditMeta(action = '') {
  const [domain, verb] = String(action).split('.')
  switch (domain) {
    case 'auth':
      return verb === 'password_reset'
        ? { icon: 'refresh', tone: 'amber', group: 'Authentication' }
        : { icon: 'checkCircle', tone: 'blue', group: 'Authentication' }
    case 'user':
      if (verb === 'created') {
        return { icon: 'userPlus', tone: 'blue', group: 'Account management' }
      }
      if (verb === 'deleted') {
        return { icon: 'trash', tone: 'red', group: 'Account management' }
      }
      return { icon: 'pencil', tone: 'blue', group: 'Account management' }
    case 'department':
      return verb === 'deleted'
        ? { icon: 'trash', tone: 'red', group: 'Departments' }
        : { icon: 'shield', tone: 'blue', group: 'Departments' }
    case 'permissions':
      return { icon: 'checkSquare', tone: 'blue', group: 'Permissions' }
    case 'fee_assessment':
      return verb === 'archived'
        ? { icon: 'creditCard', tone: 'amber', group: 'Finance' }
        : { icon: 'creditCard', tone: 'blue', group: 'Finance' }
    case 'fee_payment':
      return { icon: 'checkCircle', tone: 'green', group: 'Finance' }
    default:
      return { icon: 'activity', tone: '', group: 'System activity' }
  }
}

/**
 * Administrator dashboard.
 *
 * Django returns only the modules this administrator is authorized for
 * (`data.blocks` — see `_admin_dashboard_payload`); a missing block means
 * "not authorized", never "no data", so every card, statistic and shortcut
 * here is gated on the same permission keys the sidebar uses. Every figure
 * comes straight from the payload — counts, school-year labels, fee totals
 * and the notification unread count are all computed server-side.
 */
export default function AdminDashboard() {
  const { user, can } = useAuth()
  const summary = useFetch('/dashboard/')

  const firstName = (user.fullName || '').split(' ')[0] || user.fullName

  if (summary.loading && !summary.data) {
    return (
      <>
        <span className="sr-only" role="status">
          Loading dashboard…
        </span>
        <div className="dashboard dash-admin" aria-hidden="true">
          <div className="skeleton skeleton-hero" />
          <div className="stat-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div className="skeleton skeleton-stat" key={i} />
            ))}
          </div>
          <div className="two-col">
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-block" />
          </div>
        </div>
      </>
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
  const attendanceToday = blocks.attendance_today
  const fees = blocks.fees
  const announcements = blocks.announcements
  const audit = blocks.audit
  const departments = blocks.departments

  const schoolYear = structure?.active_school_year || fees?.active_school_year || null
  const unread = data.unread_notifications || 0
  const departmentsList = user.departments || []

  /* Shortcuts — only the pages this administrator's keys unlock. */
  const quickActions = [
    { label: 'Manage users', to: '/admin/users', icon: 'users', perm: 'users.view' },
    { label: 'Sections & subjects', to: '/admin/sections', icon: 'layers', perm: 'structure.manage' },
    { label: 'Student requirements', to: '/admin/requirements', icon: 'clipboard', perm: 'requirements.view' },
    { label: 'Attendance', to: '/admin/attendance', icon: 'calendar', perm: 'attendance.view' },
    { label: 'Fee management', to: '/admin/fees', icon: 'creditCard', perm: 'fees.view' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone', perm: 'announcements.view' },
    { label: 'Reports', to: '/admin/reports', icon: 'file', perm: 'reports.view' },
    { label: 'Departments & roles', to: '/admin/departments', icon: 'shield', perm: 'departments.view' },
    { label: 'Audit logs', to: '/admin/audit-logs', icon: 'clock', perm: 'audit.view' },
    { label: 'System settings', to: '/admin/settings', icon: 'settings', perm: 'settings.manage' },
  ].filter((action) => can(action.perm))

  /* Statistic cards — only blocks the server sent, in module order. */
  const statCards = []
  if (accounts) {
    statCards.push(
      <StatCard
        key="students"
        icon="gradCap"
        label="Students"
        value={formatNumber(accounts.total_students)}
        hint={accounts.total_students ? 'Enrolled learner accounts' : 'No student accounts yet'}
      />,
      <StatCard
        key="teachers"
        icon="book"
        label="Teachers"
        value={formatNumber(accounts.total_teachers)}
        hint={accounts.total_teachers ? 'Teaching accounts on record' : 'No teacher accounts yet'}
      />,
      <StatCard
        key="parents"
        icon="users"
        label="Parents"
        value={formatNumber(accounts.total_parents)}
        hint={accounts.total_parents ? 'Linked guardian accounts' : 'No parent accounts yet'}
      />
    )
  }
  if (structure) {
    statCards.push(
      <StatCard
        key="sections"
        icon="layers"
        label="Sections"
        value={formatNumber(structure.total_sections)}
        hint={
          structure.total_sections
            ? `${structure.total_subjects} subjects · ${structure.total_grade_levels} grade levels`
            : 'No sections yet'
        }
      />
    )
  }
  if (requirements) {
    statCards.push(
      <StatCard
        key="requirements"
        icon="clipboard"
        label="Active requirements"
        value={formatNumber(requirements.active_requirements)}
        hint={
          !requirements.total_requirements
            ? 'No requirements defined yet'
            : requirements.active_requirements
              ? `of ${requirements.total_requirements} total · ${requirements.total_submissions} submissions`
              : `of ${requirements.total_requirements} total · none with open deadlines`
        }
      />
    )
  }
  if (fees) {
    const assessed = fees.total_assessed || 0
    const outstanding = fees.total_outstanding || 0
    const collectedPct =
      assessed > 0 ? Math.round(((fees.total_collected || 0) / assessed) * 100) : null
    statCards.push(
      <StatCard
        key="assessed"
        icon="file"
        label="Fees assessed"
        value={formatCurrency(assessed)}
        hint={
          assessed
            ? `Published for ${fees.active_school_year || 'the active year'}`
            : 'No published assessments yet'
        }
      />,
      <StatCard
        key="collected"
        icon="checkCircle"
        tone="green"
        label="Fees collected"
        value={formatCurrency(fees.total_collected)}
        hint={
          assessed
            ? `${collectedPct}% of assessed`
            : 'No payments recorded yet'
        }
      />,
      <StatCard
        key="outstanding"
        icon="clock"
        tone={outstanding > 0 ? 'amber' : 'green'}
        label="Outstanding balance"
        value={formatCurrency(outstanding)}
        hint={outstanding > 0 ? 'Yet to be collected' : 'Fully collected'}
      />
    )
  }
  if (departments) {
    statCards.push(
      <StatCard
        key="departments"
        icon="shield"
        label="Departments"
        value={formatNumber(departments.total)}
        hint={
          departments.total
            ? `${departments.active} active · ${departments.super_admins} super administrator${
                departments.super_admins === 1 ? '' : 's'
              }`
            : 'No departments defined yet'
        }
      />
    )
  }
  if (announcements) {
    statCards.push(
      <StatCard
        key="announcements"
        icon="megaphone"
        label="Announcements"
        value={formatNumber(announcements.total)}
        hint={
          announcements.total
            ? announcements.pinned
              ? `${announcements.pinned} pinned`
              : 'On the school feed'
            : 'Nothing published yet'
        }
      />
    )
  }

  /* Left column: submissions · audit trail · announcements. */
  const counts = requirements?.submission_status || {}
  const countTotal = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1
  const visibleRows = SUBMISSION_ROWS.filter(([key]) => (counts[key] || 0) > 0)
  const hasSubmissionCounts = visibleRows.length > 0
  const activity = audit?.recent_activity || []

  const left = []
  if (requirements) {
    left.push(
      <Card
        key="submissions"
        title="Requirements overview"
        action={
          <Link className="btn btn-sm btn-ghost" to="/admin/requirements">
            Open requirements
          </Link>
        }
      >
        {!hasSubmissionCounts ? (
          <EmptyState
            icon="clipboard"
            title={
              requirements.total_requirements ? 'No submissions yet' : 'No requirements yet'
            }
            message={
              requirements.total_requirements
                ? 'Submission statuses will appear here as students turn in their work.'
                : 'Create a requirement so students have something to submit.'
            }
            action={
              can('requirements.manage') && !requirements.total_requirements ? (
                <Link className="btn btn-sm btn-secondary" to="/admin/requirements">
                  Create a requirement
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <div
              className="status-stack"
              role="img"
              aria-label={visibleRows
                .map(([key, label]) => `${label}: ${counts[key] || 0}`)
                .join(', ')}
            >
              {visibleRows.map(([key, label]) => (
                <span
                  key={key}
                  className={`ss-seg ss-${key}`}
                  style={{ flexGrow: counts[key] || 0 }}
                  title={`${label}: ${counts[key] || 0}`}
                />
              ))}
            </div>
            <SummaryRows
              rows={visibleRows.map(([key, label, tone]) => ({
                label,
                value: counts[key] || 0,
                tone,
                total: countTotal,
                showPercent: true,
              }))}
            />
            <p className="subtle" style={{ marginTop: 10 }}>
              {requirements.total_submissions} submissions recorded in total.
              {counts.none ? ` · ${counts.none} with nothing submitted yet.` : ''}
            </p>
          </>
        )}
      </Card>
    )
  }
  if (audit) {
    left.push(
      <Card
        key="activity"
        title="Recent system activity"
        action={
          <Link className="btn btn-sm btn-ghost" to="/admin/audit-logs">
            View audit log
          </Link>
        }
      >
        {activity.length === 0 ? (
          <EmptyState
            icon="activity"
            title="No recorded activity yet"
            message="Sign-ins, account changes and permission updates are written to the audit log and will be listed here."
          />
        ) : (
          <div className="activity-list">
            {activity.map((entry) => {
              const meta = auditMeta(entry.action)
              return (
                <div className="activity-item" key={entry.id}>
                  <span className={`act-icon ${meta.tone}`.trim()} aria-hidden="true">
                    <Icon name={meta.icon} size={15} />
                  </span>
                  <div className="grow">
                    <div className="ai-title">{entry.description || entry.action}</div>
                    <div className="ai-meta">
                      {meta.group}
                      {entry.actor ? ` · ${entry.actor}` : ''} · {formatRelative(entry.timestamp)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
              action={
                can('announcements.publish') ? (
                  <Link className="btn btn-sm btn-secondary" to="/announcements">
                    Write an announcement
                  </Link>
                ) : null
              }
            />
          ) : null
        }
      >
        <div className="activity-list">
          {announcements.latest.map((item) => (
            <div className="activity-item" key={item.id}>
              <span className="act-icon blue" aria-hidden="true">
                <Icon name="megaphone" size={15} />
              </span>
              <div className="grow">
                <div className="ai-title">{item.title}</div>
                <div className="ai-meta">
                  {AUDIENCE_LABELS[item.audience] || item.audience}
                  {item.published_at ? ` · ${formatDate(item.published_at)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  /* Right column: attendance · account distribution · notifications. */
  const right = []
  if (attendance) {
    right.push(
      <AttendanceSummaryCard
        key="attendance"
        attendance={attendance}
        today={attendanceToday}
        title="School attendance summary"
        emptyAction={
          <Link className="btn btn-sm btn-secondary" to="/admin/attendance">
            Open attendance
          </Link>
        }
      />
    )
  }
  if (accounts) {
    const total = accounts.total_users || 0
    // User.Role has exactly four values, so administrators are the exact
    // remainder of the server-provided counts — not an estimate.
    const administrators = Math.max(
      0,
      total - accounts.total_students - accounts.total_teachers - accounts.total_parents
    )
    right.push(
      <Card
        key="accounts"
        title="Account distribution"
        action={
          <Link className="btn btn-sm btn-ghost" to="/admin/users">
            Open directory
          </Link>
        }
        empty={
          total === 0 ? (
            <EmptyState
              icon="users"
              title="No accounts yet"
              message="Accounts appear here once the first users are created."
            />
          ) : null
        }
      >
        <SummaryRows
          rows={[
            { label: 'Students', value: accounts.total_students || 0, tone: 'blue', total },
            { label: 'Teachers', value: accounts.total_teachers || 0, tone: 'blue', total },
            { label: 'Parents', value: accounts.total_parents || 0, tone: 'blue', total },
            { label: 'Administrators', value: administrators, tone: 'navy', total },
          ].map((row) => ({ ...row, display: formatNumber(row.value), showPercent: true }))}
        />
        <p className="subtle" style={{ marginTop: 10 }}>
          {formatNumber(total)} user accounts in total.
        </p>
      </Card>
    )
  }
  right.push(<NotificationsCard key="notifications" />)

  return (
    <div className="dashboard dash-admin">
      <PageHeader
        className="dash-hero"
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what's happening at your school today."
        actions={
          <Link
            className="dash-notif-btn"
            to="/notifications"
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
          >
            <Icon name="bell" size={17} />
            <span>Notifications</span>
            {unread > 0 && (
              <span className="dash-notif-count">{unread > 99 ? '99+' : unread}</span>
            )}
          </Link>
        }
      >
        <div className="dash-meta">
          <span className="role-chip">
            {user.isSuperAdmin ? 'Super Administrator' : roleLabel(user.role)}
          </span>
          {departmentsList.slice(0, 3).map((dept) => (
            <span className="dept-chip" key={dept.id}>
              {dept.name}
            </span>
          ))}
          {departmentsList.length > 3 && (
            <span className="dept-chip dept-chip-more">+{departmentsList.length - 3}</span>
          )}
          <span className="dash-meta-item">
            <Icon name="calendar" size={14} />
            {TODAY_FULL_LABEL}
          </span>
          {schoolYear && (
            <span className="dash-meta-item">
              <Icon name="gradCap" size={14} />
              School year {schoolYear}
            </span>
          )}
        </div>
      </PageHeader>

      {quickActions.length > 0 && <QuickActions actions={quickActions} />}

      {statCards.length > 0 && <div className="stat-grid">{statCards}</div>}

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
