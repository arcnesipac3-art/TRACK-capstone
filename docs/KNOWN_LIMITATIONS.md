# TRACK — Known Limitations

This document describes all known incomplete features, external service dependencies, unresolved defects, native testing gaps, and deployment restrictions. Do not claim something works if it appears in this file without a resolution note.

Last verified against the code: **2026-11-02** (backend 475 tests, frontend 875 tests, `oxlint` clean over 227 files).

---

## Authentication and security

### L-001: Mobile tokens never expire
- **Severity:** Medium
- **Description:** DRF tokens issued to the mobile app are permanent — they have no expiry date. A stolen token remains valid until the user explicitly logs out (which calls `/api/auth/token/logout/` and deletes the token server-side). A reinstalled app that did not log out first retains the old token.
- **Impact:** A stolen device with a cached token grants access until the admin resets the user's password.
- **Mitigation in place:** Token is deleted on logout. Admin can reset the user's password to invalidate the session.
- **Fix required:** Add token expiry and rotation (e.g., `djangorestframework-simplejwt`) — not implemented in this version.

### L-002: No self-service password reset (SMTP not configured)
- **Severity:** Low for initial deployment
- **Description:** There is no SMTP email backend. Password recovery is admin-initiated: an admin calls the `/api/auth/reset-password/` endpoint to set a new password, which is then communicated to the user out-of-band. The reset is logged to the audit trail.
- **Impact:** Users locked out of their accounts must contact the school administrator.
- **Fix:** Configure an SMTP provider (e.g., SendGrid, Gmail SMTP) and implement a self-service reset flow.

### L-003: Login throttle is per-process (weakened with multiple workers)
- **Severity:** Low
- **Description:** The `10/min` login throttle uses Django's default `LocMemCache`, which is per-process. With 2 Gunicorn workers, a single IP address could make up to 20 login attempts per minute before being throttled.
- **Impact:** Brute-force attacks require twice as many requests to trigger the throttle per worker.
- **Fix:** Configure Redis as the cache backend and use `DRF_DEFAULT_THROTTLE_BACKEND = 'django.core.cache.backends.redis.RedisCache'`.

---

## File storage

### L-004: File uploads use local filesystem (no cloud storage)
- **Severity:** High for Render/cloud deployment
- **Description:** Student submission files are stored under `backend/media/submissions/`. On Render's free and starter tiers, the filesystem is ephemeral — files are lost on restart or redeployment. No Supabase Storage integration is implemented.
- **Impact:** On Render, uploaded files are lost on every deploy unless a persistent disk is attached ($0.25/GB/month on Render).
- **Current state:** Enrollment applications DO upload files today — the public wizard and the applicant detail page send `multipart/form-data` to the document endpoints, and the files land under `backend/media/`. The requirements-side `Submission.file_upload` field still has no frontend upload path (submissions use `link_url`). `/media/` is only routed when `DEBUG=True`, so production reads uploads back through the authorized download view (see L-018), not through a public URL.
- **Fix:** Before deploying to a host with an ephemeral filesystem, either: (a) attach a persistent disk and point `MEDIA_ROOT` at it, or (b) implement Supabase Storage as the Django storage backend.

---

## Frontend

### L-005: SchedulesPage lint warnings (non-blocking)
- **Severity:** Informational
- **Status:** Resolved (2026-11-01) — the purity, dependency-array and fast-refresh warnings in `frontend/src/pages/SchedulesPage.jsx` are gone; `npm run lint` reports 0 warnings and 0 errors over 145 files.
- **Original description:** 9 oxlint warnings (React purity hints, missing `useEffect` dependency, `useMemo` signature, fast-refresh exports). Exit code was already 0 (warnings only).

### L-006: AttendancePage unused variable warnings
- **Severity:** Informational
- **Status:** Resolved (2026-11-01) — no unused declarations remain in `frontend/src/pages/AttendancePage.jsx`.
- **Original description:** 3 oxlint warnings for an unused function and variable, and a missing `useEffect` dependency. No production impact.

---

## Mobile

