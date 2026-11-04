import { useState } from 'react'
import Button from '../Button'
import Icon from '../Icon'
import usePresence from '../../hooks/usePresence'
import { describeSchedule } from '../../utils/schedules'

/**
 * The five seconds after a delete in which the row comes back.
 *
 * Deleting a class also stops attendance sessions being generated for that
 * slot, so the undo is not decoration — it is the difference between a
 * misclick and a lost week of marks. `DELETE /schedules/:id/` has no restore
 * counterpart, so "undo" re-posts the same row and gets a new id.
 *
 * The card is kept painted for the length of its exit keyframe after the
 * delete is undone, so leaving is the mirror of arriving.
 */
export default function UndoToast({ schedule, onUndo, onDismiss }) {
  const { mounted, exiting } = usePresence(Boolean(schedule), 200)
  // While leaving, the card still names the row that was deleted — held as
  // text because the schedule itself is gone by then.
  const [heldDetail, setHeldDetail] = useState('')
  const detail = schedule ? describeSchedule(schedule) : heldDetail
  if (schedule && heldDetail !== detail) setHeldDetail(detail)
  if (!mounted) return null

  return (
    <div
      className={exiting ? 'sched-undo-toast sched-undo-toast-out' : 'sched-undo-toast'}
      role="alert"
      aria-live="polite"
    >
      <div className="sched-undo-toast-inner">
        <Icon name="checkCircle" size={20} className="sched-undo-icon" />
        <div className="sched-undo-body">
          <span className="sched-undo-title">Schedule deleted</span>
          <span className="sched-undo-detail">{detail}</span>
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
