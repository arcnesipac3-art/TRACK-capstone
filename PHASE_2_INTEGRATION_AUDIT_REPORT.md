# Phase 2 — Full Integration and Functional Audit

**Project:** TRACK — Tracking Requirements, Attendance & Communication (Kiwalan National High School)
**Date:** 19 October 2026
**Scope:** startup/connectivity, real user workflows across all four roles, all automated test suites, and targeted fixes for confirmed integration defects.

---

## 1. Method and data safety

| Item | Detail |
|---|---|
| Real backend | `python backend/manage.py runserver 127.0.0.1:8000` — real DB `backend/track_db.sqlite3` (9 users, never reset) |
| Sandbox backend | `…:8001` using `audit_settings.py` + a **copy** of the DB (`track_audit_copy.sqlite3`) — *every write path (create/update/delete) ran here* |
| Web frontend | Vite dev server `http://localhost:5173`, proxy → `127.0.0.1:8000` (real DB, read-only + session login) |
| Audit script | `C:\Users\dragon\AppData\Local\Temp\opencode\track_audit\audit_api.py` (outside the repo) |
| Mobile | Static verification only (`tsc`, `expo lint`, code review) — no emulator was available in this session |

The real database was **not mutated** by the audit: all create/update/delete checks ran against the sandbox copy on port 8001, and browser sessions against port 8000 only read data (one attendance "unsaved change" was staged and **discarded without saving** — verified afterwards that no attendance record changed).

---

## 2. Startup and connectivity

- `manage.py check` — clean; migrations consistent (new `0004_alter_attendancesession_schedule.py`, help_text-only).
- `GET /api/health/` → **200**; `GET /api/dashboard/` anonymous → **401**; `GET /api/students/` anonymous → **401**.
- `POST /api/auth/login/` (session) → **200**; `POST /api/auth/token/` (mobile token) → **200**; `POST /api/auth/token/logout/` revokes the token (subsequent `/auth/me/` → 401).
- Note: `POST /auth/login/` (no `/api` prefix) → 404 is **correct** — the SPA proxy rewrites to `/api`.

---

## 3. Automated suites (all run after the fixes)

| Suite | Command | Result |
|---|---|---|
| Backend | `python manage.py test core` | **172 tests OK** |
| Frontend | `npm run test` (vitest) | **13 files / 202 tests passed** |
| Frontend build | `npm run build` | OK |
| Frontend lint | `npx oxlint` | **0 errors**, 31 warnings, exit 0 |
| Mobile type-check | `npx tsc --noEmit` | exit 0 |
| Mobile lint | `npx expo lint` | exit 0 |
| Mobile health | `npx expo-doctor` | 19/20 (known, unrelated warning) |

New regression coverage added in `backend/core/tests.py` → `Phase2IntegrationRegressionTests` (isolated test data, no shared fixtures):

- notification mark-read accepts **POST** (mobile client) as well as PATCH, and still rejects another user's notification;
- students/parents **cannot** POST attendance records (403) and cannot PATCH them;
- requirement detail readable by students/parents scoped exactly like the list view; write attempts still 403;
- submission detail reachable by a parent for a **linked** child, 404 for an unlinked one; parent PATCH → 403;
- `page_size` query honoured (100 max) through `TrackPagination`;
- annotated school-year/section/subject lists are stably ordered (no `UnorderedObjectListWarning`);
- `SubjectDetailView` detail payload includes `assignment_count` (duplicate class removed).

---

## 4. Functional audit results — final run on a fresh sandbox

`audit_api.py` → **87 PASS / 2 FAIL**

Covered and passing:

- **Auth:** 6 role logins, invalid/unknown credentials (400), bogus token (401), `/auth/me/` for every role, mobile logout revocation.
- **Role authorization:** student/parent/teacher cannot list or create users, cannot reset passwords, cannot create requirements or post announcements, cannot create/delete schedules, cannot generate attendance sessions.
- **Attendance write authorization:** student/parent cannot list sessions, cannot create records (**403**), confirmed independently by `probe2.py`.
- **Privacy scoping:** student sees only self in `/students/`; parent sees only linked children; submissions/attendance/requirements of an unlinked child → 403/404; notifications scoped per user.
- **Announcements:** audience filtering (students-only hidden from parents and teachers), admin sees own, pinned sorts first.
- **School structure & schedules:** all read endpoints, school-year date order, end-before-start rejection, duplicate slot rejection, create/read/delete round-trip.
- **Attendance sessions:** generate, second run idempotent (`generated: 0`), manual create + duplicate rejection, record create + duplicate + invalid status.
- **Requirements & submissions:** list + **detail** for students, teacher return flow with history, student cannot verify own submission.
- **Notifications:** PATCH mark-read, **POST mark-read (mobile)**, cross-user mark-read rejected.

