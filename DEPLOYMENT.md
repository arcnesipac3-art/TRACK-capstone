# TRACK — Deployment & Production Readiness Guide

Status: **deployment-ready, NOT deployed.** No hosting provider has been
connected to this repository and nothing has been published — deployment
requires explicit owner approval. Every command below that is marked
*(verified)* was actually executed during the Phase 5 audit; commands marked
*(documented)* describe the procedure but could not be run in the audit
environment (they need a Linux host, a PostgreSQL server, or EAS credentials).

---

## 1. Architecture overview

| Component | Tech | Role |
|---|---|---|
| `backend/` | Django 6.1 + DRF 3.18 | REST API at `/api/*`, Django admin at `/admin/*`, health check at `/api/health/` |
| `frontend/` | React 19 + Vite 8 | Web app for admins/teachers/students/parents; talks to `/api` (same-origin by default) |
| `mobile/` | Expo SDK 58 (React Native 0.88) | Mobile app; talks to `EXPO_PUBLIC_API_URL` with `Authorization: Token …` |

**Authentication (two schemes, one backend):**

- Web app → Django **session** cookie + CSRF token (cookie must be readable by
  JS, so `CSRF_COOKIE_HTTPONLY=False` is intentional). Session cookie is
  `SameSite=Lax` → **the web app must be served same-origin with the API**
  (see §4.1 — this decides your hosting topology).
- Mobile app → DRF **token** (no cookies, no CSRF needed). Tokens are
  permanent per user and deleted server-side at logout; there is no expiry
  (known limitation, §7).

**Configuration is environment-driven** (`backend/config/settings.py`):

- Development (no env vars): `DEBUG=True`, SQLite `backend/track_db.sqlite3`,
  localhost CORS/CSRF, committed dev `SECRET_KEY`.
- Production (`DJANGO_PRODUCTION=1`): refuses to boot without `SECRET_KEY` and
  `DJANGO_ALLOWED_HOSTS`; forces `DEBUG=False`, secure cookies, HSTS, HTTPS
  redirect (opt-out `DJANGO_SECURE_SSL_REDIRECT=0`), host allow-list, and
  CORS/CSRF origins derived from env. WhiteNoise serves collected static
  files from the WSGI process — no nginx required for static.
