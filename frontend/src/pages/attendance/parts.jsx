import Button from '../../components/Button'
import Icon from '../../components/Icon'
import StatusBadge from '../../components/StatusBadge'
import Tabs from '../../components/Tabs'
import { attendanceStatus } from '../../utils/format'
import { MARK_STATUSES, sessionMeta, sessionState } from '../../utils/attendance'

/* ------------------------------------------------------------------ */
/* Small pieces the attendance screens share                           */
/* ------------------------------------------------------------------ */

/** Pill tablist. `idPrefix="att"` keeps the `att-tab-*` / `att-panel-*` ids. */
export function ViewTabs(props) {
  return <Tabs idPrefix="att" className="tabs--pill" {...props} />
}

/** The one status badge a session shows — including the derived Missed. */
export function SessionBadge({ session, today }) {
  const meta = sessionMeta(sessionState(session, today))
  return <StatusBadge tone={meta.tone} label={meta.label} />
}

/**
 * Completion of a session against its enrolled register.
 *
 * A finished session gets a badge instead of a full bar: "12/12" and a 100 %
 * bar say the same thing twice, and the badge is the shorter sentence.
 */
export function CompletionCell({ completion }) {
  if (!completion) return <span className="subtle">—</span>

  const { marked, enrolled, percentage, isComplete } = completion
  return (
    <div className="att-completion" title={`${marked} of ${enrolled} students marked`}>
      {isComplete ? (
        <StatusBadge tone="green" label="Complete" />
      ) : (
        <span className="att-bar" aria-hidden="true">
          <span style={{ width: `${percentage}%` }} />
        </span>
      )}
      <span className="att-frac">
        {marked}/{enrolled}
      </span>
    </div>
  )
}

/**
 * The live tally strip above the roster and above a session detail.
 *
 * It counts what is on the sheet right now — staged edits included — so the
 * numbers move as the teacher marks, and the unsaved count in the footer stays
 * a separate question ("did this reach the server?").
 */
export function MarkCounters({ total, counts, searching, shown }) {
  return (
    <div className="att-summary" role="group" aria-label="Attendance summary">
      <span className="att-total">{total} students</span>
      {MARK_STATUSES.map((status) => (
        <StatusBadge
          key={status}
          tone={attendanceStatus(status).tone}
          label={`${counts[status] || 0} ${attendanceStatus(status).label}`}
        />
      ))}
      <StatusBadge tone="neutral" label={`${counts.unmarked || 0} Unmarked`} />
      {searching && (
        <span className="subtle">
          · showing {shown} of {total}
        </span>
      )}
    </div>
  )
}

/** A session note, clipped to the column with the whole text on hover. */
export function NoteCell({ value, label = 'Notes' }) {
  return (
    <td data-label={label} className="att-notes">
      {value ? (
        <span className="att-note-text" title={value}>
          {value}
        </span>
      ) : (
        <span className="subtle">—</span>
      )}
    </td>
  )
}

/** Search box shared by the roster, the history and the session board. */
export function SearchField({ id, label, value, onChange, placeholder, disabled }) {
  return (
    <div className="att-search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" size={15} />
      <input
        id={id}
        type="search"
        className="input input-sm"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

/** Date input with the paired label a filter bar uses. */
export function DateField({ id, label, value, onChange, disabled, min, max }) {
  return (
    <div className="field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        className="input input-sm"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
        min={min}
        max={max}
      />
    </div>
  )
}

/** Select with the paired label a filter bar uses. */
export function SelectField({ id, label, value, onChange, options, disabled }) {
  return (
    <div className="field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        className="select select-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Clears a filter bar back to the unfiltered view. */
export function ClearFiltersButton({ onClick, label, hidden = false }) {
  if (hidden) return null
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={label}>
      <Icon name="close" size={14} />
      Clear
    </Button>
  )
}
