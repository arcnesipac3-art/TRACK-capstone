# TRACK — Deployment Guide

**Status: deployment-ready, NOT deployed.**
No hosting provider is connected to this repository and nothing has been
published; deploying requires explicit owner approval.

This file is the single deployment guide. It merges the two documents that used
to disagree — the root `DEPLOYMENT.md` (Phase 5 audit findings) and this file
(Phase 7 provider walkthrough) — and corrects both where later work made them
wrong:

| Claim in the old documents | Reality now |
|---|---|
| "Web app authenticates with a Django **session cookie**, `SameSite=Lax`, so the frontend **must** be same-origin." | Both web clients authenticate with a DRF **`Authorization: Token`** header obtained from `POST /api/auth/token/` (`frontend/src/services/api.js`) — no cookies, no CSRF, so split-origin works. Production *does* set `SESSION_COOKIE_SAMESITE = "None"` (`backend/config/settings.py:337`), which only governs the Django admin's own session. |
| "Start the server with `gunicorn config.wsgi`." | That serves REST only and **cannot upgrade the messaging WebSocket**. Production must run the ASGI application (§2). |
| "Migrations `0002–0004` exist only on disk / are uncommitted." | `core.0001`–`core.0014` are committed and tracked; blocker #1 is closed. |
| Messaging / web push / Redis fan-out | New since the Phase 5 audit — see §5, §8.3 and the honest limits in §11. |

Anything marked *(verified)* was executed on the audit machine (Windows, Python
3.15 venv, no Linux host, no PostgreSQL server, no Redis, no Expo account).
*(documented)* means the procedure is written from the code and settings but
could not be executed here.

---

## 1. Architecture overview

| Component | Tech | Role |
|---|---|---|
| `backend/` | Django 6.1 + DRF 3.18 + Channels 4.3 | REST API at `/api/*`, messaging socket at `/api/ws/messaging/`, Django admin at `/admin/`, health check at `/api/health/` |
| `frontend/` | React 19 + Vite 8 | Web app (admin/teacher/student/parent + public enrollment pages); talks to `VITE_API_BASE_URL` with a token header |
| `mobile/` | Expo SDK 58 (React Native 0.88) | Native app; talks to `EXPO_PUBLIC_API_URL` with `Authorization: Token …`, and to `EXPO_PUBLIC_WS_URL` for live messaging |

```
Browser (web) ──┐
                │  one origin (recommended)          ┌─ PostgreSQL (or SQLite)
Phone (mobile) ─┼─► / ──► static frontend            │
                │   /api/* ──► Django ASGI ──────────┤
                │   /admin/ ─► Django                └─ backend/staticfiles/ (WhiteNoise)
                │              │
                └── wss ───────┘ /api/ws/messaging/   (same process as /api — must be ASGI)
```

**One process must serve both HTTP and WebSocket.** `config/asgi.py` mounts the
REST application *and* the socket router, so a single ASGI server covers
everything; a WSGI server covers everything except the socket.

**Authentication (one scheme for both API clients):** login posts the
identifier + password to `/api/auth/token/`, and the returned key is sent as
`Authorization: Token …` on every call. Tokens are permanent until logout
(deleted server-side) — no expiry (known limitation, §11). Neither client puts
that token in the socket URL: it is traded for a single-use 30-second ticket
(`POST /api/messaging/ws-ticket/`, then `?ticket=…`) by both
`frontend/src/services/realtime.js` and `mobile/src/messaging/realtime.ts`. A
raw `?token=` handshake is still accepted for clients that cannot call the
authenticated endpoint first, but no shipped TRACK client uses it (L-023).

---

## 2. The process you must start (ASGI, not WSGI)

`manage.py runserver` and `gunicorn config.wsgi` serve WSGI. A WSGI process
**refuses the `/api/ws/messaging/` upgrade**, so the app still works — REST
fetches, pull-to-refresh — but no message arrives live, no typing indicator, no
read receipts. This is not a failure the UI hides: the clients fall back to
polling/refetch and the inbox simply does not move.

Run the ASGI application instead:

```bash
# Single process — REST + socket together, no Redis needed (verified locally with daphne)
cd backend && daphne config.asgi:application --bind 0.0.0.0 --port 8000

# Multiple processes — requires REDIS_URL, otherwise broadcasts reach only
# the process that happens to hold the socket (KNOWN_LIMITATIONS.md L-019)
uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers 2
```

