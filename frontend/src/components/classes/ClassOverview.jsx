import { Link } from 'react-router-dom'
import Icon from '../Icon'
import StatCard from '../StatCard'
import StatusBadge from '../StatusBadge'
import { SummaryRows } from '../dashboard/Card'
import {
  deadlineInfo,
  formatCount,
  formatDate,
  formatDateTime,
  requirementType,
} from '../../utils/format'

/**
 * The landing view of one class workspace.
 *
 * It answers the three questions a teacher asks on arriving: what is waiting
 * on me, what is due, and how this class is doing. Every figure is derived
 * from the rows `/teacher-assignments/`, `/requirements/`, `/submissions/` and
 * `/attendance/sessions/` hand back for this account — nothing is estimated,
 * and a number that cannot be computed yet says so instead of showing a zero.
 */
export default function ClassOverview({ board }) {
  const { row, requirements, attendance, sessions, schedules, indicators } = board

  const attention = []
  if (indicators.pending > 0) {
    attention.push({
      key: 'pending',
      icon: 'inbox',
      tone: 'amber',
      text: `${formatCount(indicators.pending, 'submission')} in this class ${
        indicators.pending === 1 ? 'is' : 'are'
      } handed in and waiting for your verification.`,
      to: 'submissions',
      action: 'Verify now',
    })
  }
  if (indicators.sessionsNeedingMarks > 0) {
    attention.push({
      key: 'sessions',
      icon: 'calendar',
      tone: 'amber',
      text: `${formatCount(indicators.sessionsNeedingMarks, 'session')} for this class ${
        indicators.sessionsNeedingMarks === 1 ? 'has' : 'have'
      } students without a mark yet.`,
      to: 'attendance',
      action: 'Open attendance',
    })
  }
  if (indicators.missingWork > 0) {
    attention.push({
      key: 'missing',
      icon: 'clock',
      tone: 'red',
      text: `${formatCount(indicators.missingWork, 'piece of work')} is still missing from ${
        formatCount(indicators.overdue, 'closed deadline')
      } in this class.`,
      to: 'grades',
      action: 'See who is missing work',
    })
  }
  if (indicators.unposted) {
    attention.push({
      key: 'unposted',
      icon: 'plus',
      tone: 'blue',
      text: 'Nothing has been posted to this class yet, so no work can be handed in.',
      to: 'requirements',
      action: 'Post a requirement',
    })
  }
  if (row.studentCount === 0) {
    attention.push({
      key: 'roster',
      icon: 'users',
      tone: 'blue',
      text: 'No student is enrolled in this section yet.',
      to: 'students',
      action: 'See the roster',
    })
  }

  const openWork = requirements.filter((requirement) => requirement.state === 'open')
  const closedWork = requirements.filter((requirement) => requirement.state === 'closed')
  const handedIn = requirements.reduce((sum, requirement) => sum + requirement.handedIn, 0)

  return (
    <div className="stack stack-md">
      {attention.length > 0 ? (
        <section className="card" aria-labelledby="cw-attention-title">
          <header className="card-header">
            <h2 id="cw-attention-title">Needs your attention</h2>
            <span className="cw-count">{attention.length}</span>
          </header>
          <ul className="cw-attention-list">
            {attention.map((item) => (
              <li key={item.key} className={`cw-attention-item tone-${item.tone}`}>
                <span className="cw-attention-icon" aria-hidden="true">
                  <Icon name={item.icon} size={15} />
                </span>
                <span className="grow">{item.text}</span>
                <Link
                  className="btn btn-ghost btn-sm"
                  to={`/teacher/classes/${row.id}/${item.to}`}
                >
                  {item.action}
                  <Icon name="arrowRight" size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="alert alert-success" role="status">
          <Icon name="checkCircle" size={15} />
          <span className="grow">Nothing is waiting on you in this class right now.</span>
        </div>
      )}

      <div className="kpi-grid">
        <StatCard
          label="Requirements"
          value={row.requirementCount}
          hint={`${formatCount(row.openDeadlineCount, 'open deadline')} · ${formatCount(
            row.overdueCount,
            'closed deadline'
          )}`}
          icon="clipboard"
          to={`/teacher/classes/${row.id}/requirements`}
        />
        <StatCard
          label="Awaiting verification"
          value={row.pendingCount}
          tone={row.pendingCount > 0 ? 'amber' : 'default'}
          hint="Work on record, not yet checked"
          icon="inbox"
          to={`/teacher/classes/${row.id}/submissions`}
        />
        <StatCard
          label="Students"
          value={row.studentCount}
          hint={row.adviserName ? `Adviser ${row.adviserName}` : 'No adviser recorded'}
          icon="users"
          to={`/teacher/classes/${row.id}/students`}
        />
        <StatCard
          label="Attendance"
          value={attendance.presentRate === null ? 'No marks yet' : `${attendance.presentRate}%`}
          tone={attendance.incomplete > 0 ? 'amber' : 'default'}
          hint={
            attendance.sessionCount === 0
              ? 'No session recorded for this class'
              : `${formatCount(attendance.sessionCount, 'session')} · ` +
                (attendance.incomplete > 0
                  ? `${formatCount(attendance.incomplete, 'session')} missing marks`
                  : 'every session marked')
          }
          icon="calendar"
          to={`/teacher/classes/${row.id}/attendance`}
        />
      </div>

      <div className="cw-columns">
        <section className="card">
          <header className="card-header">
            <h2>Class details</h2>
          </header>
          <div className="card-body">
            <dl className="cw-details">
              <div>
                <dt>Subject</dt>
                <dd>{row.subjectName}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>
                  {row.gradeLevelName && row.sectionName
                    ? `${row.gradeLevelName} — ${row.sectionName}`
                    : row.sectionLabel}
                </dd>
              </div>
              <div>
                <dt>School year</dt>
                <dd>{row.schoolYearLabel ? `SY ${row.schoolYearLabel}` : 'Not set'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusBadge label={row.status.label} tone={row.status.tone} />
                </dd>
              </div>
              <div>
                <dt>Work on record</dt>
                <dd>
                  {formatCount(handedIn, 'submission')} across{' '}
                  {formatCount(requirements.length, 'requirement')}
                </dd>
              </div>
              <div>
                <dt>Next deadline</dt>
                <dd>
                  {row.nextDeadline
                    ? `${formatDate(row.nextDeadline.deadline)} — ${row.nextDeadline.title}`
                    : 'None still open'}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>Class timetable</h2>
            <span className="cw-count">{schedules.length}</span>
          </header>
          {schedules.length === 0 ? (
            <div className="card-body">
              <p className="cw-note">
                No period is scheduled for {row.subjectName} with this section,
                so attendance sessions are not generated for it automatically.
              </p>
            </div>
          ) : (
            <ul className="cw-schedule">
              {schedules.map((period) => (
                <li key={period.id}>
                  <span className="cw-schedule-day">{period.day}</span>
                  <span className="cw-schedule-time">
                    {period.start} – {period.end}
                  </span>
                  {period.room && <span className="cw-schedule-room">{period.room}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <header className="card-header">
          <h2>Deadlines in this class</h2>
          <Link className="btn btn-ghost btn-sm" to={`/teacher/classes/${row.id}/requirements`}>
            All requirements
            <Icon name="arrowRight" size={14} />
          </Link>
        </header>
        {requirements.length === 0 ? (
          <div className="card-body">
            <p className="cw-note">
              Post the first requirement for {row.subjectName} and its deadline,
              submissions and verification counts will be listed here.
            </p>
          </div>
        ) : (
          <div className="cw-deadlines">
            {openWork.length > 0 && (
              <RequirementGroup
                title="Still open"
                tone="green"
                rows={openWork}
                assignmentId={row.id}
                studentCount={row.studentCount}
              />
            )}
            {closedWork.length > 0 && (
              <RequirementGroup
                title="Deadlines closed"
                tone="neutral"
                rows={closedWork}
                assignmentId={row.id}
                studentCount={row.studentCount}
              />
            )}
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Attendance for this class</h2>
          <Link className="btn btn-ghost btn-sm" to={`/teacher/classes/${row.id}/students`}>
            Per-student record
            <Icon name="arrowRight" size={14} />
          </Link>
        </header>
        {attendance.sessionCount === 0 ? (
          <div className="card-body">
            <p className="cw-note">
              No attendance session exists for {row.subjectName} with this
              section yet.
            </p>
          </div>
        ) : (
          <div className="card-body stack stack-md">
            <SummaryRows
              rows={[
                {
                  label: 'Present',
                  value: attendance.present,
                  total: attendance.recorded,
                  tone: 'green',
                },
                { label: 'Late', value: attendance.late, total: attendance.recorded, tone: 'amber' },
                { label: 'Absent', value: attendance.absent, total: attendance.recorded, tone: 'red' },
                {
                  label: 'Excused',
                  value: attendance.excused,
                  total: attendance.recorded,
                  tone: 'blue',
                },
              ]}
            />
            <ul className="cw-sessions">
              {sessions.slice(0, 6).map((session) => (
                <li key={session.id} className={session.complete ? '' : 'is-incomplete'}>
                  <span className="cw-session-date">{formatDate(session.date)}</span>
                  <span className="cw-session-tally">
                    {session.recorded === 0
                      ? 'No marks recorded'
                      : `${session.recorded} of ${row.studentCount} marked · ${session.present} present`}
                  </span>
                  <StatusBadge
                    tone={session.complete ? 'green' : 'amber'}
                    label={session.complete ? 'Complete' : 'Needs marks'}
                  />
                </li>
              ))}
            </ul>
            {sessions.length > 6 && (
              <p className="cw-note">
                Showing the 6 most recent of{' '}
                {formatCount(sessions.length, 'session')} for this class.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function RequirementGroup({ title, tone, rows, assignmentId, studentCount }) {
  return (
    <div className="cw-group">
      <h3 className={`cw-group-title tone-${tone}`}>
        {title}
        <span className="cw-count">{rows.length}</span>
      </h3>
      <ul className="cw-req-list">
        {rows.map((requirement) => {
          const due = deadlineInfo(requirement.deadline)
          return (
            <li key={requirement.id}>
              <span className="cw-req-main">
                <span className="cw-req-title">{requirement.title}</span>
                <span className="cw-req-meta">
                  {requirementType(requirement.type)} ·{' '}
                  {requirement.deadline
                    ? `Due ${formatDateTime(requirement.deadline)}`
                    : 'No deadline set'}
                </span>
              </span>
              <span className="cw-req-counts">
                <span className="subtle">
                  {studentCount === 0
                    ? 'No students enrolled'
                    : `${requirement.handedIn}/${studentCount} handed in`}
                </span>
                {requirement.pendingCount > 0 ? (
                  <StatusBadge tone="amber" label={`${requirement.pendingCount} awaiting`} />
                ) : (
                  <StatusBadge tone={tone === 'green' ? 'green' : 'neutral'} label={due.label} />
                )}
                {requirement.missing > 0 && (
                  <StatusBadge tone="red" label={`${requirement.missing} missing`} />
                )}
              </span>
              <Link
                className="btn btn-ghost btn-sm"
                to={`/teacher/classes/${assignmentId}/submissions`}
                aria-label={`Review submissions for ${requirement.title}`}
              >
                Review
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
