import { describe, expect, it } from 'vitest'
import {
  CLASS_STATUS,
  WORK_STATUSES,
  buildClassBoard,
  filterSectionGroups,
  gradeLevelsFromRows,
  greeting,
  groupRowsBySection,
  schoolYearsFromRows,
  sortSectionGroups,
  summarizeClasses,
} from './classes'

const NOW = Date.UTC(2026, 10, 2, 4) // 2026-11-02T04:00:00Z
const DAY = 86400000
const ISO = (daysFromNow) => new Date(NOW + daysFromNow * DAY).toISOString()

const SECTION = {
  id: 40,
  name: 'Sampaguita',
  grade_level_name: 'Grade 7',
  school_year: 1,
  school_year_label: '2026-2027',
  adviser_name: 'Ana Cruz',
  student_count: 2,
}

const ROSTER = [
  { id: 11, section: 40, lrn: '1357-0001', user: { full_name: 'Sofia Cruz' } },
  { id: 12, section: 40, lrn: '1357-0002', user: { full_name: 'Miguel Torres' } },
]

const assignment = (id, subjectName, sectionId = 40) => ({
  id,
  subject: id * 2,
  subject_name: subjectName,
  section: sectionId,
  section_name: `Grade 7 — Sampaguita (2026-2027)`,
})

const requirement = (id, assignmentId, { deadline = ISO(3), title = 'Work' } = {}) => ({
  id,
  teacher_assignment: assignmentId,
  title,
  deadline,
  requirement_type: 'assignment',
})

const submission = (id, requirementId, status = 'submitted', student = 11) => ({
  id,
  requirement: requirementId,
  student,
  status,
})

const session = (id, assignmentId, date, records = []) => ({
  id,
  teacher_assignment: assignmentId,
  date,
  status: records.length ? 'completed' : 'not_started',
  notes: '',
  records,
})

const record = (studentId, status) => ({
  id: `${studentId}-${status}`,
  student: studentId,
  status,
  notes: '',
})

/** Two subjects in one section, one posted requirement each. */
function base(overrides = {}) {
  return summarizeClasses({
    assignments: [assignment(500, 'Science'), assignment(501, 'English')],
    sections: [SECTION],
    students: ROSTER,
    requirements: [
      requirement(700, 500, { deadline: ISO(3), title: 'Portfolio' }),
      requirement(701, 501, { deadline: ISO(-1), title: 'Reading log' }),
    ],
    submissions: [submission(1, 700), submission(2, 700, 'verified')],
    now: NOW,
    ...overrides,
  })
}

