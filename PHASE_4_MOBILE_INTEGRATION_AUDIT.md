# Phase 4 — Mobile ↔ Backend Integration Audit

Date: 2026-10-19 · Scope: `mobile/` (Expo SDK 58, expo-router) against the existing
DRF backend (no backend changes made for this audit). All endpoint claims below were
verified by reading `backend/core/urls.py`, `views.py`, `serializers.py`, and by live
read-only requests against the running backend on `:8000`.

## 1. Backend endpoint inventory (verified)

| Area | Endpoint | Access (verified in code) |
|---|---|---|
| Token login | `POST /api/auth/token/` | all roles; 10/min per IP throttle (`auth` scope) |
| Token logout | `POST /api/auth/token/logout/` | authenticated |
| Session user | `GET /api/auth/me/` | authenticated; role read-only |
| Dashboard | `GET /api/dashboard/` | per-role shape (see §2) |
| Requirements | `GET/POST /api/requirements/`, `GET/PATCH/DELETE /api/requirements/<id>/` | scoped per role; parent `?child=<student_profile_id>`; writes teacher/admin only |
| Submissions | `GET/POST /api/submissions/`, `GET/PATCH /api/submissions/<id>/` | student create (own section, upsert); teacher PATCH `status`+`teacher_feedback`; parent read-only; `?requirement=`, `?child=<profile id>`, `?status=` |
| Attendance sessions | `GET/POST /api/attendance/sessions/`, `GET/PATCH /api/attendance/sessions/<id>/` | **admin/teacher only**; own classes for teachers; embedded `records[]` |
| Attendance records | `GET/POST /api/attendance/records/`, `GET/PATCH /api/attendance/records/<id>/` | GET all roles (own/linked children); POST/PATCH admin/teacher; `?student=<profile id>` |
| Session generation | `POST /api/attendance/generate/` | teacher/admin; date-validated, ≤366 days (Phase 3) |
| Schedules (timetable) | `GET/POST /api/schedules/` | admin sees all, teacher sees own, **student/parent get an empty list** |
| Students | `GET /api/students/` | admin all; teacher own sections; student self; parent own children |
| Users | `GET/POST /api/users/` (`?role=`) | **admin only** |
| School structure | `/api/sections/`, `/api/subjects/`, `/api/grade-levels/`, `/api/school-years/`, `/api/teacher-assignments/` | read for authenticated, writes admin (mostly) |
| Notifications | `GET /api/notifications/`, `POST /api/notifications/<id>/read/`, `POST /api/notifications/read-all/` | own rows only; POST mark-read explicitly supported for the Expo app |
| Announcements | `GET/POST /api/announcements/` | audience+section scoped (Phase 3); POST teacher/admin; **detail GET is admin/teacher only — list carries full body, use the list** |

Mobile submission method supported end-to-end: **`link_url`** (the web app posts
`{requirement, link_url, status:'submitted'}`; it never sends files). File upload exists
on the backend but is unused by the web UI — not required for parity.

## 2. Actual `/api/dashboard/` response shapes (captured live)

- **student**: `{role, student_name, section, total_requirements, not_submitted, overdue, awaiting_verification, verified, returned, attendance:{total_records, by_status:{present,absent,late,excused}, present_rate}, unread_notifications}`
- **parent**: `{role, parent_name, children:[{student_id, name, section, total_requirements, not_submitted, overdue, awaiting_verification, verified, returned, attendance:{…}}], unread_notifications}`
- **teacher**: `{role, teacher_name, assigned_classes, classes[], total_requirements, pending_verification, submission_status{…}, upcoming_deadlines[], recent_activity[], attendance{…}, unread_notifications}`
- **admin**: `{role, total_users, total_students, total_teachers, total_parents, total_sections, total_requirements, active_requirements, total_submissions, submission_status{…}, attendance{…}, recent_activity[], unread_notifications}`

`attendance/records` rows carry `session_detail:{id, date, subject_name, section_name}` —
subject/section/date are **not** top-level fields.

## 3. Defect checklist (mobile code vs. verified backend)