### L-007: No automated mobile test suite
- **Severity:** Medium
- **Description:** The mobile app (`mobile/`) has no automated test files. All mobile testing is manual.
- **Impact:** Regressions in mobile-specific behavior (SecureStore, token lifecycle, API client, role routing) cannot be caught automatically.
- **Fix:** Add Expo testing with Jest and `@testing-library/react-native`.

### L-008: Mobile app not tested on physical Android device
- **Severity:** High (before distribution)
- **Description:** No physical device testing was performed. The app was tested only via Expo web mode in a browser. Android-specific behavior (SecureStore, native gestures, screen rendering) was not verified.
- **Fix:** Run the app on a physical device or Android emulator before distributing any APK.

### L-009: EAS Build not executed
- **Severity:** High (before distribution)
- **Description:** No EAS build (APK or AAB) has been produced. The `eas.json` `EXPO_PUBLIC_API_URL` placeholder has not been replaced with a real deployed backend URL.
- **Fix:** Replace the placeholder in `eas.json`, then run `npx eas-cli@latest build -p android --profile preview`.

### L-010: Mobile npm audit — 26 toolchain advisories
- **Severity:** Informational
- **Description:** `npm audit` in the `mobile/` directory reports 26 vulnerabilities (7 moderate, 19 high) in the Expo build toolchain (`braces`, `node-forge`, `uuid` via `metro/@expo/cli/config-plugins/xcode`). These packages are not shipped in the runtime JS bundle.
- **Impact:** No runtime security risk to users. The vulnerabilities are in build-time processing tools.
- **Fix:** No fix is available without downgrading to Expo SDK 44 (breaking). Keep the Expo SDK updated: `npx expo install --check` after each Expo release.

---

## Backend

### L-011: Django admin exposed at /admin/
- **Severity:** Low (requires superuser credentials)
- **Description:** The Django admin interface is accessible at `/admin/` on the production URL. It requires superuser credentials and HTTPS in production mode. No IP allow-list is configured.
- **Impact:** The login page is publicly reachable. A compromised superuser account gives full database access.
- **Fix (optional):** Add nginx IP allow-list for `/admin/`, or change the admin URL to a non-standard path.

### L-012: No background task runner configured
- **Severity:** Low
- **Description:** The `notify_deadlines` management command (deadline reminders and overdue notifications) must be triggered manually or by a cron job. There is no Celery, Django-Q, or other task queue configured.
- **Impact:** Deadline approaching and overdue notifications are never sent unless someone runs `python manage.py notify_deadlines` on a schedule.
- **Fix:** Set up a cron job on the server or use Render's scheduled jobs feature to run `notify_deadlines` daily.

### L-013: Stray empty db.sqlite3 file
- **Severity:** Informational
- **Status:** Resolved (2026-11-01) — `backend/db.sqlite3` (a legacy Django-only database with 11 built-in tables, all empty, and no `core_*` tables) has been deleted. `backend/track_db.sqlite3` is the only database file; `settings.py` points at it and `*.sqlite3` is gitignored.

---

## Deployment

### L-014: Nothing is committed to git
- **Severity:** Critical (before deployment)
- **Status:** Resolved (2026-11-01) — `main` and `origin/main` both point at `743da85` with a clean working tree. Migrations `0001`–`0010` and the `mobile/` app are tracked, so a fresh clone runs `migrate` and builds all four roles.
- **Original description:** During the October audit the working tree was entirely uncommitted, so a clean clone was missing migrations and the Phase 1–6 features.

### L-015: No production deployment exists
- **Severity:** High (by design)
- **Description:** The application is deployment-ready but not deployed. No cloud infrastructure, domains, or public builds have been created. No real student data exists in a production database.
- **Impact:** The system is not yet accessible to real users.
- **Fix:** Follow `docs/DEPLOYMENT.md` with explicit authorization.

### L-016: Split-origin web auth requires a settings change
- **Severity:** High (if using Render + Vercel split-origin topology)
- **Status:** Resolved (2026-11-01) — the production block already sets `SESSION_COOKIE_SAMESITE = "None"` and `CSRF_COOKIE_SAMESITE = "None"` alongside `*_SECURE = True` (`backend/config/settings.py:278-280`), so cross-origin web login works without a manual edit. Same-origin hosting is still the simpler topology.