describe('summarizeClasses', () => {
  it('counts one row per subject and never twice for the shared section', () => {
    const { rows, totals } = base()

    expect(rows.map((row) => row.subjectName)).toEqual(['Science', 'English'])
    expect(totals).toMatchObject({
      assignments: 2,
      sections: 1,
      students: 2,
      requirements: 2,
      pending: 1,
    })
    // Both cards show the same roster, but the headline counts it once.
    expect(rows[0].students).toHaveLength(2)
    expect(rows[1].students).toHaveLength(2)
  })

  it('separates deadlines that closed from those still open', () => {
    const { rows, totals } = base()
    // Science: ISO(3) open. English: ISO(-1) closed.
    expect(rows[0].openDeadlineCount).toBe(1)
    expect(rows[0].overdueCount).toBe(0)
    expect(rows[1].openDeadlineCount).toBe(0)
    expect(rows[1].overdueCount).toBe(1)
    expect(totals.openDeadlines).toBe(1)
    expect(totals.overdue).toBe(1)
  })

  it('counts a section once however many subjects cross it', () => {
    const { totals } = base({
      assignments: [
        assignment(500, 'Science'),
        assignment(501, 'English'),
        assignment(502, 'Math'),
        assignment(503, 'Filipino'),
      ],
    })
    expect(totals.assignments).toBe(4)
    expect(totals.sections).toBe(1)
    expect(totals.students).toBe(2)
  })

  it('adds a second section and its own students to the totals', () => {
    const { totals } = base({
      sections: [
        SECTION,
        { ...SECTION, id: 41, name: 'Gumamela', grade_level_name: 'Grade 8' },
      ],
      students: [...ROSTER, { id: 13, section: 41, user: { full_name: 'Pat Liwanag' } }],
      assignments: [assignment(500, 'Science'), assignment(510, 'Science', 41)],
      requirements: [],
    })
    expect(totals).toMatchObject({
      assignments: 2,
      sections: 2,
      students: 3,
      requirements: 0,
      pending: 0,
    })
  })

  it('counts only work that is still awaiting verification', () => {
    const { rows, totals } = base({
      submissions: [
        submission(1, 700, 'submitted'),
        submission(2, 700, 'verified'),
        submission(3, 700, 'returned'),
        submission(4, 700, 'overdue'),
        submission(5, 700, 'not_submitted'),
      ],
    })
    expect(rows[0].pendingCount).toBe(1)
    expect(totals.pending).toBe(1)
  })

  it('refuses to guess a class from a submission whose requirement it cannot see', () => {
    const { totals } = base({ submissions: [submission(9, 999)] })
    expect(totals.pending).toBe(0)
  })

  it('keeps requirement counts per subject, not per section', () => {
    const { rows } = base({
      requirements: [
        requirement(700, 500),
        requirement(701, 500, { deadline: ISO(5), title: 'Worksheet' }),
        requirement(702, 501),
      ],
    })
    expect(rows.map((row) => row.requirementCount)).toEqual([2, 1])
  })

  it('lists each requirement with its own pending count', () => {
    const { rows } = base({
      submissions: [submission(1, 700), submission(2, 700), submission(3, 701)],
    })
    expect(rows[0].requirements).toEqual([
      {
        id: 700,
        title: 'Portfolio',
        deadline: ISO(3),
        type: 'assignment',
        pendingCount: 2,
      },
    ])
    expect(rows[1].requirements[0].pendingCount).toBe(1)
  })

  it('names the class from the section row, not from a parsed label', () => {
    const { rows } = base()
    expect(rows[0]).toMatchObject({
      sectionName: 'Sampaguita',
      gradeLevelName: 'Grade 7',
      schoolYearLabel: '2026-2027',
      adviserName: 'Ana Cruz',
    })
  })

  it('still shows the card when the section row never arrived', () => {
    const { rows } = base({ sections: [] })
    expect(rows[0].sectionLabel).toBe('Grade 7 — Sampaguita (2026-2027)')
    expect(rows[0].sectionName).toBeNull()
    expect(rows[0].studentCount).toBe(2)
  })

  it('reads the status off the work that is waiting', () => {
    expect(base().rows[0].statusKey).toBe('review')
    // No pending, one deadline still open.
    expect(
      base({ submissions: [] }).rows[0].statusKey
    ).toBe('open')
    // Every deadline has passed.
    expect(
      base({
        submissions: [],
        requirements: [requirement(700, 500, { deadline: ISO(-2) })],
      }).rows[0].statusKey
    ).toBe('past')
    // Nothing posted at all.
    expect(
      base({ submissions: [], requirements: [requirement(700, 501)] }).rows[0].statusKey
    ).toBe('unposted')
    expect(Object.keys(CLASS_STATUS)).toEqual(['review', 'open', 'past', 'unposted'])
  })

  it('takes the earliest deadline that has not passed', () => {
    const { rows } = base({
      requirements: [
        requirement(700, 500, { deadline: ISO(6), title: 'Later' }),
        requirement(701, 500, { deadline: ISO(2), title: 'Sooner' }),
        requirement(702, 500, { deadline: ISO(-4), title: 'Past' }),
      ],
    })
    expect(rows[0].nextDeadline).toEqual({
      id: 701,
      title: 'Sooner',
      deadline: ISO(2),
    })
    expect(rows[0].requirementCount).toBe(3)
  })

  it('survives the lists a slow request never returned', () => {
    const { rows, totals } = summarizeClasses({
      assignments: null,
      sections: undefined,
      students: null,
      requirements: null,
      submissions: undefined,
      sessions: null,
    })
    expect(rows).toEqual([])
    expect(totals).toMatchObject({
      assignments: 0,
      sections: 0,
      students: 0,
      requirements: 0,
      pending: 0,
      overdue: 0,
      openDeadlines: 0,
      sessionsNeedingMarks: 0,
    })
  })

  it('ignores a student with no section instead of losing the roster', () => {
    const { totals } = base({
      students: [...ROSTER, { id: 14, section: null, user: { full_name: 'Unassigned' } }],
    })
    expect(totals.students).toBe(2)
  })

  describe('attendance', () => {
    it('tallies the marks a session already carries', () => {
      const { rows } = base({
        sessions: [
          session(900, 500, '2026-11-01', [record(11, 'present'), record(12, 'absent')]),
          session(901, 500, '2026-10-30', [record(11, 'late')]),
          session(902, 501, '2026-11-01', []),
        ],
      })
      expect(rows[0].attendance).toMatchObject({
        sessionCount: 2,
        recorded: 3,
        present: 1,
        absent: 1,
        late: 1,
        excused: 0,
        presentRate: 33.3,
        lastDate: '2026-11-01',
      })
      // The other subject in the same room has its own empty session.
      expect(rows[1].attendance.sessionCount).toBe(1)
      expect(rows[1].attendance.presentRate).toBeNull()
    })

    it('calls a session incomplete until every student has a mark', () => {
      const { rows, totals } = base({
        sessions: [
          // 2 students in the section: one marked, one not → incomplete.
          session(900, 500, '2026-11-01', [record(11, 'present')]),
          session(901, 500, '2026-11-02', [record(11, 'present'), record(12, 'present')]),
        ],
      })
      expect(rows[0].sessions.map((item) => item.complete)).toEqual([true, false])
      expect(rows[0].attendance.incomplete).toBe(1)
      expect(totals.sessionsNeedingMarks).toBe(1)
    })

    it('keeps each session’s records so a workspace can attribute them', () => {
      const { rows } = base({
        sessions: [session(900, 500, '2026-11-01', [record(11, 'excused')])],
      })
      expect(rows[0].sessions[0].records).toEqual([
        { id: '11-excused', student: 11, status: 'excused', notes: '' },
      ])
    })
  })
})

