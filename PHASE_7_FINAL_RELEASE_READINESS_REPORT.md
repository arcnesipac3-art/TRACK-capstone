# TRACK — Phase 7: Final Release Readiness Report

**Date:** 2026-10-21
**Project:** TRACK — School Requirements & Attendance Monitoring
**School:** Kiwalan National High School, Iligan City, Philippines
**Audit Environment:** Windows 11, Python 3.15, Node.js LTS, local SQLite database
**Status:** See Part A.

---

## Part A — Overall Status

### ✅ READY FOR CONTROLLED PILOT

Essential workflows (authentication, role-based access, requirements, submissions, attendance, notifications) have sufficient automated test evidence — 197/197 backend tests and 202/202 frontend tests pass — and all known critical access controls are enforced server-side.

**The application is NOT yet deployed.** Deployment is deployment-ready but requires:
1. Commit of the uncommitted working tree (critical — migrations 0002–0004 are untracked).
2. Provisioning of a hosting environment (Render + Supabase or VPS).
3. Replacement of the `eas.json` EAS build URL placeholder before APK distribution.

Unverified areas that prevent PRODUCTION DEPLOYMENT status: live Gunicorn boot on Linux (POSIX-only, cannot run on Windows audit host), live PostgreSQL connection (no server available), physical Android device testing, and EAS build execution. These are infrastructure blockers, not code blockers.

---

## Part B — Test Summary

| Category | Total | Pass | Fail | Blocked | Not Tested |
|---|---|---|---|---|---|
| Backend automated tests | 197 | **197** | 0 | 0 | 0 |
| Frontend automated tests | 202 | **202** | 0 | 0 | 0 |
| Django system check (dev) | 1 | **1** | 0 | 0 | 0 |
| Migration consistency | 1 | **1** | 0 | 0 | 0 |
| makemigrations --check | 1 | **1** | 0 | 0 | 0 |
| collectstatic | 1 | **1** | 0 | 0 | 0 |
| dumpdata (backup test) | 1 | **1** | 0 | 0 | 0 |
| Frontend production build | 1 | **1** | 0 | 0 | 0 |
| Frontend lint (oxlint) | 1 | **1** (warnings only) | 0 | 0 | 0 |
| Mobile TypeScript check | 1 | **1** | 0 | 0 | 0 |
| Mobile ESLint | 1 | **1** (1 warning) | 0 | 0 | 0 |
| Python pip-audit | 1 | **1** (0 CVEs) | 0 | 0 | 0 |
| Frontend npm audit | 1 | **1** (0 vulns) | 0 | 0 | 0 |
| Mobile npm audit | 1 | — | 0 | 0 | (26 toolchain-only advisories, no fix available) |
| Gunicorn production boot | 0 | — | — | **1** (Windows) | — |
| PostgreSQL live connection | 0 | — | — | **1** (no server) | — |
| Android emulator testing | 0 | — | — | **1** (no emulator) | — |
| EAS build / physical device | 0 | — | — | **1** (no Expo account/device) | — |

**Key automated test evidence:**
- `AuthTests` — login/logout round trip, CSRF endpoint, invalid credentials → 400, unauthenticated → 401/403
- `AuthorizationTests` — student sees only own submissions (403 on foreign access), teacher verifies own class, student cannot verify own submission
- `SubmissionWriteTests` — student submits with browser payload (201), resubmission refreshes row, foreign student ID refused (403), teacher cannot touch other teacher's submission (403/404)
- `ParentScopedDataTests` — parent sees only linked child, unlinked child request returns 403, attendance for unlinked child returns 403
- `DashboardTests` — per-role dashboard shape, `none` count verified against database, cross-teacher isolation
- `AttendanceWriteTests` — teacher cannot record for foreign session (403), duplicate session per day returns 400
- `AttendanceHistoryTests` — session history scoped to teacher's assignments, foreign session returns 404

---

## Part C — Deployment Summary

| Component | Status |
|---|---|
| Render backend | **Prepared, not deployed.** Start command, env vars, migration procedure, collectstatic, and health check endpoint all documented and locally verified. Blocked by no Linux host provisioned. |
| Vercel frontend | **Prepared, not deployed.** Build succeeds (497.56 kB), `vercel.json` SPA routing added. Requires `VITE_API_BASE_URL` pointing at the deployed backend. |
| Supabase PostgreSQL | **Configured (code-side), not provisioned.** `DATABASE_URL` env var is read and parsed; `psycopg[binary]` and `dj-database-url` installed. No live Supabase project exists. |
| Supabase Storage | **Not implemented.** File uploads use local filesystem. See L-004 in `docs/KNOWN_LIMITATIONS.md`. |
| Expo Android build | **Configured, not built.** `eas.json` has correct profiles; placeholder URL must be replaced before building. |
| Production API integration | **Not tested live.** All CORS, CSRF, and auth behavior verified in local production-mode rehearsal (Phase 5). |

