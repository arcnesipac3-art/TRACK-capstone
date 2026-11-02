import { attendanceStatus } from '../../utils/format'
import { MARK_STATUSES } from '../../utils/attendance'

/**
 * Compact four-way status control.
 *
 * Real radio inputs keep the whole group keyboard operable — Tab enters the
 * group, arrow keys move between statuses — so a teacher can work down a
 * register without leaving the keyboard. `att-<studentId>-<status>` stays the
 * input id: it is what the row's note button and every test reach for.
 */
export default function StatusSegment({ student, value, onChange, disabled }) {
  const name = student.user?.full_name || student.user?.username || 'this student'

  return (
    <div className="seg-group" role="group" aria-label={`Attendance status for ${name}`}>
      {MARK_STATUSES.map((status) => {
        const meta = attendanceStatus(status)
        const id = `att-${student.id}-${status}`
        return (
          <label className={`seg seg-${status}`} key={status} htmlFor={id}>
            <input
              className="seg-input"
              type="radio"
              id={id}
              name={`att-status-${student.id}`}
              value={status}
              checked={value === status}
              onChange={() => onChange(status)}
              disabled={disabled}
            />
            <span className="seg-face">{meta.label}</span>
          </label>
        )
      })}
    </div>
  )
}
