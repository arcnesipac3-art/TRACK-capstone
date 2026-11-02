import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import FieldError from '../FieldError'
import Icon from '../Icon'
import Modal from '../Modal'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import { DAYS_OF_WEEK, normTime, schedulesOverlap } from '../../utils/schedules'

const MIN_MINUTES = 30
const MAX_MINUTES = 180

/**
 * Add or edit one weekly period.
 *
 * The conflict check runs in the browser as the admin types, on the schedules
 * this page already holds: the server validates `end_time > start_time` and the
 * `(assignment, day, start_time)` uniqueness, but it has no rule that stops a
 * teacher or a section being booked twice, so the double-booking warning is the
 * only place an admin learns it. Errors block the save; the softer warnings
 * (a 20-minute class, a room shared with another section) do not.
 */
export default function ScheduleFormModal({ schedule, existingSchedules = [], rooms = [], onClose, onSaved }) {
  const [assignment, setAssignment] = useState(schedule?.teacher_assignment || '')
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week || '')
  const [startTime, setStartTime] = useState(normTime(schedule?.start_time) || '')
  const [endTime, setEndTime] = useState(normTime(schedule?.end_time) || '')
  const [room, setRoom] = useState(schedule?.room || '')
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [busy, setBusy] = useState(false)

  // Fetched only while the dialog is open — the page itself no longer pays for
  // this list just to fill a filter dropdown.
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const isEdit = Boolean(schedule)

  const duration = useMemo(() => {
    if (!startTime || !endTime) return null
    const start = new Date(`2000-01-01T${startTime}`)
    const end = new Date(`2000-01-01T${endTime}`)
    const diffMins = Math.floor((end - start) / 60000)
    if (diffMins <= 0) return { valid: false, message: 'End time must be after start time.' }
    if (diffMins < MIN_MINUTES) return { valid: true, warning: 'Class is less than 30 minutes.' }
    if (diffMins > MAX_MINUTES) return { valid: true, warning: 'Class is more than 3 hours.' }
    return { valid: true, duration: `${diffMins} minutes` }
  }, [startTime, endTime])

  const checkConflicts = useCallback(() => {
    if (!assignment || !dayOfWeek || !startTime || !endTime) {
      setWarnings([])
      return
    }
    const chosen = assignments.data?.find((a) => a.id === Number(assignment))
    const tempSchedule = {
      id: schedule?.id || -1,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room.trim(),
      teacher_assignment_detail: chosen
        ? {
            id: chosen.id,
            teacher_id: chosen.teacher,
            teacher_name: chosen.teacher_name,
            section_id: chosen.section,
            section_name: chosen.section_name,
            subject_name: chosen.subject_name,
          }
        : null,
    }

    const found = []
    existingSchedules.forEach((existing) => {
      if (existing.id === tempSchedule.id) return
      if (!schedulesOverlap(tempSchedule, existing)) return

      const d1 = tempSchedule.teacher_assignment_detail
      const d2 = existing.teacher_assignment_detail
      // Both sides must actually name a teacher or a section: an unmatched id
      // on either side is "nothing in common", not "the same nothing".
      if (d1?.teacher_id && d2?.teacher_id && d1.teacher_id === d2.teacher_id) {
        found.push({
          type: 'error',
          message: `${d1.teacher_name} already teaches ${d2.subject_name} (${d2.section_name}) at this time`,
        })
      }
      if (d1?.section_id && d2?.section_id && d1.section_id === d2.section_id) {
        found.push({
          type: 'error',
          message: `${d1.section_name} already has ${d2.subject_name} scheduled at this time`,
        })
      }
      if (existing.room && tempSchedule.room && existing.room.toLowerCase() === tempSchedule.room.toLowerCase()) {
        found.push({
          type: 'warning',
          message: `Room ${existing.room} is already booked for ${d2.subject_name} (${d2.section_name})`,
        })
      }
    })
    setWarnings(found)
  }, [assignment, dayOfWeek, startTime, endTime, room, schedule, existingSchedules, assignments.data])

  // A warning only means something once every field the check reads is filled
  // in; while the form is incomplete it is hidden rather than cleared, so no
  // reset is needed when a field is emptied.
  const complete = Boolean(assignment && dayOfWeek && startTime && endTime)
  const shownWarnings = complete ? warnings : []
  const hasErrors =
    shownWarnings.some((warning) => warning.type === 'error') || (duration && !duration.valid)

  // Debounced, so typing a start time does not re-scan the whole timetable.
  useEffect(() => {
    if (!complete) return undefined
    const timer = setTimeout(checkConflicts, 300)
    return () => clearTimeout(timer)
  }, [complete, checkConflicts])

  function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setError(null)

    if (!assignment) {
      setError('Please select a class and subject.')
      return
    }
    if (!dayOfWeek) {
      setError('Please select a day of week.')
      return
    }
    if (!startTime || !endTime) {
      setError('Please enter start and end times.')
      return
    }
    if (startTime >= endTime) {
      setError('End time must be after start time.')
      return
    }
    if (hasErrors) {
      setError('Please resolve all conflicts before saving.')
      return
    }

    setBusy(true)
    const payload = {
      teacher_assignment: Number(assignment),
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room.trim(),
    }
    const request = isEdit
      ? api.patch(`/schedules/${schedule.id}/`, payload)
      : api.post('/schedules/', payload)

    request
      .then((saved) => {
        onSaved(saved)
        onClose()
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }

  return (
    <Modal
      open
      title={isEdit ? 'Edit Class Schedule' : 'Add Schedule'}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      width={560}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={hasErrors}
            loading={busy}
            loadingLabel="Saving…"
            title={hasErrors ? 'Resolve conflicts before saving' : undefined}
          >
            {isEdit ? 'Save Changes' : 'Add Schedule'}
          </Button>
        </>
      }
    >
      <form className="sched-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="schedule-assignment">Class and subject</label>
          <select
            id="schedule-assignment"
            className="select"
            value={assignment}
            onChange={(event) => setAssignment(event.target.value)}
            disabled={busy || assignments.loading}
            required
          >
            <option value="">
              {assignments.error
                ? 'Class list could not be loaded'
                : assignments.loading
                  ? 'Loading classes…'
                  : 'Select a class…'}
            </option>
            {(assignments.data || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.teacher_name} — {item.subject_name} — {item.section_name}
              </option>
            ))}
          </select>
          <FieldError
            id="schedule-assignment-error"
            message={assignments.error ? 'The class list did not load. Retry the screen.' : ''}
          />
        </div>

        <div className="field">
          <label htmlFor="schedule-day">Day of week</label>
          <select
            id="schedule-day"
            className="select"
            value={dayOfWeek}
            onChange={(event) => setDayOfWeek(event.target.value)}
            disabled={busy}
            required
          >
            <option value="">Select a day…</option>
            {DAYS_OF_WEEK.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sched-form-times">
          <div className="field">
            <label htmlFor="schedule-start">Start time</label>
            <input
              id="schedule-start"
              className="input"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="schedule-end">End time</label>
            <input
              id="schedule-end"
              className="input"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              disabled={busy}
              required
              aria-describedby={duration && !duration.valid ? 'schedule-end-error' : undefined}
            />
            <FieldError
              id="schedule-end-error"
              message={duration && !duration.valid ? duration.message : ''}
            />
          </div>
        </div>

        {duration?.valid && duration.duration && !duration.warning && (
          <p className="sched-form-duration">
            <Icon name="clock" size={14} aria-hidden="true" />
            Class duration: {duration.duration}
          </p>
        )}
        {duration?.warning && (
          <p className="sched-form-warning">
            <Icon name="alertTriangle" size={14} aria-hidden="true" />
            {duration.warning}
          </p>
        )}

        <div className="field">
          <label htmlFor="schedule-room">Room</label>
          <input
            id="schedule-room"
            className="input"
            type="text"
            list="room-suggestions"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            disabled={busy}
            placeholder="e.g., Room 101, Science Lab"
            maxLength={50}
          />
          {rooms.length > 0 && (
            <datalist id="room-suggestions">
              {rooms.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
          <p className="hint">
            {rooms.length > 0
              ? 'Optional. Suggestions come from the rooms already in use.'
              : 'Optional.'}
          </p>
        </div>

        {shownWarnings.length > 0 && (
          <div className="sched-form-conflicts">
            {shownWarnings.map((warning, index) => (
              <p
                key={`${warning.type}-${warning.message}-${index}`}
                className={`sched-form-alert is-${warning.type}`}
              >
                <Icon
                  name={warning.type === 'error' ? 'alertTriangle' : 'info'}
                  size={14}
                  aria-hidden="true"
                />
                {warning.message}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="sched-form-alert is-error" role="alert">
            <Icon name="info" size={14} aria-hidden="true" />
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