Notes that matter operationally:

- **Daphne reloads nothing.** Restart it after editing backend code.
- **`--workers > 1` without `REDIS_URL` silently breaks live delivery.** One
  worker + Redis unset is the correct capstone-scale configuration; the
  in-memory channel layer is a single-process layer by definition.
- The login throttle and the messaging throttle use per-process memory cache
  (`LocMem`), so their `10/min` / `60/min` budgets count separately in each
  worker. 1–2 workers keeps them meaningful at this scale.
- `gunicorn` remains in `requirements.txt` but is **not** a valid way to run
  TRACK with messaging. Do not use it as the start command.

---

## 3. Development setup (for reference — README.md has the walkthrough)

```bash
.venv/Scripts/python.exe backend/manage.py migrate       # or activate the venv first
cd backend && daphne config.asgi:application -p 8010 -b 127.0.0.1   # REST + socket
cd frontend && npm run dev                                # proxy /api → :8000, ws:true
```

The dev split most people actually run is the one README documents: plain
`runserver` on 8000 for REST work (auto-reload) plus daphne on 8010 when you
need the socket, with `VITE_PROXY_TARGET=http://127.0.0.1:8010`. Mobile dev
then needs `EXPO_PUBLIC_WS_URL` (§5.3) because there is no proxy in front of a
native app. `backend/.env` (`cp backend/.env.example backend/.env`) is loaded by
settings and is gitignored; real environment variables always win.

Demo accounts (development database only): `admin`, `teacher1`, `teacher2`,
`student1`–`student5`, `parent1` / password `track2026`.

---

## 4. Hosting options

| Option | Approx. cost | Pros | Cons |
|---|---|---|---|
| **A. Single VPS (Hetzner CX22 / DO $6 / OVH)** — nginx + daphne/uvicorn + PostgreSQL + certbot, frontend static on the same domain | ~$4–6/mo | Same-origin by design (simplest CORS/WS config); always on; cheapest per capability; one process serves REST **and** the socket | You own TLS renewal, backups, security patches |
| **B. Render Web Service + Vercel frontend + Supabase Postgres** (§6–§7) | Free tier exists; Starter ~$7/mo | Zero-ops, git-connected, auto HTTPS | Two hostnames (fine — token auth), but **the Render start command must be ASGI** (§2). Free tier sleeps: a cold container drops open sockets and the client reconnects on its own backoff |
| **C. Railway** | usage-based (~$5/mo min) | Simple git deploys, managed Postgres | Same ASGI start-command requirement; trial credit expires |
| **D. PythonAnywhere** | ~$5–10/mo | Very cheap, always on | **No PostgreSQL (MySQL only) and no long-lived WebSocket process** → messaging degrades to REST-only. Not recommended |

Same-origin is no longer a correctness requirement for the API clients (they use
token headers), but it is still the least-config path: no CORS list, no
extra socket origin, and the browser's `/api/ws/…` upgrade rides the same host.
If you split origins, set `DJANGO_CSRF_ORIGINS` (drives CORS in production) and
`TRACK_WS_ALLOWED_ORIGINS` to the frontend origin — the socket handshake is
refused from any browser origin that is not in those lists
(`backend/core/websocket_auth.py`).

---

## 5. Environment variables

Set these as real environment variables on the host. **Never upload a `.env`
file to a server.** `backend/.env.example` documents the same list with
comments.

### 5.1 Backend

