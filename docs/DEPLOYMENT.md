# TRACK — Deployment Guide

**Status: deployment-ready, NOT deployed.**
No hosting provider has been connected to this repository and nothing has been
published. Every command marked *(verified)* was actually executed during the
Phase 5/7 audit. Commands marked *(documented)* describe the procedure but
require a Linux host, a PostgreSQL server, or EAS credentials.

---

## 1. Architecture overview

```
Browser (web) ──────────────► ┌─────────────────────────────────────┐
                               │  Same-origin (recommended):          │
Phone (mobile) ─── HTTPS ────► │  / → frontend static files          │
  https://<api>/api            │  /api/* → Django (gunicorn)         │
                               │  /admin/ → Django                   │
                               └────────────────┬────────────────────┘
                                                 │
                                         PostgreSQL (Supabase)
                                                 │
                                       backend/media/  (local uploads)
                                       backend/staticfiles/  (WhiteNoise)
```

**Two authentication schemes, one backend:**

- Web app → Django **session cookie** + CSRF token. The cookie is `SameSite=Lax`, which means **the web frontend must be served from the same hostname as the API** (same-origin). If they are on different domains, web login silently fails.
- Mobile app → DRF **Authorization: Token** header. No cookies, no CSRF required. Tokens are permanent per user and deleted server-side at logout.

---

## 2. Hosting options

| Option | Cost | Pros | Cons |
|---|---|---|---|
| **A. Single VPS (Hetzner CX22 / DigitalOcean $6)** + nginx | ~$4–6/mo | Same-origin by design; always on; cheapest per capability; full control | You operate TLS renewal, backups, security patches |
| **B. Render Web Service (Django) + Static Site (frontend)** | Free tier exists; Starter ~$7/mo | Zero-ops, git-connected, auto HTTPS | Two hostnames → same-origin session issue (see §3 below); free tier sleeps |
| **C. Railway** | Usage-based | Simple git deploys | Same two-hostname issue; trial credit expires |

**Recommendation:** Option A (VPS + nginx) is the best fit because nginx serves the built frontend and proxies `/api` on the same domain, matching the session-cookie auth design with zero settings changes.

### Same-origin caveat (Option B/C)

If the web frontend and API are on **different hostnames**, `SameSite=Lax` session cookies are not sent cross-site and web login fails. To fix this on split-origin deployments, add to `backend/config/settings.py` inside the `if IS_PRODUCTION:` block:

```python
SESSION_COOKIE_SAMESITE = "None"   # requires SESSION_COOKIE_SECURE = True (already set)
```

This must be deliberate. Verify web login after applying it.

---

## 3. Backend environment variables

Set these as real environment variables on the host. **Never upload a `.env` file to the server.**

| Variable | Required | Example / notes |
|---|---|---|
| `DJANGO_PRODUCTION` | **yes** | `1` — enables the full hardening block |
| `SECRET_KEY` | **yes** | Generate: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DJANGO_ALLOWED_HOSTS` | **yes** | `track.knhs.edu.ph` (comma-separated, no scheme) |
| `DJANGO_CSRF_ORIGINS` | recommended | `https://track.knhs.edu.ph` (comma-separated, with scheme) — also controls CORS |
| `DATABASE_URL` | for PostgreSQL | `postgres://user:pass@host:5432/dbname?sslmode=require` |
| `DJANGO_SECURE_SSL_REDIRECT` | optional | Default `1` (on); set `0` only for HTTP rehearsals behind a proxy that does not pass `X-Forwarded-Proto` |
| `TRACK_AUTH_THROTTLE_RATE` | optional | Login throttle (default `10/min`) |

Static files: WhiteNoise serves the `collectstatic` output. Run `collectstatic` on every deploy.

Email: console backend only. Password resets print to server logs — no SMTP is configured.

---

## 4. Frontend environment variables (build-time)

| Variable | Default | Production value |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | `/api` (same-origin nginx) or `https://api.example.com/api` (split-origin) |
| `VITE_SITE_URL` | `http://localhost:5173` | `https://track.knhs.edu.ph` |

These are baked into the JS bundle at build time. They are public — never put backend secrets here.

---

## 5. Mobile environment variables (bundle-time)

`EXPO_PUBLIC_API_URL` is inlined into the JS bundle at build time and is public. Never put secrets here.

| Scenario | How to set it |
|---|---|
| Local dev | `mobile/.env.development` (committed) — `http://localhost:8000/api` |
| Android emulator | `mobile/.env.local` (gitignored) — `http://10.0.2.2:8000/api` |
| Physical device | `mobile/.env.local` (gitignored) — `http://<LAN-IP>:8000/api` |
| EAS build | Edit `mobile/eas.json` → `build.base.env.EXPO_PUBLIC_API_URL` = `https://<deployed-backend-host>/api` |

The app throws on startup in a release build if the URL is missing or points to localhost — this guard is intentional.

---

## 6. Supabase PostgreSQL setup

