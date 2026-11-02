/**
 * Teacher class workspace maths.
 *
 * Nothing here is a statistic the server could not give us — the API has no
 * per-assignment counters — so each one is derived from the teacher's own rows
 * and joined on foreign-key ids (`section`, `teacher_assignment`,
 * `requirement`), never on the display label. Two subjects in one section are
 * two assignments, and the section and its roster are only counted once.
 */

/** Awaiting verification, the same rule every review screen uses. */
export const PENDING_STATUS = 'submitted'

/** Card status → badge. `review` outranks the rest: work that is waiting is
 *  the one thing a teacher has to act on today. */
export const CLASS_STATUS = {
  review: { label: 'Needs review', tone: 'amber', icon: 'inbox' },
  open: { label: 'Accepting work', tone: 'green', icon: 'checkCircle' },
  past: { label: 'Deadlines closed', tone: 'neutral', icon: 'clock' },
  unposted: { label: 'No requirements yet', tone: 'blue', icon: 'plus' },
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function time(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : null
}

/** Earliest deadline that has not passed yet. */
function nextDeadlineFor(requirements, now) {
  let best = null
  let bestAt = null
  requirements.forEach((requirement) => {
    const at = time(requirement.deadline)
    if (at === null || at < now) return
    if (bestAt === null || at < bestAt) {
      best = requirement
      bestAt = at
    }
  })
  return best
}

/**
 * Attendance sessions of one assignment, with the tallies read off the
 * records the session payload already embeds. A session only counts as
 * complete when every student in its section has a mark — the same rule the
 * server applies in `AttendanceSession.update_status()`.
 */
function sessionsForAssignment(sessions, assignmentId, studentCount) {
  return list(sessions)
    .filter((session) => session.teacher_assignment === assignmentId)
    .map((session) => {
      const tally = { recorded: 0, present: 0, absent: 0, late: 0, excused: 0 }
      ;(session.records || []).forEach((record) => {
        tally.recorded += 1
        if (tally[record.status] !== undefined) tally[record.status] += 1
      })
      return {
        id: session.id,
        date: session.date,
        status: session.status || 'not_started',
        scheduleId: session.schedule || null,
        notes: session.notes || '',
        ...tally,
        records: (session.records || []).map((record) => ({
          id: record.id,
          student: record.student,
          status: record.status,
          notes: record.notes || '',
        })),
        complete: studentCount > 0 && tally.recorded >= studentCount,
      }
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

/**
 * Roll-up across a class's sessions. `presentRate` follows the server's rule
 * exactly — present marks over every mark on record, one decimal
 * (`_attendance_summary` in core/views.py) — so the workspace and the
 * dashboard never disagree about the same number.
 */
function attendanceSummary(rows) {
  const summary = {
    sessionCount: rows.length,
    recorded: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    incomplete: 0,
  }
  rows.forEach((session) => {
    summary.recorded += session.recorded
    summary.present += session.present
    summary.absent += session.absent
    summary.late += session.late
    summary.excused += session.excused
    if (!session.complete) summary.incomplete += 1
  })
  return {
    ...summary,
    presentRate: summary.recorded
      ? Math.round((1000 * summary.present) / summary.recorded) / 10
      : null,
    lastDate: rows.length ? rows[0].date : null,
  }
}

/**
 * @returns {{rows: Array, totals: Object}} one row per subject assignment plus
 * the four headline numbers, all from real records.
 */
export function summarizeClasses({
  assignments = [],
  sections = [],
  students = [],
  requirements = [],
  submissions = [],
  sessions = [],
  now = Date.now(),
} = {}) {
  const sectionById = new Map(list(sections).map((item) => [item.id, item]))
  const requirementsByAssignment = new Map()
  const pendingByAssignment = new Map()
  const pendingByRequirement = new Map()

  // Requirements carry their assignment id, so that is the join. Anything the
  // teacher cannot see is simply absent from the list.
  list(requirements).forEach((requirement) => {
    const key = requirement.teacher_assignment
    if (key == null) return
    const bucket = requirementsByAssignment.get(key)
    if (bucket) bucket.push(requirement)
    else requirementsByAssignment.set(key, [requirement])
  })

  // Submissions only know their requirement, so they join through it.
  const assignmentByRequirement = new Map(
    list(requirements).map((requirement) => [
      requirement.id,
      requirement.teacher_assignment,
    ])
  )
  list(submissions).forEach((submission) => {
    if (submission.status !== PENDING_STATUS) return
    const key = assignmentByRequirement.get(submission.requirement)
    if (key == null) return
    pendingByAssignment.set(key, (pendingByAssignment.get(key) || 0) + 1)
    pendingByRequirement.set(
      submission.requirement,
      (pendingByRequirement.get(submission.requirement) || 0) + 1
    )
  })

  // Rosters are per section, so the same students back every subject taught
  // there. They are attached for the card's roster view and deduped by id in
  // the totals below.
  const studentsBySection = new Map()
  list(students).forEach((student) => {
    const key = student.section
    if (key == null) return
    const bucket = studentsBySection.get(key)
    if (bucket) bucket.push(student)
    else studentsBySection.set(key, [student])
  })

  const uniqueStudents = new Set()
  const uniqueSections = new Set()
  let totalPending = 0
  let totalRequirements = 0

  const rows = list(assignments).map((assignment) => {
    const section = sectionById.get(assignment.section) || null
    const roster = studentsBySection.get(assignment.section) || []
    const own = requirementsByAssignment.get(assignment.id) || []

    roster.forEach((student) => uniqueStudents.add(student.id))
    uniqueSections.add(assignment.section)

    const pending = pendingByAssignment.get(assignment.id) || 0
    totalPending += pending
    totalRequirements += own.length

    const open = own.filter((requirement) => {
      const at = time(requirement.deadline)
      return at === null || at >= now
    })
    const next = nextDeadlineFor(own, now)
    const classSessions = sessionsForAssignment(sessions, assignment.id, roster.length)
    const attendance = attendanceSummary(classSessions)
    const statusKey = own.length === 0
      ? 'unposted'
      : pending > 0
        ? 'review'
        : open.length > 0
          ? 'open'
          : 'past'

    return {
      id: assignment.id,
      subjectId: assignment.subject,
      subjectName: assignment.subject_name || 'Subject',
      sectionId: assignment.section,
      sectionLabel: assignment.section_name || '—',
      sectionName: section ? section.name : null,
      gradeLevelName: section ? section.grade_level_name : null,
      schoolYearId: section ? section.school_year : null,
      schoolYearLabel: section ? section.school_year_label : null,
      adviserName: section ? section.adviser_name : null,
      studentIds: roster.map((student) => student.id),
      studentCount: roster.length,
      students: roster.map((student) => ({
        id: student.id,
        name: (student.user && student.user.full_name) || '—',
        lrn: student.lrn || '',
      })),
      requirements: own
        .slice()
        .sort((a, b) => (time(a.deadline) ?? Infinity) - (time(b.deadline) ?? Infinity))
        .map((requirement) => ({
          id: requirement.id,
          title: requirement.title,
          deadline: requirement.deadline,
          type: requirement.requirement_type,
          pendingCount: pendingByRequirement.get(requirement.id) || 0,
        })),
      requirementCount: own.length,
      pendingCount: pending,
      openDeadlineCount: open.length,
      overdueCount: own.length - open.length,
      nextDeadline: next
        ? { id: next.id, title: next.title, deadline: next.deadline }
        : null,
      sessions: classSessions,
      attendance,
      statusKey,
      status: CLASS_STATUS[statusKey],
    }
  })

  return {
    rows,
    totals: {
      assignments: rows.length,
      sections: uniqueSections.size,
      students: uniqueStudents.size,
      requirements: totalRequirements,
      pending: totalPending,
      overdue: rows.reduce((sum, row) => sum + row.overdueCount, 0),
      openDeadlines: rows.reduce((sum, row) => sum + row.openDeadlineCount, 0),
      sessionsNeedingMarks: rows.reduce(
        (sum, row) => sum + row.attendance.incomplete,
        0
      ),
    },
  }
}

/** Sections this teacher actually teaches, as filter options. */
export function schoolYearsFromRows(rows) {
  const seen = new Map()
  list(rows).forEach((row) => {
    if (row.schoolYearId == null || seen.has(row.schoolYearId)) return
    seen.set(row.schoolYearId, row.schoolYearLabel || 'School year')
  })
  return [...seen].map(([id, label]) => ({ id, label }))
}

export function gradeLevelsFromRows(rows) {
  const seen = new Map()
  list(rows).forEach((row) => {
    const label = row.gradeLevelName
    if (!label) return
    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.set(key, label)
  })
  return [...seen].map(([value, label]) => ({ value, label }))
}

/** Worse first: work waiting on the teacher outranks everything else. */
const STATUS_SEVERITY = ['review', 'open', 'unposted', 'past']

/**
 * One card per section room, holding every subject taught there. Rosters are
 * per section, so the students a group counts are deduped by id across its
 * subjects and never added once per assignment.
 */
export function groupRowsBySection(rows) {
  const buckets = new Map()
  list(rows).forEach((row) => {
    // An assignment whose section row is not visible still has to be
    // reachable, so it gets its own bucket keyed on the assignment.
    const key = row.sectionId == null ? `assignment-${row.id}` : row.sectionId
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  })

  return [...buckets].map(([key, subjectRows]) => {
    const first = subjectRows[0]
    const students = new Map()
    const attendance = {
      sessionCount: 0,
      recorded: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      incomplete: 0,
      presentRate: null,
    }
    let lastDate = null
    subjectRows.forEach((row) => {
      row.students.forEach((student) => {
        if (!students.has(student.id)) students.set(student.id, student)
      })
      attendance.sessionCount += row.attendance.sessionCount
      attendance.recorded += row.attendance.recorded
      attendance.present += row.attendance.present
      attendance.absent += row.attendance.absent
      attendance.late += row.attendance.late
      attendance.excused += row.attendance.excused
      attendance.incomplete += row.attendance.incomplete
      if (row.attendance.lastDate && (!lastDate || row.attendance.lastDate > lastDate))
        lastDate = row.attendance.lastDate
    })
    // Same rule as attendanceSummary(): present marks over every mark on record.
    attendance.presentRate = attendance.recorded
      ? Math.round((1000 * attendance.present) / attendance.recorded) / 10
      : null
    attendance.lastDate = lastDate

    const next = subjectRows
      .filter((row) => row.nextDeadline)
      .map((row) => ({ ...row.nextDeadline, subjectName: row.subjectName }))
      .sort((a, b) => (time(a.deadline) ?? Infinity) - (time(b.deadline) ?? Infinity))

    const statusKey = STATUS_SEVERITY.find((severity) =>
      subjectRows.some((row) => row.statusKey === severity)
    ) || 'past'

    return {
      key,
      sectionId: first.sectionId,
      sectionName: first.sectionName,
      sectionLabel: first.sectionLabel,
      gradeLevelName: first.gradeLevelName,
      schoolYearId: first.schoolYearId,
      schoolYearLabel: first.schoolYearLabel,
      adviserName: first.adviserName,
      subjects: subjectRows
        .slice()
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      subjectCount: subjectRows.length,
      students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name)),
      studentCount: students.size,
      requirementCount: subjectRows.reduce((sum, row) => sum + row.requirementCount, 0),
      pendingCount: subjectRows.reduce((sum, row) => sum + row.pendingCount, 0),
      overdueCount: subjectRows.reduce((sum, row) => sum + row.overdueCount, 0),
      attendance,
      nextDeadline: next[0] || null,
      statusKey,
      status: CLASS_STATUS[statusKey],
    }
  })
}

/**
 * Search plus the selects over section groups. Empty strings mean "no
 * filter", so a caller can hold one state object and pass it straight through.
 * A group matches when its room, any subject taught there or any enrolled
 * student matches the search — teachers look for a class or for a child.
 */
export function filterSectionGroups(
  groups,
  { search = '', schoolYear = '', gradeLevel = '', status = '' } = {}
) {
  const needle = search.trim().toLowerCase()
  return list(groups).filter((group) => {
    if (schoolYear && String(group.schoolYearId) !== String(schoolYear)) return false
    if (
      gradeLevel &&
      String(group.gradeLevelName || '').toLowerCase() !== String(gradeLevel).toLowerCase()
    )
      return false
    if (status && group.statusKey !== status) return false
    if (!needle) return true
    const haystack = [
      group.sectionName,
      group.sectionLabel,
      group.gradeLevelName,
      group.schoolYearLabel,
      group.adviserName,
      ...group.subjects.map((row) => row.subjectName),
      ...group.students.map((student) => student.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}

const GROUP_SORTERS = {
  section: (a, b) =>
    (a.gradeLevelName || '').localeCompare(b.gradeLevelName || '') ||
    (a.sectionName || a.sectionLabel || '').localeCompare(b.sectionName || b.sectionLabel || ''),
  students: (a, b) => b.studentCount - a.studentCount || (a.sectionLabel || '').localeCompare(b.sectionLabel || ''),
  pending: (a, b) => b.pendingCount - a.pendingCount || (a.sectionLabel || '').localeCompare(b.sectionLabel || ''),
  subjects: (a, b) => b.subjectCount - a.subjectCount || (a.sectionLabel || '').localeCompare(b.sectionLabel || ''),
  deadline: (a, b) => {
    const left = time(a.nextDeadline?.deadline)
    const right = time(b.nextDeadline?.deadline)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return left - right
  },
}

export function sortSectionGroups(groups, key = 'section') {
  const sorter = GROUP_SORTERS[key] || GROUP_SORTERS.section
  return [...list(groups)].sort(sorter)
}

/** The five verification states a submission row can carry. */
export const SUBMISSION_STATES = ['submitted', 'verified', 'returned', 'overdue', 'not_submitted']

/**
 * Of those, the states that mean work is actually on the server: `overdue` and
 * `not_submitted` are rows standing in for missing work, so counting them as
 * handed in would report a submission that does not exist.
 */
export const WORK_STATUSES = ['submitted', 'verified', 'returned']

/**
 * Everything one class workspace shows, derived from the rows already fetched
 * for the hub. The teacher may only reach a row that came back from
 * `/teacher-assignments/`, so an id outside that list resolves to null and the
 * route refuses to open another class's workspace.
 *
 * Handed-in counting treats `not_submitted` as no work at all, because that is
 * what the row means; `missing` is the roster size minus the work on record,
 * never a guess.
 */
export function buildClassBoard({
  rows = [],
  assignmentId = null,
  submissions = [],
  schedules = [],
  now = Date.now(),
} = {}) {
  const row = list(rows).find((item) => String(item.id) === String(assignmentId)) || null
  if (!row) return null

  const submissionsByRequirement = new Map()
  list(submissions).forEach((submission) => {
    const key = submission.requirement
    if (key == null) return
    const bucket = submissionsByRequirement.get(key)
    if (bucket) bucket.push(submission)
    else submissionsByRequirement.set(key, [submission])
  })

  const studentIds = row.students.map((student) => student.id)
  const requirements = row.requirements.map((requirement) => {
    const own = submissionsByRequirement.get(requirement.id) || []
    const states = { submitted: 0, verified: 0, returned: 0, overdue: 0, not_submitted: 0 }
    const stateByStudent = new Map()
    own.forEach((submission) => {
      if (states[submission.status] !== undefined) states[submission.status] += 1
      stateByStudent.set(submission.student, submission.status)
    })
    const handedIn = own.filter((submission) =>
      WORK_STATUSES.includes(submission.status)
    ).length
    const at = time(requirement.deadline)
    return {
      ...requirement,
      state: at === null || at >= now ? 'open' : 'closed',
      states,
      handedIn,
      missing: Math.max(0, studentIds.length - handedIn),
      verifiedRate: handedIn ? Math.round((100 * states.verified) / handedIn) : null,
      stateByStudent,
    }
  })

  const attendanceByStudent = new Map(
    studentIds.map((id) => [id, { present: 0, absent: 0, late: 0, excused: 0, recorded: 0 }])
  )
  row.sessions.forEach((session) => {
    ;(session.records || []).forEach((record) => {
      const tally = attendanceByStudent.get(record.student)
      if (tally && tally[record.status] !== undefined) {
        tally[record.status] += 1
        tally.recorded += 1
      }
    })
  })

  const students = row.students.map((student) => {
    const marks = attendanceByStudent.get(student.id)
    const tally = { submitted: 0, verified: 0, returned: 0, pending: 0, missing: 0 }
    requirements.forEach((requirement) => {
      const state = requirement.stateByStudent.get(student.id)
      if (!WORK_STATUSES.includes(state)) {
        // Nothing handed in. Only a closed deadline makes that a gap the
        // teacher has to chase; an open one is still in time.
        if (requirement.state === 'closed') tally.missing += 1
        return
      }
      if (state === 'submitted') tally.pending += 1
      if (state === 'verified') tally.verified += 1
      if (state === 'returned') tally.returned += 1
      tally.submitted += 1
    })
    return {
      ...student,
      submissionTally: tally,
      attendance: marks ? { ...marks } : null,
      attendanceRate:
        marks && marks.recorded
          ? Math.round((1000 * marks.present) / marks.recorded) / 10
          : null,
    }
  })

  return {
    row,
    siblings: list(rows).filter(
      (item) => item.id !== row.id && item.sectionId === row.sectionId
    ),
    requirements,
    students,
    attendance: row.attendance,
    sessions: row.sessions,
    schedules: list(schedules)
      .filter((schedule) => schedule.teacher_assignment === row.id)
      .map((schedule) => ({
        id: schedule.id,
        day: schedule.day_of_week_display || `Day ${schedule.day_of_week}`,
        dayNumber: schedule.day_of_week,
        start: schedule.start_time,
        end: schedule.end_time,
        room: schedule.room || '',
      }))
      .sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0) || String(a.start).localeCompare(String(b.start))),
    indicators: {
      pending: row.pendingCount,
      overdue: row.overdueCount,
      sessionsNeedingMarks: row.attendance.incomplete,
      missingWork: students.reduce((sum, student) => sum + student.submissionTally.missing, 0),
      unposted: row.requirementCount === 0,
    },
  }
}

export function greeting(date = new Date()) {
  const hours = date.getHours()
  if (hours < 12) return 'Good morning'
  if (hours < 18) return 'Good afternoon'
  return 'Good evening'
}
