import { Link } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import CardSkeleton from '../../components/loading/CardSkeleton'
import StatCardSkeleton from '../../components/loading/StatCardSkeleton'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import ActionToolbar from '../../components/dashboard/ActionToolbar'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import FinanceSummaryCard from '../../components/dashboard/FinanceSummaryCard'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import {
  AUDIENCE_LABELS,
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
 * Dashboard shortcuts, most useful first. The first five permitted by this
 * administrator stay in the toolbar; the rest fold into "More actions", so
 * navigation never outgrows a single row.
 *
 * People are reached by role directory — TRACK has no single "all users"
 * screen in the sidebar, so no shortcut points at one either.
 */
const DASH_ACTIONS = [
  { label: 'Manage students', to: '/admin/students', icon: 'gradCap', perm: 'users.view' },
  { label: 'Manage enrollment', to: '/admin/enrollment/overview', icon: 'userPlus', perm: 'enrollment.view' },
  { label: 'View attendance', to: '/admin/attendance', icon: 'calendar', perm: 'attendance.view' },
  { label: 'Manage requirements', to: '/admin/requirements', icon: 'clipboard', perm: 'requirements.view' },
  { label: 'View reports', to: '/admin/reports', icon: 'chart', perm: 'reports.view' },
  { label: 'Manage teachers', to: '/admin/teachers', icon: 'user', perm: 'users.view' },
  { label: 'Manage parents', to: '/admin/parents', icon: 'users', perm: 'users.view' },
  { label: 'Fee management', to: '/admin/fees', icon: 'creditCard', perm: 'fees.view' },
  { label: 'Sections & subjects', to: '/admin/sections', icon: 'layers', perm: 'structure.manage' },
  { label: 'Announcements', to: '/announcements', icon: 'megaphone', perm: 'announcements.view' },
  { label: 'Departments & roles', to: '/admin/departments', icon: 'shield', perm: 'departments.view' },
  { label: 'Audit logs', to: '/admin/audit-logs', icon: 'clock', perm: 'audit.view' },
  { label: 'System settings', to: '/admin/settings', icon: 'settings', perm: 'settings.manage' },
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
 * comes straight from a payload — counts, school-year labels, fee totals and
 * the notification unread count are all computed server-side. The one extra
 * request (registrar enrollment figures) is gated the same way and reports
 * its own failure instead of showing zeros.
 */
export default function AdminDashboard() {
  const { user, can } = useAuth()
  const summary = useFetch('/dashboard/')
  // Pending applications are the registrar's numbers, served by
  // /enrollment/dashboard/ only to accounts holding `enrollment.view` — so
  // the request itself is permission-gated, not just the tile.
  const enrollment = useFetch('/enrollment/dashboard/', {
    enabled: can('enrollment.view'),
  })

  const firstName = (user.fullName || '').split(' ')[0] || user.fullName

  if (summary.loading && !summary.data) {
    return (
      <>
        {/* One announcement for the whole placeholder grid — the skeletons
            themselves are decorative and must not be read out bar by bar. */}
        <span className="sr-only" role="status">
          Loading dashboard…
        </span>
        <div className="dashboard dash-admin" aria-hidden="true">
          <div className="skeleton skeleton-hero" />
          <div className="skeleton skeleton-toolbar" />
          <div className="kpi-grid">
            {[0, 1, 2, 3, 4].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="two-col">
            <div className="stack stack-md">
              <CardSkeleton />
              <CardSkeleton />
            </div>
            <div className="stack stack-md">
              <CardSkeleton />
              <CardSkeleton />
            </div>
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

  /* Shortcuts — the first five this administrator's keys unlock stay visible. */
  const allowedActions = DASH_ACTIONS.filter((action) => can(action.perm))
  const primaryActions = allowedActions.slice(0, 5)
  const moreActions = allowedActions.slice(5)

  /* Key metrics — the daily-triage numbers, each linking to its own screen. */
  const kpis = []
  if (accounts) {
    const totalUsers = accounts.total_users || 0
    kpis.push(
      <StatCard
        key="students"
        icon="gradCap"
        label="Students"
        to="/admin/students"
        value={formatNumber(accounts.total_students)}
        hint={
          accounts.total_students
            ? `of ${formatNumber(totalUsers)} accounts in the directory`
            : 'No student accounts yet'
        }
      />,
      <StatCard
        key="teachers"
        icon="book"
        label="Teachers"
        to="/admin/teachers"
        value={formatNumber(accounts.total_teachers)}
        hint={accounts.total_teachers ? 'Teaching accounts on record' : 'No teacher accounts yet'}
      />
    )
  }
  if (attendance) {
    const records = attendance.total_records || 0
    const todayRecords = attendanceToday?.total_records || 0
    kpis.push(
      <StatCard
        key="attendance"
        icon="checkCircle"
        label={attendance.present_rate === null ? 'Attendance' : 'Attendance present'}
        to="/admin/attendance"
        value={
          records === 0
            ? '—'
            : attendance.present_rate === null
              ? formatNumber(records)
              : `${attendance.present_rate}%`
        }
        hint={
          records === 0
            ? 'Nothing recorded yet'
            : `${formatNumber(records)} records${
                todayRecords ? ` · ${formatNumber(todayRecords)} today` : ''
              }`
        }
      />
    )
  }
  if (requirements) {
    const submissions = requirements.total_submissions || 0
    const verified = requirements.submission_status?.verified || 0
    kpis.push(
      <StatCard
        key="requirements"
        icon="clipboard"
        label="Requirements verified"
        to="/admin/requirements"
        value={submissions ? `${Math.round((verified / submissions) * 100)}%` : '—'}
        hint={
          submissions
            ? `${formatNumber(verified)} of ${formatNumber(submissions)} submissions`
            : 'No submissions yet'
        }
      />
    )
  }
  if (can('enrollment.view')) {
    if (enrollment.loading && !enrollment.data) {
      kpis.push(<StatCardSkeleton key="enrollment" />)
    } else if (enrollment.error) {
      // A failed request is reported as such — never as "0 applications".
      kpis.push(
        <StatCard
          key="enrollment"
          icon="userPlus"
          label="Applications in review"
          value="Unavailable"
          hint="Enrollment figures could not be loaded."
        />
      )
    } else if (enrollment.data) {
      const stats = enrollment.data
      kpis.push(
        <StatCard
          key="enrollment"
          icon="userPlus"
          label="Applications in review"
          to="/admin/enrollment/applications"
          tone={stats.under_review > 0 ? 'amber' : 'default'}
          value={formatNumber(stats.under_review)}
          hint={`${formatNumber(stats.submitted)} submitted · ${formatNumber(
            stats.awaiting_corrections
          )} awaiting corrections`}
        />
      )
    }
  }

  /* Organisation figures that no longer justify a card of their own. */
  const facts = []
  if (structure) {
    facts.push(
      `${formatNumber(structure.total_sections)} sections · ${formatNumber(
        structure.total_subjects
      )} subjects · ${formatNumber(structure.total_grade_levels)} grade levels`
    )
  }
  if (departments) {
    facts.push(
      !departments.total
        ? 'No departments defined yet'
        : `${formatNumber(departments.total)} departments · ${formatNumber(
            departments.active
          )} active · ${departments.super_admins} super administrator${
            departments.super_admins === 1 ? '' : 's'
          }`
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
          <span className="row row-wrap gap-xs">
            {/* The metric tile reports completion; the deadline status the old
                "Active requirements" card carried stays visible here. */}
            <StatusBadge
              tone="neutral"
              label={`${formatNumber(requirements.active_requirements)} of ${formatNumber(
                requirements.total_requirements
              )} active`}
            />
            <Link className="btn btn-sm btn-ghost" to="/admin/requirements">
              Open requirements
            </Link>
          </span>
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
          <span className="row row-wrap gap-xs">
            <StatusBadge tone="neutral" label={`${formatNumber(announcements.total)} published`} />
            <Link className="btn btn-sm btn-ghost" to="/announcements">
              View all
            </Link>
          </span>
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
          {announcements.latest.map((item, index) => {
            // The payload is ordered `-is_pinned, -published_at` and only
            // carries the pinned total, so the first `pinned` rows are exactly
            // the pinned ones — no per-item flag is invented here.
            const isPinned = index < (announcements.pinned || 0)
            return (
              <div className="activity-item" key={item.id}>
                <span className="act-icon blue" aria-hidden="true">
                  <Icon name="megaphone" size={15} />
                </span>
                <div className="grow">
                  <div className="ai-title ann-title">
                    <span>{item.title}</span>
                    {isPinned && (
                      <StatusBadge tone="blue" label="Pinned" title="Pinned to the top of the feed" />
                    )}
                  </div>
                  <div className="ai-meta">
                    {AUDIENCE_LABELS[item.audience] || item.audience}
                    {item.published_at ? ` · ${formatDate(item.published_at)}` : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    )
  }

  /* Right column: attendance · finance · accounts · notifications. */
  const right = []
  if (attendance) {
    right.push(
      <AttendanceSummaryCard
        key="attendance"
        attendance={attendance}
        today={attendanceToday}
        title="School attendance summary"
        link={
          <Link className="btn btn-sm btn-ghost" to="/admin/attendance">
            Manage
          </Link>
        }
        emptyAction={
          <Link className="btn btn-sm btn-secondary" to="/admin/attendance">
            Open attendance
          </Link>
        }
      />
    )
  }
  if (fees) {
    right.push(
      <FinanceSummaryCard
        key="finance"
        fees={fees}
        action={
          <Link className="btn btn-sm btn-ghost" to="/admin/fees">
            Manage
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
  /* The notifications feed lives in the shell's contextual column now
     (AdminContextPanel), so the center grid does not show it a second time. */

  const nothingGranted = kpis.length === 0 && facts.length === 0 && left.length === 0

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

      {primaryActions.length > 0 && (
        <ActionToolbar primary={primaryActions} more={moreActions} />
      )}

      {kpis.length > 0 && (
        <section className="kpi-grid" aria-label="Key metrics">
          {kpis}
        </section>
      )}

      {facts.length > 0 && (
        <ul className="fact-strip">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}

      {nothingGranted && (
        <EmptyState
          icon="shield"
          title="No modules granted yet"
          message="Your departments do not carry any permissions yet — a Super Administrator can grant them under Departments & Roles."
        />
      )}

      {left.length > 0 && right.length > 0 ? (
        <div className="two-col bento">
          <div className="stack stack-md">{left}</div>
          <div className="stack stack-md">{right}</div>
        </div>
      ) : left.length > 0 || right.length > 0 ? (
        /* One lane empty — let the other use the full width instead of
           stranding it in a third of the grid. */
        <div className="stack stack-md bento-single">
          {[...left, ...right]}
        </div>
      ) : null}
    </div>
  )
}
