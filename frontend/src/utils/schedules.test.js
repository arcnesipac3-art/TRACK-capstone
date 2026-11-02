import { describe, it, expect } from 'vitest'
import {
  DAYS_OF_WEEK,
  applyFilters,
  dayLabel,
  describeSchedule,
  detectConflicts,
  filterOptions,
  generatePeriodGrid,
  groupByAssignment,
  groupConflicts,
  normTime,
  reasonsBySchedule,
  scheduleSummary,
  schedulesOverlap,
  timeRange,
  timeToMinutes,
  timetableDays,
  timetableLayout,
  todayWeekday,
  weekRangeLabel,
} from './schedules'

// Helper to create a schedule object matching the API shape
function makeSchedule(overrides) {
  return {
    id: overrides.id ?? 1,
    teacher_assignment: overrides.teacher_assignment ?? 1,
    day_of_week: overrides.day_of_week ?? 1,
    start_time: overrides.start_time ?? '08:00',
    end_time: overrides.end_time ?? '09:00',
    room: overrides.room ?? 'Room 101',
    day_of_week_display: overrides.day_of_week_display ?? 'Monday',
    teacher_assignment_detail: {
      id: overrides.teacher_assignment_detail?.id ?? overrides.teacher_assignment ?? 1,
      teacher_id: overrides.teacher_assignment_detail?.teacher_id ?? 1,
      teacher_name: overrides.teacher_assignment_detail?.teacher_name ?? 'Teacher A',
      subject_name: overrides.teacher_assignment_detail?.subject_name ?? 'Mathematics',
      section_id: overrides.teacher_assignment_detail?.section_id ?? 1,
      section_name: overrides.teacher_assignment_detail?.section_name ?? 'Grade 7',
      grade_level: overrides.teacher_assignment_detail?.grade_level ?? 'Grade 7',
      ...overrides.teacher_assignment_detail,
    },
  }
}

describe('normTime', () => {
  it('strips seconds from a time string', () => {
    expect(normTime('08:00:00')).toBe('08:00')
    expect(normTime('09:30:00')).toBe('09:30')
  })
  it('returns empty string for null/undefined', () => {
    expect(normTime(null)).toBe('')
    expect(normTime(undefined)).toBe('')
  })
})

describe('timeToMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(timeToMinutes('08:00')).toBe(480)
    expect(timeToMinutes('12:30')).toBe(750)
    expect(timeToMinutes('09:00:00')).toBe(540)
  })
})

describe('schedulesOverlap', () => {
  it('detects genuine time overlap on the same day', () => {
    const s1 = makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' })
    const s2 = makeSchedule({ id: 2, start_time: '08:30', end_time: '09:30' })
    expect(schedulesOverlap(s1, s2)).toBe(true)
  })

  it('treats adjacent periods as non-overlapping', () => {
    const s1 = makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' })
    const s2 = makeSchedule({ id: 2, start_time: '09:00', end_time: '10:00' })
    expect(schedulesOverlap(s1, s2)).toBe(false)
  })

  it('returns false for schedules on different days', () => {
    const s1 = makeSchedule({ id: 1, day_of_week: 1, start_time: '08:00', end_time: '09:00' })
    const s2 = makeSchedule({ id: 2, day_of_week: 2, start_time: '08:00', end_time: '09:00' })
    expect(schedulesOverlap(s1, s2)).toBe(false)
  })

  it('handles time strings with and without seconds', () => {
    const s1 = makeSchedule({ id: 1, start_time: '08:00:00', end_time: '09:00:00' })
    const s2 = makeSchedule({ id: 2, start_time: '08:00', end_time: '09:00' })
    expect(schedulesOverlap(s1, s2)).toBe(true)
  })

  it('does not compare a schedule against itself', () => {
    const s1 = makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' })
    // Same id — detectConflicts should skip this pair
    const s2 = makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(0)
  })
})

