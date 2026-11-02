import { useMemo } from 'react'
import useFetch from './useFetch'
import { buildClassBoard, groupRowsBySection, summarizeClasses } from '../utils/classes'

/**
 * The rows behind every teacher class screen, fetched once and derived in the
 * same place for the My Classes hub and for a single class workspace.
 *
 * Django scopes each of these endpoints to the signed-in teacher
 * (`core/views.py` filters by `teacher=user` or by the teacher's own
 * assignment ids), so nothing here can ask for another teacher's class. What
 * the server does not do is hand back per-class counters — there is no
 * endpoint for that — so the summaries are computed from these rows and
 * joined on foreign-key ids only.
 *
 * `/schedules/` is only fetched for one class, where the timetable belongs.
 * Submissions arrive in every status because a class board has to show work
 * already verified and work returned, not only what is waiting.
 */
export default function useClassData({ withSchedules = false, assignmentId = null } = {}) {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const sections = useFetch('/sections/', { list: true })
  const students = useFetch('/students/', { list: true })
  const requirements = useFetch('/requirements/', { list: true })
  const submissions = useFetch('/submissions/', { list: true })
  const sessions = useFetch('/attendance/sessions/', { list: true })
  const schoolYears = useFetch('/school-years/', {
    list: true,
    params: { is_active: true },
  })
  const schedules = useFetch('/schedules/', { list: true, enabled: withSchedules })

  const queries = [
    assignments,
    sections,
    students,
    requirements,
    submissions,
    sessions,
    schoolYears,
    schedules,
  ]

  function reload() {
    queries.forEach((query) => query.reload())
  }

  const derived = useMemo(
    () =>
      summarizeClasses({
        assignments: assignments.data,
        sections: sections.data,
        students: students.data,
        requirements: requirements.data,
        submissions: submissions.data,
        sessions: sessions.data,
      }),
    [assignments.data, sections.data, students.data, requirements.data, submissions.data, sessions.data]
  )

  const groups = useMemo(() => groupRowsBySection(derived.rows), [derived.rows])

  const board = useMemo(
    () =>
      assignmentId == null
        ? null
        : buildClassBoard({
            rows: derived.rows,
            assignmentId,
            submissions: submissions.data,
            schedules: schedules.data,
          }),
    [derived.rows, assignmentId, submissions.data, schedules.data]
  )

  const failed = [assignments, sections].filter((query) => query.error)
  const partial = [students, requirements, submissions, sessions, schedules].filter(
    (query) => query.error
  )

  return {
    assignments: assignments.data || [],
    sections: sections.data || [],
    students: students.data || [],
    requirements: requirements.data || [],
    submissions: submissions.data || [],
    sessions: sessions.data || [],
    schedules: schedules.data || [],
    activeSchoolYear: schoolYears.data?.[0] || null,
    rows: derived.rows,
    totals: derived.totals,
    groups,
    board,
    loading: assignments.loading || sections.loading || schoolYears.loading,
    // Every list a class workspace renders, so it can tell "still arriving"
    // from "this class has no such row" before it refuses to open an id.
    busy:
      assignments.loading ||
      sections.loading ||
      students.loading ||
      requirements.loading ||
      submissions.loading ||
      sessions.loading ||
      schoolYears.loading ||
      schedules.loading,
    // Assignments and sections are the two lists every figure joins through,
    // so their failure is the screen's failure. The rest degrade: a class card
    // that cannot see its roster says so instead of showing a zero.
    error: failed.length ? failed[0].error : null,
    partialErrors: partial.map((query) => query.error?.message).filter(Boolean),
    reload,
  }
}