describe('groupRowsBySection', () => {
  it('puts every subject of a room on one card with one roster', () => {
    const { rows } = base()
    const groups = groupRowsBySection(rows)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: 40,
      sectionId: 40,
      sectionName: 'Sampaguita',
      gradeLevelName: 'Grade 7',
      schoolYearLabel: '2026-2027',
      adviserName: 'Ana Cruz',
      subjectCount: 2,
      studentCount: 2,
      requirementCount: 2,
      pendingCount: 1,
    })
    expect(groups[0].subjects.map((row) => row.subjectName)).toEqual(['English', 'Science'])
    expect(groups[0].students.map((student) => student.name)).toEqual([
      'Miguel Torres',
      'Sofia Cruz',
    ])
  })

  it('never double-counts a student taught in two subjects', () => {
    const { rows } = base({
      assignments: [assignment(500, 'Science'), assignment(501, 'English')],
    })
    const group = groupRowsBySection(rows)[0]
    expect(group.studentCount).toBe(2)
    expect(group.students).toHaveLength(2)
  })

  it('takes the worst status of the subjects it holds', () => {
    const { rows } = base({
      assignments: [assignment(500, 'Science'), assignment(501, 'English')],
      // Science needs review (1 pending), English only has a deadline still open.
      requirements: [
        requirement(700, 500, { deadline: ISO(3), title: 'Portfolio' }),
        requirement(701, 501, { deadline: ISO(4), title: 'Reading log' }),
      ],
      submissions: [submission(1, 700, 'submitted')],
    })
    expect(rows.map((row) => row.statusKey)).toEqual(['review', 'open'])
    expect(groupRowsBySection(rows)[0].statusKey).toBe('review')
  })

  it('names the subject a shared deadline belongs to', () => {
    const { rows } = base({
      requirements: [
        requirement(700, 500, { deadline: ISO(5), title: 'Portfolio' }),
        requirement(701, 501, { deadline: ISO(2), title: 'Reading log' }),
      ],
    })
    const group = groupRowsBySection(rows)[0]
    expect(group.nextDeadline).toMatchObject({
      title: 'Reading log',
      subjectName: 'English',
    })
  })

  it('merges the attendance of every subject in the room', () => {
    const { rows } = base({
      sessions: [
        session(900, 500, '2026-11-01', [record(11, 'present')]),
        session(901, 501, '2026-10-30', [record(12, 'absent')]),
      ],
    })
    const group = groupRowsBySection(rows)[0]
    expect(group.attendance).toMatchObject({
      sessionCount: 2,
      recorded: 2,
      present: 1,
      absent: 1,
      presentRate: 50,
      lastDate: '2026-11-01',
    })
  })

  it('keeps a room card when its section row never arrived', () => {
    const { rows } = base({ sections: [] })
    const groups = groupRowsBySection(rows)
    // The assignment still names section 40, so both subjects stay on one card
    // and only the adviser/grade-level labels are missing.
    expect(groups.map((group) => group.key)).toEqual([40])
    expect(groups[0].sectionName).toBeNull()
    expect(groups[0].sectionLabel).toBe('Grade 7 — Sampaguita (2026-2027)')
    expect(groups[0].studentCount).toBe(2)
  })

  it('gives an assignment with no section its own card', () => {
    const { rows } = base({
      assignments: [
        assignment(500, 'Science'),
        { ...assignment(501, 'English'), section: null, section_name: '' },
      ],
    })
    const groups = groupRowsBySection(rows)
    expect(groups.map((group) => group.key)).toEqual([40, 'assignment-501'])
  })
})

