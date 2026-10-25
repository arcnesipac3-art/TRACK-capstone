# TRACK — Phase 3: Security & Data Integrity Audit Report

**Date:** 19 October 2026
**Scope:** Authorization, mass assignment, object-level access, throttling, input
validation, upload safety, production configuration, privacy scoping.
**Method:** Direct API requests against a **sandbox server (127.0.0.1:8001) backed by a
disposable copy of the database**. The real database (port 8000) was never written to.
All fixes are applied in the working tree; **nothing was committed**.

---

## 1. Summary

Phase 3 verified the TRACK API's security posture by exploiting it directly — not by
reading code alone. **10 confirmed vulnerabilities** were found and fixed with minimal,
targeted changes. Every fix is pinned by a new regression test (25 added), and every
fix was re-verified over live HTTP against the sandbox after implementation.

**Test results (actually run):**

| Suite | Result |
|---|---|
| Backend `manage.py test core` | **197 tests OK** (172 existing + 25 new Phase 3 regression tests) |
| Frontend `npm run test` | **202 tests / 13 files passed** |
| Frontend `npm run build` | **OK** (exit 0) |
| Frontend `npx oxlint` | **exit 0** (31 pre-existing warnings, unchanged) |
| Mobile `npx tsc --noEmit` | **exit 0** |
| Mobile `npx expo lint` | **exit 0** |
| Live sandbox probe (22 checks, post-fix) | **22/22 PASS** |

**Phase 4 readiness verdict: READY**, subject to the remaining risks in §6 and the
production configuration steps in §7. Tests passing is necessary but not sufficient for
production — this report does **not** claim compliance or production readiness on its own.

---

## 2. Issues found and fixed (by severity)

### HIGH

**H-1. Submission mass assignment — a student could forge teacher feedback, backdate
hand-in, move work to another requirement, and reassign ownership.**
*(backend/core/serializers.py, SubmissionSerializer)*
Confirmed live: `PATCH /api/submissions/<own>/` with `{"teacher_feedback": "forged"}`,
`{"submitted_at": "2020-01-01…"}`, `{"requirement": <other>}`, and
`{"student": <classmate>}` all returned 200 and were stored.
*Fix:* on update, `requirement` and `submitted_at` are read-only; `teacher_feedback`
is read-only for students (teachers/admins keep writing it — the review flow sends
`{status, teacher_feedback}` and still works); ownership immutability is enforced in
`validate()` (the `student` field is explicitly declared, so `extra_kwargs` cannot
freeze it — DRF only applies `extra_kwargs` to auto-generated fields).

**H-2. A student could hand in work to a requirement in a section they are not enrolled
in** (confirmed live: 201 for a Grade-7 student posting into a Grade-8 requirement).
*(backend/core/views.py, `SubmissionListCreateView.perform_create`)*
*Fix:* the requirement's section must match the student's section, else 403.

**H-3. Attendance sessions could be re-assigned to another teacher's class, and
`created_by` was client-writable** (confirmed live: `PATCH /api/attendance/sessions/<id>/`
with `{"teacher_assignment": <teacher2's>}` and `{"created_by": <admin>}` → 200, stored).
*(backend/core/serializers.py, AttendanceSessionSerializer)*
*Fix:* `created_by` is always read-only (server-stamped); on update `teacher_assignment`
and `schedule` are frozen. The UI flow (PATCH `{date, notes}`) verified still working.

