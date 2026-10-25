# TRACK — Phase 5 Report: Deployment & Production Readiness

Date: 2026-10-21 · Status: **deployment-ready — NOT deployed.** Nothing was
committed, published, or provisioned; all changes remain uncommitted in the
working tree, and the real database was never written to by any check.

---

## 1. What was inspected

- **Repository & git:** 120 tracked files, 70 pending changes (Phases 1–4
  uncommitted), GitHub remote present, no Dockerfile/render.yaml/Procfile/
  fly.toml/vercel.json anywhere → **no hosting provider selected**.
- **Backend:** `config/settings.py` (all 265 lines, incl. the Phase 3
  production block), `config/urls.py`, `core/urls.py` (39 routes), auth views
  (session + token + admin-initiated password reset), health check, throttle,
  CORS/CSRF config, `requirements.txt` (6 packages), `backend/.env.example`,
  `media/`, both SQLite files (`track_db.sqlite3` = live 438 KB, stray
  `db.sqlite3`), migrations 0001–0004 (read line-by-line: all
  additive/constraint-only; **0002–0004 untracked in git**).
- **Frontend:** Vite config + `/api` dev proxy, `services/api.js`
  (`VITE_API_BASE_URL` build-time base, CSRF token read from
  `document.cookie`), `.env`/`.env.example`, tracked `package-lock.json`.
- **Mobile:** `package.json` (Expo SDK 58), `app.json`, `client.ts` API-layer
  resolution of `EXPO_PUBLIC_API_URL`, `.env*` files, `.gitignore` coverage,
  missing `eas.json`; Expo SDK 58 docs fetched for env-file loading and the
  eas.json schema (per `mobile/AGENTS.md`).
- **Git hygiene:** `.env` files ignored at every level (verified with
  `git check-ignore`), DB/media/build artifacts ignored, only `.env.example`
  files tracked.

**Audit findings that drove the work:** no `STATIC_ROOT`/collectstatic path,
no production WSGI server or PostgreSQL driver or static middleware in
requirements, `DATABASE_URL` advertised in `.env.example` but unread by
settings, no `.env` loader, stale `.env.example`, `eas.json` absent while
`client.ts` silently fell back to `localhost:8000` (which would ship in a
release build), a `.gitignore` gap for `.env.*` files, and no documented
backup/restore procedure.

## 2. What was changed (and why)

| File | Change | Why |
|---|---|---|
| `backend/requirements.txt` | + gunicorn 26.2.0, whitenoise 6.12.0, psycopg[binary] 3.3.6, dj-database-url 3.1.2, python-dotenv 1.2.4 (installed into `.venv`) | production server, static serving, PostgreSQL, `DATABASE_URL` parsing, documented `.env` loading |
| `backend/config/settings.py` | load `backend/.env` if present (never overrides real env); `STATIC_ROOT`; `DATABASE_URL` → PostgreSQL with `conn_max_age=600` + `conn_health_checks` (SQLite default untouched); production block: WhiteNoise middleware + manifest static storage, console `LOGGING`, `DJANGO_SECURE_SSL_REDIRECT` opt-out (as the comment already promised), updated env-var docs | collectstatic/production static, real Postgres path, honest logging, testable HTTPS rehearsal |
| `backend/.env.example` | rewritten to the variables settings actually reads (old one advertised `DEBUG`/`DATABASE_URL` nothing read) | stop documenting env vars that do nothing |
| `.gitignore` | `.env.*` ignored; allow-list `!.env.development`/`!.env.production`/`!.env.*.example` | a future `.env.production` was not covered; committed dev-URL files are safe by design (`EXPO_PUBLIC_*` is public) |
| `mobile/.env.development` (new, committable) | localhost dev URL + emulator/device instructions | dev mode only; release mode never reads it → localhost cannot enter release bundles via files |
| `mobile/.env` | now comment-only pointer | same reason (release mode reads `.env` last) |
| `mobile/.env.example` | rewritten for the SDK 58 mode-based loading order + 4 use cases | document how each environment sets `EXPO_PUBLIC_API_URL` |
| `mobile/eas.json` (new) | `preview` (APK, internal) + `production` (AAB) profiles with `env.EXPO_PUBLIC_API_URL` placeholder | EAS never uploads gitignored `.env` — the URL must come from the profile/dashboard |
| `mobile/src/api/client.ts` | guard: dev keeps the localhost fallback, **release builds throw if the URL is missing or localhost** | enforced "never ship localhost in a production build" instead of trusting procedure |
| `mobile/app.json` | removed `newArchEnabled` (schema-invalid in SDK 58; RN 0.88 is New-Arch-only) | expo-doctor failure |
| `mobile/package.json` + lock | expo 58.0.14→58.0.16, expo-router 58.0.23→58.0.24 via `npx expo install --fix` | expo-doctor patch drift |
| `DEPLOYMENT.md` (new) | full guide: architecture, provider options + trade-offs, env tables, deploy order, backup/restore/rollback, verification, troubleshooting, limitations, blockers | required deliverable |
| `PHASE_5_DEPLOYMENT_READINESS_REPORT.md` (this file) | durable copy of the final report | phase-report convention |