describe('filterSectionGroups and sortSectionGroups', () => {
  const twoRooms = groupRowsBySection(
    summarizeClasses({
      assignments: [assignment(500, 'Science'), assignment(510, 'Math', 41)],
      sections: [
        SECTION,
        { ...SECTION, id: 41, name: 'Gumamela', grade_level_name: 'Grade 8' },
      ],
      students: [...ROSTER, { id: 13, section: 41, user: { full_name: 'Pat Liwanag' } }],
      requirements: [requirement(700, 500), requirement(701, 510, { deadline: ISO(-2) })],
      submissions: [submission(1, 700)],
      now: NOW,
    }).rows
  )

  it('searches room, grade level, subject and student together', () => {
    expect(filterSectionGroups(twoRooms, { search: 'science' }).map((g) => g.key)).toEqual([40])
    expect(filterSectionGroups(twoRooms, { search: 'grade 8' })).toHaveLength(1)
    expect(filterSectionGroups(twoRooms, { search: 'pat' })).toHaveLength(1)
    expect(filterSectionGroups(twoRooms, { search: 'sampaguita' })).toHaveLength(2)
    expect(filterSectionGroups(twoRooms, { search: 'nothing here' })).toHaveLength(0)
    expect(filterSectionGroups(twoRooms, { search: '  ' })).toHaveLength(2)
  })

  it('narrows by status and school year', () => {
    expect(filterSectionGroups(twoRooms, { status: 'review' })).toHaveLength(1)
    expect(filterSectionGroups(twoRooms, { status: 'past' })).toHaveLength(1)
    expect(filterSectionGroups(twoRooms, { schoolYear: '1' })).toHaveLength(2)
    expect(filterSectionGroups(twoRooms, { schoolYear: '9' })).toHaveLength(0)
    expect(filterSectionGroups(twoRooms, { gradeLevel: 'grade 8' })).toHaveLength(1)
  })

  it('orders rooms by what a teacher acts on', () => {
    expect(sortSectionGroups(twoRooms, 'pending').map((g) => g.key)).toEqual([40, 41])
    expect(sortSectionGroups(twoRooms, 'deadline').map((g) => g.key)).toEqual([40, 41])
    expect(sortSectionGroups(twoRooms, 'section').map((g) => g.gradeLevelName)).toEqual([
      'Grade 7',
      'Grade 8',
    ])
    expect(sortSectionGroups(twoRooms, 'students').map((g) => g.studentCount)).toEqual([2, 1])
    // An unknown sort key falls back to the room order instead of throwing.
    expect(sortSectionGroups(twoRooms, 'nonsense-key').map((g) => g.key)).toEqual([40, 41])
  })

  it('lists the option sets without duplicates', () => {
    const both = [...twoRooms, { ...twoRooms[0], key: 'x', sectionId: 99 }]
    expect(schoolYearsFromRows(both)).toEqual([{ id: 1, label: '2026-2027' }])
    expect(gradeLevelsFromRows(both)).toEqual([
      { value: 'grade 7', label: 'Grade 7' },
      { value: 'grade 8', label: 'Grade 8' },
    ])
  })
})

