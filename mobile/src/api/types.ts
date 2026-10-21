/**
 * TRACK — shared API types.
 *
 * Every shape here was captured from the live backend (`GET /api/...` against
 * the running Django server) — not guessed. Screens import from this module
 * instead of re-declaring local copies, so a response-shape change is caught
 * by `tsc` in one place rather than silently rendering `undefined` everywhere.
 */

import type { Role } from './client';

export type { Role };

/* ------------------------------------------------------------------ */
/* Dashboard (GET /dashboard/) — one shape per role                     */
/* ------------------------------------------------------------------ */

export type AttendanceSummary = {
  total_records: number;
  by_status: { present: number; absent: number; late: number; excused: number };
  present_rate: number | null;
};

export type SubmissionStatusCounts = {
  submitted: number;
  verified: number;
  returned: number;
  not_submitted: number;
  overdue: number;
  /** Requirements with no submission row at all. */
  none: number;
};

export type StudentDashboard = {
  role: 'student';
  student_name: string;
  section: string | null;
  total_requirements: number;
  not_submitted: number;
  overdue: number;
  awaiting_verification: number;
  verified: number;
  returned: number;
  attendance: AttendanceSummary;
  unread_notifications: number;
};

/** Child row inside the parent dashboard. `student_id` is the StudentProfile pk. */
export type ParentDashboardChild = {
  student_id: number;
  name: string;
  section: string | null;
  total_requirements: number;
  not_submitted: number;
  overdue: number;
  awaiting_verification: number;
  verified: number;
  returned: number;
  attendance: AttendanceSummary;
};

export type ParentDashboard = {
  role: 'parent';
  parent_name: string;
  children: ParentDashboardChild[];
  unread_notifications: number;
};

export type TeacherDashboardClass = {
  id: number;
  subject: string;
  subject_id: number;
  section_id: number;
  section: string;
};

export type TeacherDashboardUpcoming = {
  id: number;
  title: string;
  subject: string;
  section: string;
  deadline: string;
  is_overdue: boolean;
};

export type TeacherDashboardActivity = {
  id: number;
  requirement_title: string;
  student_name: string;
  status: SubmissionStatus;
  submitted_at: string | null;
  updated_at: string;
};

export type TeacherDashboard = {
  role: 'teacher';
  teacher_name: string;
  assigned_classes: number;
  classes: TeacherDashboardClass[];
  total_requirements: number;
  pending_verification: number;
  submission_status: SubmissionStatusCounts;
  upcoming_deadlines: TeacherDashboardUpcoming[];
  recent_activity: TeacherDashboardActivity[];
  attendance: AttendanceSummary;
  unread_notifications: number;
};

export type AdminDashboardActivity = {
  id: number;
  action: string;
  description: string;
  actor: string | null;
  timestamp: string;
};

export type AdminDashboard = {
  role: 'admin';
  total_users: number;
  total_students: number;
  total_teachers: number;
  total_parents: number;
  total_sections: number;
  total_requirements: number;
  active_requirements: number;
  total_submissions: number;
  submission_status: SubmissionStatusCounts;
  attendance: AttendanceSummary;
  recent_activity: AdminDashboardActivity[];
  unread_notifications: number;
};

export type Dashboard =
  | StudentDashboard
  | ParentDashboard
  | TeacherDashboard
  | AdminDashboard;

/* ------------------------------------------------------------------ */
/* Requirements & submissions                                          */
/* ------------------------------------------------------------------ */

export type Requirement = {
  id: number;
  title: string;
  description: string;
  requirement_type: string;
  deadline: string;
  is_overdue: boolean;
  allow_file_upload: boolean;
  allow_link_submission: boolean;
  subject_name: string;
  section_name: string;
  teacher_assignment: number;
  created_at: string;
};

export type SubmissionStatus =
  | 'not_submitted'
  | 'submitted'
  | 'verified'
  | 'returned'
  | 'overdue';

export type SubmissionHistoryEntry = {
  id: number;
  old_status: string;
  new_status: string;
  changed_by: number | null;
  changed_by_name: string | null;
  note: string;
  timestamp: string;
};

export type Submission = {
  id: number;
  requirement: number;
  requirement_title: string;
  /** StudentProfile pk. */
  student: number;
  student_name: string;
  status: SubmissionStatus;
  submitted_at: string | null;
  verified_at: string | null;
  link_url: string;
  teacher_feedback: string;
  created_at: string;
  updated_at: string;
  history: SubmissionHistoryEntry[];
};

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

/** Embedded in every attendance record (not top-level fields). */
export type SessionBrief = {
  id: number;
  date: string;
  subject_name: string;
  section_name: string;
};

export type AttendanceRecord = {
  id: number;
  session: number;
  session_detail: SessionBrief;
  /** StudentProfile pk. */
  student: number;
  student_name: string;
  status: AttendanceStatus;
  notes: string | null;
  recorded_by: number | null;
  modified_by: number | null;
  recorded_at: string;
  modified_at: string;
};

export type AttendanceSession = {
  id: number;
  teacher_assignment: number;
  subject_name: string;
  section_name: string;
  date: string;
  schedule: number | null;
  schedule_time: { start_time: string; end_time: string; room: string | null } | null;
  status: 'not_started' | 'in_progress' | 'completed';
  status_display: string;
  notes: string;
  created_by: number;
  created_at: string;
  records: AttendanceRecord[];
};

/* ------------------------------------------------------------------ */
/* Timetable, people, structure                                        */
/* ------------------------------------------------------------------ */

export type ClassSchedule = {
  id: number;
  teacher_assignment: number;
  teacher_assignment_detail: {
    id: number;
    teacher_id: number;
    teacher_name: string;
    subject_name: string;
    section_id: number;
    section_name: string;
    grade_level: string;
  };
  /** 1 = Monday … 7 = Sunday (Django isoweekday). */
  day_of_week: number;
  day_of_week_display: string;
  start_time: string;
  end_time: string;
  room: string | null;
};

export type TeacherAssignment = {
  id: number;
  teacher: number;
  teacher_name: string;
  subject: number;
  subject_name: string;
  section: number;
  section_name: string;
};

export type StudentProfile = {
  id: number;
  /** StudentProfile pk. */
  user: {
    id: number;
    username: string;
    email: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    full_name: string;
    role: Role;
    is_active: boolean;
  };
  lrn: string | null;
  /** Section pk — used for roster filtering. */
  section: number | null;
  section_name: string | null;
  date_of_birth: string | null;
  address: string | null;
  contact_number: string | null;
};

export type AdminUser = {
  id: number;
  username: string;
  email: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

export type Section = {
  id: number;
  name: string;
  grade_level: number;
  grade_level_name: string;
  school_year: number;
  school_year_label: string;
  adviser: number | null;
  adviser_name: string | null;
  student_count: number;
};

/* ------------------------------------------------------------------ */
/* Notifications & announcements                                       */
/* ------------------------------------------------------------------ */

export type Notification = {
  id: number;
  notif_type: string;
  title: string;
  body: string;
  is_read: boolean;
  requirement: number | null;
  submission: number | null;
  attendance_record: number | null;
  created_at: string;
};

export type AnnouncementAudience = 'all' | 'students' | 'teachers' | 'parents';

export type Announcement = {
  id: number;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  /** Section pk, or null for school-wide. */
  section: number | null;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  author: number | null;
  author_name: string | null;
};
