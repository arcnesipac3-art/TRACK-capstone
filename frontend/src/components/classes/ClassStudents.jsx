import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../Button'
import EmptyState from '../EmptyState'
import Icon from '../Icon'
import StatusBadge from '../StatusBadge'
import { formatCount } from '../../utils/format'

const SORTS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'awaiting', label: 'Most awaiting verification' },
  { value: 'missing', label: 'Most work missing' },
  { value: 'attendance', label: 'Lowest attendance' },
]

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  awaiting: (a, b) =>
    b.submissionTally.pending - a.submissionTally.pending || a.name.localeCompare(b.name),
  missing: (a, b) =>
    b.submissionTally.missing - a.submissionTally.missing || a.name.localeCompare(b.name),
  attendance: (a, b) =>
    (a.attendanceRate ?? 101) - (b.attendanceRate ?? 101) || a.name.localeCompare(b.name),
}

/**
 * The roster of one class, with what each student has handed in and how often
 * they were marked present.
 *
 * The roster is the section's — every subject taught to these students shares
 * it — while the work and marks in each row are only this class's, because the
 * requirements are the ones joined to this assignment. A student with no mark
 * at all reads as '—', not as 0%, because the class has no record either way.
 */
export default function ClassStudents({ board }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('name')

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = board.students.filter((student) =>
      !needle ||
      student.name.toLowerCase().includes(needle) ||
      String(student.lrn || '').toLowerCase().includes(needle)
    )
    return [...filtered].sort(SORTERS[sort] || SORTERS.name)
  }, [board.students, search, sort])

  if (board.students.length === 0) {
    return (
      <div className="card">
        <header className="card-header">
          <h2>Students</h2>
        </header>
        <div className="card-body">
          <EmptyState
            icon="users"
            title="No student enrolled in this section"
            message={`Nobody is enrolled in ${board.row.sectionLabel} yet, so ${board.row.subjectName} has no roster to mark work against. Students appear here as soon as the administrator enrols them in the section.`}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <header className="card-header">
        <h2>Students</h2>
        <span className="cw-count">
          {rows.length === board.students.length
            ? formatCount(board.students.length, 'student')
            : `${rows.length} of ${board.students.length}`}
        </span>
      </header>

      <div className="filter-bar">
        <div className="field grow">
          <label htmlFor="student-search">Search</label>
          <input
            id="student-search"
            className="input"
            type="search"
            placeholder="Name or LRN"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="student-sort">Sort by</label>
          <select
            id="student-sort"
            className="select"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {(search.trim() !== '' || sort !== 'name') && (
          <div className="field cw-reset">
            <span className="field-spacer" aria-hidden="true" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setSort('name')
              }}
            >
              <Icon name="close" size={14} />
              Reset
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card-body">
          <EmptyState
            icon="search"
            title="No student matches"
            message={`Nothing in this class of ${board.students.length} matches “${search.trim()}”.`}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Handed in</th>
                <th>Awaiting</th>
                <th>Verified</th>
                <th>Returned</th>
                <th>Missing</th>
                <th>Attendance</th>
                <th className="text-right">Work</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => {
                const tally = student.submissionTally
                return (
                  <tr key={student.id}>
                    <td data-label="Student" className="cell-main">
                      {student.name}
                      {student.lrn && <span className="cw-lrn">{student.lrn}</span>}
                    </td>
                    <td data-label="Handed in">{tally.submitted}</td>
                    <td data-label="Awaiting">
                      {tally.pending > 0 ? (
                        <StatusBadge tone="amber" label={`${tally.pending} pending`} />
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td data-label="Verified">{tally.verified}</td>
                    <td data-label="Returned">
                      {tally.returned > 0 ? (
                        <StatusBadge tone="red" label={`${tally.returned} returned`} />
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td data-label="Missing">
                      {tally.missing > 0 ? (
                        <StatusBadge tone="red" label={`${tally.missing} missing`} />
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td data-label="Attendance">
                      {student.attendanceRate === null ? (
                        <span className="subtle">No marks</span>
                      ) : (
                        `${student.attendanceRate}% · ${student.attendance.present}/${student.attendance.recorded}`
                      )}
                    </td>
                    <td data-label="" className="text-right">
                      <Link
                        className="btn btn-ghost btn-sm"
                        to={`/teacher/classes/${board.row.id}/grades`}
                        aria-label={`See ${student.name}'s record for ${board.row.subjectName}`}
                      >
                        Record
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-body cw-students-note">
        <p className="cw-note">
          {formatCount(board.requirements.length, 'requirement')} posted to{' '}
          {board.row.subjectName} · {formatCount(board.attendance.sessionCount, 'session')} marked
          for this section. Missing counts only close once a deadline has passed.
        </p>
      </div>
    </div>
  )
}