**The 2 failures (expected, documented as residual risk):**

| Check | Result | Meaning |
|---|---|---|
| overlapping teacher schedule rejected (backend) | **201** — accepted | No server-side overlap validation |
| double-booked room rejected (backend) | **201** — accepted | No server-side room-conflict validation |

> These two checks "passed" only in an intermediate run because stale rows from an earlier run collided with the `unique_together` constraint. On a freshly restored sandbox they fail honestly, which is the true state: **the backend only rejects an exact duplicate slot** (`teacher_assignment + day_of_week + start_time`) and an end-before-start time. Conflict detection is deliberately frontend-only per `SCHEDULE_CONFLICT_AUDIT_REPORT.md` — see §6.

Two harness bugs were also found and fixed during the audit (they were *not* product defects): `/students/` rows are StudentProfile ids while `/auth/me/` returns the User id, and the manual-session check reused a fixed date that a previous run had already consumed.

---

## 5. Browser integration verification (Vite → Django)

Performed in a real browser against the dev server:

1. **Admin login** (`admin`/`track2026`) → redirected to `/admin/dashboard`; live data rendered from the API: 5 students, 2 teachers, 1 parent, 9 accounts, 5 active requirements, 9 submissions, 71.9 % attendance, activity feed.
2. **Admin attendance** (`/admin/attendance`) → 18 sessions loaded from `GET /api/attendance/sessions/`.
3. **Role guard:** admin → `/student/dashboard` redirected to `/unauthorized` ("403 Access denied … (Administrator)").
4. **Student login** (`student1`) → `/student/dashboard` with correctly scoped data (own 6 requirements, own 8 attendance records, section "Grade 7 — Sampaguita"), student menu with admin pages absent; `/admin/users` → `/unauthorized` ("… (Student)").
5. **Failed-request handling:** `/api/announcements` forced to reject → page rendered `Could not load announcements — Cannot reach the TRACK server. Check that Django is running.` with a **Try again** button. No crash, no blank screen.
6. **Unsaved-changes handling (teacher):** `/teacher/attendance` → *Take attendance* → staged one status change → `1 unsaved change` appeared with **Discard / Save attendance**; clicking *Back* opened the dialog **"Discard unsaved changes? — This session has 1 unsaved change that will be lost when you leave."** Chose **Discard**: returned to the list, no save request issued (attendance rows unchanged, verified afterwards).
7. **Logout** returns to `/login` and the session is actually invalidated.

---

## 6. Defects confirmed and fixed (minimal, targeted changes)

| # | Defect | Evidence before | Fix | Evidence after |
|---|---|---|---|---|
| 1 | `frontend/src/pages/AttendancePage.test.jsx:753` unescaped apostrophe → parse error, broke `npm test` and `oxlint` | vitest/oxlint could not parse the file | double-quoted the `it(...)` title | 202 tests run, oxlint exit 0 |
| 2 | Mobile `POST /api/notifications/<id>/read/` → **405** (client only had POST) | audit FAIL, server log `405` | added `post` to `NotificationMarkReadView` (`backend/core/views.py`) | audit PASS; regression test added |
| 3 | Students/parents could `POST /api/attendance/records/` → **201** | `probe2.py` returned 201 for student & parent | admin/teacher guard in `AttendanceRecordListCreateView.perform_create` | `probe2.py` → **403** for student1/student5/parent1 |
| 4 | Requirement detail **404** for students/parents; submission detail **404** for parents (list showed rows they could not open) | audit FAIL | shared `_requirement_queryset_for()` + parent branch in `SubmissionDetailView.get_queryset`, with explicit write guards (`IsAdminOrTeacher` on unsafe methods, `PermissionDenied` for parent PATCH) | audit PASS ×2; regression tests added |
| 5 | Migration drift (model changed without migration) | `makemigrations --check` wanted a new migration | `backend/core/migrations/0004_alter_attendancesession_schedule.py` (help_text only) | `showmigrations` consistent, applied to real DB |
| 6 | Duplicate `SubjectDetailView` class — second definition shadowed the first, dropping `assignment_count` from detail responses | code inspection | removed the dead duplicate | regression test asserts `assignment_count` in detail |
| 7 | `UnorderedObjectListWarning` on paginated annotated querysets (school years, sections, subjects) | Django log warning | explicit `.order_by(...)` on the three list views | warning gone; ordering test added |
| 8 | `PAGE_SIZE_QUERY_PARAM` / `MAX_PAGE_SIZE` in `settings.py` were **inert** (DRF never reads them) — mobile's `page_size=100` was silently ignored | settings inspection | new `backend/core/pagination.py` (`TrackPagination`) wired via `DEFAULT_PAGINATION_CLASS`; inert keys removed | `?page_size=100` now returns up to 100 rows (verified: 32 records on one request) |

