# TRACK — School Requirements & Attendance Monitoring

[![CI](https://github.com/arcnesipac3-art/TRACK-capstone/actions/workflows/ci.yml/badge.svg)](https://github.com/arcnesipac3-art/TRACK-capstone/actions/workflows/ci.yml)

**Kiwalan National High School, Iligan City, Philippines**

TRACK is a role-based school monitoring system that lets administrators, teachers, students, and parents manage academic requirements and attendance records. It runs as a Django REST API backend with a React web frontend and a React Native (Expo) mobile app.

---

## Technology stack

| Layer | Technology |
|---|---|
| Backend | Django 6.1, Django REST Framework 3.18 |
| Real-time | Django Channels 4.3 (WebSocket at `/api/ws/messaging/`), Daphne ASGI server |
| Web push | `pywebpush` with a VAPID key pair (optional; off until keys exist) |
| Web frontend | React 19, Vite 8, React Router 7 |
| Mobile | React Native 0.88, Expo SDK 58, Expo Router |
| Dev database | SQLite (`backend/track_db.sqlite3`) |
| Prod database | PostgreSQL via `DATABASE_URL` |
| Channel layer | In-memory by default; Redis via `REDIS_URL` when more than one process |
| WSGI server | Gunicorn (Linux production only) |
| Static files | WhiteNoise (production) |
| Auth — web | DRF Token in `sessionStorage`, sent as `Authorization: Token …` (no cookie jar, no CSRF dance) |
| Auth — mobile | DRF Token stored in `expo-secure-store` |
| Auth — WebSocket | Single-use 30-second ticket from `POST /api/messaging/ws-ticket/`; the token never goes in a socket URL from a browser |

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.12 or later | Django backend |
| Node.js | 18 or later (LTS) | React frontend and Expo CLI |
| npm | 9 or later | frontend and mobile package management |
| Git | any recent | source control |

Optional (production only):
- PostgreSQL 14+ (hosted on Supabase, Render, or self-managed)
- A POSIX host for Gunicorn (Render, Railway, VPS — not Windows)

---

## Repository structure

```
TRACK-capstone/
├── backend/                Django project
│   ├── config/             Django settings, URL config, WSGI
│   │   ├── settings.py     Environment-driven: dev (SQLite) / prod (Postgres)
│   │   └── urls.py         Root URL config (/api/* → core, /admin/)
│   ├── core/               Only Django app
│   │   ├── models.py       All database models
│   │   ├── views.py        All API views (generics + custom)
│   │   ├── enrollment.py   Enrollment rules: transitions, capacity, confirmation
│   │   ├── enrollment_auth.py / enrollment_views.py / enrollment_serializers.py
│   │   │                   Account-less guest access + enrollment API layer
│   │   ├── serializers.py  DRF serializers
│   │   ├── permissions.py  Role-based permission classes
│   │   ├── urls.py         All /api/* routes
│   │   ├── notifications.py In-app notification fan-out
│   │   ├── pagination.py   TrackPagination class
│   │   ├── tests.py        Core test suite (TRACK domain)
│   │   ├── tests_enrollment.py Enrollment test suite
│   │   └── migrations/     Database migration history
│   ├── media/              Uploaded files (dev): submissions, enrollment documents
│   ├── staticfiles/        collectstatic output (gitignored)
│   ├── track_db.sqlite3    Development database
│   ├── requirements.txt    Python dependencies
│   ├── manage.py
│   └── .env.example        Environment variable template
├── frontend/               React web app
│   ├── src/
│   │   ├── App.jsx         React Router route tree
│   │   ├── pages/          Page components (52 pages, 4 dashboards, enrollment portal)
│   │   ├── components/     Shared UI components
│   │   ├── context/        AuthContext (session state)
│   │   ├── services/api.js Centralized API client (CSRF + session)
│   │   └── config/         Navigation config per role
│   ├── vite.config.js      Dev proxy /api → localhost:8000
│   ├── package.json
│   └── .env.example        VITE_API_BASE_URL, VITE_SITE_URL
├── mobile/                 Expo React Native app
│   ├── src/
│   │   ├── app/            Expo Router file-based routes
│   │   │   ├── (auth)/     login screen
│   │   │   └── (app)/      admin/teacher/student/parent screens
│   │   ├── api/client.ts   API client (Authorization: Token)
│   │   ├── auth-state.ts   Shared auth observable
│   │   └── theme.ts        Design tokens
│   ├── app.json            Expo config (bundle IDs, plugins)
│   ├── eas.json            EAS Build profiles
│   ├── package.json
│   └── .env.development    Dev API URL (committed — no secrets)
└── docs/                   Generated documentation
    ├── DEPLOYMENT.md
    ├── ENROLLMENT.md
    ├── BACKUP_RECOVERY.md
    ├── DEPARTMENTS_ROLES.md
    ├── TESTING_REPORT.md
    ├── KNOWN_LIMITATIONS.md
    ├── ADMIN_HANDOVER.md
    └── archive/            Historical feature & phase reports (Oct 2026)
```

---

## Local development setup

### 1. Clone and prepare the Python environment

```bash
git clone <repository-url>
cd TRACK-capstone

python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r backend/requirements.txt
```

### 2. Configure the backend environment (optional)

The backend runs on SQLite with `DEBUG=True` with no configuration needed.
To override defaults, copy the template and edit it:

```bash
cp backend/.env.example backend/.env
```

**Never commit `backend/.env`** — it is gitignored.

### 3. Apply migrations and start Django

```bash
python backend/manage.py migrate
python backend/manage.py runserver        # http://127.0.0.1:8000
```

`runserver` serves the REST API but not the messaging WebSocket. For live
messaging, run the ASGI application instead — one command replaces `runserver`:

```bash
cd backend && daphne config.asgi:application -p 8000 -b 127.0.0.1
```

Daphne reloads nothing, so restart it after editing backend code. Keep it to a
single process unless you set `REDIS_URL` (`docs/KNOWN_LIMITATIONS.md` L-019).

To seed demo accounts (admin/teacher1/teacher2/student1–5/parent1, all password `track2026`):

```bash
python backend/seed_demo.py
```

### 4. Start the React web frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

All `/api/*` requests are proxied to Django by the Vite dev server, including
the `/api/ws/messaging/` upgrade (`ws: true` in `frontend/vite.config.js`), so
the browser only ever talks to one origin and the socket handshake carries a
ticket rather than a token.

If something already holds port 8000 — a plain `runserver`, or another session's
server — point the proxy at the ASGI process instead of moving anything:

```bash
VITE_PROXY_TARGET=http://127.0.0.1:8010 npm run dev -- --port 5199
```

The dev-server origin must then be allowed to open sockets:
`TRACK_WS_ALLOWED_ORIGINS=http://localhost:5199` on the Django side.

### 5. Start the Expo mobile app

In a third terminal:

```bash
cd mobile
npm install
npx expo start --web                     # press W — opens in browser
```

The mobile dev environment reads `mobile/.env.development` which points to `http://localhost:8000/api`. For Android emulator or physical device, see the instructions in `mobile/.env.example`.

---

## Environment variables

### Backend (`backend/.env.example`)

| Variable | Required in prod | Purpose |
|---|---|---|
| `DJANGO_PRODUCTION` | yes | Set to `1` to enable hardened production mode |
| `SECRET_KEY` | yes | Django secret key (boot fails if missing in prod) |
| `DJANGO_ALLOWED_HOSTS` | yes | Comma-separated public hostnames |
| `DJANGO_CSRF_ORIGINS` | recommended | Trusted browser origins with scheme, e.g. `https://track.knhs.edu.ph` |
| `DATABASE_URL` | for PostgreSQL | `postgres://user:pass@host:5432/dbname?sslmode=require` |
| `DJANGO_SECURE_SSL_REDIRECT` | optional | Default on in production; set `0` to disable |
| `TRACK_AUTH_THROTTLE_RATE` | optional | Login rate limit (default `10/min`) |
| `DJANGO_EXTRA_ALLOWED_HOSTS` | dev only | LAN IP for mobile device testing |
| `REDIS_URL` | for >1 process | Channel layer for WebSocket fan-out; unset means in-memory (single process) |
| `TRACK_WS_ALLOWED_ORIGINS` | optional | Extra browser origins allowed to open the messaging socket (CORS/CSRF origins are always accepted) |
| `TRACK_MESSAGING_THROTTLE_RATE` | optional | Message-send and ws-ticket rate limit (default `60/min`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | for browser push | Web Push identity; without them push stays off and the UI says so (`manage.py generate_vapid_keys`) |

### Frontend (`frontend/.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base URL (default `/api` for same-origin; set full URL for split-origin) |
| `VITE_SITE_URL` | Public origin for metadata (og:image, etc.) |
| `VITE_PROXY_TARGET` | Dev only: where the Vite proxy forwards `/api/*`, including the messaging socket (default `http://127.0.0.1:8000`) |

### Mobile

| Variable | How to set | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `mobile/.env.development` (dev), `mobile/eas.json` (EAS build) | Django API base URL |

---

## Running tests

### Backend (426 tests)

```bash
# From project root, with .venv activated
python backend/manage.py test core
```

### Frontend (789 tests)

```bash
cd frontend
npm test
```

### Mobile

No automated test suite. Manual smoke testing via Expo web or Android emulator.

---

## API reference

All endpoints are prefixed with `/api/`. Key groups:

- `GET /api/health/` — public health check
- `/api/auth/` — login, logout, token (mobile), me, change-password, reset-password
- `/api/users/` — admin: user CRUD (writes gated by permission keys)
- `/api/departments/`, `/api/permissions/`, `/api/users/<id>/permissions/` — department & permission management
- `/api/audit-logs/` — audit trail of administrative actions
- `/api/school-years/`, `/api/grade-levels/`, `/api/sections/`, `/api/subjects/`, `/api/teacher-assignments/` — school structure
- `/api/requirements/`, `/api/submissions/` — requirements and student submissions
- `/api/schedules/` — timetable
- `/api/attendance/sessions/` — sessions, filtered and paged by the server: `date` / `date_after` / `date_before`, `status` (a stored value, or the derived `missed` and `outstanding`), `section`, `subject`, `assignment`, `search` across class, subject and learner names, `ordering` (`-`-prefixed, newest first by `-date`) and `page` / `page_size`. `?brief=1` returns the flat row the boards and history tables render — counts for present/absent/late/excused and `record_count` / `enrolled` annotated in SQL — leaving the nested shape for existing consumers. `POST /api/attendance/sessions/<id>/records/` writes the whole register in one transaction (`{ "records": [{ student, status, notes }] }`) and answers with created / updated / unchanged totals and the refreshed session; a teacher may only write sessions they are assigned.
- `/api/attendance/records/` — one attendance row per learner per session, with the same server-side `student` / `session` / `status` / date-range / `search` / `ordering` / paging. No delete route: recorded attendance is corrected by writing a new mark, not removed.
- `/api/notifications/`, `/api/announcements/` — communications
- `/api/messaging/conversations/` — threads: list, unread totals, and create (direct, class- or section-scoped group). `<id>/messages/` reads and posts a thread (`since_seq`/`before_seq` cursors), `<id>/read/` and `<id>/delivered/` write receipts, `<id>/members/`, `<id>/sync-members/` and `<id>/archive/` manage the roster. `/api/messaging/contacts/`, `/options/`, `/summary/`, `/settings/` and `/ws-ticket/` cover the launch pad, unread badge, preferences, and the single-use ticket that authenticates the socket; `/api/messaging/push/subscriptions/` stores browser push endpoints.
- `WS /api/ws/messaging/` — the messaging socket (delivery, typing, presence, read receipts, `sync` resume). Authenticated with `?ticket=` from `/api/messaging/ws-ticket/`, or `?token=` for the native app.
- `/api/dashboard/` — role-specific dashboard metrics

See `backend/core/urls.py` for the complete route list, and
`docs/DEPARTMENTS_ROLES.md` for how departments, permissions and the Super
Administrator role work.

---

## Deployment

See `docs/DEPLOYMENT.md` for the complete deployment guide covering Render, Vercel, Supabase, and Expo EAS.

**The application is deployment-ready but has not been deployed.** No cloud infrastructure, domains, or public builds have been created. Deployment requires explicit authorization.