describe('detectConflicts', () => {
  it('detects teacher double-booking', () => {
    const s1 = makeSchedule({
      id: 1,
      teacher_assignment: 1,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'Math', section_id: 1, section_name: 'G7' },
    })
    const s2 = makeSchedule({
      id: 2,
      teacher_assignment: 2,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'English', section_id: 2, section_name: 'G8' },
      room: 'Room 102',
    })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reasons.some((r) => r.type === 'teacher')).toBe(true)
  })

  it('detects section overlap', () => {
    const s1 = makeSchedule({
      id: 1,
      teacher_assignment: 1,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'Math', section_id: 5, section_name: 'G7-Sampaguita' },
    })
    const s2 = makeSchedule({
      id: 2,
      teacher_assignment: 2,
      teacher_assignment_detail: { teacher_id: 20, teacher_name: 'Marco', subject_name: 'Science', section_id: 5, section_name: 'G7-Sampaguita' },
      room: 'Room 102',
    })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reasons.some((r) => r.type === 'section')).toBe(true)
  })

  it('detects room conflict only', () => {
    const s1 = makeSchedule({
      id: 1,
      teacher_assignment: 1,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'Math', section_id: 1, section_name: 'G7' },
    })
    const s2 = makeSchedule({
      id: 2,
      teacher_assignment: 2,
      teacher_assignment_detail: { teacher_id: 20, teacher_name: 'Marco', subject_name: 'Science', section_id: 2, section_name: 'G8' },
      room: 'Room 101',
    })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reasons).toHaveLength(1)
    expect(conflicts[0].reasons[0].type).toBe('room')
  })

  it('does not flag overlapping schedules with different teacher, section, and room', () => {
    const s1 = makeSchedule({
      id: 1,
      teacher_assignment: 1,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'Math', section_id: 1, section_name: 'G7' },
      room: 'Room 101',
    })
    const s2 = makeSchedule({
      id: 2,
      teacher_assignment: 2,
      teacher_assignment_detail: { teacher_id: 20, teacher_name: 'Marco', subject_name: 'Science', section_id: 2, section_name: 'G8' },
      room: 'Room 102',
    })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(0)
  })

  it('does not count conflicts across different days', () => {
    const s1 = makeSchedule({ id: 1, day_of_week: 1, teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'Math', section_id: 1, section_name: 'G7' } })
    const s2 = makeSchedule({ id: 2, day_of_week: 3, teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'English', section_id: 1, section_name: 'G7' } })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(0)
  })

  it('does not flag adjacent periods as conflicts', () => {
    const s1 = makeSchedule({
      id: 1,
      start_time: '08:00',
      end_time: '09:00',
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'Math', section_id: 1, section_name: 'G7' },
    })
    const s2 = makeSchedule({
      id: 2,
      start_time: '09:00',
      end_time: '10:00',
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'English', section_id: 1, section_name: 'G7' },
    })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(0)
  })

  it('groups multiple reasons in a single conflict pair', () => {
    // Same teacher, same section, same room = 3 reasons in 1 conflict
    const s1 = makeSchedule({
      id: 1,
      teacher_assignment: 1,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'Math', section_id: 1, section_name: 'G7' },
      room: 'Room 101',
    })
    const s2 = makeSchedule({
      id: 2,
      teacher_assignment: 2,
      teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa', subject_name: 'English', section_id: 1, section_name: 'G7' },
      room: 'Room 101',
    })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reasons).toHaveLength(3)
    expect(conflicts[0].reasons.map((r) => r.type).sort()).toEqual(['room', 'section', 'teacher'])
  })

  it('counts each conflicting pair exactly once', () => {
    // 3 schedules on same day/time/room = C(3,2) = 3 conflict pairs
    const s1 = makeSchedule({ id: 1, teacher_assignment: 1, teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'Math', section_id: 1, section_name: 'G7' }, room: 'Room 101' })
    const s2 = makeSchedule({ id: 2, teacher_assignment: 2, teacher_assignment_detail: { teacher_id: 20, teacher_name: 'M', subject_name: 'English', section_id: 2, section_name: 'G8' }, room: 'Room 101' })
    const s3 = makeSchedule({ id: 3, teacher_assignment: 3, teacher_assignment_detail: { teacher_id: 30, teacher_name: 'S', subject_name: 'Science', section_id: 3, section_name: 'G9' }, room: 'Room 101' })
    const conflicts = detectConflicts([s1, s2, s3])
    expect(conflicts).toHaveLength(3)
  })

  it('includes day and time in the conflict for identification', () => {
    const s1 = makeSchedule({ id: 1, day_of_week: 3, start_time: '08:00', end_time: '09:00', teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'Math', section_id: 1, section_name: 'G7' } })
    const s2 = makeSchedule({ id: 2, day_of_week: 3, start_time: '08:00', end_time: '09:00', teacher_assignment_detail: { teacher_id: 10, teacher_name: 'T', subject_name: 'English', section_id: 2, section_name: 'G8' }, room: 'Room 102' })
    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].day).toBe(3)
    expect(conflicts[0].dayLabel).toBe('Wednesday')
    expect(conflicts[0].time).toContain('08:00')
  })

  it('handles empty schedule list', () => {
    expect(detectConflicts([])).toEqual([])
  })

  it('does not flag a schedule against itself', () => {
    const s1 = makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' })
    // Same id should be skipped
    const s1Copy = makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' })
    const conflicts = detectConflicts([s1, s1Copy])
    // The pair key uses min/max id, so id=1 vs id=1 would be "1-1" which is the same pair
    // But the loop also checks i < j so it's the same record — detectConflicts should not flag
    expect(conflicts).toHaveLength(0)
  })
})

