import { describe, expect, it } from 'vitest'
import {
  activityMeta,
  buildDeadlineRows,
  buildSubmissionOverview,
  buildTeachingSchedule,
  buildTodayAttendance,
  buildVerificationQueue,
  classLink,
  isoWeekday,
  localDateKey,
  slotState,
} from './teacherDashboard'

// Monday 2 November 2026, 08:00 local — inside the 07:30–08:30 slot below.
const MONDAY_8AM = new Date(2026, 10, 2, 8, 0, 0)

const schedule = (id, assignmentId, overrides = {}) => ({
  id,
  teacher_assignment: assignmentId,
  day_of_week: 1,
  start_time: '07:30:00',
  end_time: '08:30:00',
  room: '',
  teacher_assignment_detail: {
    subject_name: 'Mathematics',
    section_name: 'Grade 7 — Sampaguita',
    grade_level: 'Grade 7',
  },
  ...overrides,
})

const record = (id, status) => ({ id, status, student: id, notes: '' })

describe('teacherDashboard — calendar helpers', () => {
  it('uses the local calendar, not UTC', () => {
    // 23:30 local on the 2nd is still the 2nd, where toISOString() would roll
    // it to the next day for any zone behind UTC.
    expect(localDateKey(new Date(2026, 10, 2, 23, 30, 0))).toBe('2026-11-02')
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('numbers weekdays the way ClassSchedule does', () => {
    expect(isoWeekday(new Date(2026, 10, 2))).toBe(1) // Monday
    expect(isoWeekday(new Date(2026, 10, 8))).toBe(7) // Sunday
  })

  it('places a slot before, during or after its clock window', () => {
    expect(slotState(450, 510, 400)).toBe('upcoming')
    expect(slotState(450, 510, 480)).toBe('now')
    expect(slotState(450, 510, 510)).toBe('finished')
  })
})

describe('teacherDashboard — today’s teaching schedule', () => {
  it('keeps only today’s slots, in start-time order', () => {
    const { today } = buildTeachingSchedule({
      schedules: [
        schedule(2, 1, { start_time: '10:00:00', end_time: '11:00:00' }),
        schedule(1, 1),
        schedule(3, 1, { day_of_week: 3 }),
      ],
      sessions: [],
      now: MONDAY_8AM,
    })
    expect(today.map((slot) => slot.id)).toEqual([1, 2])
    expect(today[0].start).toBe('07:30')
    expect(today[0].subject).toBe('Mathematics')
    expect(today[0].section).toBe('Grade 7 — Sampaguita')
  })

  it('reports the clock state and the class it belongs to', () => {
    const { today } = buildTeachingSchedule({
      schedules: [schedule(1, 7), schedule(2, 7, { start_time: '09:00:00', end_time: '10:00:00' })],
      sessions: [],
      now: MONDAY_8AM,
    })
    expect(today[0].state).toBe('now')
    expect(today[1].state).toBe('upcoming')
    expect(today[0].assignmentId).toBe(7)
  })

  it('joins the session generated from this slot and tallies its marks', () => {
    const { today } = buildTeachingSchedule({
      schedules: [schedule(30, 1)],
      sessions: [
        {
          id: 21,
          teacher_assignment: 1,
          date: '2026-11-02',
          status: 'completed',
          status_display: 'Completed',
          schedule: 30,
          records: [record(1, 'present'), record(2, 'present'), record(3, 'absent')],
        },
      ],
      now: MONDAY_8AM,
    })
    expect(today[0].attendanceRecorded).toBe(true)
    expect(today[0].session).toMatchObject({
      id: 21,
      status: 'completed',
      recorded: 3,
      present: 2,
      absent: 1,
    })
  })

  it('claims an unmarked manual session but never guesses between two', () => {
    const manual = (id, scheduleId = null) => ({
      id,
      teacher_assignment: 1,
      date: '2026-11-02',
      status: 'not_started',
      schedule: scheduleId,
      records: [],
    })
    const single = buildTeachingSchedule({
      schedules: [schedule(1, 1)],
      sessions: [manual(50)],
      now: MONDAY_8AM,
    })
    expect(single.today[0].session.id).toBe(50)

    const doubled = buildTeachingSchedule({
      schedules: [schedule(1, 1), schedule(2, 1, { start_time: '09:00:00', end_time: '10:00:00' })],
      sessions: [manual(50), manual(51)],
      now: MONDAY_8AM,
    })
    expect(doubled.today[0].session).toBeNull()
    expect(doubled.today[1].session).toBeNull()
  })

  it('carries the next slots across the weekend and labels their dates', () => {
    const wednesdayMorning = new Date(2026, 10, 4, 8, 0, 0) // Wed 4 Nov
    const { today, next } = buildTeachingSchedule({
      schedules: [schedule(1, 1, { day_of_week: 1 })],
      sessions: [],
      now: wednesdayMorning,
      upcomingLimit: 2,
    })
    expect(today).toHaveLength(0)
    expect(next).toHaveLength(1)
    expect(next[0].date).toBe('2026-11-09') // the following Monday
    expect(next[0].state).toBe('scheduled')
  })

  it('says whether any timetable exists at all', () => {
    expect(buildTeachingSchedule({ schedules: [], now: MONDAY_8AM }).hasSchedule).toBe(false)
    expect(
      buildTeachingSchedule({ schedules: [schedule(1, 1)], now: MONDAY_8AM }).hasSchedule
    ).toBe(true)
  })
})

describe('teacherDashboard — today’s attendance', () => {
  it('is null when the teacher has no session today', () => {
    const today = buildTodayAttendance({
      sessions: [{ id: 1, date: '2026-11-01', records: [record(1, 'present')] }],
      now: MONDAY_8AM,
    })
    expect(today).toBeNull()
  })

  it('adds up every mark taken across today’s sessions', () => {
    const today = buildTodayAttendance({
      sessions: [
        { id: 1, date: '2026-11-02', records: [record(1, 'present'), record(2, 'late')] },
        { id: 2, date: '2026-11-02', records: [record(3, 'present'), record(4, 'absent')] },
        { id: 3, date: '2026-11-03', records: [record(5, 'excused')] },
      ],
      now: MONDAY_8AM,
    })
    expect(today.total_records).toBe(4)
    expect(today.by_status).toEqual({ present: 2, absent: 1, late: 1, excused: 0 })
    expect(today.present_rate).toBe(50)
    expect(today.sessionCount).toBe(2)
  })

  it('reports a real zero without inventing a rate', () => {
    const today = buildTodayAttendance({
      sessions: [{ id: 1, date: '2026-11-02', records: [] }],
      now: MONDAY_8AM,
    })
    expect(today.total_records).toBe(0)
    expect(today.present_rate).toBeNull()
  })
})

describe('teacherDashboard — links', () => {
  it('carries the class through to the module that owns it', () => {
    expect(classLink('review', 12)).toBe('/teacher/review?class=12')
    expect(classLink('attendance', 12)).toBe('/teacher/attendance?class=12')
    // No class known — fall back to the module-wide screen, never a bare id.
    expect(classLink('review', null)).toBe('/teacher/review')
  })
})

describe('teacherDashboard — verification queue', () => {
  const requirements = [
    {
      id: 3,
      title: 'Pie Chart Project',
      teacher_assignment: 1,
      subject_name: 'Mathematics',
      section_name: 'Grade 7 — Sampaguita',
      deadline: '2026-10-21T06:00:00+08:00',
    },
    {
      id: 4,
      title: 'Linear Equations Practice',
      teacher_assignment: 2,
      subject_name: 'English',
      section_name: 'Grade 7 — Sampaguita',
      deadline: '2026-12-01T06:00:00+08:00',
    },
  ]

  it('joins each pending submission to its class and links the review', () => {
    const { rows, total } = buildVerificationQueue({
      submissions: [
        { id: 8, requirement: 4, status: 'submitted', student_name: 'Ana Reyes', requirement_title: 'Linear Equations Practice', submitted_at: '2026-11-01T06:00:00+08:00' },
        { id: 9, requirement: 3, status: 'submitted', student_name: 'Ben Cruz', requirement_title: 'Pie Chart Project', submitted_at: '2026-11-02T07:00:00+08:00' },
        { id: 10, requirement: 3, status: 'verified', student_name: 'Carla Diaz', submitted_at: '2026-11-02T07:00:00+08:00' },
      ],
      requirements,
      now: MONDAY_8AM,
    })
    expect(total).toBe(2)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      studentName: 'Ana Reyes',
      requirementTitle: 'Linear Equations Practice',
      assignmentId: 2,
      subject: 'English',
      section: 'Grade 7 — Sampaguita',
      reviewHref: '/teacher/review?class=2',
    })
    // A deadline already past is the row that needs attention.
    expect(rows[0].pastDeadline).toBe(false)
    expect(rows[1].pastDeadline).toBe(true)
  })

  it('keeps a submission whose requirement is not on the page', () => {
    const { rows } = buildVerificationQueue({
      submissions: [
        { id: 8, requirement: 99, status: 'submitted', student_name: 'Ana Reyes', requirement_title: 'Quiz 2', submitted_at: '2026-11-02T07:00:00+08:00' },
      ],
      requirements: [],
      now: MONDAY_8AM,
    })
    expect(rows[0].assignmentId).toBeNull()
    expect(rows[0].reviewHref).toBe('/teacher/review')
    expect(rows[0].pastDeadline).toBe(false)
  })

  it('counts every waiting row but returns only the cap', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      id: index,
      requirement: 3,
      status: 'submitted',
      student_name: `Student ${index}`,
      submitted_at: '2026-11-02T07:00:00+08:00',
    }))
    const { rows, total } = buildVerificationQueue({
      submissions: many,
      requirements,
      now: MONDAY_8AM,
      limit: 6,
    })
    expect(rows).toHaveLength(6)
    expect(total).toBe(9)
  })
})