**Pagination safety check:** pagination was *already* active before the change (`PageNumberPagination`, `PAGE_SIZE: 20`), so the `{count, next, results}` envelope did not change shape. Both clients already follow `next` (`frontend/src/services/api.js` loops up to 10 pages; `mobile/src/api/client.ts` does the same), so no client loses rows.

---

## 7. Residual risks and observations (not fixed — by design or out of scope)

1. **No server-side schedule conflict validation (2 audit FAILs).** `ClassScheduleSerializer.validate()` only checks `end_time > start_time`; `unique_together` only blocks the *exact* same teacher/day/start. A teacher double-booking, a section clash, or a room double-booking through the API is accepted (`201`). Conflict detection exists only in `SchedulesPage.jsx` (`detectConflicts()`), which a direct API client bypasses. `SCHEDULE_CONFLICT_AUDIT_REPORT.md` states this split is intentional — if it is *not* intentional, add a serializer-level overlap check (teacher/section/room) as the follow-up.
2. **9 pre-existing schedule conflicts** in the real DB (3 teacher+section+room, 6 room-only), already documented in `SCHEDULE_CONFLICT_AUDIT_REPORT.md`. Not modified.
3. **Frontend lint:** 31 oxlint warnings (0 errors) — `Date.now()`-in-render, `setState` in effect, exhaustive-deps, unused vars in `AttendancePage.jsx`. The "0 warnings" claim only holds for the mobile app (`expo lint`).
4. **`expo-doctor` 19/20** — one unrelated package recommendation.
5. **`GET /api/attendance/records/?session=<id>` is ignored** — the list view filters only by `student`. No current client sends `?session=` (both fetch the role-scoped list and filter client-side), so nothing breaks, but the parameter is a silent no-op for anyone who assumes it works.
6. **Attendance sessions cannot be deleted** — `DELETE /api/attendance/sessions/<id>/` → 405 (list/create only). Probably deliberate (records reference sessions); flagged so nobody reports it as a regression.
7. **Unknown process polls `http://127.0.0.1:8000/health` every ~30 s** (404 — the real route is `/api/health/`). Harmless, but it is not part of this project.

---

## 8. Running the mobile app (Android emulator / device)

`mobile/.env` currently reads `EXPO_PUBLIC_API_URL=http://localhost:8000/api`.

- **Android emulator:** `localhost` inside the emulator is the emulator itself. Use the special alias to reach the host machine:
  ```
  EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api
  ```
- **Real phone on the same Wi‑Fi:** use the dev machine's LAN IP, e.g. `http://192.168.1.10:8000/api`, and allow that host in Django:
  ```
  $env:DJANGO_EXTRA_ALLOWED_HOSTS="192.168.1.10"
  python backend\manage.py runserver 0.0.0.0:8000
  ```
  (`ALLOWED_HOSTS` in `backend/config/settings.py` already honours `DJANGO_EXTRA_ALLOWED_HOSTS`.)
- **iOS simulator:** `localhost` works as-is.
- The dev server must **not** be exposed to the public internet — it runs with `DEBUG=True` and a development `SECRET_KEY`. LAN-only, trusted network.

---

## 9. State at the end of the audit

- Backend on **:8000** — real DB, running (leave as is).
- Sandbox on **:8001** — shut down; its DB copy is disposable.
- Vite dev server on **:5173** — running for manual review.
- No repository files were committed by this session; all fixes are in the working tree:
  `backend/core/{views,serializers,tests,urls,pagination}.py`, `backend/config/settings.py`,
  `backend/core/migrations/0004_alter_attendancesession_schedule.py`, `frontend/src/pages/AttendancePage.test.jsx`.

### How to re-run everything

```bash
# backend
python backend/manage.py test core
python backend/manage.py runserver 127.0.0.1:8000

# frontend
cd frontend && npm run test && npm run build && npx oxlint

# mobile
cd mobile && npx tsc --noEmit && npx expo lint

# functional API audit (sandbox on :8001 with audit_settings.py)
python C:\Users\dragon\AppData\Local\Temp\opencode\track_audit\audit_api.py
```