No backend business logic, models, serializers, views, or migrations were
modified. The web frontend was not modified at all.

## 3. Checks — executed results

| Check | Command | Result |
|---|---|---|
| Backend tests | `python backend/manage.py test core` | **PASS 197/197** |
| Migration drift | `makemigrations --check --dry-run` | **PASS** — "No changes detected" |
| Fresh-database migrate | scratch settings, empty DB, migrate | **PASS** — all 25 migrations incl. core.0002–0004; 0 users created |
| Live-DB migration state | `showmigrations` (read-only) | **PASS** — everything `[X]`, no pending |
| Production self-check | `check --deploy` with generated 50+ char key | **PASS — 0 issues** (with a short test key it correctly warns W009) |
| collectstatic (prod mode) | `collectstatic --noinput` | **PASS** — 157 copied, 453 post-processed (manifest) |
| Production boot smoke (11 checks, `DJANGO_PRODUCTION=1`, sandbox DB) | health 200; security headers; admin page; WhiteNoise hashed CSS 200; unauth API 401; CORS allow trusted origin + reject foreign; token login; authenticated data; no session cookie on token login | **PASS 11/11** |
| Production boot without SECRET_KEY | `manage.py check` | **PASS (fails fast as designed)** — `ImproperlyConfigured`, exit 1 |
| `DATABASE_URL` → Postgres code path | settings introspection with postgres URL | **PASS** — engine/name/host/`CONN_MAX_AGE=600`/`conn_health_checks=True` (no server connection attempted) |
| API integration probe | `phase4_probe.ps1` vs sandbox :8001 (dev mode) | **PASS 44/44** on a fresh DB copy (first run 41/44 on a stale copy — probe non-idempotency, not a regression; re-verified) |
| Frontend lint | `npm run lint` (oxlint) | **PASS exit 0** with 5 pre-existing warnings in `SchedulesPage.jsx` (non-blocking, untouched) |
| Frontend tests | `npm test` (vitest) | **PASS 202/202** |
| Frontend production build | `npm run build` | **PASS** — 497.56 kB JS / 59.82 kB CSS |
| Mobile typecheck | `npx tsc --noEmit` | **PASS exit 0** |
| Mobile lint | `npx expo lint` | **PASS exit 0** |
| Expo diagnostics | `npx expo-doctor` | **PASS 20/20** (after fixing schema field + 2 patch versions; initially 18/20) |
| Mobile release bundling | `npx expo export -p android` | **PASS** (run before *and* after the SDK patch upgrade) |
| Release env inlining | bytecode scan of export artifact | **PASS** — `api.phase5-test.example.com` present, `localhost:8000` absent |
| Dependency vulnerabilities | `pip-audit -r requirements.txt`, `pip check` | **PASS** — 0 known vulns, no conflicts |
| Dependency vulnerabilities | `npm audit` frontend | **PASS — 0** (all deps) |
| Dependency vulnerabilities | `npm audit --omit=dev` mobile | **26 advisories (7 moderate, 19 high)** — all in Expo's build toolchain (`braces`/`node-forge`/`uuid` chains via metro/@expo/cli/xcode); only offered fix is breaking downgrade to expo@44 → **not applied**; no shipped-runtime path; mitigation = keep SDK updated |
| SQLite→dump→fresh-DB round trip | `dumpdata` → `migrate` → `loaddata` → counts | **PASS** — 161 objects, counts identical (9/5/9/32/2) |
| SQLite online backup | Python `sqlite3.Connection.backup` | **PASS** |
| `.env` secret hygiene | `git check-ignore` matrix | **PASS** — real `.env*` ignored everywhere, examples + safe `.env.development`/`.env.production` visible |
| Fresh Metro dev server after SDK upgrade | `expo start` + web bundle request | see §4 note* |
| **gunicorn boot** | `gunicorn config.wsgi` | **CANNOT RUN HERE** — POSIX-only (`import fcntl` fails on Windows). Install + config validated; runtime must be smoke-tested on the Linux host |
| **PostgreSQL live connect** | — | **CANNOT RUN HERE** — no PostgreSQL server in this environment; settings/parser path verified instead |
| **EAS build / physical device** | — | **NOT EXECUTED** — requires the owner's Expo account and a physical device (approval required) |

