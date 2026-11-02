import { Link } from 'react-router-dom'
import Button from '../Button'
import Icon from '../Icon'
import StatusBadge from '../StatusBadge'
import { formatCount } from '../../utils/format'

/**
 * What one student handed in for one requirement, read straight off the
 * verification state the server stores.
 *
 * TRACK has no grade book — there is no score field on any model, and no
 * endpoint that computes one — so this view reports the rules the system
 * actually keeps: work is awaiting verification, verified, returned, handed in
 * past its deadline (overdue) or not on record at all. Anything else would be
 * a number the database cannot support.
 */
function cellOf(requirement, student) {
  const state = requirement.stateByStudent.get(student.id)
  if (state === 'verified') return { key: 'verified', label: 'Verified', tone: 'green' }
  if (state === 'submitted') return { key: 'pending', label: 'Awaiting', tone: 'amber' }
  if (state === 'returned') return { key: 'returned', label: 'Returned', tone: 'red' }
  if (state === 'overdue') return { key: 'overdue', label: 'Overdue', tone: 'red' }
  if (requirement.state === 'closed') {
    return { key: 'missing', label: 'Missing', tone: 'red' }
  }
  return { key: 'open', label: '—', tone: 'neutral' }
}

const RULES = [
  { tone: 'green', label: 'Verified', text: 'the work is on record and you accepted it' },
  { tone: 'amber', label: 'Awaiting', text: 'handed in, not checked yet' },
  { tone: 'red', label: 'Returned', text: 'handed in and sent back for revision' },
  { tone: 'red', label: 'Missing', text: 'nothing on record after the deadline passed' },
  { tone: 'neutral', label: '—', text: 'the deadline is still open' },
]

export default function ClassGrades({ board }) {
  const { row, requirements, students, indicators } = board

  const verifiedTotal = students.reduce((sum, student) => sum + student.submissionTally.verified, 0)
  const handedTotal = requirements.reduce((sum, requirement) => sum + requirement.handedIn, 0)

  return (
    <div className="stack stack-md">
      <section className="card">
        <header className="card-header">
          <h2>How work is graded here</h2>
          {indicators.pending > 0 && (
            <Link
              className="btn btn-primary btn-sm"
              to={`/teacher/classes/${row.id}/submissions`}
            >
              <Icon name="inbox" size={14} />
              Verify {indicators.pending}
            </Link>
          )}
        </header>
        <div className="card-body stack stack-sm">
          <p className="cw-note">
            {row.subjectName} — {row.sectionLabel} is reported the way TRACK
            records it: by verification state, not by a score. There is no grade
            field on any model in this system, so a percentage here would be a
            number the database cannot support; instead every cell below is the
            actual status of a student&apos;s submission for a requirement you
            posted to this class.
          </p>
          <ul className="cw-rules">
            {RULES.map((rule) => (
              <li key={rule.label}>
                <StatusBadge tone={rule.tone} label={rule.label} />
                <span>{rule.text}</span>
              </li>
            ))}
          </ul>
          <p className="cw-note">
            Attendance is the same story: {formatCount(board.attendance.sessionCount, 'session')}
            {' '}marked for this class, and each student&apos;s rate is present marks over every
            mark on record — the rule the server itself uses for its attendance summary.
          </p>
        </div>
      </section>

      {requirements.length === 0 ? (
        <section className="card">
          <header className="card-header">
            <h2>Class record</h2>
          </header>
          <div className="card-body">
            <p className="cw-note">
              Nothing has been posted to {row.subjectName} yet, so there is no
              work to report. Once you post a requirement, each student appears
              here with its verification state.
            </p>
            <Link
              className="btn btn-secondary btn-sm"
              to={`/teacher/classes/${row.id}/requirements`}
            >
              <Icon name="plus" size={14} />
              Go to requirements
            </Link>
          </div>
        </section>
      ) : (
        <section className="card">
          <header className="card-header">
            <h2>Class record</h2>
            <span className="cw-count">
              {handedTotal} handed in · {verifiedTotal} verified
            </span>
          </header>
          {students.length === 0 ? (
            <div className="card-body">
              <p className="cw-note">
                {formatCount(requirements.length, 'requirement')} is posted to
                this class, but no student is enrolled in {row.sectionLabel}, so
                nobody can hand work in yet.
              </p>
            </div>
          ) : (
            <div className="table-wrap cw-matrix-wrap">
              <table className="table responsive-table cw-matrix">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    {requirements.map((requirement) => (
                      <th scope="col" key={requirement.id} className="cw-matrix-head">
                        <span className="cw-matrix-title">{requirement.title}</span>
                        <span className="cw-matrix-meta">
                          {requirement.handedIn}/{students.length} in
                          {requirement.verifiedRate !== null
                            ? ` · ${requirement.verifiedRate}% verified`
                            : ''}
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="cw-matrix-head">
                      <span className="cw-matrix-title">Attendance</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <th scope="row" className="cell-main">
                        <span className="cw-matrix-student">{student.name}</span>
                        {student.lrn && <span className="cw-lrn">{student.lrn}</span>}
                      </th>
                      {requirements.map((requirement) => {
                        const cell = cellOf(requirement, student)
                        return (
                          <td key={requirement.id} data-label={requirement.title}>
                            <span className={`cw-cell tone-${cell.tone}`}>
                              {cell.key === 'open' ? (
                                <span className="subtle">—</span>
                              ) : (
                                cell.label
                              )}
                            </span>
                          </td>
                        )
                      })}
                      <td data-label="Attendance">
                        {student.attendanceRate === null ? (
                          <span className="subtle">No marks</span>
                        ) : (
                          <span className="cw-cell tone-neutral">
                            {student.attendanceRate}% · {student.attendance.present}/
                            {student.attendance.recorded}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-body">
            <p className="cw-note cw-print-hint">
              Rows are the students enrolled in {row.sectionLabel}; columns are
              the requirements you posted to this class. Only this
              teacher&apos;s assignment is included, so a parallel section or a
              different school year can never appear in the same grid.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="no-print"
              onClick={() => window.print()}
            >
              <Icon name="printer" size={14} />
              Print class record
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