- `DATABASE_URL` (postgres://…) switches to PostgreSQL; unset = SQLite.

```
                    ┌─────────────────────────────┐
  Browser (web) ───►│  same origin:  /  + /api/*  │◄── nginx or single host
                    └─────────────┬───────────────┘
                                  │
  Phone (mobile) ─────────────────┼──► Django (gunicorn) ──► PostgreSQL
      https://<api-host>/api      │         │
                                  │    WhiteNoise /static/*
                                  └─ health check: GET /api/health/
```

---

## 2. Development setup (unchanged from Phases 1–4)

```bash
# Backend (Python 3.15 used in audit; 3.12+ should work)
python -m venv .venv && .venv\Scripts\activate   # or source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py runserver              # http://127.0.0.1:8000

# Web frontend (port 5173; dev proxy /api → 127.0.0.1:8000)
cd frontend && npm install && npm run dev

# Mobile (port 5173 too — run one of the two at a time)
cd mobile && npm install && npx expo start --web
# API URL: mobile/.env.development (committed) = http://localhost:8000/api
# Physical device: copy mobile/.env.example → mobile/.env.local and set
#   EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000/api plus
#   DJANGO_EXTRA_ALLOWED_HOSTS=<LAN-IP> when starting Django.
```

Optional local env for the backend: `cp backend/.env.example backend/.env`
(loaded automatically by settings.py; real environment variables always win).

Demo accounts (development database only): `admin`, `teacher1`, `teacher2`,
`student1`–`student5`, `parent1` / password `track2026`.

---

## 3. Hosting options (no provider selected in this repo)

There is no Dockerfile, render.yaml, Procfile, or cloud config in the
repository, so nothing provider-specific was added. Trade-offs:

| Option | Approx. cost | Pros | Cons |
|---|---|---|---|
| **A. Render.com** — Web Service (Django) + Static Site (frontend) + managed Postgres | Free tier exists; Starter ~$7/mo/machine; Postgres from ~$7/mo | Zero-ops, git-connected, auto HTTPS, close to capstone budget | Free tier sleeps (cold starts) and free Postgres has limited retention; **two services = two hostnames → violates the same-origin session rule (§4.1) unless you put the frontend behind the backend or use one service** |
| **B. Small VPS (Hetzner CX22 / DigitalOcean $6 / OVH)** — nginx + gunicorn + PostgreSQL + certbot, frontend static on same domain | ~$4–6/mo | **Same-origin by design (nginx serves frontend + proxies `/api`)** — matches the auth design exactly; always on; full control; cheapest per capability | You operate TLS renewal, backups, security patches |
| **C. Railway** | Usage-based (~$5/mo minimum) | Simple git deploys, managed Postgres | Trial credit expires; same two-hostname issue as A |
| **D. PythonAnywhere** | Beginner ~$5–10/mo | Very cheap, always on | **No PostgreSQL (MySQL only)** — conflicts with the stated production DB choice; less control over HTTPS/static |

**Recommendation for this project:** **Option B** (single VPS + nginx) is the
best fit for the existing auth design, because one nginx serves the built
frontend and proxies `/api` on the same domain — session cookies stay
first-party with zero settings changes. Option A is the lowest-effort path if
you accept the split-origin caveat below.

> **Split-origin caveat (Render-style A/C):** if the web frontend and API live
> on *different hostnames*, `SameSite=Lax` session cookies will not be sent
> cross-site and web login will silently fail. Options, in order of
> preference: (1) serve both from one origin (nginx path proxy / VPS);
> (2) change `SESSION_COOKIE_SAMESITE = "None"` (+ `SESSION_COOKIE_SECURE`,
> already on in production) in the production block — a one-line settings
> change that must be made deliberately and re-tested; (3) don't split.

---

## 4. Production environment setup

### 4.1 Backend environment variables

Set these as real environment variables on the host (never upload a `.env`
file). `backend/.env.example` documents the same list.

| Variable | Required in prod | Example / notes |
|---|---|---|
| `DJANGO_PRODUCTION` | **yes** | `1` — enables the whole hardening block |
| `SECRET_KEY` | **yes** | `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` — boot fails if empty |
| `DJANGO_ALLOWED_HOSTS` | **yes** | `track.knhs.edu.ph` or `api.example.com` (comma-separated, no scheme) |
| `DJANGO_CSRF_ORIGINS` | recommended | `https://track.knhs.edu.ph` — trusted browser origins for CSRF **and** CORS (comma-separated, with scheme). Defaults to `https://<host>` per allowed host if unset |
| `DATABASE_URL` | for PostgreSQL | `postgres://user:pass@host:5432/track?sslmode=require`. Unset = SQLite (only acceptable on a persistent single server) |
| `DJANGO_SECURE_SSL_REDIRECT` | optional | default on; set `0` only for plain-HTTP rehearsals or proxies without `X-Forwarded-Proto` |
| `TRACK_AUTH_THROTTLE_RATE` | optional | login throttle, default `10/min` |
| `DJANGO_EXTRA_ALLOWED_HOSTS` | dev only | LAN IPs for device testing |

Static files: `STATIC_ROOT=backend/staticfiles` (already in settings,
gitignored). WhiteNoise serves it in production; run `collectstatic` on every
deploy — the manifest storage (`CompressedManifestStaticFilesStorage`) fails
loudly at collect time if a referenced file is missing, which is intended.

Email stays on the **console backend** (password-reset codes appear in server
logs — this is the designed admin-initiated flow; there is no self-service
reset and no SMTP integration). Nothing crashes when SMTP is absent.

### 4.2 Web frontend (build-time env)

| Variable | When | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `npm run build` | Default `/api` = **same-origin** (correct for nginx/VPS Option B). For split origins set the absolute API: `https://api.example.com/api` |
| `VITE_SITE_URL` | `npm run build` | Absolute origin for og:image links, e.g. `https://track.knhs.edu.ph` |

### 4.3 Mobile (bundle-time env — localhost cannot ship)

`EXPO_PUBLIC_API_URL` is inlined into the JS bundle by Expo at build time.
Loading order (SDK 58): dev mode reads `.env.development*`, release mode
reads `.env.production*` — `mobile/.env.development` (committed) holds the
localhost dev URL and **can never end up in a release bundle**. Release
bundles additionally hard-fail at startup if the URL is missing or points at
localhost (`mobile/src/api/client.ts` guard — *verified* via bytecode
inspection of an `expo export` artifact).

- Local release bundle: set `EXPO_PUBLIC_API_URL=https://<api>/api` in the
  shell or in `mobile/.env.production.local` before `npx expo export`.
- EAS build: edit `mobile/eas.json` → `build.base.env.EXPO_PUBLIC_API_URL`
  (placeholder `https://REPLACE-WITH-DEPLOYED-BACKEND.example.com/api` must
  be replaced) or set it in the EAS dashboard environment. EAS never uploads
  gitignored `.env` files.
- Never put secrets in `EXPO_PUBLIC_*` — they are readable from the APK.

---

## 5. Deployment steps

### 5.0 Preconditions (owner actions)

1. Commit the working tree (nothing is committed yet — including migrations
   `core.0002–0004`, which exist only on disk; a fresh deploy would break
   without them). Review `git status` first; `.env*` files stay ignored.
2. Choose an option from §3 and create: a PostgreSQL database, a host for the
   backend, a host/build for the frontend.
3. Generate and store `SECRET_KEY` in the host's secret store.

### 5.1 Order of operations

```
1. Database up + backups in place
2. Backend: install → env vars → migrate → collectstatic → start (gunicorn)
3. Verify backend (§5.4)
4. Frontend: build with env → serve (nginx static / static host)
5. Verify frontend + CORS/session
6. Mobile: edit eas.json → eas build → install preview APK → verify
```

### 5.2 Backend commands

```bash
pip install -r backend/requirements.txt

# migrations (safe set: 0001–0004 are additive/constraint-only; verified on a
# fresh database — "No changes detected" from makemigrations --check)
python backend/manage.py migrate --noinput

# static (verified: 157 files copied, 453 post-processed)
python backend/manage.py collectstatic --noinput

# production self-check (verified clean with a generated key)
DJANGO_PRODUCTION=1 SECRET_KEY=… DJANGO_ALLOWED_HOSTS=… python backend/manage.py check --deploy

# start (POSIX host only — gunicorn imports fcntl and does not run on Windows)
gunicorn config.wsgi --chdir backend --bind 0.0.0.0:8000 --workers 2 --timeout 60
```

Notes:
- `--workers 2`: login throttling uses per-process memory (LocMem); with many
  workers each process counts separately. 1–2 workers keeps the `10/min`
  login throttle meaningful at this scale.
- Systemd/Render start command = the gunicorn line above *(documented —
  gunicorn itself could not be executed in the Windows audit environment:
  `ModuleNotFoundError: fcntl`)*.
- Health check path for uptime monitors: `GET /api/health/` →
  `200 {"status":"success", …}` *(verified)*.

### 5.3 Frontend commands

```bash
cd frontend
npm ci                       # lockfile is tracked → reproducible install
VITE_API_BASE_URL=/api VITE_SITE_URL=https://<your-domain> npm run build
# output: frontend/dist  → serve as static files with SPA fallback
```

nginx sketch for Option B (same-origin — recommended):

```nginx
location / { root /var/www/track-frontend; try_files $uri /index.html; }
location /api/ { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host;
                 proxy_set_header X-Forwarded-Proto $scheme; }
location /admin/ { proxy_pass http://127.0.0.1:8000; }
```

(`X-Forwarded-Proto` matters: production Django trusts it for HTTPS detection.)

### 5.4 Verify a deployment (backend)

```bash
curl -i https://<api-host>/api/health/              # 200 JSON
curl -i https://<api-host>/api/students/            # 401 unauthenticated
curl -i -X OPTIONS https://<api-host>/api/auth/token/ \
     -H 'Origin: https://<web-host>' \
     -H 'Access-Control-Request-Method: POST'       # ACAO echoes <web-host>
# login as a demo account via the web UI; load a dashboard; check /admin/
# login page loads with hashed CSS (WhiteNoise manifest)
```

The same checks were executed against a local production-mode rehearsal
(`DJANGO_PRODUCTION=1`, sandbox DB): **11/11 passed** — health, security
headers, admin page, hashed static, 401 gating, CORS allow **and** reject,
token login, authenticated data, no session cookie on token login.

### 5.5 Mobile build (NOT executed — requires owner's Expo account/approval)

```bash
cd mobile
# 1. edit eas.json: replace the EXPO_PUBLIC_API_URL placeholder
npx eas-cli@latest build -p android --profile preview     # installable APK
npx eas-cli@latest build -p android --profile production  # Play Store .aab
# Physical-device sanity run without EAS (dev):
#   DJANGO_EXTRA_ALLOWED_HOSTS=<PC-LAN-IP> python backend/manage.py runserver 0.0.0.0:8000
#   set mobile/.env.local EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:8000/api
#   npx expo start  → open in Expo Go / dev build
```

Local native bundling was verified in the audit with
`npx expo export -p android` (Hermes bytecode produced, exit 0, and the
release env URL inlined / localhost absent).

---

## 6. Backup & recovery

### What must be backed up

1. **Database** (all student/attendance records) — PostgreSQL or SQLite
2. **`backend/media/`** — uploaded submission files (feature dormant but the
   directory exists; 5 files present at audit time)
3. **Environment secrets** (`SECRET_KEY`, `DATABASE_URL`) — store in the
   host's secret manager, *not* in git

### SQLite (dev or single-server fallback) — *verified*

Online backup (safe while the server runs — Python's backup API):

```bash
python - <<'PY'
import sqlite3
src = sqlite3.connect('backend/track_db.sqlite3')
dst = sqlite3.connect('/backups/track_db.sqlite3')   # .wal/.shm handled by API
src.backup(dst); dst.close(); src.close()
print('backup OK')
PY
```

(Executed successfully during the audit against a scratch database.)
Cold alternative: stop the server, copy `track_db.sqlite3` (+ `-wal`/`-shm`
if present), restart.

Restore: stop the server → replace `track_db.sqlite3` with the backup →
start → check counts:

```bash
python backend/manage.py shell -c "
from django.contrib.auth import get_user_model
from core.models import StudentProfile, Submission, AttendanceRecord
print(get_user_model().objects.count(), StudentProfile.objects.count(),
      Submission.objects.count(), AttendanceRecord.objects.count())"
```

Audit-time reference counts (live dev DB): users 9, profiles 5,
submissions 9, attendance 32, announcements 2.

### PostgreSQL (production) — *(documented; no PG server in audit env)*

```bash
pg_dump -Fc -d track -f /backups/track_$(date +%F).dump   # nightly cron
pg_restore --clean --if-exists -d track /backups/track_YYYY-MM-DD.dump
```

### SQLite → PostgreSQL data transfer — *(procedure verified end-to-end on
scratch databases; the load target was SQLite because no PostgreSQL server
exists in the audit environment — re-run the same commands against PG before
the real cutover)*

```bash
# 1. dump from the live SQLite DB (read-only)
python backend/manage.py dumpdata --exclude contenttypes --exclude auth.permission -o track_dump.json
# 2. empty PostgreSQL DB, same migrations
DATABASE_URL=postgres://… python backend/manage.py migrate --noinput
# 3. load
DATABASE_URL=postgres://… python backend/manage.py loaddata track_dump.json
# 4. compare counts with step "restore check" above
```

Executed during the audit: dump 44,653 bytes → fresh DB → `Installed 161
object(s)` → counts identical to the source (9/5/9/32/2). **No destructive
command was run against the real database at any point.**

### Deployment rollback

1. **App rollback:** redeploy the previous build (Render: "Rollback to
   previous deploy"; VPS: `git checkout <last-good> && repeat §5.2/§5.3`).
   Migrations 0001–0004 are all reversible (`python manage.py migrate <prev>
   `) — but prefer app-only rollback unless the migration itself is bad.
2. **Data rollback:** restore the most recent DB backup (that is what the
   backup cadence is for).
3. **Mobile rollback:** rebuild the previous commit, or ship a fixed build —
   there is no OTA-update channel configured (EAS Update not set up).

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Boot error `DJANGO_PRODUCTION is set but SECRET_KEY is empty` / `DJANGO_ALLOWED_HOSTS is empty` | Hardened production block working as designed | Set the env vars (§4.1) |
| `400 Bad Request: DisallowedHost` | Host not in `DJANGO_ALLOWED_HOSTS` | Add the public hostname |
| Redirect loop to `https://` behind a proxy | Proxy doesn't set `X-Forwarded-Proto` | Fix proxy header, or set `DJANGO_SECURE_SSL_REDIRECT=0` only if TLS is terminated without the header |
| Web login succeeds but every request 401 | Frontend and API on different origins (SameSite=Lax) | Serve same-origin (§3 Option B) or apply the documented `SESSION_COOKIE_SAMESITE=None` change |
| Browser POST 403 despite login | CSRF origin not trusted | Set `DJANGO_CSRF_ORIGINS=https://<web-host>` |
| CORS blocked in browser | CORS follows the same list | Same variable as above (`CORS_ALLOWED_ORIGINS` is derived from it in production) |
| 401/403 bursts after ~10 logins | Intentional `10/min` login throttle (per server process) | Wait a minute, or restart the server (memory cache), or raise `TRACK_AUTH_THROTTLE_RATE` |
| Admin CSS 404 in production | `collectstatic` not run (manifest storage) | `python backend/manage.py collectstatic --noinput` |
| Mobile crash on launch: "EXPO_PUBLIC_API_URL is not set…" | Release build without API URL | Set it in eas.json/EAS env or `.env.production.local` (§4.3) — guard is intentional, never patch it out to ship localhost |
| Expo web and Vite both need port 5173 | Shared dev port | Run one at a time |
| `gunicorn` → `No module named 'fcntl'` | gunicorn is POSIX-only | Run it on the Linux host, not on Windows dev machines |
| Free-tier host lost the data | Ephemeral disk + no backups | Use a managed DB / persistent disk and §6 backups before real student data |

---

## 8. Known limitations

- **Mobile tokens never expire** (permanent until logout; deleted server-side
  on logout). Acceptable for a capstone; a stolen long-lived token stays valid.
  Fixing this means adding expiry/rotation — deliberately not done here to
  avoid redesigning the auth flow without a requirement.
- **No SMTP**: password recovery is admin-initiated; reset codes print to the
  server console/log. Graceful by design (documented in the view), but
  operators must watch logs.
- **`file_upload` exists in the model/serializer (validated, tested) but no
  frontend sends files** — submissions use `link_url`. `/media/` therefore
  needs no public route yet; when file upload is enabled in the UI, the web
  server must serve `/media/` per the production settings comment.
- **Login throttle uses per-process memory** — weaker with many workers.
- **Django admin exposed at `/admin/`** — superuser-only and HTTPS-only in
  production; consider an IP allow-list if the school wants it private.
- **npm audit (mobile): 26 advisories (7 moderate, 19 high)** — all in Expo's
  *build toolchain* (metro/@expo/cli/config-plugins/xcode chains: `braces`,
  `node-forge`, `uuid`), not in shipped runtime JS, and the only proposed fix
  is a breaking downgrade to `expo@44`. Mitigation = keep the Expo SDK
  updated (`npx expo install --check`); `npm audit fix --force` must NOT be
  run. Frontend: 0 advisories. Python: `pip-audit` 0 known vulns, `pip check` clean.
- **frontend lint** passes (exit 0) with 5 pre-existing warnings in
  `SchedulesPage.jsx` (React purity/deps hints) — non-blocking, untouched.
- **gunicorn and PostgreSQL were not executed in the audit environment**
  (Windows host, no PG server). Everything else in §5 was executed locally in
  production mode.

## 9. Remaining release blockers (before real student data)

1. **Commit the work** — Phase 1–5 changes (incl. `core.0002–0004`
   migrations) are untracked/uncommitted; a deploy from a clean clone today
   would fail.
2. **Provision the chosen host + PostgreSQL**, set the §4.1 env vars from a
   secret store; run §5.2 and §6 backups on a schedule.
3. **Replace the eas.json placeholder** `EXPO_PUBLIC_API_URL` before any
   distributed APK build.
4. **Decide topology** (same-origin VPS vs split-origin) and, if split, apply
   + re-test the `SESSION_COOKIE_SAMESITE` change (§3).
5. **Physical-device + EAS build run** — requires the owner's device and Expo
   account; not executable in the audit environment.
6. **Secret rotation**: the development `SECRET_KEY` committed in settings is
   dev-only (production refuses to use it); make sure the real host never
   runs without `DJANGO_PRODUCTION=1`.
7. Optional hardening backlog: token expiry, SMTP, private admin, rate-limit
   with Redis if multi-worker.
