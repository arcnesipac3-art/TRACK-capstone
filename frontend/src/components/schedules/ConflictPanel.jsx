import Button from '../Button'
import Icon from '../Icon'
import { groupConflicts } from '../../utils/schedules'

/**
 * The double-bookings detected in the loaded timetable, grouped by the time
 * slot they happen in. Conflict detection is deliberately over every schedule
 * the screen holds, not the filtered view: a class hidden by a filter can still
 * collide with one that is visible.
 */
export default function ConflictPanel({ conflicts, onScheduleClick, onClose }) {
  if (!conflicts || conflicts.length === 0) return null

  const grouped = groupConflicts(conflicts)
  const totalPairs = conflicts.length
  const slotCount = grouped.length

  return (
    <section className="sched-conflict-panel" aria-label="Scheduling conflicts">
      <header className="sched-conflict-head">
        <h3 className="sched-conflict-title">
          <Icon name="alertTriangle" size={18} aria-hidden="true" />
          {totalPairs} Scheduling Conflict{totalPairs === 1 ? '' : 's'} across {slotCount} time slot
          {slotCount === 1 ? '' : 's'}
        </h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close conflict panel">
            <Icon name="close" size={14} />
          </Button>
        )}
      </header>

      <div className="sched-conflict-list">
        {grouped.map((group) => (
          <div className="sched-conflict-group" key={`${group.day}-${group.time}`}>
            <div className="sched-conflict-group-header">
              <span className="sched-conflict-daytime">
                {group.dayLabel} · {group.time}
              </span>
              <div className="sched-conflict-summary-tags">
                {group.summary.teacher > 0 && (
                  <span
                    className="sched-conflict-reason high"
                    title={`${group.summary.teacher} teacher conflict${group.summary.teacher > 1 ? 's' : ''}`}
                  >
                    <Icon name="users" size={12} aria-hidden="true" />
                    {group.summary.teacher} teacher
                  </span>
                )}
                {group.summary.section > 0 && (
                  <span
                    className="sched-conflict-reason high"
                    title={`${group.summary.section} section conflict${group.summary.section > 1 ? 's' : ''}`}
                  >
                    <Icon name="layers" size={12} aria-hidden="true" />
                    {group.summary.section} section
                  </span>
                )}
                {group.summary.room > 0 && (
                  <span
                    className="sched-conflict-reason medium"
                    title={`${group.summary.room} room conflict${group.summary.room > 1 ? 's' : ''}`}
                  >
                    <Icon name="mapPin" size={12} aria-hidden="true" />
                    {group.summary.room} room
                  </span>
                )}
              </div>
            </div>

            <div className="sched-conflict-pairs">
              {group.conflicts.map((conflict) => {
                const [s1, s2] = conflict.schedules
                return (
                  <div className="sched-conflict-pair-item" key={conflict.id}>
                    <div className="sched-conflict-pair">
                      <ConflictSide schedule={s1} onScheduleClick={onScheduleClick} />
                      <span className="sched-conflict-vs" aria-hidden="true">
                        <Icon name="close" size={14} />
                      </span>
                      <ConflictSide schedule={s2} onScheduleClick={onScheduleClick} />
                    </div>
                    <div className="sched-conflict-reasons-detail">
                      {conflict.reasons.map((reason, index) => (
                        <div
                          key={`${reason.type}-${index}`}
                          className={`sched-conflict-reason-detail ${reason.severity}`}
                        >
                          <Icon
                            name={reason.severity === 'high' ? 'alertTriangle' : 'info'}
                            size={12}
                            aria-hidden="true"
                          />
                          {reason.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ConflictSide({ schedule, onScheduleClick }) {
  const detail = schedule.teacher_assignment_detail
  return (
    <button
      type="button"
      className="sched-conflict-side"
      onClick={() => onScheduleClick(schedule)}
      title="View schedule details"
    >
      <span className="subject">{detail?.subject_name}</span>
      <span className="meta">{detail?.section_name}</span>
      <span className="meta">
        {detail?.teacher_name}
        {schedule.room ? ` · ${schedule.room}` : ''}
      </span>
    </button>
  )
}