describe('groupConflicts', () => {
  function makeConflict(overrides) {
    return {
      id: overrides.id ?? '1-2',
      schedules: overrides.schedules ?? [],
      reasons: overrides.reasons ?? [{ type: 'teacher', message: 'Teacher conflict', severity: 'high' }],
      day: overrides.day ?? 1,
      dayLabel: overrides.dayLabel ?? 'Monday',
      time: overrides.time ?? '08:00–09:00',
    }
  }

  it('groups conflicts by day and time', () => {
    const c1 = makeConflict({ id: '1-2', day: 1, time: '08:00–09:00' })
    const c2 = makeConflict({ id: '1-3', day: 1, time: '08:00–09:00' })
    const c3 = makeConflict({ id: '2-3', day: 1, time: '08:00–09:00' })
    // Different time on same day
    const c4 = makeConflict({ id: '4-5', day: 1, time: '10:00–11:00' })
    // Different day
    const c5 = makeConflict({ id: '6-7', day: 2, time: '08:00–09:00' })

    const grouped = groupConflicts([c1, c2, c3, c4, c5])

    expect(grouped).toHaveLength(3) // 3 unique day/time combinations
    expect(grouped[0].day).toBe(1)
    expect(grouped[0].time).toBe('08:00–09:00')
    expect(grouped[0].conflicts).toHaveLength(3)
    expect(grouped[1].day).toBe(1)
    expect(grouped[1].time).toBe('10:00–11:00')
    expect(grouped[1].conflicts).toHaveLength(1)
    expect(grouped[2].day).toBe(2)
    expect(grouped[2].time).toBe('08:00–09:00')
    expect(grouped[2].conflicts).toHaveLength(1)
  })

  it('summarizes conflict types correctly', () => {
    const c1 = makeConflict({
      reasons: [
        { type: 'teacher', message: 'T1', severity: 'high' },
        { type: 'section', message: 'S1', severity: 'high' },
        { type: 'room', message: 'R1', severity: 'medium' },
      ],
    })
    const c2 = makeConflict({
      id: '3-4',
      reasons: [
        { type: 'teacher', message: 'T2', severity: 'high' },
        { type: 'room', message: 'R2', severity: 'medium' },
      ],
    })
    const c3 = makeConflict({
      id: '5-6',
      reasons: [{ type: 'room', message: 'R3', severity: 'medium' }],
    })

    const grouped = groupConflicts([c1, c2, c3])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].summary.teacher).toBe(2)
    expect(grouped[0].summary.section).toBe(1)
    expect(grouped[0].summary.room).toBe(3)
  })

  it('handles empty conflicts array', () => {
    expect(groupConflicts([])).toEqual([])
  })

  it('sorts groups by day then time', () => {
    const c1 = makeConflict({ day: 3, time: '10:00–11:00', dayLabel: 'Wednesday' }) // Wednesday
    const c2 = makeConflict({ day: 1, time: '09:00–10:00', dayLabel: 'Monday' }) // Monday later
    const c3 = makeConflict({ day: 1, time: '08:00–09:00', dayLabel: 'Monday' }) // Monday earlier
    const c4 = makeConflict({ day: 2, time: '08:00–09:00', dayLabel: 'Tuesday' }) // Tuesday

    const grouped = groupConflicts([c1, c2, c3, c4])

    expect(grouped.map((g) => `${g.dayLabel} ${g.time}`)).toEqual([
      'Monday 08:00–09:00',
      'Monday 09:00–10:00',
      'Tuesday 08:00–09:00',
      'Wednesday 10:00–11:00',
    ])
  })
})

