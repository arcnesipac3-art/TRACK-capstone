/**
 * Pure timetable helpers shared by the schedules screen and its components.
 *
 * These live outside the page component so the page file exports only
 * components (which keeps fast refresh working) and so the conflict logic
 * can be imported without pulling in the whole screen.
 */

/**
 * The server accepts Monday–Sunday (`ClassSchedule.DayOfWeek` is 1–7 and
 * `generate_attendance_sessions` matches it with `date.isoweekday()`), so the
 * UI offers all seven. The grid still *shows* five columns for a school that
 * never schedules a weekend — see `timetableDays`.
 */
export const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
]

/** Days a timetable always shows, whether or not anything is booked in them. */
const CORE_DAY_VALUES = [1, 2, 3, 4, 5]

export function dayLabel(value) {
  return DAYS_OF_WEEK.find((day) => day.value === value)?.label || '—'
}

export function dayShort(value) {
  return DAYS_OF_WEEK.find((day) => day.value === value)?.short || '—'
}

/**
 * Which columns the weekly grid draws: the five school days, plus a weekend
 * column only once a class actually sits in it. A school that never teaches
 * Saturday keeps a five-day timetable; the first Saturday class makes the
 * column appear instead of the class vanishing from a five-column grid.
 */
export function timetableDays(schedules) {
  const present = new Set((schedules || []).map((s) => s.day_of_week))
  return DAYS_OF_WEEK.filter((day) => CORE_DAY_VALUES.includes(day.value) || present.has(day.value))
}

/**
 * Today as the server numbers it: 1 = Monday … 7 = Sunday.
 *
 * The school day is read in Manila time because a schedule saved for "Monday
 * 07:30" means Monday *at school*, whichever side of midnight the browser
 * happens to be on. The calendar date is taken from the same clock as the
 * weekday, so the two can never disagree.
 */
function manilaParts(now) {
  const stamped = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [year, month, day] = String(stamped).split('-').map(Number)
  if (!year || !month || !day) {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  }
  return { year, month, day }
}