1. Create a project at [supabase.com](https://supabase.com).
2. In Settings → Database, copy the **Session mode** connection string (port 5432).
   It looks like: `postgres://postgres.[ref]:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
3. Append `?sslmode=require` to the connection string.
4. Set this as `DATABASE_URL` in your backend host's environment variables.
5. The first deploy runs `python backend/manage.py migrate` and creates the schema automatically.

**Connection pooling note:** For Render with multiple workers, use Supabase's **Transaction mode** (port 6543) instead of Session mode, and set `conn_max_age=0` in settings (or use the `pgbouncer=true` parameter). Session mode is fine for 1–2 workers.

---

## 7. Render backend deployment

1. Connect your GitHub repository in the Render dashboard.
2. Create a **Web Service** pointing at the repository root.
3. Set:
   - Root directory: `backend`
   - Runtime: Python
   - Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput`
   - Start command: `gunicorn config.wsgi --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
4. Add all required environment variables from §3.
5. Add a health check path: `/api/health/`

**Important:** Gunicorn is POSIX-only and cannot run on Windows. It runs correctly on Render's Linux environment.

---

## 8. Vercel frontend deployment

1. Connect your GitHub repository in the Vercel dashboard.
2. Set:
   - Root directory: `frontend`
   - Framework preset: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add environment variables from §4.
4. For SPA routing, create `frontend/public/_redirects` or a `vercel.json`:

```json
{
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

5. The API base URL must be the full Render backend URL for split-origin deployments (e.g. `https://track-backend.onrender.com/api`).

---

## 9. Deployment order

```
1. Set up and verify PostgreSQL (Supabase or other)
2. Deploy backend to Render:
   a. Set all environment variables
   b. Trigger deploy: install → migrate → collectstatic → start
   c. Verify: GET https://<backend>/api/health/ → 200
   d. Verify: GET https://<backend>/api/students/ → 401 (not 500, not 404)
3. Deploy frontend to Vercel:
   a. Set VITE_API_BASE_URL to backend URL
   b. Build and deploy
   c. Verify: open frontend URL, log in as admin
   d. Verify: CORS — browser network tab shows 200 on API calls
4. Configure EAS build for mobile:
   a. Replace eas.json placeholder with deployed backend URL
   b. Run: npx eas-cli@latest build -p android --profile preview
   c. Install APK on a device and verify login and dashboard
5. Set up database backups (see docs/BACKUP_RECOVERY.md)
6. Create initial admin account if not seeded
```

---

## 10. Backend commands reference

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Apply migrations (safe — all additive)
python backend/manage.py migrate --noinput

# Collect static files (required for production)
python backend/manage.py collectstatic --noinput

# Production self-check (run before each deploy)
DJANGO_PRODUCTION=1 SECRET_KEY=<key> DJANGO_ALLOWED_HOSTS=<host> \
  python backend/manage.py check --deploy

# Start server (Linux host only — gunicorn does not run on Windows)
gunicorn config.wsgi --chdir backend --bind 0.0.0.0:8000 --workers 2 --timeout 60

# Create a superuser (if not seeded)
python backend/manage.py createsuperuser
```

---

## 11. Verification steps (post-deploy)

```bash
# Health check
curl -i https://<backend-host>/api/health/
# Expected: 200 {"status":"success","message":"TRACK backend is running."}

# Unauthenticated API access
curl -i https://<backend-host>/api/students/
# Expected: 401 {"detail":"..."}

# CORS preflight
curl -i -X OPTIONS https://<backend-host>/api/auth/token/ \
  -H 'Origin: https://<frontend-host>' \
  -H 'Access-Control-Request-Method: POST'
# Expected: 200 with Access-Control-Allow-Origin matching frontend host

# Security headers check
curl -I https://<backend-host>/api/health/ | grep -i "strict-transport\|x-frame\|x-content"
```

---

## 12. Rollback procedure

**Application rollback:**
- Render: click "Rollback to previous deploy" in the dashboard.
- VPS: `git checkout <last-good-commit>` and repeat deploy commands.

**Data rollback:**
- Restore from the most recent database backup (see `docs/BACKUP_RECOVERY.md`).
- Do not attempt data rollback without a verified backup.

**Mobile rollback:**
- Rebuild and redistribute the previous APK.
- There is no OTA update channel (EAS Update is not configured).

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Boot error: `SECRET_KEY is empty` | `DJANGO_PRODUCTION=1` set but `SECRET_KEY` missing | Set `SECRET_KEY` env var |
| `400 DisallowedHost` | Hostname not in `DJANGO_ALLOWED_HOSTS` | Add the deployed hostname |
| HTTPS redirect loop behind proxy | Proxy does not set `X-Forwarded-Proto` | Fix proxy header, or set `DJANGO_SECURE_SSL_REDIRECT=0` |
| Web login works but every request returns 401 | Split-origin: `SameSite=Lax` cookie not sent | Use same-origin (nginx) or add `SESSION_COOKIE_SAMESITE = "None"` (§2) |
| Browser POST 403 | CSRF origin not trusted | Set `DJANGO_CSRF_ORIGINS=https://<frontend-host>` |
| CORS blocked | Same variable as CSRF origins | Same fix as above |
| Admin CSS 404 | `collectstatic` not run | Run `python manage.py collectstatic --noinput` |
| Mobile crash on launch: URL not set | Release build without API URL | Set `EXPO_PUBLIC_API_URL` in `eas.json` or `.env.production.local` |
| `No module named 'fcntl'` | Gunicorn run on Windows | Run on the Linux deployment host |
| 401 bursts after ~10 logins | Login throttle (10/min per process) | Wait 1 minute, or raise `TRACK_AUTH_THROTTLE_RATE` |