describe('buildClassBoard', () => {
  const { rows } = base()

  const board = (overrides = {}) =>
    buildClassBoard({
      rows,
      assignmentId: 500,
      submissions: [
        submission(1, 700, 'submitted', 11),
        submission(2, 700, 'verified', 12),
      ],
      schedules: [
        {
          id: 21,
          teacher_assignment: 500,
          day_of_week: 1,
          day_of_week_display: 'Monday',
          start_time: '07:30',
          end_time: '08:30',
          room: 'Room 3',
        },
        {
          id: 22,
          teacher_assignment: 501,
          day_of_week: 0,
          day_of_week_display: 'Sunday',
          start_time: '09:00',
          end_time: '10:00',
          room: '',
        },
      ],
      now: NOW,
      ...overrides,
    })

  it('refuses an assignment id the teacher was not given', () => {
    expect(board({ assignmentId: 606 })).toBeNull()
    expect(board({ assignmentId: '501' }).row.subjectName).toBe('English')
    expect(board({ assignmentId: null })).toBeNull()
  })

  it('joins requirements to their submissions and to the roster', () => {
    const result = board()
    expect(result.requirements).toHaveLength(1)
    expect(result.requirements[0]).toMatchObject({
      id: 700,
      title: 'Portfolio',
      state: 'open',
      handedIn: 2,
      missing: 0,
      verifiedRate: 50,
      pendingCount: 1,
    })
    expect(result.requirements[0].states).toMatchObject({ submitted: 1, verified: 1 })
    expect([...result.requirements[0].stateByStudent]).toEqual([
      [11, 'submitted'],
      [12, 'verified'],
    ])
  })

  it('does not count a deadline that has not closed as missing work', () => {
    const result = board({
      submissions: [submission(1, 700, 'verified', 11)],
    })
    expect(result.requirements[0].missing).toBe(1)
    expect(result.students[1].submissionTally).toMatchObject({
      submitted: 0,
      verified: 0,
      missing: 0,
      pending: 0,
    })
    expect(result.indicators.missingWork).toBe(0)
  })

  it('counts a closed deadline with nothing on record as missing', () => {
    const english = buildClassBoard({
      rows,
      assignmentId: 501,
      submissions: [],
      schedules: [],
      now: NOW,
    })
    // 701's deadline is ISO(-1), already past.
    expect(english.requirements[0].state).toBe('closed')
    expect(english.requirements[0].missing).toBe(2)
    expect(english.students[0].submissionTally.missing).toBe(1)
    expect(english.indicators.missingWork).toBe(2)
  })

  it('treats only real work as handed in', () => {
    expect(WORK_STATUSES).toEqual(['submitted', 'verified', 'returned'])
    const result = board({
      submissions: [
        submission(1, 700, 'not_submitted', 11),
        submission(2, 700, 'overdue', 12),
      ],
    })
    expect(result.requirements[0].handedIn).toBe(0)
    expect(result.requirements[0].states).toMatchObject({ not_submitted: 1, overdue: 1 })
  })

  it('gives each student this class’s attendance and no other’s', () => {
    const { rows: withSessions } = summarizeClasses({
      assignments: [assignment(500, 'Science'), assignment(501, 'English')],
      sections: [SECTION],
      students: ROSTER,
      requirements: [],
      submissions: [],
      sessions: [
        session(900, 500, '2026-11-01', [record(11, 'present'), record(12, 'absent')]),
        session(901, 501, '2026-10-30', [record(11, 'absent')]),
      ],
      now: NOW,
    })
    const result = buildClassBoard({
      rows: withSessions,
      assignmentId: 500,
      submissions: [],
      schedules: [],
      now: NOW,
    })
    expect(result.students[0]).toMatchObject({
      id: 11,
      attendance: { present: 1, absent: 0, recorded: 1 },
      attendanceRate: 100,
    })
    expect(result.students[1]).toMatchObject({
      id: 12,
      attendance: { present: 0, absent: 1, recorded: 1 },
      attendanceRate: 0,
    })
  })

  it('lists the class’s own timetable and siblings only', () => {
    const result = board()
    expect(result.schedules).toEqual([
      { id: 21, day: 'Monday', dayNumber: 1, start: '07:30', end: '08:30', room: 'Room 3' },
    ])
    expect(result.siblings.map((row) => row.id)).toEqual([501])
    expect(board({ assignmentId: 501 }).siblings.map((row) => row.id)).toEqual([500])
  })

  it('reports the indicators the workspace tabs count on', () => {
    const result = board()
    expect(result.indicators).toEqual({
      pending: 1,
      overdue: 0,
      sessionsNeedingMarks: 0,
      missingWork: 0,
      unposted: false,
    })
  })
})

describe('greeting', () => {
  it('follows the clock', () => {
    expect(greeting(new Date('2026-11-02T08:00:00'))).toBe('Good morning')
    expect(greeting(new Date('2026-11-02T14:00:00'))).toBe('Good afternoon')
    expect(greeting(new Date('2026-11-02T20:00:00'))).toBe('Good evening')
  })
})
