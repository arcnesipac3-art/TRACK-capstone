import EmptyState from '../EmptyState'
import Icon from '../Icon'
import Popover from '../Popover'
import Skeleton from '../loading/Skeleton'
import { generatePeriodGrid, timeRange, timetableDays, timetableLayout } from '../../utils/schedules'
import { subjectColorVars } from './subjectColors'

/**
 * The weekly grid: generated periods down the side, teaching days across.
 *
 * Columns are drawn from `timetableDays`, so a school that never teaches on a
 * Saturday sees five days, and the first Saturday class makes that column
 * appear instead of disappearing into a five-day grid.
 */

/** Placeholder blocks in the loading grid, scattered timetable-shape, not checkerboard. */
const BLOCKED_PERIODS = [
  [0, 3],
  [1, 2, 4],
  [2, 0, 3],
  [3, 1, 4],
  [4, 2],
]

function TimetableCard({ schedule, hasConflict, conflictReasons, onOpen, onEdit, onDelete, readOnly }) {
  const detail = schedule.teacher_assignment_detail
  const tooltip = conflictReasons.join('; ')

  return (
    <div className="timetable-card-wrapper">
      <button
        type="button"
        className={`timetable-card${hasConflict ? ' has-conflict' : ''}`}
        style={subjectColorVars(detail?.subject_name)}
        onClick={() => onOpen(schedule)}
        title={[
          detail?.subject_name,
          detail?.section_name,
          detail?.teacher_name,
          timeRange(schedule),
          schedule.room,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <span className="timetable-card-subject">{detail?.subject_name}</span>
        <span className="timetable-card-section">{detail?.section_name}</span>
        <span className="timetable-card-time">{timeRange(schedule)}</span>
        {detail?.teacher_name && (
          <span className="timetable-card-teacher">{detail.teacher_name}</span>
        )}
        {schedule.room && (
          <span className="timetable-card-room">
            <Icon name="mapPin" size={10} aria-hidden="true" />
            {schedule.room}
          </span>
        )}
        {hasConflict && (
          <span
            className="timetable-card-warn"
            role="img"
            aria-label={`Scheduling conflict: ${tooltip}`}
            data-tooltip={tooltip}
          >
            !
          </span>
        )}
      </button>

      {!readOnly && (
        <Popover
          wrapClassName="timetable-card-menu"
          triggerClassName="timetable-card-menu-trigger"
          panelClassName="timetable-card-dropdown"
          panelRole="menu"
          panelLabel="Schedule actions"
          triggerLabel="Schedule actions"
          trigger={<Icon name="moreVertical" size={16} />}
        >
          {({ close }) => (
            <>
              <button
                type="button"
                className="timetable-card-dropdown-item"
                onClick={() => {
                  close()
                  onEdit(schedule)
                }}
              >
                <Icon name="pencil" size={14} />
                Edit
              </button>
              <button
                type="button"
                className="timetable-card-dropdown-item danger"
                onClick={() => {
                  close()
                  onDelete(schedule)
                }}
              >
                <Icon name="trash" size={14} />
                Delete
              </button>
            </>
          )}
        </Popover>
      )}
    </div>
  )
}

export default function TimetableGrid({
  schedules,
  conflicts,
  reasons,
  today,
  onScheduleClick,
  onEdit,
  onDelete,
  readOnly = false,
}) {
  const days = timetableDays(schedules)
  const periods = generatePeriodGrid(schedules)
  const layout = timetableLayout(schedules, periods, days)

  const conflictedIds = new Set()
  ;(conflicts || []).forEach((conflict) =>
    conflict.schedules.forEach((schedule) => conflictedIds.add(schedule.id))
  )

  if (periods.length === 0) {
    return (
      <div className="timetable-empty">
        <EmptyState
          icon="calendar"
          title="No periods to display"
          message={
            readOnly
              ? 'These classes carry no start and end times yet, so there is nothing to lay out.'
              : 'Add schedules with start and end times to see the weekly timetable.'
          }
        />
      </div>
    )
  }

  return (
    <div
      className="timetable-table-container"
      role="region"
      aria-label="Weekly timetable"
      style={{ '--tt-cols': days.length }}
    >
      <table className="timetable-table">
        <colgroup>
          <col className="time-col" />
          {days.map((day) => (
            <col key={day.value} className="day-col" />
          ))}
        </colgroup>
        <thead>
          <tr className="timetable-header-row">
            <th className="timetable-th time-col" scope="col">
              Time
            </th>
            {days.map((day) => (
              <th
                key={day.value}
                className={`timetable-th${day.value === today ? ' is-today' : ''}`}
                scope="col"
              >
                <span className="timetable-day-label">{day.label}</span>
                {day.value === today && <span className="timetable-today-badge">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period, periodIndex) => (
            <tr key={period.index} className="timetable-row">
              <td className="timetable-time-td">
                <span className="timetable-period-num">P{period.index}</span>
                <span className="timetable-time-range">
                  {period.start}–{period.end}
                </span>
              </td>
              {days.map((day) => {
                const dayData = layout[day.value]
                const isToday = day.value === today
                const starting = dayData.startingHere[periodIndex] || []

                if (starting.length > 0) {
                  // rowSpan only works when the block is alone in the cell; two
                  // classes sharing a period stack inside it instead.
                  if (starting.length === 1 && starting[0].span > 1) {
                    const { schedule, span } = starting[0]
                    return (
                      <td
                        key={day.value}
                        className={`timetable-td occupied${isToday ? ' is-today' : ''}`}
                        rowSpan={span}
                      >
                        <TimetableCard
                          schedule={schedule}
                          hasConflict={conflictedIds.has(schedule.id)}
                          conflictReasons={reasons.get(schedule.id) || []}
                          onOpen={onScheduleClick}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          readOnly={readOnly}
                        />
                      </td>
                    )
                  }
                  return (
                    <td
                      key={day.value}
                      className={`timetable-td occupied stacked${isToday ? ' is-today' : ''}`}
                    >
                      <div className="timetable-stack">
                        {starting.map(({ schedule }) => (
                          <TimetableCard
                            key={schedule.id}
                            schedule={schedule}
                            hasConflict={conflictedIds.has(schedule.id)}
                            conflictReasons={reasons.get(schedule.id) || []}
                            onOpen={onScheduleClick}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            readOnly={readOnly}
                          />
                        ))}
                      </div>
                    </td>
                  )
                }

                // Covered by a rowSpan from above: the browser draws the cell.
                if (dayData.coveredBy[periodIndex] !== null) return null

                return (
                  <td
                    key={day.value}
                    className={`timetable-td empty${isToday ? ' is-today' : ''}`}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Placeholder for the weekly grid.
 *
 * It reuses the *real* table — same `colgroup`, same sticky time column, same
 * navy header row — so column widths and row heights land exactly where they
 * will once the periods arrive; only the class blocks are placeholders. The
 * day headings are derived from the clock, not from the request, so they are
 * rendered for real; otherwise "Today" would pop in and nudge the header.
 */
export function TimetableSkeleton({ rows = 5, today }) {
  const days = timetableDays([])

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        Loading schedules…
      </span>
      <div
        className="timetable-table-container"
        aria-hidden="true"
        style={{ '--tt-cols': days.length }}
      >
        <table className="timetable-table">
          <colgroup>
            <col className="time-col" />
            {days.map((day) => (
              <col key={day.value} className="day-col" />
            ))}
          </colgroup>
          <thead>
            <tr className="timetable-header-row">
              <th className="timetable-th time-col" scope="col">
                Time
              </th>
              {days.map((day) => (
                <th
                  key={day.value}
                  className={`timetable-th${day.value === today ? ' is-today' : ''}`}
                  scope="col"
                >
                  <span className="timetable-day-label">{day.label}</span>
                  {day.value === today && <span className="timetable-today-badge">Today</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, periodIndex) => {
              const blocked = BLOCKED_PERIODS[periodIndex] || []
              return (
                <tr key={periodIndex} className="timetable-row">
                  <td className="timetable-time-td">
                    <Skeleton lines={2} height={9} />
                  </td>
                  {days.map((day, dayIndex) => {
                    const isToday = day.value === today
                    return blocked.includes(dayIndex) ? (
                      <td
                        key={day.value}
                        className={`timetable-td occupied${isToday ? ' is-today' : ''}`}
                      >
                        {/* Same footprint as a `.timetable-card` block. */}
                        <span className="skeleton timetable-card-skeleton" />
                      </td>
                    ) : (
                      <td
                        key={day.value}
                        className={`timetable-td empty${isToday ? ' is-today' : ''}`}
                      />
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