---

## Data and privacy

### L-017: No GDPR/Data Privacy Act compliance review
- **Severity:** Medium
- **Description:** No formal review of compliance with the Philippine Data Privacy Act (Republic Act 10173) has been conducted. Student names, LRNs, birthdates, addresses, and contact numbers are stored.
- **Fix:** Before collecting real student data, have a data protection officer review the system and establish a privacy notice and data retention policy.

### L-018: Media files not access-controlled in production
- **Severity:** High (when file uploads are enabled in the frontend)
- **Status:** Mostly resolved for enrollment uploads (2026-11-01). Enrollment documents are streamed by `ApplicationDocumentDownloadView` (`backend/core/enrollment_views.py:613`), which re-checks ownership or `enrollment.view` staff permission per request and answers 404 — never 403 — for someone else's record. The frontend fetches them through that endpoint (`downloadAuthorizedFile`), not the public `/media/` URL, and `/media/` is only routed when `DEBUG=True`.
- **Remaining:** Requirement `Submission.file_upload` has no authorized download view yet, and nothing stops a future `/media/`-served path from being opened in production by an nginx rule.
- **Fix:** Reuse the document download pattern for submissions before that upload path is enabled.

---

## Real-time messaging

### L-019: The channel layer is in-memory unless `REDIS_URL` is set
- **Severity:** High (only when running more than one process)
- **Description:** With no `REDIS_URL`, `CHANNEL_LAYERS` uses `channels.layers.InMemoryChannelLayer` (`backend/config/settings.py:116-134`). Group messages — the fan-out that carries `message.new`, `typing.update`, presence and read receipts — live inside one Python process.
- **Impact:** One ASGI process works, and the documented `daphne config.asgi:application` command is exactly one process. Two workers behind a load balancer split live traffic: a sender on worker A does not reach a reader on worker B, and the reader sees the message only after a reload or a reconnect `sync`. This is invisible in development and appears the moment the app is scaled out.
- **Fix:** Set `REDIS_URL` (`redis://host:6379/0`) on the deployment. `channels-redis` is already in `backend/requirements.txt` and the code path is unchanged; expiry is 60 s so a Redis blip degrades live delivery rather than losing messages, which are stored first.

### L-020: Browser push is inert without VAPID keys
- **Severity:** Medium (feature is off by default, by design)
- **Description:** Web push needs a VAPID key pair. `core/push.py` checks `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` and sends nothing when either is missing.
- **Impact:** Without them the details column states it plainly — "This server has no push keys configured, so nothing can be delivered outside TRACK" — the browser toggle is disabled, and no subscription is stored. In-app bells and live socket events are unaffected.
- **Fix:** `python backend/manage.py generate_vapid_keys`, then put the three values (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) in the environment. Re-running it invalidates every existing subscription; browsers resubscribe on their next visit.

### L-021: Push fan-out is capped at five recipients per message
- **Severity:** Low
- **Description:** `PUSH_FANOUT_LIMIT = 5` (`backend/core/notifications.py:516`) stops push delivery after the fifth recipient because each subscription is a separate HTTPS round-trip made while the sender waits for their POST.
- **Impact:** A class or department thread gets its live socket event, its unread count and its in-app bell for everyone; only the first five offline members also receive a device notification.
- **Fix:** Move `notify_message_received` onto a task runner (see L-012) and lift the cap. The cap is a symptom of the missing queue, not of the messaging design.

### L-022: Notifications are delivered inside the send request
- **Severity:** Low
- **Description:** Storing a message, writing bell rows and pushing to devices all happen in the same request that posts it (`core/messaging.py:post_message` → `notifications.notify_message_received`).
- **Impact:** A send to a small thread is fast; a send to a large class thread costs the sender the fan-out time. Failures are logged and swallowed, so a broken notification never loses the message.
- **Fix:** Same as L-012 — a queue turns this into an enqueue call. Not needed for the school sizes TRACK serves today.