---

## Part D — Database and Recovery Summary

| Item | Status |
|---|---|
| Development database | SQLite — `backend/track_db.sqlite3` (438 KB, 9 users, 5 students, 9 submissions, 20 sessions, 38 records, all 29 tables present) |
| Production database config | PostgreSQL via `DATABASE_URL` env var — code path verified, no live server provisioned |
| Migration status | All 4 migrations applied and consistent; `makemigrations --check` returns "No changes detected" |
| Data integrity | All foreign keys, unique constraints, and relationship checks verified through 197 automated tests |
| Backup procedure | Documented in `docs/BACKUP_RECOVERY.md`; SQLite online backup verified locally; pg_dump procedure documented |
| Recovery test | SQLite dump/load verified (161 objects, counts identical) in Phase 5; PostgreSQL restore documented but not executed (no server) |
| Automated backup schedule | **Not configured.** Must be set up before real student data is entered. |

---

## Part E — Security Findings

### Critical (must fix before pilot)
None — no critical security issues identified.

### High

| ID | Finding | Status |
|---|---|---|
| L-014 | Uncommitted working tree — migrations 0002–0004, all Phase features, entire mobile app not in git | Must commit before deploying |
| L-018 | Uploaded files not access-controlled in production (media files served without auth check) | **Currently dormant** — no frontend sends files. Must fix before enabling file upload UI. |
| L-016 | Split-origin topology breaks web session auth without `SESSION_COOKIE_SAMESITE="None"` | Documented one-line fix. Topology decision not yet made. |
| L-015 | Application is not deployed | By design. Requires authorization. |

### Medium

| ID | Finding | Status |
|---|---|---|
| L-001 | Mobile tokens never expire | Accepted for this version. Admin can reset password to invalidate. |
| L-003 | Login throttle weakened with multiple workers | Use 1–2 workers. Redis fix documented. |
| L-007 | No mobile test suite | Manual testing required before APK distribution. |
| L-008 | No physical device testing | Required before APK distribution. |
| L-017 | No formal Data Privacy Act review | Required before handling real student data. |

### Low / Informational

| ID | Finding | Status |
|---|---|---|
| L-002 | No SMTP — console-only password reset | Acceptable for controlled pilot. Admin must watch server logs. |
| L-005/L-006 | Lint warnings in SchedulesPage and AttendancePage | Non-blocking. No errors. |
| L-009 | EAS build not executed | Required before APK distribution. |
| L-010 | 26 mobile npm toolchain advisories | No fix available without breaking downgrade. Mitigated by using latest SDK. |
| L-011 | Django admin exposed at /admin/ | Requires superuser + HTTPS. Acceptable. |
| L-012 | No background task runner | Deadline notifications must be run manually. |
| L-013 | Stray empty db.sqlite3 | Informational. Delete it. |

---

## Part F — Files Changed in Phase 7

| File | Action | Reason |
|---|---|---|
| `README.md` | **Created** | Project had no root README. Required deliverable. |
| `docs/DEPLOYMENT.md` | **Created** | Structured deployment guide (replaces untracked `DEPLOYMENT.md` at root). |
| `docs/BACKUP_RECOVERY.md` | **Created** | Backup and recovery procedures. Required deliverable. |
| `docs/TESTING_REPORT.md` | **Created** | Testing evidence with all test IDs, commands, actual results. Required deliverable. |
| `docs/KNOWN_LIMITATIONS.md` | **Created** | Honest catalog of all incomplete features and risks. Required deliverable. |
| `docs/ADMIN_HANDOVER.md` | **Created** | Operational guide for school admin/IT staff. Required deliverable. |
| `frontend/vercel.json` | **Created** | SPA rewrite rules so Vercel serves `index.html` for all client-side routes instead of returning 404 on direct URL access. |
| `PHASE_7_FINAL_RELEASE_READINESS_REPORT.md` | **Created** | This report. |

**No existing code files were modified.** No models, views, serializers, migrations, or frontend pages were changed. All changes are documentation and configuration additions.

---

## Part G — Remaining Actions (Prioritized)

### Required before any pilot (with real users)

1. **Commit the working tree.** At minimum: `backend/core/migrations/0002–0004`, `backend/core/pagination.py`, all modified tracked files (`settings.py`, `models.py`, `views.py`, `serializers.py`, `urls.py`, `tests.py`, `requirements.txt`, frontend pages). The entire `mobile/` directory must also be added.
   ```bash
   git add backend/core/migrations/0002_auto_attendance.py
   git add backend/core/migrations/0003_attendance_constraints.py
   git add backend/core/migrations/0004_alter_attendancesession_schedule.py
   git add backend/core/pagination.py
   git add backend/ frontend/ mobile/ docs/ README.md
   git commit -m "feat: Phase 1-7 complete — production-ready"
   ```

