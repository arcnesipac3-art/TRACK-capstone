import Button from '../Button'
import Icon from '../Icon'
import Modal from '../Modal'
import { dayLabel, timeRange } from '../../utils/schedules'

/**
 * Read-only view of one period, opened by clicking its block in the grid.
 *
 * Editing belongs to whoever holds `structure.manage`, so the two authoring
 * actions appear only when the caller passes their handlers.
 */
export default function ScheduleDetailModal({ schedule, onClose, onEdit, onDelete }) {
  if (!schedule) return null
  const detail = schedule.teacher_assignment_detail

  const rows = [
    ['Class and subject', detail?.subject_name],
    ['Section', detail?.section_name],
    ['Teacher', detail?.teacher_name],
    ['Grade level', detail?.grade_level],
    ['Day', schedule.day_of_week_display || dayLabel(schedule.day_of_week)],
    ['Time', timeRange(schedule)],
    ['Room', schedule.room],
  ]

  return (
    <Modal
      open
      title="Schedule details"
      onClose={onClose}
      width={500}
      footer={
        <>
          {onDelete && (
            <Button variant="danger" size="sm" onClick={() => onDelete(schedule)}>
              <Icon name="trash" size={14} />
              Delete
            </Button>
          )}
          <span className="grow" />
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          {onEdit && (
            <Button variant="primary" size="sm" onClick={() => onEdit(schedule)}>
              <Icon name="pencil" size={14} />
              Edit
            </Button>
          )}
        </>
      }
    >
      <dl className="sched-detail">
        {rows.map(([label, value]) => (
          <div className="sched-detail-row" key={label}>
            <dt>{label}</dt>
            <dd className={value ? '' : 'is-missing'}>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
