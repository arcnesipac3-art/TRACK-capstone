# TRACK — Known Limitations

This document describes all known incomplete features, external service dependencies, unresolved defects, native testing gaps, and deployment restrictions. Do not claim something works if it appears in this file without a resolution note.

Last verified against the code: **2026-11-01** (backend 324 tests, frontend 368 tests, `oxlint` clean).

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