| Variable | Required | Notes |
|---|---|---|
| `DJANGO_PRODUCTION` | **yes** | `1` — enables the hardening block (DEBUG off, secure cookies, HSTS, HTTPS redirect, host allow-list) |
| `SECRET_KEY` | **yes** | `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` — boot fails if empty |
| `DJANGO_ALLOWED_HOSTS` | **yes** | `track.knhs.edu.ph` — comma-separated, no scheme |
| `DJANGO_CSRF_ORIGINS` | recommended | `https://track.knhs.edu.ph` — comma-separated, scheme included. Defaults to `https://<host>` per allowed host; **also the CORS allow-list in production** |
| `DATABASE_URL` | for PostgreSQL | `postgres://user:pass@host:5432/db?sslmode=require` (parsed by `dj-database-url`). Unset = SQLite — acceptable only on a persistent single server with §9 backups |
| `DJANGO_SECURE_SSL_REDIRECT` | optional | On by default; `0` only for plain-HTTP rehearsals or a proxy that does not set `X-Forwarded-Proto` |
| `TRACK_AUTH_THROTTLE_RATE` | optional | Login throttle, default `10/min` |
| `REDIS_URL` | **for >1 ASGI worker** | `redis://host:6379/0`. Unset = `InMemoryChannelLayer` (one process). With more than one worker and no Redis, live events stop crossing processes |
| `TRACK_WS_ALLOWED_ORIGINS` | split-origin / odd dev ports | Comma-separated browser origins allowed to open the socket, on top of the CORS/CSRF lists. A handshake with **no** `Origin` header (native app, curl) is judged on its credential alone |
| `TRACK_MESSAGING_THROTTLE_RATE` | optional | Send + `ws-ticket` rate per user, default `60/min`; the socket enforces the same window itself |
| `VAPID_PUBLIC_KEY`<br>`VAPID_PRIVATE_KEY` | only for browser push | **Both** must be set or push stays off and the UI says so. Generate: `python backend/manage.py generate_vapid_keys`. `VAPID_PRIVATE_KEY` may hold the PEM itself or a path to a `.pem` (pywebpush accepts either — the path form is what platforms that cannot store a newline need). `VAPID_SUBJECT` (default `mailto:` address) identifies the app to the push service |
| `DJANGO_EXTRA_ALLOWED_HOSTS` | dev only | LAN IPs for physical-device testing |
| `TRACK_DEV_CORS_ORIGINS` | dev only | Extra browser origins for the API, comma-separated with scheme — e.g. `http://localhost:8099` when `expo start --web` took a free port instead of 8081. Development only; production derives CORS from `DJANGO_CSRF_ORIGINS` |
| `EMAIL_BACKEND`<br>`EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USE_TLS`<br>`EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD`<br>`DEFAULT_FROM_EMAIL` | only to actually send mail | Unset = `console.EmailBackend`: the message is printed to the server log and nothing leaves the box. The enrollment confirmation is the only thing that sends (see the paragraph below the table) |
| `TRACK_APP_BASE_URL` | **yes, once mail is sent** | The origin the emailed links point at — the **web app**, not this API, because a link clicked in an inbox opens in a browser. A server-side event (confirmation) cannot infer it from a request. Default `http://localhost:5173`; production = `https://track.knhs.edu.ph` |

Static files: `STATIC_ROOT=backend/staticfiles` (gitignored), served by
WhiteNoise from the app process — no nginx needed for static. Run
`collectstatic` on every deploy; the manifest storage
(`CompressedManifestStaticFilesStorage`) fails loudly at collect time if a
referenced file is missing, which is intended. *(verified: 157 files copied,
453 post-processed.)*

Email is **not configured to send anything by this guide**. `core/emails.py`
hands the enrollment confirmation to Django's email backend and swallows any
failure, so confirming an enrollment — the one-time account-setup link
`TRACK_APP_BASE_URL/enroll/claim?token=…`, sent to the applicant email on the
application and falling back to the guardian email — never depends on a mail
server being reachable. Password recovery does **not** use email at all: the
Registrar sets a new password directly (`ResetPasswordView`) and the action is
written to the audit log, so there is nothing to deliver. With no SMTP
credentials the console backend prints the confirmation into the server log,
which is how it is read in development and how operators must read it today.
Set the `EMAIL_*` block above when the school wants it delivered for real;
nothing in the app changes, and a message that cannot be sent is logged, not
retried.

The claim link is a credential. It is the `account_claim_token` column itself
— a unique, 32-character hex value stored on the application row, which is
what lets the lookup answer without an account — it works once, and it is
cleared together with the guest token when the account is created. An emailed
link is therefore only as private as the recipient's inbox; a spent link, or
one from a trashed application, answers 404 rather than showing a form.

### 5.2 Web frontend (build-time, public)

