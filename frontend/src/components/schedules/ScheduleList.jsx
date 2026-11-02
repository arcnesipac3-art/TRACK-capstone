import Button from '../Button'
import Icon from '../Icon'
import StatusBadge from '../StatusBadge'
import { normTime } from '../../utils/schedules'

/**
 * The same timetable read class by class instead of hour by hour — what an
 * admin uses to check one section's weekly load, and the only view where the
 * room field is editable at a glance.
 */
export default function ScheduleList({ groups, reasons, onEdit, onDelete }) {
  return (
    <div className="sched-groups">
      {groups.map((group) => {
        const detail = group.assignment
        return (
          <section className="sched-group" key={detail.id}>
            <header className="sched-group-head">
              <h3 className="sched-group-title">{detail.subject_name}</h3>
              <p className="sched-group-sub">
                {detail.section_name}
                {detail.teacher_name ? ` · ${detail.teacher_name}` : ''}
              </p>
            </header>

            <div className="table-wrap">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Room</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.schedules.map((schedule) => {
                    const rowReasons = reasons.get(schedule.id) || []
                    return (
                      <tr key={schedule.id}>
                        <td data-label="Day">
                          <span className="sched-group-day">
                            {schedule.day_of_week_display || '—'}
                          </span>
                          {rowReasons.length > 0 && (
                            <StatusBadge
                              tone="red"
                              label="Conflict"
                              title={rowReasons.join('; ')}
                            />
                          )}
                        </td>
                        <td data-label="Start" className="sched-group-time">
                          {normTime(schedule.start_time)}
                        </td>
                        <td data-label="End" className="sched-group-time">
                          {normTime(schedule.end_time)}
                        </td>
                        <td data-label="Room">
                          {schedule.room || <span className="subtle">—</span>}
                        </td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onEdit(schedule)}
                              title="Edit schedule"
                              aria-label={`Edit ${schedule.day_of_week_display} ${normTime(
                                schedule.start_time
                              )}`}
                            >
                              <Icon name="pencil" size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="sched-action-danger"
                              onClick={() => onDelete(schedule)}
                              title="Delete schedule"
                              aria-label={`Delete ${schedule.day_of_week_display} ${normTime(
                                schedule.start_time
                              )}`}
                            >
                              <Icon name="trash" size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