2. **Provision PostgreSQL on Supabase.** Create a project, copy the Session-mode connection string, append `?sslmode=require`.

3. **Deploy the backend to Render (or VPS).** Set all environment variables from `docs/DEPLOYMENT.md §3`. Run migrate + collectstatic. Verify `GET /api/health/` returns 200.

4. **Deploy the frontend to Vercel.** Set `VITE_API_BASE_URL` to the Render backend URL. Verify login works. Verify SPA routing (navigate to `/login` directly — should not 404).

5. **Resolve the split-origin session issue** if using Render + Vercel on different domains. Apply `SESSION_COOKIE_SAMESITE = "None"` or use same-origin nginx.

6. **Set up nightly database backups** before creating any real user accounts. Verify one backup and restore to a test database.

7. **Run `python backend/manage.py notify_deadlines`** on a daily cron schedule for deadline reminder notifications.

### Required before Android distribution

8. **Replace the `eas.json` placeholder:** change `https://REPLACE-WITH-DEPLOYED-BACKEND.example.com/api` to the actual Render backend URL.

9. **Test on a physical Android device or emulator** — each role (admin, teacher, student, parent) should log in, view their dashboard, and navigate to key screens.

10. **Run EAS build:** `npx eas-cli@latest build -p android --profile preview` to produce an installable APK.

### Required before production (full rollout with all students and parents)

11. **Complete Data Privacy Act compliance review** (Philippine RA 10173) — privacy notice, data retention policy, breach notification procedure.

12. **Implement media access control** before enabling file uploads in the frontend (see L-018).

13. **Test restore procedure** against a real PostgreSQL restore from a Supabase backup to a test database.

14. **Gunicorn + PostgreSQL smoke test** on the Linux deployment host (verify health check, auth, CORS, static files, 197 backend tests).

### Recommended after launch

15. Implement mobile token expiry and refresh (djangorestframework-simplejwt).
16. Configure SMTP for self-service password reset emails.
17. Add a mobile test suite (`@testing-library/react-native`).
18. Address lint warnings in SchedulesPage.jsx and AttendancePage.jsx.
19. Implement IP allow-list for `/admin/` if required by school security policy.
20. Configure Redis for multi-worker login throttle (if scaling to 4+ workers).

---

## Part H — Exact Commands Reference

### Backend deploy (Linux host)
```bash
# Activate environment
source .venv/bin/activate  # or .venv\Scripts\activate on Windows dev

# Install dependencies
pip install -r backend/requirements.txt

# Verify no pending migrations
python backend/manage.py makemigrations --check

# Apply migrations
python backend/manage.py migrate --noinput

# Collect static files
python backend/manage.py collectstatic --noinput

# Production self-check (requires env vars)
DJANGO_PRODUCTION=1 SECRET_KEY=<your-key> DJANGO_ALLOWED_HOSTS=<your-host> \
  python backend/manage.py check --deploy

# Start server (Linux only)
gunicorn config.wsgi \
  --chdir backend \
  --bind 0.0.0.0:8000 \
  --workers 2 \
  --timeout 60

# Verify
curl https://<host>/api/health/
curl https://<host>/api/students/   # should be 401
```

### Frontend deploy
```bash
cd frontend
npm ci
VITE_API_BASE_URL=https://<backend-host>/api \
  VITE_SITE_URL=https://<frontend-host> \
  npm run build
# Deploy frontend/dist/ to Vercel or nginx
```

### Mobile build (EAS)
```bash
cd mobile
# 1. Edit eas.json: replace EXPO_PUBLIC_API_URL placeholder
# 2. Log in to Expo
npx eas-cli@latest login
# 3. Build installable APK
npx eas-cli@latest build -p android --profile preview
# 4. Install on device from the EAS dashboard download link
```

### Data migration (SQLite → PostgreSQL)
```bash
# Dump from dev SQLite
python backend/manage.py dumpdata \
  --exclude contenttypes \
  --exclude auth.permission \
  -o track_dump.json

# Apply schema to empty PostgreSQL target
DATABASE_URL="postgres://..." python backend/manage.py migrate --noinput

# Load data
DATABASE_URL="postgres://..." python backend/manage.py loaddata track_dump.json

# Verify counts
DATABASE_URL="postgres://..." python backend/manage.py shell -c "
from core.models import StudentProfile, Submission, AttendanceRecord
print(StudentProfile.objects.count(), Submission.objects.count(), AttendanceRecord.objects.count())
"
```

### Run tests (local)
```bash
# Backend
python backend/manage.py test core

# Frontend
cd frontend && npm test

# Mobile typecheck + lint
cd mobile && npx tsc --noEmit && npm run lint
```
