# TRACK — Known Limitations

This document describes all known incomplete features, external service dependencies, unresolved defects, native testing gaps, and deployment restrictions. Do not claim something works if it appears in this file without a resolution note.

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
- **Current state:** The `Submission.file_upload` field, the serializer validation, and the upload directory exist. No frontend currently sends files — submissions use `link_url`. The `/media/` URL is served by Django's dev static handler only.
- **Fix:** Before enabling file uploads in the frontend, either: (a) attach a Render persistent disk and configure `MEDIA_ROOT` to a path on that disk, or (b) implement Supabase Storage as the Django storage backend.

---

## Frontend

### L-005: SchedulesPage lint warnings (non-blocking)
- **Severity:** Informational
- **Description:** `frontend/src/pages/SchedulesPage.jsx` has 9 oxlint warnings: React purity hints (`Date` used in render), missing `useEffect` dependency, `useMemo` signature, and fast-refresh export warnings. Exit code is 0 (warnings only, not errors).
- **Impact:** None on production behavior. May cause subtle stale-state bugs in development hot-reload.
- **Fix:** Address the warnings in a future maintenance pass.

### L-006: AttendancePage unused variable warnings
- **Severity:** Informational
- **Description:** `frontend/src/pages/AttendancePage.jsx` has 3 oxlint warnings for an unused function and variable, and a missing `useEffect` dependency.
- **Impact:** None on production behavior.
- **Fix:** Remove unused declarations in a future cleanup.

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
- **Description:** `backend/db.sqlite3` (empty, 0 bytes or near-empty) exists alongside the real `backend/track_db.sqlite3`. It is not used by the application but may cause confusion.
- **Fix:** Delete `backend/db.sqlite3` after confirming the real database is `track_db.sqlite3`.

---

## Deployment

### L-014: Nothing is committed to git
- **Severity:** Critical (before deployment)
- **Description:** The entire working tree — including migrations `0002–0004`, `pagination.py`, `SchedulesPage.jsx`, `AttendancePage.jsx` updates, all Phase docs, the entire `mobile/` directory, and all backend/frontend changes since the initial commit — is uncommitted. A clean clone of the `origin/main` branch would be missing critical migration files and all Phase 1–6 features.
- **Impact:** Any deployment from a fresh clone today would fail at the migration step and present an incomplete application.
- **Fix:** Commit the working tree. At minimum, commit: `backend/core/migrations/0002_auto_attendance.py`, `0003_attendance_constraints.py`, `0004_alter_attendancesession_schedule.py`, and all modified tracked files.

### L-015: No production deployment exists
- **Severity:** High (by design)
- **Description:** The application is deployment-ready but not deployed. No cloud infrastructure, domains, or public builds have been created. No real student data exists in a production database.
- **Impact:** The system is not yet accessible to real users.
- **Fix:** Follow `docs/DEPLOYMENT.md` with explicit authorization.

### L-016: Split-origin web auth requires a settings change
- **Severity:** High (if using Render + Vercel split-origin topology)
- **Description:** If the Django backend and React frontend are on different hostnames (e.g., Render backend + Vercel frontend), `SameSite=Lax` session cookies will not be sent cross-site, and web login silently fails.
- **Fix:** Either use same-origin hosting (VPS + nginx recommended), or add `SESSION_COOKIE_SAMESITE = "None"` inside the `if IS_PRODUCTION:` block in `settings.py` (requires `SESSION_COOKIE_SECURE = True`, which is already set).

---

## Data and privacy

### L-017: No GDPR/Data Privacy Act compliance review
- **Severity:** Medium
- **Description:** No formal review of compliance with the Philippine Data Privacy Act (Republic Act 10173) has been conducted. Student names, LRNs, birthdates, addresses, and contact numbers are stored.
- **Fix:** Before collecting real student data, have a data protection officer review the system and establish a privacy notice and data retention policy.

### L-018: Media files not access-controlled in production
- **Severity:** High (when file uploads are enabled in the frontend)
- **Description:** The production settings comment notes that `/media/` should be served by nginx with a restrictive content-type allow-list. There is no backend authorization check on media file access — anyone who knows the URL can download a submission file.
- **Current state:** No frontend sends files, so no submission files exist from real users. The feature is dormant.
- **Fix:** Before enabling file uploads, implement signed URL generation or a Django view that checks permissions before streaming the file.