describe('teacherDashboard — submission overview', () => {
  it('counts only handed-in work in the total', () => {
    const overview = buildSubmissionOverview({
      not_submitted: 4,
      submitted: 3,
      verified: 5,
      returned: 2,
      overdue: 1,
      none: 6,
    })
    expect(overview).toMatchObject({
      pending: 3,
      verified: 5,
      returned: 2,
      overdue: 1,
      onRecord: 10,
      outstanding: 10,
    })
  })

  it('reads an empty payload as nothing on record', () => {
    expect(buildSubmissionOverview({}).onRecord).toBe(0)
    expect(buildSubmissionOverview({ submitted: 2 }).pending).toBe(2)
  })
})

describe('teacherDashboard — deadlines and activity', () => {
  it('drops a deadline that has passed since the payload was built', () => {
    const rows = buildDeadlineRows({
      deadlines: [
        { id: 1, title: 'Past', deadline: '2026-11-01T06:00:00+08:00' },
        { id: 3, title: 'Future', deadline: '2026-11-20T06:00:00+08:00' },
      ],
      requirements: [{ id: 3, teacher_assignment: 1 }],
      now: MONDAY_8AM,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Future', assignmentId: 1, href: '/teacher/requirements?class=1' })
  })

  it('caps the list at the limit', () => {
    const deadlines = Array.from({ length: 6 }, (_, index) => ({
      id: index,
      deadline: '2026-12-01T06:00:00+08:00',
    }))
    expect(buildDeadlineRows({ deadlines, requirements: [], now: MONDAY_8AM })).toHaveLength(5)
  })

  it('labels a status the feed has never seen', () => {
    expect(activityMeta('verified').icon).toBe('checkCircle')
    expect(activityMeta('archived')).toEqual({ icon: 'activity', tone: '', label: 'archived' })
  })
})