describe('generatePeriodGrid', () => {
  it('creates periods from schedule boundaries', () => {
    const schedules = [
      makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' }),
      makeSchedule({ id: 2, start_time: '09:00', end_time: '10:00' }),
    ]
    const periods = generatePeriodGrid(schedules)
    expect(periods).toHaveLength(2)
    expect(periods[0]).toMatchObject({ start: '08:00', end: '09:00' })
    expect(periods[1]).toMatchObject({ start: '09:00', end: '10:00' })
  })

  it('returns empty array for no schedules', () => {
    expect(generatePeriodGrid([])).toEqual([])
    expect(generatePeriodGrid(null)).toEqual([])
  })

  it('handles overlapping schedules with merged boundaries', () => {
    const schedules = [
      makeSchedule({ id: 1, start_time: '08:00', end_time: '09:00' }),
      makeSchedule({ id: 2, start_time: '08:00', end_time: '09:00' }),
    ]
    const periods = generatePeriodGrid(schedules)
    expect(periods).toHaveLength(1)
    expect(periods[0]).toMatchObject({ start: '08:00', end: '09:00' })
  })

  it('does not invent 07:00-18:00 boundaries', () => {
    const schedules = [
      makeSchedule({ id: 1, start_time: '10:00', end_time: '11:00' }),
    ]
    const periods = generatePeriodGrid(schedules)
    expect(periods).toHaveLength(1)
    expect(periods[0].start).toBe('10:00')
    expect(periods[0].end).toBe('11:00')
  })
})

