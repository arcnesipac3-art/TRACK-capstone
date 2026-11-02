import Button from '../Button'
import Icon from '../Icon'
import { describeSchedule } from '../../utils/schedules'

/**
 * The five seconds after a delete in which the row comes back.
 *
 * Deleting a class also stops attendance sessions being generated for that
 * slot, so the undo is not decoration — it is the difference between a
 * misclick and a lost week of marks. `DELETE /schedules/:id/` has no restore
 * counterpart, so "undo" re-posts the same row and gets a new id.
 */
export default function UndoToast({ schedule, onUndo, onDismiss }) {
  if (!schedule) return null

  return (
    <div className="sched-undo-toast" role="alert" aria-live="polite">
      <div className="sched-undo-toast-inner">
        <Icon name="checkCircle" size={20} className="sched-undo-icon" />
        <div className="sched-undo-body">
          <span className="sched-undo-title">Schedule deleted</span>
          <span className="sched-undo-detail">{describeSchedule(schedule)}</span>
        </div>
        <Button variant="primary" size="sm" className="sched-undo-action" onClick={onUndo}>
          <Icon name="undo" size={14} />
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="sched-undo-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <Icon name="close" size={14} />
        </Button>
      </div>
    </div>
  )
}