### L-023: The native mobile app authenticates its socket with a token in the query string
- **Severity:** Low
- **Description:** The web app trades its API token for a single-use 30-second ticket over HTTPS (`POST /api/messaging/ws-ticket/`) and puts only the ticket in the socket URL. A raw DRF token is also accepted as `?token=` for non-browser clients (`backend/core/websocket_auth.py`).
- **Impact:** Expo cannot set an `Authorization` header on a WebSocket, so the mobile handshake leaks a credential into whatever logs the connection URL — the same credential the app already sends in a header on every request. Web traffic never takes this path; a browser has no reason to.
- **Fix:** Give the mobile client a ticket too (it can call the same authenticated endpoint) once the Expo app is wired to the messaging screens.

---

## Attendance management

### L-024: `Missed` is derived, never stored
- **Severity:** Low
- **Description:** `AttendanceSession.status` still holds only `not_started`, `in_progress` and `completed`. `Missed` is what the filter helper and the UI call a past session that never reached `completed` (`backend/core/views.py` `attendance_session_filters`, `frontend/src/utils/attendance.js`).
- **Impact:** The web screens agree with each other, and `?status=missed` filters correctly server-side. A consumer that reads the raw `status` field — the mobile app, or a report written straight against the model — sees `not_started` for a class that was simply never marked.
- **Fix:** Only if the school wants `Missed` to be a fact on the record rather than a view: add the choice to the model and sweep past sessions in a data migration. Deliberately not done here, because it rewrites historical rows.

### L-025: Attendance history is inspect-only — a session cannot be deleted
- **Severity:** Low
- **Description:** The redesign removed the delete affordance from the history table, and there is no `DELETE` endpoint for a session. `EditSessionModal` patches `date` and `notes` only.
- **Impact:** A session recorded wrongly can be corrected mark by mark, and one generated on the wrong day can be moved, but a genuinely unwanted session stays on the books. Records are never silently lost, which is the trade the school asked for.
- **Fix:** If deletion is ever required, add an admin-only endpoint that cascades deliberately and writes an audit row — not a button on the teacher's history screen.

### L-026: Session filter dropdowns read up to 100 rows
- **Severity:** Low
- **Description:** The board's *Filter by class* and *Filter by subject* selects are built from `/teacher-assignments/` and `/schedules/?page_size=100`, one bounded read per mount, while every list of sessions and records is server-paged.
- **Impact:** Correct for any realistic teacher (a teacher does not hold more than 100 subject assignments). Beyond that the option list is truncated — the filters themselves still work, because they send ids to the server.
- **Fix:** Replace the two selects with the shared search-select pattern if the school ever outgrows 100 rows.

### L-027: `POST /attendance/generate/` runs once per attendance mount
- **Severity:** Low
- **Description:** The screen materialises today's sessions from the timetable when it opens, guarded by a ref so a re-render does not repeat it.
- **Impact:** The endpoint is idempotent — scoped to the calling teacher and skipping days that already have a session — so tab clicking adds no rows. It is one extra write-shaped request on entry, not drift.
- **Fix:** Move generation to a scheduled management command (see L-012) if the school wants sessions to exist before anyone opens the screen.

### L-028: Fresh logins only work from an origin Django trusts
- **Severity:** Low (development only)
- **Description:** `POST /api/auth/token/` is CSRF-checked and `CSRF_TRUSTED_ORIGINS` lists `http://localhost:5173` and `http://127.0.0.1:5173` (`backend/config/settings.py:250`). Running the Vite dev server on another port — `5199`, or the `5203` used for the attendance probe — makes a first sign-in answer `403 CSRF Failed: Origin checking failed`.
- **Impact:** The login screen reports "Your browser blocked the sign-in request". Requests with an already-issued API token are unaffected, which is why a probe on a non-standard port can read and write normally but cannot sign a new account in.
- **Fix:** Add the dev origin to `CSRF_TRUSTED_ORIGINS` (or set `TRACK_CSRF_TRUSTED_ORIGINS`) when running Vite off the default port. Not changed here because it is a security-relevant setting.