describe('Real-world conflict scenario (9 conflicts across 3 days)', () => {
  // Simulates the actual database state: 3 teacher assignments, 3 days each
  // TA1: Teresa Reyes - Mathematics - Grade 7 Sampaguita
  // TA2: Teresa Reyes - English - Grade 7 Sampaguita
  // TA3: Marco Dizon - Science - Grade 8 Gumamela
  // All at 08:00-09:00 in Room 101 on Mon/Wed/Fri
  it('detects 9 pairwise conflicts grouped into 3 time slots', () => {
    const schedules = [
      // Monday
      makeSchedule({ id: 21, teacher_assignment: 1, day_of_week: 1, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa Reyes', subject_name: 'Mathematics', section_id: 1, section_name: 'Grade 7 — Sampaguita' } }),
      makeSchedule({ id: 24, teacher_assignment: 2, day_of_week: 1, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa Reyes', subject_name: 'English', section_id: 1, section_name: 'Grade 7 — Sampaguita' } }),
      makeSchedule({ id: 26, teacher_assignment: 3, day_of_week: 1, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 20, teacher_name: 'Marco Dizon', subject_name: 'Science', section_id: 2, section_name: 'Grade 8 — Gumamela' } }),
      // Wednesday
      makeSchedule({ id: 22, teacher_assignment: 1, day_of_week: 3, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa Reyes', subject_name: 'Mathematics', section_id: 1, section_name: 'Grade 7 — Sampaguita' } }),
      makeSchedule({ id: 16, teacher_assignment: 2, day_of_week: 3, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa Reyes', subject_name: 'English', section_id: 1, section_name: 'Grade 7 — Sampaguita' } }),
      makeSchedule({ id: 27, teacher_assignment: 3, day_of_week: 3, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 20, teacher_name: 'Marco Dizon', subject_name: 'Science', section_id: 2, section_name: 'Grade 8 — Gumamela' } }),
      // Friday
      makeSchedule({ id: 23, teacher_assignment: 1, day_of_week: 5, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa Reyes', subject_name: 'Mathematics', section_id: 1, section_name: 'Grade 7 — Sampaguita' } }),
      makeSchedule({ id: 25, teacher_assignment: 2, day_of_week: 5, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 10, teacher_name: 'Teresa Reyes', subject_name: 'English', section_id: 1, section_name: 'Grade 7 — Sampaguita' } }),
      makeSchedule({ id: 28, teacher_assignment: 3, day_of_week: 5, start_time: '08:00', end_time: '09:00', room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 20, teacher_name: 'Marco Dizon', subject_name: 'Science', section_id: 2, section_name: 'Grade 8 — Gumamela' } }),
    ]

    const conflicts = detectConflicts(schedules)
    expect(conflicts).toHaveLength(9)

    // Verify conflict breakdown:
    // Monday: 3 pairs (Math-English, Math-Science, English-Science)
    // Wednesday: 3 pairs
    // Friday: 3 pairs
    const mondayConflicts = conflicts.filter((c) => c.day === 1)
    const wednesdayConflicts = conflicts.filter((c) => c.day === 3)
    const fridayConflicts = conflicts.filter((c) => c.day === 5)
    expect(mondayConflicts).toHaveLength(3)
    expect(wednesdayConflicts).toHaveLength(3)
    expect(fridayConflicts).toHaveLength(3)

    // Check conflict types for Monday
    const mathEnglishMon = mondayConflicts.find((c) =>
      c.schedules.some((s) => s.teacher_assignment_detail.subject_name === 'Mathematics') &&
      c.schedules.some((s) => s.teacher_assignment_detail.subject_name === 'English')
    )
    expect(mathEnglishMon.reasons.map((r) => r.type).sort()).toEqual(['room', 'section', 'teacher'])

    const mathScienceMon = mondayConflicts.find((c) =>
      c.schedules.some((s) => s.teacher_assignment_detail.subject_name === 'Mathematics') &&
      c.schedules.some((s) => s.teacher_assignment_detail.subject_name === 'Science')
    )
    expect(mathScienceMon.reasons.map((r) => r.type)).toEqual(['room'])

    const englishScienceMon = mondayConflicts.find((c) =>
      c.schedules.some((s) => s.teacher_assignment_detail.subject_name === 'English') &&
      c.schedules.some((s) => s.teacher_assignment_detail.subject_name === 'Science')
    )
    expect(englishScienceMon.reasons.map((r) => r.type)).toEqual(['room'])

    // Group conflicts
    const grouped = groupConflicts(conflicts)
    expect(grouped).toHaveLength(3) // Mon, Wed, Fri
    expect(grouped[0].summary.teacher).toBe(1) // Math-English teacher conflict
    expect(grouped[0].summary.section).toBe(1) // Math-English section conflict
    expect(grouped[0].summary.room).toBe(3)   // All 3 pairs have room conflict
  })
})

// ---------------------------------------------------------------------------
// Seven-day week: the server has always accepted Saturday and Sunday, the
// screen did not. These lock the behaviour that makes a weekend class visible
// instead of silently dropping it.
// ---------------------------------------------------------------------------

describe('DAYS_OF_WEEK', () => {
  it('covers Monday through Sunday, numbered the way the server numbers them', () => {
    expect(DAYS_OF_WEEK.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(DAYS_OF_WEEK.map((d) => d.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })
})

describe('dayLabel', () => {
  it('names the weekend', () => {
    expect(dayLabel(6)).toBe('Saturday')
    expect(dayLabel(7)).toBe('Sunday')
  })

  it('answers a dash for a value the model does not allow', () => {
    expect(dayLabel(0)).toBe('—')
    expect(dayLabel(8)).toBe('—')
    expect(dayLabel(undefined)).toBe('—')
  })
})

describe('timetableDays', () => {
  it('shows the five school days when nothing is booked at the weekend', () => {
    const rows = [
      makeSchedule({ id: 1, day_of_week: 1 }),
      makeSchedule({ id: 2, day_of_week: 5 }),
    ]
    expect(timetableDays(rows).map((d) => d.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('adds a weekend column only once a class actually sits in it', () => {
    const rows = [makeSchedule({ id: 1, day_of_week: 1 }), makeSchedule({ id: 2, day_of_week: 6 })]
    expect(timetableDays(rows).map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('keeps both weekend days in order when both are used', () => {
    const rows = [makeSchedule({ id: 1, day_of_week: 7 }), makeSchedule({ id: 2, day_of_week: 6 })]
    expect(timetableDays(rows).map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('tolerates an empty set', () => {
    expect(timetableDays([]).map((d) => d.value)).toEqual([1, 2, 3, 4, 5])
    expect(timetableDays(null).map((d) => d.value)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('detectConflicts on a weekend', () => {
  it('labels a Saturday double-booking instead of dropping the name', () => {
    const s1 = makeSchedule({
      id: 11,
      day_of_week: 6,
      start_time: '08:00',
      end_time: '09:00',
      teacher_assignment_detail: { teacher_id: 4, teacher_name: 'Rita Gamos', section_id: 9, section_name: 'Grade 8-Mabini' },
    })
    const s2 = makeSchedule({
      id: 12,
      day_of_week: 6,
      start_time: '08:30',
      end_time: '09:30',
      teacher_assignment_detail: { teacher_id: 4, teacher_name: 'Rita Gamos', section_id: 10, section_name: 'Grade 9-Rizal' },
    })

    const conflicts = detectConflicts([s1, s2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].day).toBe(6)
    expect(conflicts[0].dayLabel).toBe('Saturday')
    expect(conflicts[0].reasons[0].message).toContain('Rita Gamos')
  })

  it('does not treat the same clock time on Friday and Saturday as a clash', () => {
    const s1 = makeSchedule({ id: 13, day_of_week: 5, start_time: '08:00', end_time: '09:00' })
    const s2 = makeSchedule({ id: 14, day_of_week: 6, start_time: '08:00', end_time: '09:00' })
    expect(detectConflicts([s1, s2])).toEqual([])
  })
})

describe('timeRange and describeSchedule', () => {
  it('formats the period the same way everywhere it is quoted', () => {
    const schedule = makeSchedule({ start_time: '07:30:00', end_time: '08:30:00' })
    expect(timeRange(schedule)).toBe('07:30–08:30')
    expect(describeSchedule(schedule)).toBe('Mathematics · Grade 7 · Monday 07:30–08:30 · Room 101')
  })

  it('omits a room that was never filled in', () => {
    const schedule = makeSchedule({ room: '', day_of_week: 6, day_of_week_display: 'Saturday' })
    expect(describeSchedule(schedule)).toBe('Mathematics · Grade 7 · Saturday 08:00–09:00')
  })

  it('has something to say about no schedule at all', () => {
    expect(describeSchedule(null)).toBe('This schedule')
  })
})

describe('todayWeekday', () => {
  it('numbers Monday as 1 and Sunday as 7', () => {
    // Noon in Manila on each day of the week, expressed in UTC so the
    // assertion does not depend on the machine running the suite.
    expect(todayWeekday(new Date('2026-11-02T04:00:00Z'))).toBe(1)
    expect(todayWeekday(new Date('2026-11-07T04:00:00Z'))).toBe(6)
    expect(todayWeekday(new Date('2026-11-08T04:00:00Z'))).toBe(7)
  })

  it('uses the school clock, not the browser’s', () => {
    // 2026-10-31T20:00Z is already 04:00 on Sunday 2026-11-01 in Manila.
    expect(todayWeekday(new Date('2026-10-31T20:00:00Z'))).toBe(7)
  })
})

describe('weekRangeLabel', () => {
  it('spans Monday to Sunday of the current week', () => {
    // Wednesday 2026-11-04 sits in the week that opens on Monday Nov 2.
    expect(weekRangeLabel(new Date('2026-11-04T04:00:00Z'))).toBe('Nov 2 – Nov 8, 2026')
  })

  it('does not split the year when the week straddles it', () => {
    expect(weekRangeLabel(new Date('2026-12-31T04:00:00Z'))).toBe('Dec 28 – Jan 3, 2027')
  })
})

describe('filterOptions', () => {
  const rows = [
    makeSchedule({
      id: 1,
      teacher_assignment: 40,
      teacher_assignment_detail: { teacher_id: 7, teacher_name: 'Rita Gamos', section_id: 3, section_name: 'Grade 8-Mabini', subject_name: 'Science' },
    }),
    makeSchedule({
      id: 2,
      teacher_assignment: 41,
      teacher_assignment_detail: { teacher_id: 7, teacher_name: 'Rita Gamos', section_id: 3, section_name: 'Grade 8-Mabini', subject_name: 'Science' },
    }),
    makeSchedule({
      id: 3,
      teacher_assignment: 42,
      teacher_assignment_detail: { teacher_id: 5, teacher_name: 'Ana Reyes', section_id: 9, section_name: 'Grade 7-Rizal', subject_name: 'Mathematics' },
    }),
  ]

  it('offers one option per teacher, section and subject actually scheduled', () => {
    const options = filterOptions(rows)
    expect(options.teachers).toEqual([
      { id: 5, name: 'Ana Reyes' },
      { id: 7, name: 'Rita Gamos' },
    ])
    expect(options.sections).toEqual([
      { id: 9, name: 'Grade 7-Rizal' },
      { id: 3, name: 'Grade 8-Mabini' },
    ])
    expect(options.subjects).toEqual(['Mathematics', 'Science'])
  })

  it('keys the teacher list on the person, not on the assignment row', () => {
    const options = filterOptions(rows)
    expect(options.teachers.map((t) => t.id)).not.toContain(40)
  })

  it('is empty rather than invented when there is nothing loaded', () => {
    expect(filterOptions([])).toEqual({ teachers: [], sections: [], subjects: [] })
  })
})

describe('applyFilters', () => {
  const rows = [
    makeSchedule({
      id: 1,
      day_of_week: 1,
      teacher_assignment_detail: { teacher_id: 7, section_id: 3, subject_name: 'Science' },
    }),
    makeSchedule({
      id: 2,
      day_of_week: 6,
      teacher_assignment_detail: { teacher_id: 5, section_id: 9, subject_name: 'Mathematics' },
    }),
  ]

  it('returns everything when no filter is set', () => {
    expect(applyFilters(rows, {})).toHaveLength(2)
  })

  it('narrows by teacher, section, subject and day', () => {
    expect(applyFilters(rows, { teacher: '7' }).map((s) => s.id)).toEqual([1])
    expect(applyFilters(rows, { section: '9' }).map((s) => s.id)).toEqual([2])
    expect(applyFilters(rows, { subject: 'Science' }).map((s) => s.id)).toEqual([1])
    expect(applyFilters(rows, { day: '6' }).map((s) => s.id)).toEqual([2])
  })

  it('combines filters rather than letting the last one win', () => {
    expect(applyFilters(rows, { teacher: '7', day: '6' })).toEqual([])
  })
})

describe('groupByAssignment', () => {
  it('puts every period of one class under one heading, in week order', () => {
    const rows = [
      makeSchedule({ id: 1, teacher_assignment: 40, day_of_week: 3, start_time: '09:00', end_time: '10:00' }),
      makeSchedule({ id: 2, teacher_assignment: 40, day_of_week: 1, start_time: '10:00', end_time: '11:00' }),
      makeSchedule({ id: 3, teacher_assignment: 40, day_of_week: 1, start_time: '08:00', end_time: '09:00' }),
      makeSchedule({ id: 4, teacher_assignment: 41, day_of_week: 6, start_time: '08:00', end_time: '09:00' }),
    ]

    const groups = groupByAssignment(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].schedules.map((s) => s.id)).toEqual([3, 2, 1])
    expect(groups[1].assignment.id).toBeDefined()
  })

  it('survives an empty list', () => {
    expect(groupByAssignment([])).toEqual([])
  })
})

describe('scheduleSummary', () => {
  it('counts periods, today, distinct teachers and conflicts', () => {
    const rows = [
      makeSchedule({ id: 1, day_of_week: 1, teacher_assignment_detail: { teacher_id: 7 } }),
      makeSchedule({ id: 2, day_of_week: 1, start_time: '08:30', end_time: '09:30', teacher_assignment_detail: { teacher_id: 7 } }),
      makeSchedule({ id: 3, day_of_week: 3, teacher_assignment_detail: { teacher_id: 5 } }),
    ]

    expect(scheduleSummary(rows, 1)).toEqual({
      total: 3,
      today: 2,
      teachers: 2,
      days: 2,
      conflicts: 1,
    })
  })

  it('reports zero periods, not a phantom class, when the week is empty', () => {
    expect(scheduleSummary([], 1)).toMatchObject({ total: 0, today: 0, teachers: 0, days: 0, conflicts: 0 })
  })

  it('counts a Saturday load against Saturday', () => {
    const rows = [makeSchedule({ id: 1, day_of_week: 6, teacher_assignment_detail: { teacher_id: 7 } })]
    expect(scheduleSummary(rows, 6).today).toBe(1)
    expect(scheduleSummary(rows, 1).today).toBe(0)
  })
})

describe('reasonsBySchedule', () => {
  it('collects every reason a row appears under', () => {
    const rows = [
      makeSchedule({
        id: 1,
        day_of_week: 2,
        teacher_assignment_detail: { teacher_id: 7, teacher_name: 'Rita Gamos', section_id: 3, section_name: 'Grade 8' },
      }),
      makeSchedule({
        id: 2,
        day_of_week: 2,
        start_time: '08:30',
        end_time: '09:30',
        room: 'Room 101',
        teacher_assignment_detail: { teacher_id: 7, teacher_name: 'Rita Gamos', section_id: 3, section_name: 'Grade 8' },
      }),
    ]

    const map = reasonsBySchedule(detectConflicts(rows))
    expect(map.get(1)).toEqual(map.get(2))
    expect(map.get(1)).toHaveLength(3)
    expect(map.has(99)).toBe(false)
  })

  it('returns an empty map for no conflicts', () => {
    expect(reasonsBySchedule([]).size).toBe(0)
    expect(reasonsBySchedule(null).size).toBe(0)
  })
})

describe('timetableLayout', () => {
  // One school day, periods cut at every boundary the rows mention.
  const periods = generatePeriodGrid([
    makeSchedule({ id: 1, start_time: '07:00', end_time: '08:00' }),
    makeSchedule({ id: 2, start_time: '08:00', end_time: '10:00' }),
    makeSchedule({ id: 3, start_time: '07:30', end_time: '08:30' }),
  ])
  const days = DAYS_OF_WEEK

  it('cuts one period per distinct time boundary', () => {
    expect(periods.map((p) => `${p.start}-${p.end}`)).toEqual([
      '07:00-07:30',
      '07:30-08:00',
      '08:00-08:30',
      '08:30-10:00',
    ])
  })

  it('merges a long class across the periods it covers', () => {
    const layout = timetableLayout(
      [makeSchedule({ id: 2, day_of_week: 1, start_time: '08:00', end_time: '10:00' })],
      periods,
      days
    )

    expect(layout[1].startingHere[2]).toHaveLength(1)
    expect(layout[1].startingHere[2][0].span).toBe(2)
    expect(layout[1].coveredBy).toEqual([null, null, 2, 2])
  })

  it('stacks two classes that start in the same period', () => {
    const layout = timetableLayout(
      [
        makeSchedule({ id: 1, day_of_week: 1, start_time: '07:00', end_time: '07:30' }),
        makeSchedule({
          id: 5,
          day_of_week: 1,
          start_time: '07:00',
          end_time: '07:30',
          teacher_assignment_detail: { section_id: 11, section_name: 'Grade 7-Maunawari' },
        }),
      ],
      periods,
      days
    )

    expect(layout[1].startingHere[0].map(({ schedule }) => schedule.id)).toEqual([1, 5])
    expect(layout[1].startingHere[0].every(({ span }) => span === 1)).toBe(true)
  })

  it('keeps each day in its own bucket, so a Saturday class cannot fill Monday', () => {
    const layout = timetableLayout(
      [
        makeSchedule({ id: 1, day_of_week: 1, start_time: '07:00', end_time: '08:00' }),
        makeSchedule({ id: 4, day_of_week: 6, start_time: '07:00', end_time: '08:00' }),
      ],
      periods,
      days
    )

    expect(layout[1].startingHere[0][0].schedule.id).toBe(1)
    expect(layout[6].startingHere[0][0].schedule.id).toBe(4)
    expect(layout[2].startingHere).toEqual({})
  })

  it('only returns buckets for the days the grid actually draws', () => {
    const layout = timetableLayout([makeSchedule({ id: 4, day_of_week: 6 })], periods, [
      DAYS_OF_WEEK[0],
    ])
    expect(Object.keys(layout)).toEqual(['1'])
    expect(layout[1].startingHere).toEqual({})
  })
})
