/**
 * Pure timetable helpers shared by SchedulesPage and its tests.
 *
 * These live outside the page component so the page file exports only
 * components (which keeps fast refresh working) and so the conflict logic
 * can be imported without pulling in the whole screen.
 */

export const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
]

export function normTime(t) {
  return t?.slice(0, 5) ?? ''
}

export function timeToMinutes(t) {
  const [h, m] = normTime(t).split(':').map(Number)
  return h * 60 + m
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
        const dayLabel = DAYS_OF_WEEK.find((d) => d.value === s1.day_of_week)?.label || '—'
        conflicts.push({
          id: `${s1.id}-${s2.id}`,
          schedules: [s1, s2],
          reasons,
          day: s1.day_of_week,
          dayLabel,
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