| Variable | Default | Production value |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | `/api` for same-origin; `https://<backend-host>/api` when split. The socket URL is derived from this same base, so it moves with it |
| `VITE_SITE_URL` | `http://localhost:5173` | Absolute origin for og:image links, e.g. `https://track.knhs.edu.ph` |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:8000` | **Dev only** — where Vite forwards `/api/*` including the ws upgrade |

These are inlined into the JS bundle and are public — never put a secret here.

### 5.3 Mobile (bundle-time, public)

`EXPO_PUBLIC_API_URL` is inlined at build time. SDK 58 loading order: dev reads
`.env.development*`, release reads `.env.production*`, so the committed
`mobile/.env.development` localhost URL **cannot** end up in a release bundle.
Release builds additionally hard-fail at startup if the URL is missing or points
at localhost — `mobile/src/api/client.ts`. *(verified: the guard is present in
Hermes bytecode from an `expo export`, and the release URL is inlined.)* **Never
patch that guard out to ship a localhost build.**

| Scenario | `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_WS_URL` |
|---|---|---|
| Local dev (Expo web) | committed `.env.development` = `http://localhost:8000/api` | unset (same origin as the API) |
| Dev with runserver + daphne | `http://localhost:8000/api` | `http://127.0.0.1:8010` — without it the socket has no host and the app is REST-only |
| Android emulator | `http://10.0.2.2:8000/api` | `http://10.0.2.2:8010` (or `:8000` if daphne serves both) |
| Physical device | `http://<LAN-IP>:8000/api` + `DJANGO_EXTRA_ALLOWED_HOSTS=<LAN-IP>` | `http://<LAN-IP>:8010` |
| EAS / deployed | `https://<api-host>/api` | **unset** — it defaults to the API's own origin, which is where the deployed socket lives |

`EXPO_PUBLIC_WS_URL` may be written with `ws://`, `wss://`, `http://`, `https://`
or a bare `host:port`; the client normalises the scheme (`wss` when TLS) and the
path always comes from the server's handshake ticket, never from this value.

- EAS: set it in `mobile/eas.json` → `build.base.env` (the placeholder
  `https://REPLACE-WITH-DEPLOYED-BACKEND.example.com/api` must be replaced) or in
  the EAS dashboard environment. EAS never uploads gitignored `.env` files.

---

## 6. Supabase PostgreSQL setup

1. Create a project at [supabase.com](https://supabase.com).
2. Settings → Database → copy the **Session mode** connection string (port 5432),
   e.g. `postgres://postgres.[ref]:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.
3. Append `?sslmode=require`.
4. Set it as `DATABASE_URL` on the backend host.
5. The first deploy runs `manage.py migrate` and creates the schema.

**Pooling:** Session mode (5432) is right for 1–2 workers — which is also what
§2 requires for the socket. Transaction mode (6543) is for many short-lived
connections and breaks nothing here only if you keep `conn_max_age` at 0; prefer
Session mode.

---

## 7. Provider-specific settings

**Render (backend):**
- Root directory `backend`, Runtime Python.
- Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput`
- Start command: `daphne config.asgi:application --bind 0.0.0.0 --port $PORT`
  (not `gunicorn config.wsgi` — see §2). Keep **one** web process unless you also
  set `REDIS_URL`.
- Health check path: `/api/health/`. Env vars from §5.1, plus
  `TRACK_WS_ALLOWED_ORIGINS=https://<frontend-host>` if the frontend is elsewhere.
- Render/Railway/Heroku are POSIX: `fcntl`-based tooling works there and does not
  work on Windows dev machines.

**Vercel (frontend):**
- Root directory `frontend`, framework preset Vite, build `npm run build`, output `dist`.
- Env vars from §5.2 — `VITE_API_BASE_URL` must be the absolute backend URL for
  split-origin.
- SPA rewrites:

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

**VPS (nginx, same-origin — recommended):**

```nginx
location / { root /var/www/track-frontend; try_files $uri /index.html; }

location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# The messaging socket: an upgrade, not a normal proxied request.
# Without these two headers every /api/ws/messaging/ handshake fails with 400
# even though plain /api/ calls work fine.
location /api/ws/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;          # a chat socket is long-lived
}

location /admin/ { proxy_pass http://127.0.0.1:8000; }
```

`X-Forwarded-Proto` matters twice: production Django trusts it for HTTPS
detection, and it decides whether the `wss://` handshake is treated as secure.

---

## 8. Deploy

### 8.1 Order of operations

```
1. Database up + backups scheduled (§9)
2. Backend: install → env vars → migrate → collectstatic → start (ASGI, §2)
3. Verify backend + socket (§8.3)
4. Frontend: build with env → serve (§7)
5. Verify login + a live message round-trip from the deployed URLs
6. Mobile: eas.json URL → eas build → install preview APK → verify
```

### 8.2 Commands

```bash
pip install -r backend/requirements.txt

# core.0001–0014, all committed. Additive/constraint-only;
# `makemigrations --check` reports no missing migration. *(verified)*
python backend/manage.py migrate --noinput

python backend/manage.py collectstatic --noinput

# production self-check *(verified clean with a generated key)*
DJANGO_PRODUCTION=1 SECRET_KEY=… DJANGO_ALLOWED_HOSTS=… \
  python backend/manage.py check --deploy

# start — the line that must be in your systemd unit / Render start command
cd backend && daphne config.asgi:application --bind 0.0.0.0 --port 8000

python backend/manage.py createsuperuser          # if not seeded
```

```bash
cd frontend
npm ci                                             # lockfile tracked → reproducible
VITE_API_BASE_URL=/api VITE_SITE_URL=https://<domain> npm run build
# output: frontend/dist → serve statically with SPA fallback
```

### 8.3 Verification

```bash
curl -i  https://<host>/api/health/          # 200 {"status":"success",…}
curl -i  https://<host>/api/students/        # 401 — not 500, not 404
curl -i  https://<host>/admin/login/         # 200, CSS URL is hashed (WhiteNoise manifest)
curl -I  https://<host>/api/health/ | grep -i "strict-transport\|x-frame\|x-content"

# CORS preflight must echo the frontend origin
curl -i -X OPTIONS https://<backend>/api/auth/token/ \
     -H 'Origin: https://<frontend>' -H 'Access-Control-Request-Method: POST'

# The socket really upgraded — a WSGI process answers this with a 404
curl -i -N https://<host>/api/ws/messaging/?ticket=nope \
     -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
     -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://<frontend>'
# What the status line means *(each of these three was observed locally)*:
#   404 → you are talking to WSGI (runserver / gunicorn). REST works, messaging does not.
#   403 → ASGI is serving, and the handshake was refused before accept — a bad,
#         expired or already-used ticket, or this Origin is not in the allow-list.
#         One WARNING line in the server log, no traceback.
#   101 → accepted: the socket is live. (A real client handshake with a valid
#         ticket was verified with the transport probe — see the table below.)

# Push configuration is advertised to the UI
curl -s https://<host>/api/messaging/options/ -H "Authorization: Token …" \
  | grep vapid_public_key        # null → VAPID keys are not loaded
```

Then in the browser: log in, load a dashboard, open `/messages/` in two tabs and
confirm a message typed in one appears in the other without a refresh (network
tab: one `101 Switching Protocols` on `/api/ws/messaging/`).

**What the audit machine proved, and what it could not:**

| Check | Status |
|---|---|
| Production-mode boot, security headers, admin page, hashed static, 401 gating, CORS allow **and** reject, token login, authenticated data, no session cookie on token login | *(verified — 11/11 against a local `DJANGO_PRODUCTION=1` rehearsal with a sandbox DB)* |
| `migrate` / `collectstatic` / `check --deploy` | *(verified)* |
| SQLite online backup, and SQLite→SQLite `dumpdata`/`loaddata` (44,653 bytes, 161 objects, counts identical) | *(verified)* |
| `expo export -p android` → Hermes bundle, release URL inlined, localhost guard present | *(verified)* |
| Messaging transport against real WSGI + ASGI servers using the mobile client's exact contract (token login, ticket issue/consume, no-`Origin` handshake, dedupe by `client_reference`, `sync` resume, 4401 on anonymous) | *(verified — 14/14; the probe wrote real rows into the dev database and deleted none)* |
| VAPID key pair: PEM path form loads, `sign()` yields a `vapid t=…,k=…` header whose `k=` equals the key `/api/messaging/options/` advertises | *(verified)* |
| The two handshake signatures above against live servers: 404 from `runserver` (WSGI), 403 + one WARNING from daphne when the ticket is junk or the origin is foreign — no traceback | *(verified)* |
| The Expo app's messaging screens driven end to end in a browser against a real daphne process: ticket handshake over REST, thread send, and a reply POSTed by another account arriving **without a reload** | *(verified — 2026-11-02; the page was in the background the whole time, so nothing refreshed. See `docs/TESTING_REPORT.md` → "Mobile messaging")* |
| The `REDIS_URL` branch itself: empty/blank selects `InMemoryChannelLayer`, a value selects `RedisChannelLayer` with that exact host and a 60 s expiry, both dotted paths resolve, and the test process runs in-memory | *(verified — `core.tests_messaging.ChannelLayerConfigTests`, 6 tests)* |
| The enrollment confirmation email: one message per confirmation, addressed to the applicant email and then the guardian email, carrying the `…/enroll/claim?token=…` link — and a mail server that raises cannot undo the committed enrollment | *(verified — `core.tests_enrollment.AccountClaimTests`, plus a real SMTP transaction against a local sink; see `docs/TESTING_REPORT.md` → "The message really left the process")* |
| A browser actually subscribing to push, and a notification appearing | **not provable here** — needs HTTPS (or a real push service), a granted permission prompt, and eyes on the notification |
| Mail delivered to a real inbox | **not provable here** — no SMTP credentials exist on this machine, so no message has reached a mailbox outside it. What *is* measured: with `EMAIL_BACKEND=…smtp.EmailBackend` a full `EHLO → MAIL FROM → RCPT TO → DATA → QUIT` was captured on a local sink, its headers, body and token matching the database row, and a refused connection leaving the resend at `200` with the traceback only logged. Unproven: a provider accepting `AUTH`, TLS on 587, and arrival anywhere but this box |
| Redis multi-process fan-out | **not provable here** — no Redis and no Docker on this machine (`where redis-server` and `docker` both report nothing). The configuration switch is now test-covered; delivery from worker A to a socket on worker B has never been watched. Rehearse it with two workers before scaling out. |
| `daphne`/`uvicorn`/`gunicorn` as a long-running Linux service, and PostgreSQL | *(documented)* — `gunicorn` cannot even import on Windows (`fcntl`); daphne was run locally in dev, not as a service |
| The app on a physical phone | *(not run)* — needs the owner's device and Expo account |

---

## 9. Backup, restore, rollback

`docs/BACKUP_RECOVERY.md` is authoritative for the commands (SQLite online
backup, cold copy, `pg_dump`/`pg_restore`, the `dumpdata`→`loaddata` transfer to
PostgreSQL, restore verification counts). Summary of what it says you must not
skip:

1. **Database** — nightly `pg_dump -Fc` (or Supabase automated backups) / SQLite
   online backup.
2. **`backend/media/`** — uploaded submission files (feature is dormant; the
   directory exists and is small).
3. **Secrets** (`SECRET_KEY`, `DATABASE_URL`, `VAPID_PRIVATE_KEY`) — host secret
   store, never git.

Audit-time reference counts (live dev DB): users 9, profiles 5, submissions 9,
attendance 32, announcements 2.

**Rollback:**
- *App:* Render "Rollback to previous deploy"; VPS `git checkout <last-good>` and
  repeat §8.2. All migrations `0001`–`0014` are reversible
  (`manage.py migrate <prev>`), but prefer app-only rollback unless the
  migration itself is the problem.
- *Data:* restore the most recent verified backup — that is what the cadence is
  for. Never attempt a data rollback without one.
- *Mobile:* rebuild the previous commit. There is no OTA channel (EAS Update is
  not configured).

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Boot error `DJANGO_PRODUCTION is set but SECRET_KEY is empty` / `DJANGO_ALLOWED_HOSTS is empty` | Hardening block working as designed | Set the vars (§5.1) |
| `400 DisallowedHost` | Hostname not allow-listed | Add the public hostname |
| HTTPS redirect loop behind a proxy | Proxy does not send `X-Forwarded-Proto` | Fix the header, or `DJANGO_SECURE_SSL_REDIRECT=0` only if TLS is terminated without it |
| `/api/health/` works, `/api/ws/messaging/` gets **404** | A WSGI process (gunicorn, `runserver`) is serving the host — the socket path is not in the WSGI URLconf | Start `config.asgi:application` (§2), and add the nginx upgrade block (§7) |
| Socket opens but messages stop arriving when a second worker joins | `InMemoryChannelLayer` is per-process | Set `REDIS_URL`, or run one ASGI worker |
| Handshake refused, log line `refused WebSocket handshake from origin …` | Browser origin not in the allow-list | `TRACK_WS_ALLOWED_ORIGINS=https://<frontend>` (CORS/CSRF origins are always accepted) |
| Dev: everything loads, nothing is live | `runserver` on 8000 has no socket, or the proxy points at it | Run daphne (8010) and set `VITE_PROXY_TARGET` / `EXPO_PUBLIC_WS_URL` (§3, §5.3) |
| Mobile inbox never updates without pull-to-refresh | `EXPO_PUBLIC_WS_URL` unset while REST and ASGI are on different ports | Set it (§5.3). Unset means REST-only by design |
| Mobile: tapping a chat lands on the role's dashboard with `?id=…` in the URL | The screen exists as a file but was never declared as a `<Tabs.Screen>`, so expo-router falls back to the nearest tab | Add it to `threadTabs` / `feeEditorTabs` in `mobile/src/app/(app)/_layout.tsx` with `tabBarButton: () => null` — not `href: null`, which removes the route entirely (L-032) |
| Browser POST 403 despite being logged in | CSRF origin not trusted | `DJANGO_CSRF_ORIGINS=https://<web-host>` |
| CORS blocked | CORS is derived from that same list in production | Same fix |
| 401 bursts after ~10 logins | Intentional `10/min` login throttle, per process | Wait a minute, restart (memory cache), or raise `TRACK_AUTH_THROTTLE_RATE` |
| Admin CSS 404 | `collectstatic` not run (manifest storage) | `manage.py collectstatic --noinput` |
| Push toggle says unavailable / `vapid_public_key` is null | Keys absent — push is off by design | Set both `VAPID_*` keys (§5.1); in-app bells do not need them |
| Mobile crash on launch "EXPO_PUBLIC_API_URL is not set…" | Release build without the URL | `eas.json` / `.env.production.local` (§5.3) — the guard is intentional |
| Expo web and Vite both want 5173 | Shared dev port | Run one at a time |
| `No module named 'fcntl'` | gunicorn on Windows | Run server processes on the Linux host |
| Backend code edited, daphne still serving old behaviour | Daphne does not autoreload | Restart it |
| Free-tier host lost the data | Ephemeral disk, no backups | Managed DB / persistent disk + §9 before real student data |

---

## 11. Known limitations & release blockers

Deliberately not fixed here (each is a design decision, not an oversight; see
`docs/KNOWN_LIMITATIONS.md` for the tracked list):

- **Tokens never expire** — permanent until logout, deleted server-side then. A
  stolen token stays valid. Fixing it means expiry/rotation, i.e. redesigning
  auth without a requirement to do so.
- **Throttles and the channel layer are per-process** unless `REDIS_URL` is set
  (L-019 for messaging fan-out, L-003 for the LocMem throttle cache).
- **No SMTP** — recovery codes print to the server log; admin-initiated only.
- **`file_upload`** exists in the model/serializer, validated and tested, but no
  client sends files, so `/media/` needs no public route yet. If uploads are
  enabled in the UI, serve `/media/` per the production settings comment.
- **Django admin at `/admin/`** — superuser-only, HTTPS-only in production;
  consider an IP allow-list if the school wants it private.
- **npm audit (mobile)** reports advisories in Expo's *build toolchain*
  (metro/@expo/cli/config-plugins), not shipped runtime JS; the only suggested
  "fix" is a breaking downgrade to `expo@44`. Do **not** run
  `npm audit fix --force`; keep the SDK current with `npx expo install --check`.
  Frontend: 0 advisories. Python: `pip-audit` 0 known vulns, `pip check` clean.
- **Mobile has no test runner** — its CI gate is typecheck + lint + a real Hermes
  bundle (`.github/workflows/ci.yml` → `mobile`), which proves every module
  resolves for the native target but executes no assertions.

Before real student data:

1. ~~Commit the work, including migrations~~ — done; `0001`–`0014` are tracked.
2. Provision the chosen host + PostgreSQL, set §5.1 from a secret store, and
   schedule §9 backups.
3. Replace the `eas.json` `EXPO_PUBLIC_API_URL` placeholder before any
   distributed APK build.
4. Pick a topology (§4) and set the socket origin + nginx upgrade block to match.
5. Run the four things §8.3 lists as unprovable here: a real browser push
   subscription and delivery, Redis fan-out with two workers, the app on a
   physical phone, and the ASGI process as a supervised Linux service.
6. Keep the development `SECRET_KEY` out of production — it is dev-only and
   `DJANGO_PRODUCTION=1` refuses to use it.
7. Optional hardening backlog: token expiry, SMTP, private admin, Redis-backed
   throttling.