\* recorded in the chat log of this session; a fresh Metro serves the web
bundle with no resolution errors — the earlier `bundle-origin` failures came
from a stale pre-upgrade Metro process, which was stopped.

## 4. Production settings that remain incomplete

1. **No live host** — no provider provisioned, so no real `SECRET_KEY`,
   `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, or TLS exist yet (by design: not
   deployed without approval).
2. **Email** — console backend remains; admin-initiated password reset writes
   to server logs. SMTP integration not implemented (would be new behavior).
3. **Split-origin topology** — if frontend and API get different hostnames,
   `SESSION_COOKIE_SAMESITE` must become `None` (documented one-line change,
   deliberately not applied; same-origin hosting avoids it entirely).
4. **Media serving** — production defers `/media/` to the web server (feature
   dormant: no frontend sends files).
5. **eas.json placeholder** — `EXPO_PUBLIC_API_URL` still reads
   `https://REPLACE-WITH-DEPLOYED-BACKEND.example.com/api`.
6. **Commit** — nothing is committed (standing constraint); migrations
   `core.0002–0004` exist only on disk.

## 5. Deployed, or deployment-ready?

**Deployment-ready only.** The system has never been deployed: no cloud
infrastructure, domains, or builds were created; no packages published; no
git commits made. What *was* executed: a full local production-mode rehearsal
(hardened settings + WhiteNoise + collectstatic + health/CORS/auth smoke) and
every build/test/check listed in §3.

## 6. Exact next steps for you

1. Review + commit the working tree — at minimum include
   `backend/core/migrations/0002–0004` or a clean-clone deploy breaks.
2. Pick a hosting option from `DEPLOYMENT.md` §3 (recommendation: single VPS
   + nginx for same-origin session auth; Render as the low-ops alternative
   with the split-origin caveat).
3. Provision PostgreSQL; create host env vars per `DEPLOYMENT.md` §4.1
   (`DJANGO_PRODUCTION=1`, generated `SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
   `DJANGO_CSRF_ORIGINS`, `DATABASE_URL`).
4. Deploy backend: `pip install -r backend/requirements.txt` →
   `migrate` → `collectstatic` → `gunicorn config.wsgi --chdir backend`
   (on the Linux host) → verify `GET /api/health/`.
5. Build frontend with `VITE_API_BASE_URL`/`VITE_SITE_URL` (split-origin) or
   default `/api` (same-origin nginx) and serve `frontend/dist`.
6. Edit `mobile/eas.json` placeholder → `npx eas-cli@latest build -p android
   --profile preview` → install the APK on a physical device and run the
   smoke flow against the deployed API (this step was not executable here).
7. Set up the §6 backup schedule in `DEPLOYMENT.md` **before** any real
   student data is entered.

## 7. Critical issues before real student data

1. **Commit everything (incl. migrations)** — a clean clone today cannot run
   migrations 0002–0004 or Phase 1–5 code.
2. **Backups first** — SQLite/Postgres backup + restore procedure exists but
   no automated backup runs yet; the DB now holds the records.
3. **Topology decision** — split-origin without the documented
   `SameSite=None` change breaks web login silently; same-origin avoids it.
4. **Mobile release URL** — replace the eas.json placeholder before
   distributing any APK (the app-side guard prevents localhost, but a
   placeholder URL yields an unreachable backend).
5. **Known accepted risks** — permanent (non-expiring) mobile tokens; console
   email; `/admin/` reachable (superuser-only, HTTPS); per-process login
   throttle with multiple gunicorn workers; 26 npm toolchain advisories with
   no non-breaking fix (upstream Expo). None exploitable against student data
   as configured; each is documented in `DEPLOYMENT.md` §8.