### Broken — wrong response shape / wrong ID space
- [x] **D1 student/dashboard.tsx** expects `requirements_*` / `attendance_*` — backend returns `total_requirements`, `not_submitted`, `awaiting_verification`, …, `attendance.by_status.*`. Every stat tile renders `undefined`.
- [x] **D2 parent/dashboard.tsx** expects `children[].user.*` / `requirements_*` — backend returns `children[].{student_id, name, …}`. `child.user.full_name` throws (crash).
- [x] **D3 parent/children.tsx** maps `c.user.id` → throws → screen always shows "No linked children"; also would pass a **user id** where the API expects a **student-profile id**.
- [x] **D4 parent/requirements.tsx** same wrong children shape; client filter compares `submission.student` (profile id) with a user id → never matches; `/requirements/` fetched without `?child=`.
- [x] **D5 parent/attendance.tsx** same children shape bug + `r.student === selectedChild` id-space mismatch; `/attendance/records/` fetched without `?student=`.
- [x] **D6 student/attendance.tsx, parent/attendance.tsx** read `subject_name`/`section_name`/`session_date` at top level — real payload nests them in `session_detail` (rows show placeholder "Subject"/"Section").

### Missing core behavior
- [x] **D7 Auth transition**: `RootLayout` reads the token once on mount and never re-renders — after a successful login the user stays on the login screen (the comment claiming otherwise is wrong). No logout button exists anywhere.
- [x] **D8 AppLayout**: if `/auth/me/` fails (network error, revoked token) the shell spins forever (`loading=false && user=null` → spinner), with no retry or sign-out path.
- [x] **D9 Student submission**: "Submit work"/"Resubmit work" on `student/requirements.tsx` is inert text — no form, no `POST /submissions/`. Requirements workflow is display-only (§4 of the task).
- [x] **D10 Attendance row detail**: subject/section/date fallbacks make rows ambiguous (see D6) — no way to tell which class a mark belongs to.
- [x] **D11 No error surfaces**: every screen swallows failures with `console.warn` and renders an empty state indistinguishable from "no data".

### Missing roles / features (task §3)
- [x] **D12 Teacher role**: no screens at all ("dashboard is on the web app" fallback). Missing: dashboard, timetable, attendance recording + history, submission review, announcements, notifications.
- [x] **D13 Admin role**: no screens at all. Missing: dashboard stats, directory (students/teachers/parents/structure), schedules + attendance monitoring, requirements, announcements, notifications.
- [x] **D14 Announcements**: no screen for any role, though the task lists announcements for all four roles.

### Verified working (do not break)
- Token auth via `expo-secure-store`, `Authorization: Token`, 401 → token cleared.
- Student requirement/submission/attendance/notification **lists** hit correct endpoints with correct scoping.
- Parent scoping enforced server-side (`?child=`/`?student=` take profile ids — verified live: `?child=1` → 6 requirements, no `?child=` → 9).
- Notification mark-read `POST` supported by backend.
- Throttling: only `auth` endpoints (10/min/IP); GETs unthrottled.

## 4. Genuine backend gaps (documented, not masked)

1. **No timetable for students or parents** — `ClassScheduleListCreateView.get_queryset`
   returns `ClassSchedule.objects.none()` for non-admin/teacher. A student "class
   timetable" screen cannot be backed by real data without a backend change. The mobile
   app will **not** fabricate one; this is left for backend follow-up.
2. **`/attendance/records/` has no `?session=` filter** (Phase 2 known) — the mobile
   teacher screen uses the session's embedded `records[]` instead, which is authoritative.
3. **No file upload from mobile** — the JSON-only client matches the web app's link-based
   submission flow; backend file upload stays unused (parity, not a gap in workflow).
4. **`/students/` has no `?section=` filter** — teacher attendance roster filters by
   section client-side from the (already section-scoped) teacher list.

## 5. Implementation checklist (this phase)

- [x] P0 shared auth state (login → app, logout → login, 401 → login) + SignOut button
- [x] P0 AppLayout error/retry/sign-out instead of infinite spinner
- [x] P0 fix D1–D5 (real dashboard shape, student-profile ids everywhere)
- [x] P0 student submission form (link_url, validation, refresh, no duplicate tap)
- [x] P1 attendance rows via `session_detail` (D6)
- [x] P1 error/empty/loading states consistently (D11)
- [x] P1 teacher role: dashboard · attendance record · submission review · timetable · notices
- [x] P1 announcements for student/parent (segmented into the notices screen)
- [x] P2 admin role: dashboard · directory · schedules/attendance monitoring · requirements · notices
- [x] P2 verification: tsc, eslint, backend + frontend suites, Expo web smoke per role (sandbox DB for all write flows)
