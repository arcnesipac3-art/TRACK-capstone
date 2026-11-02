/**
 * Teacher dashboard maths.
 *
 * Django hands the teacher dashboard one aggregate (`_attendance_summary`,
 * `_submission_summary`, `upcoming_deadlines`, `recent_activity` in
 * `core/views.py`) and nothing else that is per-day: `/schedules/` is a weekly
 * table with no date, and `/attendance/sessions/` accepts no date filter. So
 * the day-shaped figures below are joined in the browser from the rows this
 * account is already allowed to read, on foreign-key ids
 * (`teacher_assignment`, `requirement`, `schedule`) and never on a display
 * label. Every function is pure and returns `null` rather than a zero when the
 * data for a figure is not on the page.
 */

import { normTime, timeToMinutes } from './schedules'

/** The four marks one attendance record can carry. */
export const RECORD_STATUSES = ['present', 'absent', 'late', 'excused']

/** Statuses that mean a pupil handed something in — the server's own rule. */
export const WORK_STATUSES = ['submitted', 'verified', 'returned']

/** One week of weekday offsets for the "next classes" list. */
const LOOKAHEAD_DAYS = 7

/** Local calendar date as Django writes it (`YYYY-MM-DD`), not UTC. */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** ISO weekday, Monday = 1 … Sunday = 7, matching `ClassSchedule.DayOfWeek`. */
export function isoWeekday(date = new Date()) {
  return date.getDay() === 0 ? 7 : date.getDay()
}

function minutesOf(date) {
  return date.getHours() * 60 + date.getMinutes()
}

/** Tally the records a session payload already embeds. */
function tallyRecords(records) {
  const tally = { recorded: 0, present: 0, absent: 0, late: 0, excused: 0 }
  ;(records || []).forEach((record) => {
    tally.recorded += 1
    if (tally[record.status] !== undefined) tally[record.status] += 1
  })
  return tally
}

/**
 * The attendance session that belongs to one weekly slot on one date.
 *
 * A generated session carries its `schedule` id, so that is the join. A manual
 * session (`schedule: null`) is only claimed when the class has a single
 * session that day — with two or more there is nothing to join on, and
 * guessing would attribute one slot's marks to another.
 */
function sessionForSlot(sessions, assignmentId, dateKey, scheduleId) {
  const sameClass = sessions.filter(
    (item) => String(item.teacher_assignment) === String(assignmentId) && item.date === dateKey
  )
  if (sameClass.length === 0) return null
  const exact = sameClass.find((item) => item.schedule === scheduleId)
  if (exact) return exact
  return sameClass.length === 1 && sameClass[0].schedule == null ? sameClass[0] : null
}

/**
 * Does this slot sit before, during or after its own clock window?
 * Only meaningful for today — a future weekday has not started yet.
 */
export function slotState(startMinutes, endMinutes, nowMinutes) {
  if (nowMinutes >= endMinutes) return 'finished'
  if (nowMinutes >= startMinutes) return 'now'
  return 'upcoming'
}

/**
 * Today's slots plus the next slots after today, from the weekly table.
 *
 * @returns {{today: Array, next: Array, hasSchedule: boolean}}
 */
export function buildTeachingSchedule({
  schedules = [],
  sessions = [],
  now = new Date(),
  upcomingLimit = 3,
} = {}) {
  const todayKey = localDateKey(now)
  const nowMinutes = minutesOf(now)
  const todayWeekday = isoWeekday(now)

  const row = (schedule, dateKey, dayOffset) => {
    const detail = schedule.teacher_assignment_detail || {}
    const startMinutes = timeToMinutes(schedule.start_time)
    const endMinutes = timeToMinutes(schedule.end_time)
    const session = sessionForSlot(
      sessions,
      schedule.teacher_assignment,
      dateKey,
      schedule.id
    )
    const marks = session ? tallyRecords(session.records) : null
    return {
      id: schedule.id,
      assignmentId: schedule.teacher_assignment,
      subject: detail.subject_name || 'Subject',
      section: detail.section_name || detail.grade_level || 'Unassigned section',
      room: schedule.room || '',
      date: dateKey,
      dayOffset,
      start: normTime(schedule.start_time),
      end: normTime(schedule.end_time),
      startMinutes,
      endMinutes,
      state: dayOffset === 0 ? slotState(startMinutes, endMinutes, nowMinutes) : 'scheduled',
      session: session
        ? {
            id: session.id,
            status: session.status || 'not_started',
            statusDisplay: session.status_display || session.status || 'Not started',
            ...marks,
          }
        : null,
      attendanceRecorded: Boolean(marks && marks.recorded > 0),
    }
  }

  const today = schedules
    .filter((schedule) => schedule.day_of_week === todayWeekday)
    .map((schedule) => row(schedule, todayKey, 0))
    .sort((a, b) => a.startMinutes - b.startMinutes)

  const next = []
  for (let offset = 1; offset <= LOOKAHEAD_DAYS && next.length < upcomingLimit; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const weekday = isoWeekday(date)
    schedules
      .filter((schedule) => schedule.day_of_week === weekday)
      .map((schedule) => row(schedule, localDateKey(date), offset))
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .forEach((slot) => {
        if (next.length < upcomingLimit) next.push(slot)
      })
  }

  return { today, next, hasSchedule: schedules.length > 0 }
}