**H-4. Attendance records could be moved into another teacher's session, and
`recorded_by` was client-writable** (confirmed live: `PATCH /api/attendance/records/<id>/`
with `{"session": <teacher2's session>}` → 200; the record then silently left the
teacher's own scope).
*(backend/core/serializers.py, AttendanceRecordSerializer)*
*Fix:* `recorded_by`/`modified_by` always read-only; on update `session`/`student` are
frozen (the UI PATCHes only `{status, notes}` — verified still working).

### MEDIUM

**M-1. Section-scoped announcements leaked to other sections.** The announcement list
queryset filtered by audience but never by `section`, so a notice targeted at one class
was readable by every student/parent/teacher in the school (confirmed live). The detail
endpoint already returned 404 — the list was the leak.
*(backend/core/views.py, `AnnouncementListCreateView.get_queryset`)*
*Fix:* non-admin users see `section__isnull=True` OR a section they belong to
(student → own section; parent → children's sections; teacher → assigned sections).
Re-verified live: same-section student sees it; foreign-section students get 0 list rows
and 404 on detail.

**M-2. A teacher could post announcements into a section they do not teach** (confirmed
live: 201). *(backend/core/serializers.py, `AnnouncementSerializer.validate_section`)*
*Fix:* teachers may target only sections they are assigned to; admins may target any;
`null` stays school-wide.

**M-3. No brute-force protection on credential endpoints.** 15 consecutive failed
logins to `/api/auth/token/` all returned 400 — no throttling.
*(backend/config/settings.py, backend/core/views.py)*
*Fix:* DRF `ScopedRateThrottle` (`scope="auth"`, **10/min per IP**) on `LoginView` and
`TokenLoginView`; rate overridable via `TRACK_AUTH_THROTTLE_RATE`. Verified live: 429
after the budget is exhausted. Tests clear the throttle cache in `setUp` so the suite
is deterministic.

**M-4. Session-generation endpoint: unhandled 500 and unbounded work.** A malformed
date raised `ValueError` → 500 with a full traceback (with DEBUG on); a
1990–2099 range generated **5,738 attendance sessions** in one request.
*(backend/core/views.py, `generate_attendance_sessions`)*
*Fix:* malformed dates → 400; end-before-start → 400; range capped at 366 days
(generous for any legitimate batch) → 400 beyond that.

**M-5. Arbitrary file upload accepted.** `POST /api/submissions/` accepted an HTML file
containing `<script>` (201, stored under `/media/` — a stored-XSS vector where media is
served). *(backend/core/serializers.py, `SubmissionSerializer.validate_file_upload`)*
*Fix:* extension allow-list (PDF/Office/TXT/common images) and 10 MB size cap.
Verified live: `probe.html` refused with 400; a normal PDF still accepted (regression
test pins both directions).

### LOW / configuration

**L-1. Production configuration hardening.** `DEBUG=True` and a committed `SECRET_KEY`
meant any 500 in production would leak stack traces and settings (observed live: a
~225 KB traceback page).
*(backend/config/settings.py)*
*Fix:* opt-in `DJANGO_PRODUCTION=1` block that refuses to boot without `SECRET_KEY`
and `DJANGO_ALLOWED_HOSTS`, forces `DEBUG=False`, enables HTTPS-only cookies, SSL
redirect, HSTS, and restricts CORS/CSRF origins to the deployed hosts. **Local
development is unchanged** — nothing activates unless the env var is set.

---

## 3. Verified-safe areas (inspected and tested, no fix needed)

These were probed but found correctly protected. Several first-pass probe "failures"
were **probe artifacts**, listed here honestly rather than as fixes:

- `PATCH /auth/me/` with `{"role": "admin"}` → 200 but **role unchanged** (read-only
  field). Not vulnerable.
- Student `DELETE /api/submissions/<own>/` → 405 (destroy not exposed). Not vulnerable.
- Teacher A patching teacher B's announcement → the probe had actually targeted A's
  *own* announcement (author verified). Authorization correct.
- Teacher passing `teacher_id=<other>` to `/attendance/generate/` → the parameter is
  ignored for non-admins; only the teacher's own assignments are used. Correct.
- "Section announcement visible to student2" → in the real demo database student2 is in
  the *same* section as the announcement; correct behavior. Re-tested with genuinely
  foreign-section students (student4/5): hidden, 404 on detail.
- `role`, `is_active`, `username` read-only on `/auth/me/`; `Announcement.author`
  read-only; inactive accounts get generic login errors (no account enumeration);
  `link_url` validated by `URLField` (no `javascript:` URIs).
- Notification fan-out correctly scoped (parents-of-student, section members,
  assigned teachers).
- Mobile: credentials in `expo-secure-store` (keychain/keystore), token in the
  `Authorization` header, 401 handling resets the session — appropriate, compatible
  with existing auth.
- Web frontend: cookie session + CSRF cookie only; **no tokens in browser storage**.
- Cross-role write attempts (student/parent creating requirements, schedules,
  teacher-assignments, users, sessions, records; parent verifying submissions) all
  correctly refused (403/404), pinned by tests.
- `.gitignore` covers secrets and the database; no `.env` or DB tracked in git.

---

## 4. Files changed (all uncommitted, working tree only)

| File | Change |
|---|---|
| `backend/core/serializers.py` | Submission mass-assignment freezes + upload validation; attendance record/session identity freezes and server-stamped attribution; announcement section validator |
| `backend/core/views.py` | Announcement list section scoping; cross-section hand-in guard; generation date validation and range cap; auth throttling on login views |
| `backend/config/settings.py` | Auth throttle rate; `DJANGO_PRODUCTION` hardening block (env-gated) |
| `backend/core/tests.py` | `Phase3SecurityRegressionTests` (25 tests); per-test throttle cache clear in `TrackTestCase.setUp` |
| `PHASE_3_SECURITY_AUDIT_REPORT.md` | This report |

No schema changes were made — **no migrations required**. No endpoints or capabilities
were added or removed; all changes narrow what a client may write or read.

---

## 5. Regression test results

25 new tests in `Phase3SecurityRegressionTests`, each reproducing a defect proven over
HTTP, plus positive tests pinning that legitimate flows still work:

- Submissions: feedback forgery, backdating, requirement moves, ownership reassignment
  (all blocked); teacher review flow (works); cross-section hand-in blocked / own-section
  hand-in works; hostile script upload refused / normal PDF accepted.
- Attendance: `recorded_by`/`created_by` server-stamped; cross-session record moves and
  session re-assignment blocked; teacher can still edit `status`, `notes`, `date`.
- Announcements: section scoping (visible in-section, hidden cross-section), school-wide
  still reaches everyone; foreign-section targeting refused for teachers, allowed for
  their own section and for admins.
- Generation: malformed date, unbounded range, end-before-start all → 400.
- Throttling: repeated failed logins → 429.

**`manage.py test core`: Ran 197 tests — OK.** Full frontend/mobile suites and builds
also pass (see §1).

---

## 6. Remaining risks (known, documented, not fixed here)

1. **Server-side schedule-overlap validation** remains frontend-only by documented
   design (see `SCHEDULE_CONFLICT_AUDIT_REPORT.md`); the API will still accept
   overlapping schedules. Expected audit FAIL.
2. **Throttle is per-IP.** Many users behind one NAT/proxy share a budget; the
   rate is env-tunable (`TRACK_AUTH_THROTTLE_RATE`) and should be tuned for the
   deployment's egress topology. Account-lockout policy and alerting are out of scope.
3. **Media serving in production** must be done by the web server with a restrictive
   content-type allow-list and `nosniff`; Django's dev media handler is not
   production-grade. The serializer allow-list is defense-in-depth, not a substitute.
4. **`DEBUG=True` remains the default** for local development (intentionally); the
   production block only activates with `DJANGO_PRODUCTION=1`. Deployment must set it.
5. **9 documented schedule conflicts** and **31 frontend lint warnings** remain from
   earlier phases (unchanged, out of Phase 3 scope).
6. **No automated DAST/SAST pipeline** — verification was one-shot; CI enforcement is
   a Phase 4+ item.
7. **Backup procedures** were not audited for operational adequacy (retention,
   restoration drills); only confirmed no backups/secrets are tracked in git.

---

## 7. Production configuration steps

Set in the deployment environment (nothing to change in code):

1. `DJANGO_PRODUCTION=1` — activates the hardening block; the app **refuses to boot**
   without steps 2–3.
2. `SECRET_KEY` — generate per environment:
   `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`.
3. `DJANGO_ALLOWED_HOSTS` — comma-separated public hostname(s).
4. `DJANGO_CSRF_ORIGINS` — comma-separated `https://` origins of the deployed SPA
   (defaults to `https://<host>` for each allowed host).
5. `TRACK_AUTH_THROTTLE_RATE` — optional; tune the login throttle (default `10/min`).
6. Run behind HTTPS termination (the block sets secure cookies, SSL redirect, HSTS,
   and honors `X-Forwarded-Proto`).
7. Serve `/media/` from the web server with a restrictive content type and
   `X-Content-Type-Options: nosniff`.
8. Keep SQLite backups off-repo on a schedule; test restoration before go-live.
9. Run `python manage.py migrate` on deployment (no new migrations from this phase,
   but standard practice) and `manage.py check --deploy`.

---

## 8. Phase 4 readiness verdict

**READY for Phase 4** on the evidence of this audit: all confirmed security defects
from Phases 1–3 are fixed with minimal changes, pinned by 197 passing backend tests and
re-verified over live HTTP; no workflow was broken; no data or schema was altered.
Production deployment remains gated on §7 and the residual risks in §6 — passing tests
alone does not make this production-ready.
