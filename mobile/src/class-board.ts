/**
 * TRACK — mobile class-workspace maths.
 *
 * This is the mobile half of `frontend/src/utils/classes.js`, kept to the rules
 * the web app already ships: the same joins, the same rounding, the same status
 * vocabulary, so a phone and a browser never disagree about one number for the
 * same class.
 *
 * Why it is computed at all: the API has no per-assignment counters and no grade
 * field — there is nothing on any model that stores a score — so every figure a
 * class screen shows is derived from rows the teacher is already permitted to
 * read (`/teacher-assignments/`, `/sections/`, `/students/`, `/requirements/`,
 * `/submissions/`, `/attendance/sessions/`) and joined on foreign-key ids
 * (`section`, `teacher_assignment`, `requirement`), never on a display label.
 * Two subjects in one section are two assignments; the section and its roster
 * are counted once.
 */
import type { Tone } from './theme';
import type {
  AttendanceSession,
  AttendanceStatus,
  Requirement,
  Section,
  StudentProfile,
  Submission,
  SubmissionStatus,
  TeacherAssignment,
} from './api/types';

/** Awaiting verification — the same rule every review screen uses. */
export const PENDING_STATUS = 'submitted';

/** Statuses that mean the student put work on record. */
export const WORK_STATUSES: SubmissionStatus[] = ['submitted', 'verified', 'returned'];

export type ClassStatusKey = 'review' | 'open' | 'past' | 'unposted';

/** `review` outranks the rest: work waiting on the teacher is the one thing to act on today. */
export const CLASS_STATUS: Record<ClassStatusKey, { label: string; tone: Tone }> = {
  review: { label: 'Needs review', tone: 'amber' },
  open: { label: 'Accepting work', tone: 'green' },
  past: { label: 'Deadlines closed', tone: 'gray' },
  unposted: { label: 'No requirements yet', tone: 'blue' },
};

export type Marks = {
  recorded: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export type StudentSummary = { id: number; name: string; lrn: string };

export type RequirementSummary = {
  id: number;
  title: string;
  deadline: string;
  type: string;
  pendingCount: number;
};

export type ClassSession = Marks & {
  id: number;
  date: string;
  status: string;
  complete: boolean;
  records: { student: number; status: AttendanceStatus }[];
};

export type AttendanceRollup = Marks & {
  sessionCount: number;
  incomplete: number;
  presentRate: number | null;
  lastDate: string | null;
};

export type ClassRow = {
  id: number;
  subjectName: string;
  sectionId: number | null;
  sectionLabel: string;
  gradeLevelName: string | null;
  schoolYearLabel: string | null;
  adviserName: string | null;
  students: StudentSummary[];
  studentCount: number;
  requirements: RequirementSummary[];
  requirementCount: number;
  pendingCount: number;
  openDeadlineCount: number;
  overdueCount: number;
  nextDeadline: { id: number; title: string; deadline: string } | null;
  sessions: ClassSession[];
  attendance: AttendanceRollup;
  statusKey: ClassStatusKey;
};

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? null : at;
}

const emptyMarks = (): Marks => ({ recorded: 0, present: 0, absent: 0, late: 0, excused: 0 });

/** present marks over every mark on record — the server's own rule, one decimal. */
function presentRate(marks: Marks): number | null {
  return marks.recorded ? Math.round((1000 * marks.present) / marks.recorded) / 10 : null;
}

/** Earliest deadline that has not passed yet. */
function nextDeadlineFor(requirements: Requirement[], now: number): Requirement | null {
  let best: Requirement | null = null;
  let bestAt: number | null = null;
  requirements.forEach((requirement) => {
    const at = time(requirement.deadline);
    if (at === null || at < now) return;
    if (bestAt === null || at < bestAt) {
      best = requirement;
      bestAt = at;
    }
  });
  return best;
}

