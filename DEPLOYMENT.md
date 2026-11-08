# TRACK — Deployment Guide

**This file moved.** The deployment guide is
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), and it is now the only one.

Until this merge there were two guides that had drifted apart: the Phase 5 audit
copy at this path and the Phase 7 provider copy in `docs/`. Both still described
the pre-messaging app, and both were wrong about two things an operator would
act on:

- They said the web frontend must be **same-origin** because web login uses a
  `SameSite=Lax` **session cookie**. The web client logs in through
  `POST /api/auth/token/` and sends `Authorization: Token …`
  (`frontend/src/services/api.js`), so no cookie is involved; production sets
  `SESSION_COOKIE_SAMESITE = "None"` for the Django admin's own session
  (`backend/config/settings.py:337`).
- They said to start the server with `gunicorn config.wsgi`. That serves REST
  only and cannot upgrade the messaging WebSocket, so live messaging, typing and
  read receipts silently do not work — a socket handshake against such a process
  answers 404. Production runs the **ASGI** application:
  `daphne config.asgi:application` (or `uvicorn`, plus `REDIS_URL` for more than
  one worker).

Everything unique to either copy is in the merged document, with the
`*(verified)*` / `*(documented)*` labels kept honest: architecture and auth (§1),
the process that must run (§2), development setup (§3), hosting options including
Supabase + Render + Vercel (§4, §6, §7), the full env list including the
messaging, Redis and VAPID variables (§5), deploy and verification commands (§8),
backups and rollback (§9 → `docs/BACKUP_RECOVERY.md`), troubleshooting (§10),
limitations and remaining release blockers (§11).