/**
 * Today's attendance, in the shape `_attendance_summary` returns so the shared
 * attendance card can render it beside the all-time figures.
 *
 * `null` means the teacher has no class session today at all — the card then
 * says nothing about "today" instead of showing a row of zeros. A real zero is
 * reported as zero: sessions exist, nobody has been marked yet.
 */
export function buildTodayAttendance({ sessions = [], now = new Date() } = {}) {
  const todayKey = localDateKey(now)
  const daySessions = sessions.filter((session) => session.date === todayKey)
  if (daySessions.length === 0) return null

  const byStatus = { present: 0, absent: 0, late: 0, excused: 0 }
  let total = 0
  daySessions.forEach((session) => {
    const marks = tallyRecords(session.records)
    RECORD_STATUSES.forEach((status) => {
      byStatus[status] += marks[status]
    })
    total += marks.recorded
  })

  return {
    date: todayKey,
    sessionCount: daySessions.length,
    total_records: total,
    by_status: byStatus,
    present_rate: total ? Math.round((1000 * byStatus.present) / total) / 10 : null,
  }
}

/**
 * Deep link into the module that owns a class, carrying the class so the
 * screen opens filtered on it (`?class=` is read by the requirements, review
 * and attendance screens).
 */
export function classLink(path, assignmentId) {
  const base = `/teacher/${path}`
  return assignmentId == null || assignmentId === ''
    ? base
    : `${base}?class=${assignmentId}`
}

/**
 * The verification queue: pending submission rows, joined through their
 * requirement to the class that posted it so each row links to its review.
 * Oldest first within the newest rows — work that has waited longest is the
 * one a teacher has to chase, so `waitingDays` comes back for the caller to
 * sort or flag with.
 */
export function buildVerificationQueue({
  submissions = [],
  requirements = [],
  now = new Date(),
  limit = 6,
} = {}) {
  const byRequirement = new Map(requirements.map((item) => [item.id, item]))
  const rows = submissions
    .filter((submission) => submission.status === 'submitted')
    .map((submission) => {
      const requirement = byRequirement.get(submission.requirement) || null
      const submittedAt = submission.submitted_at
        ? new Date(submission.submitted_at)
        : null
      const waitingDays =
        submittedAt && !Number.isNaN(submittedAt.getTime())
          ? Math.max(0, Math.floor((now - submittedAt) / 86400000))
          : null
      const deadline = requirement && requirement.deadline
        ? new Date(requirement.deadline)
        : null
      return {
        id: submission.id,
        studentName: submission.student_name || 'A student',
        requirementId: submission.requirement,
        requirementTitle:
          submission.requirement_title || (requirement && requirement.title) || 'Requirement',
        assignmentId: requirement ? requirement.teacher_assignment : null,
        subject: requirement ? requirement.subject_name : '',
        section: requirement ? requirement.section_name : '',
        submittedAt,
        waitingDays,
        pastDeadline: Boolean(deadline && !Number.isNaN(deadline.getTime()) && deadline < now),
        reviewHref: classLink('review', requirement ? requirement.teacher_assignment : null),
      }
    })
  return { rows: rows.slice(0, limit), total: rows.length }
}

/**
 * Submission overview figures.
 *
 * `onRecord` counts only work a pupil actually handed in (`WORK_STATUSES`), so
 * the `not_submitted` and `overdue` rows TRACK keeps for missing work never
 * inflate a total or a percentage.
 */
export function buildSubmissionOverview(statusCounts = {}) {
  const count = (key) => Number(statusCounts[key] || 0)
  const pending = count('submitted')
  const verified = count('verified')
  const returned = count('returned')
  return {
    pending,
    verified,
    returned,
    overdue: count('overdue'),
    // `none` is the server's "requirement with no submission row at all".
    outstanding: count('not_submitted') + count('none'),
    onRecord: pending + verified + returned,
  }
}

/** Activity feed meta: what happened, shown as an icon and a tone. */
export const ACTIVITY_META = {
  submitted: { icon: 'inbox', tone: 'amber', label: 'Awaiting verification' },
  verified: { icon: 'checkCircle', tone: 'green', label: 'Verified' },
  returned: { icon: 'undo', tone: 'red', label: 'Returned for revision' },
  overdue: { icon: 'clock', tone: 'red', label: 'Overdue' },
  not_submitted: { icon: 'info', tone: '', label: 'Not submitted' },
}

export function activityMeta(status) {
  return (
    ACTIVITY_META[status] || { icon: 'activity', tone: '', label: status || 'Activity' }
  )
}

/**
 * Deadline rows, soonest first, each linked to the class that set it.
 *
 * The dashboard payload already caps `upcoming_deadlines` to future dates; the
 * join adds the class link and drops a row whose deadline has since passed, so
 * a stale payload cannot offer a "due in −2 days".
 */
export function buildDeadlineRows({
  deadlines = [],
  requirements = [],
  now = new Date(),
  limit = 5,
} = {}) {
  const byRequirement = new Map(requirements.map((item) => [item.id, item]))
  return deadlines
    .filter((item) => {
      const at = item.deadline ? new Date(item.deadline) : null
      return at && !Number.isNaN(at.getTime()) && at >= now
    })
    .map((item) => {
      const requirement = byRequirement.get(item.id) || null
      return {
        ...item,
        assignmentId: requirement ? requirement.teacher_assignment : null,
        href: classLink('requirements', requirement ? requirement.teacher_assignment : null),
      }
    })
    .slice(0, limit)
}