/** One assignment's sessions, tallied from the records the payload already embeds. */
function sessionsForAssignment(
  sessions: AttendanceSession[],
  assignmentId: number,
  studentCount: number
): ClassSession[] {
  return sessions
    .filter((session) => session.teacher_assignment === assignmentId)
    .map((session) => {
      const marks = emptyMarks();
      (session.records ?? []).forEach((record) => {
        marks.recorded += 1;
        if (marks[record.status] !== undefined) marks[record.status] += 1;
      });
      return {
        id: session.id,
        date: session.date,
        status: session.status || 'not_started',
        complete: studentCount > 0 && marks.recorded >= studentCount,
        ...marks,
        records: (session.records ?? []).map((record) => ({
          student: record.student,
          status: record.status,
        })),
      };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function rollUpSessions(sessions: ClassSession[]): AttendanceRollup {
  const marks = emptyMarks();
  let incomplete = 0;
  sessions.forEach((session) => {
    marks.recorded += session.recorded;
    marks.present += session.present;
    marks.absent += session.absent;
    marks.late += session.late;
    marks.excused += session.excused;
    if (!session.complete) incomplete += 1;
  });
  return {
    ...marks,
    sessionCount: sessions.length,
    incomplete,
    presentRate: presentRate(marks),
    lastDate: sessions.length ? sessions[0].date : null,
  };
}

export type ClassRowsInput = {
  assignments: TeacherAssignment[];
  sections: Section[];
  students: StudentProfile[];
  requirements: Requirement[];
  submissions: Submission[];
  sessions: AttendanceSession[];
  now?: number;
};

/** One row per subject the teacher is assigned, with its roster and roll-ups. */
export function buildClassRows({
  assignments,
  sections,
  students,
  requirements,
  submissions,
  sessions,
  now = Date.now(),
}: ClassRowsInput): ClassRow[] {
  const sectionById = new Map<number, Section>(sections.map((item) => [item.id, item]));

  const requirementsByAssignment = new Map<number, Requirement[]>();
  requirements.forEach((requirement) => {
    const key = requirement.teacher_assignment;
    if (key == null) return;
    const bucket = requirementsByAssignment.get(key);
    if (bucket) bucket.push(requirement);
    else requirementsByAssignment.set(key, [requirement]);
  });

  // Submissions only know their requirement, so they join through it.
  const assignmentByRequirement = new Map<number, number>(
    requirements
      .filter((requirement) => requirement.teacher_assignment != null)
      .map((requirement) => [requirement.id, requirement.teacher_assignment as number])
  );
  const pendingByAssignment = new Map<number, number>();
  const pendingByRequirement = new Map<number, number>();
  submissions.forEach((submission) => {
    if (submission.status !== PENDING_STATUS) return;
    const key = assignmentByRequirement.get(submission.requirement);
    if (key == null) return;
    pendingByAssignment.set(key, (pendingByAssignment.get(key) ?? 0) + 1);
    pendingByRequirement.set(
      submission.requirement,
      (pendingByRequirement.get(submission.requirement) ?? 0) + 1
    );
  });

  const rosterBySection = new Map<number, StudentProfile[]>();
  students.forEach((student) => {
    const key = student.section;
    if (key == null) return;
    const bucket = rosterBySection.get(key);
    if (bucket) bucket.push(student);
    else rosterBySection.set(key, [student]);
  });

  return assignments.map((assignment) => {
    const section = sectionById.get(assignment.section) ?? null;
    const roster = rosterBySection.get(assignment.section) ?? [];
    const own = requirementsByAssignment.get(assignment.id) ?? [];
    const pending = pendingByAssignment.get(assignment.id) ?? 0;

    const open = own.filter((requirement) => {
      const at = time(requirement.deadline);
      return at === null || at >= now;
    });
    const next = nextDeadlineFor(own, now);
    const classSessions = sessionsForAssignment(sessions, assignment.id, roster.length);
    const statusKey: ClassStatusKey =
      own.length === 0 ? 'unposted' : pending > 0 ? 'review' : open.length > 0 ? 'open' : 'past';

    const studentViews: StudentSummary[] = roster
      .map((student) => ({
        id: student.id,
        name: student.user?.full_name || '—',
        lrn: student.lrn || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: assignment.id,
      subjectName: assignment.subject_name || 'Subject',
      sectionId: assignment.section,
      sectionLabel: assignment.section_name || '—',
      gradeLevelName: section ? section.grade_level_name : null,
      schoolYearLabel: section ? section.school_year_label : null,
      adviserName: section ? section.adviser_name : null,
      students: studentViews,
      studentCount: studentViews.length,
      requirements: [...own]
        .sort((a, b) => (time(a.deadline) ?? Infinity) - (time(b.deadline) ?? Infinity))
        .map((requirement) => ({
          id: requirement.id,
          title: requirement.title,
          deadline: requirement.deadline,
          type: requirement.requirement_type,
          pendingCount: pendingByRequirement.get(requirement.id) ?? 0,
        })),
      requirementCount: own.length,
      pendingCount: pending,
      openDeadlineCount: open.length,
      overdueCount: own.length - open.length,
      nextDeadline: next ? { id: next.id, title: next.title, deadline: next.deadline } : null,
      sessions: classSessions,
      attendance: rollUpSessions(classSessions),
      statusKey,
    };
  });
}

export type SectionGroup = {
  key: string | number;
  sectionId: number | null;
  sectionLabel: string;
  gradeLevelName: string | null;
  schoolYearLabel: string | null;
  adviserName: string | null;
  subjects: ClassRow[];
  students: StudentSummary[];
  studentCount: number;
  requirementCount: number;
  pendingCount: number;
  attendance: AttendanceRollup;
  statusKey: ClassStatusKey;
};

/** Worse first: work waiting on the teacher outranks everything else. */
const STATUS_SEVERITY: ClassStatusKey[] = ['review', 'open', 'unposted', 'past'];

/**
 * One card per section room, holding every subject taught there.
 *
 * Rosters are per section, so the students a group counts are deduped by id
 * across its subjects and never added once per assignment.
 */
export function groupRowsBySection(rows: ClassRow[]): SectionGroup[] {
  const buckets = new Map<string | number, ClassRow[]>();
  rows.forEach((row) => {
    // An assignment whose section row is not visible still has to be reachable,
    // so it gets its own bucket keyed on the assignment.
    const key = row.sectionId == null ? `assignment-${row.id}` : row.sectionId;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  });

  return [...buckets].map(([key, subjectRows]) => {
    const first = subjectRows[0];
    const students = new Map<number, StudentSummary>();
    const marks = emptyMarks();
    let sessionCount = 0;
    let incomplete = 0;
    let lastDate: string | null = null;

    subjectRows.forEach((row) => {
      row.students.forEach((student) => {
        if (!students.has(student.id)) students.set(student.id, student);
      });
      marks.recorded += row.attendance.recorded;
      marks.present += row.attendance.present;
      marks.absent += row.attendance.absent;
      marks.late += row.attendance.late;
      marks.excused += row.attendance.excused;
      sessionCount += row.attendance.sessionCount;
      incomplete += row.attendance.incomplete;
      if (row.attendance.lastDate && (!lastDate || row.attendance.lastDate > lastDate)) {
        lastDate = row.attendance.lastDate;
      }
    });

    return {
      key,
      sectionId: first.sectionId,
      sectionLabel: first.sectionLabel,
      gradeLevelName: first.gradeLevelName,
      schoolYearLabel: first.schoolYearLabel,
      adviserName: first.adviserName,
      subjects: [...subjectRows].sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name)),
      studentCount: students.size,
      requirementCount: subjectRows.reduce((sum, row) => sum + row.requirementCount, 0),
      pendingCount: subjectRows.reduce((sum, row) => sum + row.pendingCount, 0),
      attendance: {
        ...marks,
        sessionCount,
        incomplete,
        presentRate: presentRate(marks),
        lastDate,
      },
      statusKey: STATUS_SEVERITY.find((severity) =>
        subjectRows.some((row) => row.statusKey === severity)
      ) ?? 'past',
    };
  });
}

export type BoardRequirement = RequirementSummary & {
  /** `closed` is what turns "nothing handed in" into a gap worth chasing. */
  state: 'open' | 'closed';
  states: Record<SubmissionStatus, number>;
  handedIn: number;
  missing: number;
  verifiedRate: number | null;
  stateByStudent: Map<number, SubmissionStatus>;
};

export type BoardStudent = StudentSummary & {
  tally: { submitted: number; verified: number; pending: number; returned: number; missing: number };
  marks: Marks | null;
  attendanceRate: number | null;
};

export type ClassBoard = {
  row: ClassRow;
  siblings: ClassRow[];
  requirements: BoardRequirement[];
  students: BoardStudent[];
  attendance: AttendanceRollup;
  sessions: ClassSession[];
  indicators: {
    pending: number;
    overdue: number;
    sessionsNeedingMarks: number;
    missingWork: number;
    handedIn: number;
    verified: number;
    unposted: boolean;
  };
};

/**
 * Everything one class screen shows, from the rows the hub already fetched.
 *
 * The teacher may only reach a row that came back from `/teacher-assignments/`,
 * so an id outside that list resolves to null and the screen refuses to open
 * another class's record. `missing` is the roster size minus the work on record,
 * never a guess.
 */
export function buildClassBoard({
  rows,
  assignmentId,
  submissions,
  now = Date.now(),
}: {
  rows: ClassRow[];
  assignmentId: number | string | null;
  submissions: Submission[];
  now?: number;
}): ClassBoard | null {
  const row = rows.find((item) => String(item.id) === String(assignmentId)) ?? null;
  if (!row) return null;

  const submissionsByRequirement = new Map<number, Submission[]>();
  submissions.forEach((submission) => {
    const key = submission.requirement;
    if (key == null) return;
    const bucket = submissionsByRequirement.get(key);
    if (bucket) bucket.push(submission);
    else submissionsByRequirement.set(key, [submission]);
  });

  const studentIds = row.students.map((student) => student.id);

  const requirements: BoardRequirement[] = row.requirements.map((requirement) => {
    const own = submissionsByRequirement.get(requirement.id) ?? [];
    const states = { submitted: 0, verified: 0, returned: 0, overdue: 0, not_submitted: 0 };
    const stateByStudent = new Map<number, SubmissionStatus>();
    own.forEach((submission) => {
      if (states[submission.status] !== undefined) states[submission.status] += 1;
      stateByStudent.set(submission.student, submission.status);
    });
    const handedIn = own.filter((submission) => WORK_STATUSES.includes(submission.status)).length;
    const at = time(requirement.deadline);
    return {
      ...requirement,
      state: at === null || at >= now ? 'open' : 'closed',
      states,
      handedIn,
      missing: Math.max(0, studentIds.length - handedIn),
      verifiedRate: handedIn ? Math.round((100 * states.verified) / handedIn) : null,
      stateByStudent,
    };
  });

  const marksByStudent = new Map<number, Marks>(studentIds.map((id) => [id, emptyMarks()]));
  row.sessions.forEach((session) => {
    session.records.forEach((record) => {
      const marks = marksByStudent.get(record.student);
      if (marks && marks[record.status] !== undefined) {
        marks[record.status] += 1;
        marks.recorded += 1;
      }
    });
  });

  const students: BoardStudent[] = row.students.map((student) => {
    const marks = marksByStudent.get(student.id) ?? null;
    const tally = { submitted: 0, verified: 0, pending: 0, returned: 0, missing: 0 };
    requirements.forEach((requirement) => {
      const state = requirement.stateByStudent.get(student.id);
      if (!state || !WORK_STATUSES.includes(state)) {
        // Nothing handed in. Only a closed deadline makes that a gap the teacher
        // has to chase; an open one is still in time.
        if (requirement.state === 'closed') tally.missing += 1;
        return;
      }
      if (state === 'submitted') tally.pending += 1;
      if (state === 'verified') tally.verified += 1;
      if (state === 'returned') tally.returned += 1;
      tally.submitted += 1;
    });
    return {
      ...student,
      tally,
      marks,
      attendanceRate: marks && marks.recorded ? presentRate(marks) : null,
    };
  });

  return {
    row,
    siblings: rows.filter(
      (item) => item.id !== row.id && item.sectionId === row.sectionId
    ),
    requirements,
    students,
    attendance: row.attendance,
    sessions: row.sessions,
    indicators: {
      pending: row.pendingCount,
      overdue: row.overdueCount,
      sessionsNeedingMarks: row.attendance.incomplete,
      missingWork: students.reduce((sum, student) => sum + student.tally.missing, 0),
      handedIn: requirements.reduce((sum, requirement) => sum + requirement.handedIn, 0),
      verified: students.reduce((sum, student) => sum + student.tally.verified, 0),
      unposted: row.requirementCount === 0,
    },
  };
}

/**
 * What one student handed in for one requirement, read straight off the
 * verification state the server stores.
 *
 * TRACK has no grade book — no score field on any model, and no endpoint that
 * computes one — so this reports the states the system actually keeps. Anything
 * else would be a number the database cannot support.
 */
export type GradeCell = { key: string; label: string; tone: Tone };

export function gradeCellOf(
  requirement: BoardRequirement,
  studentId: number
): GradeCell {
  const state = requirement.stateByStudent.get(studentId);
  if (state === 'verified') return { key: 'verified', label: 'Verified', tone: 'green' };
  if (state === 'submitted') return { key: 'pending', label: 'Awaiting', tone: 'amber' };
  if (state === 'returned') return { key: 'returned', label: 'Returned', tone: 'red' };
  if (state === 'overdue') return { key: 'overdue', label: 'Overdue', tone: 'red' };
  if (requirement.state === 'closed') return { key: 'missing', label: 'Missing', tone: 'red' };
  return { key: 'open', label: '—', tone: 'gray' };
}