export function todayWeekday(now = new Date()) {
  const { year, month, day } = manilaParts(now)
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

/** Label for the Monday–Sunday week containing today (school time). */
export function weekRangeLabel(now = new Date()) {
  const { year, month, day } = manilaParts(now)
  const startOfToday = Date.UTC(year, month - 1, day)
  const monday = startOfToday - (todayWeekday(now) - 1) * 86400000
  const sunday = monday + 6 * 86400000
  const fmt = (ms) =>
    new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(monday)} – ${fmt(sunday)}, ${new Date(sunday).getUTCFullYear()}`
}

export function normTime(t) {
  return t?.slice(0, 5) ?? ''
}

export function timeToMinutes(t) {
  const [h, m] = normTime(t).split(':').map(Number)
  return h * 60 + m
}

/** "07:30–08:30" — the one place the en dash between two times is spelled. */
export function timeRange(schedule) {
  return `${normTime(schedule?.start_time)}–${normTime(schedule?.end_time)}`
}

/**
 * One-line identity of a schedule, used wherever a dialog or a toast has to
 * name the row it is about without the reader having to look it up.
 */
export function describeSchedule(schedule) {
  if (!schedule) return 'This schedule'
  const detail = schedule.teacher_assignment_detail
  const parts = [
    [detail?.subject_name, detail?.section_name].filter(Boolean).join(' · '),
    `${schedule.day_of_week_display || dayLabel(schedule.day_of_week)} ${timeRange(schedule)}`,
  ]
  if (schedule.room) parts.push(schedule.room)
  return parts.filter(Boolean).join(' · ')
}

export function generatePeriodGrid(schedules) {
  if (!schedules || schedules.length === 0) return []
  const timeBoundaries = new Set()
  schedules.forEach((s) => {
    timeBoundaries.add(normTime(s.start_time))
    timeBoundaries.add(normTime(s.end_time))
  })
  const sortedTimes = Array.from(timeBoundaries).sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
  const periods = []
  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const start = sortedTimes[i]
    const end = sortedTimes[i + 1]
    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    if (endMin > startMin) {
      periods.push({
        index: periods.length + 1,
        start,
        end,
        startMin,
        endMin,
        duration: endMin - startMin,
      })
    }
  }
  return periods
}

export function schedulesOverlap(s1, s2) {
  if (s1.day_of_week !== s2.day_of_week) return false
  const s1Start = normTime(s1.start_time)
  const s1End = normTime(s1.end_time)
  const s2Start = normTime(s2.start_time)
  const s2End = normTime(s2.end_time)
  // Strict overlap: s1 starts before s2 ends AND s1 ends after s2 starts.
  // Adjacent periods (s1.end === s2.start) are NOT overlapping.
  return s1Start < s2End && s1End > s2Start
}

export function detectConflicts(schedules) {
  const conflicts = []
  const seen = new Set()
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const s1 = schedules[i]
      const s2 = schedules[j]
      if (s1.id === s2.id) continue
      if (!schedulesOverlap(s1, s2)) continue
      const key = `${Math.min(s1.id, s2.id)}-${Math.max(s1.id, s2.id)}`
      if (seen.has(key)) continue
      seen.add(key)
      const reasons = []
      const d1 = s1.teacher_assignment_detail
      const d2 = s2.teacher_assignment_detail
      if (d1?.teacher_id && d2?.teacher_id && d1.teacher_id === d2.teacher_id) {
        reasons.push({ type: 'teacher', message: `${d1.teacher_name} is double-booked at this time`, severity: 'high' })
      }
      if (d1?.section_id && d2?.section_id && d1.section_id === d2.section_id) {
        reasons.push({ type: 'section', message: `${d1.section_name} has two overlapping classes`, severity: 'high' })
      }
      if (s1.room && s2.room && s1.room.trim().toLowerCase() === s2.room.trim().toLowerCase()) {
        reasons.push({ type: 'room', message: `Room ${s1.room} is double-booked`, severity: 'medium' })
      }
      if (reasons.length > 0) {
        conflicts.push({
          id: `${s1.id}-${s2.id}`,
          schedules: [s1, s2],
          reasons,
          day: s1.day_of_week,
          dayLabel: dayLabel(s1.day_of_week),
          time: `${normTime(s1.start_time)}–${normTime(s1.end_time)}`,
        })
      }
    }
  }
  return conflicts
}

/**
 * Group conflicts by day and time for clearer presentation.
 * Returns an array of grouped conflicts, each containing:
 * - day, dayLabel, time
 * - conflicts: array of individual conflict objects (each with schedules, reasons)
 * - summary: counts by type (teacher, section, room)
 */
export function groupConflicts(conflicts) {
  const groups = new Map()

  conflicts.forEach((conflict) => {
    const key = `${conflict.day}-${conflict.time}`
    if (!groups.has(key)) {
      groups.set(key, {
        day: conflict.day,
        dayLabel: conflict.dayLabel,
        time: conflict.time,
        conflicts: [],
        summary: { teacher: 0, section: 0, room: 0 },
      })
    }
    const group = groups.get(key)
    group.conflicts.push(conflict)
    conflict.reasons.forEach((r) => {
      if (group.summary[r.type] !== undefined) {
        group.summary[r.type]++
      }
    })
  })

  // Sort groups by day then time
  return Array.from(groups.values()).sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    return a.time.localeCompare(b.time)
  })
}

/** Map of schedule id → the reasons it appears in a conflict, for row markers. */
export function reasonsBySchedule(conflicts) {
  const map = new Map()
  ;(conflicts || []).forEach((conflict) => {
    conflict.schedules.forEach((schedule) => {
      if (!map.has(schedule.id)) map.set(schedule.id, [])
      map.get(schedule.id).push(...conflict.reasons.map((r) => r.message))
    })
  })
  return map
}

/**
 * Which cell each period of each day is drawn in.
 *
 * A class that spans several generated periods merges into one tall cell
 * (`rowSpan`), which a table can only do when it is alone there. Two classes
 * sharing a period therefore stack inside one cell instead, and the periods
 * below a merged block emit no `<td>` at all — the browser spans for them.
 *
 * Returns `{ [dayValue]: { startingHere: { [periodIndex]: [{schedule, span}] },
 * coveredBy: [scheduleId|null, ...] } }`.
 */
export function timetableLayout(schedules, periods, days) {
  const byDay = {}

  ;(days || []).forEach((day) => {
    const daySchedules = (schedules || [])
      .filter((s) => s.day_of_week === day.value)
      .sort(
        (a, b) => normTime(a.start_time).localeCompare(normTime(b.start_time)) || a.id - b.id
      )

    const startingHere = {}
    const coveredBy = new Array(periods.length).fill(null)

    daySchedules.forEach((schedule) => {
      const sStart = timeToMinutes(normTime(schedule.start_time))
      const sEnd = timeToMinutes(normTime(schedule.end_time))

      let firstIdx = -1
      for (let i = 0; i < periods.length; i++) {
        if (periods[i].startMin === sStart) {
          firstIdx = i
          break
        }
        if (periods[i].startMin < sStart && periods[i].endMin > sStart) {
          firstIdx = i
          break
        }
      }
      if (firstIdx === -1) return

      let span = 0
      for (let i = firstIdx; i < periods.length; i++) {
        if (periods[i].startMin >= sStart && periods[i].endMin <= sEnd) {
          span++
          coveredBy[i] = schedule.id
        } else break
      }
      if (span > 0) {
        if (!startingHere[firstIdx]) startingHere[firstIdx] = []
        startingHere[firstIdx].push({ schedule, span })
      }
    })

    byDay[day.value] = { startingHere, coveredBy }
  })

  return byDay
}

/**
 * The four filter dropdowns, read off the schedules the screen already holds.
 *
 * These used to come from a separate `/teacher-assignments/` crawl, which cost
 * a second paged request on every visit and offered classes that have no
 * timetable at all — nothing to filter to. Ids, not labels, are the option
 * values: `section_name` is only unique per grade level, and the teacher filter
 * must key on `teacher_id` rather than the assignment row id.
 */
export function filterOptions(schedules) {
  const teachers = new Map()
  const sections = new Map()
  const subjects = new Set()

  ;(schedules || []).forEach((schedule) => {
    const detail = schedule.teacher_assignment_detail
    if (!detail) return
    if (detail.teacher_id && !teachers.has(detail.teacher_id)) {
      teachers.set(detail.teacher_id, detail.teacher_name || '—')
    }
    if (detail.section_id && !sections.has(detail.section_id)) {
      sections.set(detail.section_id, detail.section_name || '')
    }
    if (detail.subject_name) subjects.add(detail.subject_name)
  })

  const byLabel = (entries) =>
    Array.from(entries, ([id, name]) => ({ id, name })).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    )

  return {
    teachers: byLabel(teachers),
    sections: byLabel(sections),
    subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b)),
  }
}

/**
 * Apply the four filters. Values are the ids `filterOptions` produced, except
 * subject (the serializer exposes no subject id) and the day number.
 */
export function applyFilters(schedules, filters = {}) {
  const { teacher = '', section = '', subject = '', day = '' } = filters
  return (schedules || []).filter((schedule) => {
    const detail = schedule.teacher_assignment_detail
    if (teacher && detail?.teacher_id !== Number(teacher)) return false
    if (section && detail?.section_id !== Number(section)) return false
    if (subject && detail?.subject_name !== subject) return false
    if (day && schedule.day_of_week !== Number(day)) return false
    return true
  })
}

/** One entry per class-and-subject, its periods sorted, for the list view. */
export function groupByAssignment(schedules) {
  const groups = new Map()

  ;(schedules || []).forEach((schedule) => {
    const key = schedule.teacher_assignment
    if (!groups.has(key)) {
      groups.set(key, { assignment: schedule.teacher_assignment_detail || {}, schedules: [] })
    }
    groups.get(key).schedules.push(schedule)
  })

  const result = Array.from(groups.values())
  result.forEach((group) => {
    group.schedules.sort(
      (a, b) =>
        a.day_of_week - b.day_of_week || normTime(a.start_time).localeCompare(normTime(b.start_time))
    )
  })
  result.sort((a, b) => {
    const left = `${a.assignment?.teacher_name ?? ''} ${a.assignment?.subject_name ?? ''}`
    const right = `${b.assignment?.teacher_name ?? ''} ${b.assignment?.subject_name ?? ''}`
    return left.localeCompare(right)
  })
  return result
}

/**
 * The KPI strip. Every figure is counted from the rows the screen holds —
 * nothing here asks the server for a number it did not already send.
 */
export function scheduleSummary(schedules, today = todayWeekday()) {
  const rows = schedules || []
  const conflicts = detectConflicts(rows)
  const teachers = new Set()
  const days = new Set()
  let todayCount = 0

  rows.forEach((schedule) => {
    if (schedule.teacher_assignment_detail?.teacher_id) {
      teachers.add(schedule.teacher_assignment_detail.teacher_id)
    }
    days.add(schedule.day_of_week)
    if (schedule.day_of_week === today) todayCount += 1
  })

  return {
    total: rows.length,
    today: todayCount,
    teachers: teachers.size,
    days: days.size,
    conflicts: conflicts.length,
  }
}
