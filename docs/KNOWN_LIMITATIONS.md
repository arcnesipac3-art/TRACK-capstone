# TRACK — Known Limitations

This document describes all known incomplete features, external service dependencies, unresolved defects, native testing gaps, and deployment restrictions. Do not claim something works if it appears in this file without a resolution note.

Last verified against the code: **2026-11-02** (backend 475 tests, frontend 953 tests across 68 files, `oxlint` clean over 242 files).

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
- **Description:** Password recovery is admin-initiated: an admin calls the `/api/auth/reset-password/` endpoint to set a new password, which is then communicated to the user out-of-band. The reset is logged to the audit trail. The email backend itself is now configurable (`EMAIL_*`, used by the enrollment confirmation — `docs/DEPLOYMENT.md` §5.1) but no self-service reset flow reads it, so a locked-out user still cannot recover by themselves.
- **Impact:** Users locked out of their accounts must contact the school administrator.
- **Fix:** Implement a self-service reset flow on top of the existing `EMAIL_*` configuration (token issuance, expiry, and one emailed link).

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
- **Description:** The mobile app (`mobile/`) has no automated test files. All mobile testing is manual. CI does run a *compile* gate for it — `npx tsc --noEmit`, `npx expo lint`, and `npx expo export --platform android` (a real Hermes bundle) in the `Mobile` job of `.github/workflows/ci.yml` — so a screen that no longer typechecks or a route tree that no longer bundles fails the build.
- **Impact:** Regressions in mobile-specific *behavior* (SecureStore, token lifecycle, API client, role routing, socket reconnects) cannot be caught automatically; the routing defect fixed on 2026-11-02 (see L-032) is an example that a compile gate does not see.
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
- **Status:** Resolved (2026-11-01) — the production block already sets `SESSION_COOKIE_SAMESITE = "None"` and `CSRF_COOKIE_SAMESITE = "None"` alongside `*_SECURE = True` (`backend/config/settings.py:337-339`), so cross-origin web login works without a manual edit. Same-origin hosting is still the simpler topology.

---

## Data and privacy

### L-017: No GDPR/Data Privacy Act compliance review
- **Severity:** Medium — lowered from High on 2026-11-08 for everything the software can decide on its own
- **Status:** The engineer-side half is done (2026-11-08, "Play-Store / web compliance pass" in TESTING_REPORT.md). A privacy notice and terms exist, name the controller and its address, state retention, and are linked from every public surface; consent to them is captured on the enrollment application and on the account-claim form as `consent_given_at` + `consent_policy_version`, and refused server-side when absent; a person can export their own record and file a correction / objection / erasure request that the enrollment office must answer in writing. There are no third-party scripts, fonts, pixels or stock photographs in the bundle, and the Google map only loads on an explicit click.
- **Remaining:** A qualified person still has to review it. RA 10173 asks the school, not the code, to appoint a responsible officer, set the retention schedule against DepEd order, and sign off that the notice matches how the division actually operates — none of which can be closed by a commit. Erasure is answered with a written reason rather than executed, because the school is obliged to keep academic records.
- **Fix:** Before collecting real student data, have a data protection officer review the notice, confirm the retention periods in Privacy §8, and own the answer path for `/admin/enrollment/data-requests`.

### L-018: Media files not access-controlled in production
- **Severity:** High (when file uploads are enabled in the frontend)
- **Status:** Mostly resolved for enrollment uploads (2026-11-01). Enrollment documents are streamed by `ApplicationDocumentDownloadView` (`backend/core/enrollment_views.py:613`), which re-checks ownership or `enrollment.view` staff permission per request and answers 404 — never 403 — for someone else's record. The frontend fetches them through that endpoint (`downloadAuthorizedFile`), not the public `/media/` URL, and `/media/` is only routed when `DEBUG=True`.
- **Remaining:** Requirement `Submission.file_upload` has no authorized download view yet, and nothing stops a future `/media/`-served path from being opened in production by an nginx rule.
- **Fix:** Reuse the document download pattern for submissions before that upload path is enabled.

---

## Real-time messaging

### L-019: The channel layer is in-memory unless `REDIS_URL` is set
- **Severity:** High (only when running more than one process)
- **Description:** With no `REDIS_URL`, `CHANNEL_LAYERS` uses `channels.layers.InMemoryChannelLayer` (`backend/config/settings.py:110-140`, `channel_layers_for()`). Group messages — the fan-out that carries `message.new`, `typing.update`, presence and read receipts — live inside one Python process.
- **Impact:** One ASGI process works, and the documented `daphne config.asgi:application` command is exactly one process. Two workers behind a load balancer split live traffic: a sender on worker A does not reach a reader on worker B, and the reader sees the message only after a reload or a reconnect `sync`. This is invisible in development and appears the moment the app is scaled out.
- **Verified:** `core.tests_messaging.ChannelLayerConfigTests` (6 tests) asserts the switch itself: an empty or whitespace `REDIS_URL` selects the in-memory layer, a set value becomes `channels_redis.core.RedisChannelLayer` with that exact host and a 60 s expiry, both dotted paths resolve (so a host that sets `REDIS_URL` cannot die on a missing package), and the test process really runs on the in-memory layer.
- **Still unproven here:** actual cross-process delivery. This machine has no Redis server and no Docker (`where redis-server` / `docker` both absent), so no one has watched a message written by worker A surface on a socket held by worker B. That claim needs a deployment rehearsal with two workers; see `docs/DEPLOYMENT.md` §8.
- **Fix:** Set `REDIS_URL` (`redis://host:6379/0`) on the deployment. `channels-redis` is already in `backend/requirements.txt` and the code path is unchanged; expiry is 60 s so a Redis blip degrades live delivery rather than losing messages, which are stored first.

### L-020: Browser push is inert without VAPID keys
- **Severity:** Medium (feature is off by default, by design)
- **Description:** Web push needs a VAPID key pair. `core/push.py` checks `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` and sends nothing when either is missing.
- **Impact:** Without them the details column states it plainly — "This server has no push keys configured, so nothing can be delivered outside TRACK" — the browser toggle is disabled, and no subscription is stored. In-app bells and live socket events are unaffected.
- **Verified:** a pair generated with `manage.py generate_vapid_keys` loads through the documented path form (`pywebpush.Vapid.from_file(<path>)`), the private key's public half equals the `vapid_public_key` advertised by `/api/messaging/options/`, and a signed `Authorization` header comes out as `vapid t=<jwt>,k=<pub>` (comma, no space). Delivery code is covered by `core.tests_messaging.PushDeliveryTests` with mocks.
- **Still unproven here:** that a browser actually shows a TRACK notification. `frontend/src/services/push.js` requires `window.isSecureContext`, a served `/push-sw.js` and a user clicking "Allow" — none of which hold on an insecure dev origin in a headless webview. First real deployment should confirm it with eyes on a phone.
- **Fix:** `python backend/manage.py generate_vapid_keys`, then put the three values (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) in the environment. Re-running it invalidates every existing subscription; browsers resubscribe on their next visit. `VAPID_PRIVATE_KEY` may hold the PEM text or a path to it.

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

### L-023: The socket handshake still accepts a raw token in the query string
- **Severity:** Low
- **Description:** Both TRACK clients now trade their credential for a single-use 30-second ticket over HTTPS (`POST /api/messaging/ws-ticket/`) and put only the ticket in the socket URL — `frontend/src/services/realtime.js` and `mobile/src/messaging/realtime.ts:146-164`. A raw DRF token is *also* still accepted as `?token=` for non-browser clients (`backend/core/websocket_auth.py`).
- **Impact:** No shipped TRACK client leaks a long-lived credential into a connection URL. The remaining exposure is the server-side alternative itself: anything that authenticates a socket with `?token=` puts a permanent credential in access logs, and a token does not expire (L-001).
- **Fix (optional):** Drop the `?token=` branch once nothing uses it — curl rehearsals can mint a ticket instead. It is kept because a native client that cannot call the authenticated endpoint first would otherwise have no socket at all.

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
- **Note (2026-11-02):** The schedules portal no longer shares this pattern. Its four selects are derived from the week it already loaded (`frontend/src/utils/schedules.js` → `filterOptions`), so opening `/admin/schedules` sends one `/schedules/` read and no `/teacher-assignments/` crawl; the class list is fetched only when the add/edit dialog mounts (`components/schedules/ScheduleFormModal.jsx:35`). The attendance board keeps its own reads and this entry stays open for it.

### L-027: `POST /attendance/generate/` runs once per attendance mount
- **Severity:** Low
- **Description:** The screen materialises today's sessions from the timetable when it opens, guarded by a ref so a re-render does not repeat it.
- **Impact:** The endpoint is idempotent — scoped to the calling teacher and skipping days that already have a session — so tab clicking adds no rows. It is one extra write-shaped request on entry, not drift.
- **Fix:** Move generation to a scheduled management command (see L-012) if the school wants sessions to exist before anyone opens the screen.

### L-028: Browser sign-in fails when the dev origin is untrusted or Django cookies are present
- **Severity:** Low (development only)
- **Description:** `POST /api/auth/token/` passes through CSRF protection, and two separate checks can reject it.
  1. **Origin.** `CSRF_TRUSTED_ORIGINS` lists `http://localhost:5173` and `http://127.0.0.1:5173` (`backend/config/settings.py:265-268`). A Vite dev server on any other port — `5199`, or the `5203` used for the attendance probe — answers `403 CSRF Failed: Origin checking failed - None`. The list is hardcoded in the development branch of the settings; the `DJANGO_CSRF_ORIGINS` env override further down the file applies only when `DEBUG` is off, so there is no env var that widens it locally. (`TRACK_DEV_CORS_ORIGINS` widens the *CORS* list for the same situation, which is a different check and a different failure; session-authenticated POSTs still need the CSRF entry.)
  2. **Stale cookies.** A request that arrives carrying `sessionid`/`csrftoken` — left behind by an earlier session-cookie login or a visit to `/admin/` — is CSRF-enforced in full, and the SPA never sends a token: it authenticates with the `Authorization: Token …` header and its CSRF prefetch is an explicit no-op (`frontend/src/services/api.js:254`, `src/services/api.js:7`). The same POST on a trusted origin then answers `403 CSRF token missing`, and after deleting only `csrftoken` it answers `CSRF cookie not set`.
- **Impact:** The login screen reports "Your browser blocked the sign-in request" even though the credentials are correct. Requests with an already-issued API token are unaffected, which is why a probe on a non-standard port can read and write normally but cannot sign a new account in — the documented workaround is to clear the site's cookies, or to write a token into `sessionStorage['track.auth.token']`.
- **Fix:** Sign in from `http://localhost:5173`, and clear the site cookies when a previous session left Django's own cookies behind. Extending `CSRF_TRUSTED_ORIGINS` is a code edit in `settings.py`, not an env var; neither is done here because both are security-relevant settings and production is unaffected (the Vite proxy makes the deployed app same-origin).
---

## Portal presentation

### L-029: Off-scale type and spacing literals survive in the portal
- **Severity:** Low
- **Description:** The cross-portal polish pass replaced every inline `gap`, `padding` and `margin` whose value a spacing token computes to identically (`4/8/12/16/24/32px` → `var(--space-1..4, --space-6, --space-8)`, or the existing `.gap-xs` / `.gap-sm` classes) and the two `font-size` literals the scale already owns (`1rem` → `var(--text-lg)`). What is left has no matching token. Type: `0.85rem` (4 sites), `0.82rem` (4), `0.92rem` (2), `0.87rem` (1) and `1.1rem` (1) — in `AnnouncementsPage.jsx`, `AdminFeesPage.jsx`, `AdminFeeAssessmentDetailPage.jsx`, `NotificationsPage.jsx` and the two admin modals; the scale runs `0.6875 / 0.75 / 0.8125 / 0.875 / 0.9375 / 1 / 1.0625 / 1.1875rem`, so each of those sits between two steps. Geometry: `width: '42%'` (`pages/attendance/SessionsBoard.jsx:383`), `maxHeight: 170` (`components/admin/UserFormModal.jsx:473`), and the `minWidth: 150/180/200/220` column floors. The public enrollment pages (`pages/enrollment/`, including `ApplicationWizardPage.jsx:1113`'s `0.75rem`) keep their literals by the standing guardrail.
- **Impact:** Text on those screens renders a fraction of a pixel away from the intended step — invisible next to the rest of the app, but it is why a `0.85rem` label and a `--text-md` label in the same card do not share a size exactly. Nothing is unreadable and no state is missing; this is scale debt, not a defect.
- **Fix required:** Decide whether the scale should absorb these (snap `0.82 → --text-sm`, `0.85/0.87 → --text-md`, `0.9/0.92 → --text-base`, `1.1 → --text-xl`) and make the change as one pass with a before/after screenshot review, because it shifts text sizes on screens that have already been approved. Deliberately not done in this pass.
- **Note (2026-11-02):** `SchedulesPage.jsx` has left this list. The schedules rebuild moved its six remaining literals (three `0.9rem`, one each `0.82 / 0.85 / 0.92rem`) and its inline-styled summary cards into `.kpi-grid` / `StatCard` plus a token-only `pages/SchedulesPage.css`; `grep` finds no `rem`, numeric `font-size` or inline `gap`/`padding` literal anywhere in `pages/SchedulesPage.jsx` or `components/schedules/` — the only inline `style` left is `--tt-cols: <day count>`, which is data, not decoration.

### L-030: The confirmation dialog needs the provider, and page tests must mount it
- **Severity:** Low (development only)
- **Description:** `useConfirm()` (`frontend/src/context/ConfirmContext.js:26`) throws rather than falling back to `window.confirm`, and the provider is installed once in `main.jsx`. A screen that calls it and is rendered in a bare test harness — `AuthContext.Provider` only, no `ConfirmProvider` — fails on mount.
- **Impact:** Three suites (`UsersPage`, `SectionsPage`, `App`) had to move to `renderConfirmed()` from `frontend/src/test/confirm.jsx` before their dialogs could be driven. Any new page that guards a write needs the same wrapper, and a future page rendered under a second `<ConfirmProvider>` would show two independent dialogs.
- **Fix required:** None planned. A silent `window.confirm` fallback was rejected on purpose: it would let a missing provider ship as a browser-chrome dialog that the design system explicitly retired.

### L-031: The weekly timetable needs every period in the browser
- **Severity:** Low
- **Description:** `/admin/schedules` reads the whole recurring timetable through `api.list('/schedules/')` (`frontend/src/pages/SchedulesPage.jsx:56`), which asks for `page_size=100` and follows up to ten pages. It does that on purpose: the grid, the conflict panel and all four filter selects are computed from the full set in `utils/schedules.js` (`schedulesOverlap`, `detectConflicts`, `filterOptions`), because the server validates `end_time > start_time` and `(assignment, day, start_time)` uniqueness but has no rule that stops the same teacher, section or room being booked twice.
- **Impact:** Up to 1,000 weekly periods load and stay in memory — one request per visit, and one today. Past that ceiling the option lists and the double-booking warning are derived from a truncated set, so a real conflict could exist server-side and go unlabelled on this screen (the save itself would still be accepted, since the server has no overlap rule).
- **Fix:** If the school outgrows the ceiling, move overlap detection into the schedule serializer so the refusal names the clash at save time, and page the grid by day or week. That is a backend change and was deliberately left out of a frontend phase.

---

## Mobile navigation and toolchain

### L-032: A screen inside `(app)` that is not declared as a tab is unreachable by URL
- **Severity:** Medium (reopening risk — the rule is invisible to whoever adds the next screen)
- **Description:** `mobile/src/app/(app)/_layout.tsx` builds one `<Tabs>` navigator per role. A tab navigator can only show screens it was given, so a path whose file exists but whose name was never passed as a `<Tabs.Screen>` falls back to the nearest tab and carries the dynamic segment as a query string: `/messages/7` used to land on `admin/dashboard?id=7`. `tabBarButton: () => null` keeps the route in the navigator while hiding the bar item; `href: null` — the option that looks correct — deletes it from the route table, so nothing can navigate there either.
- **Impact:** Found while wiring messaging: the thread and new-conversation screens were unreachable from the inbox, and the same defect already existed for the two admin fee editors (`admin/fees/category/[id]`, `admin/fees/assessment/[id]`), which no one had noticed because tapping a card on a phone pushes the screen through the navigator's own state instead of resolving a URL.
- **Fix required:** None open — `threadTabs` and `feeEditorTabs` are declared in `_layout.tsx:73-86` and verified live on 2026-11-02 (`/messages/new`, `/messages/8` and a deep link loaded cold from the URL bar all render their own screen, and the bar shows no phantom stop). Anyone adding a non-tab screen under `(app)` must add it to one of those arrays; there is no test that catches the omission (L-007), which is why this is written down instead.

### L-033: `npx expo-doctor` fails its dependency-version check
- **Severity:** Informational (does not affect CI or the bundle)
- **Description:** 19 of 20 doctor checks pass; the one failure is "packages match versions required by installed Expo SDK", reporting **patch** drift on eight packages (`@expo/metro-runtime` 58.0.14 vs ~58.0.16, `expo` 58.0.16 vs ~58.0.22, `expo-constants`, `expo-linking`, `expo-router`, `expo-status-bar`, `react-native` 0.88.0 vs 0.88.1, `react-native-screens`). The lockfile predates this project's work; `git diff HEAD -- mobile/package.json` shows only `expo-font` added (at the version `npx expo install` picked, which doctor accepts).
- **Impact:** Nothing observed — typecheck, lint and `expo export --platform android` all pass, and CI's `mobile` job does not run doctor. The app is a few patch releases behind within SDK 58, which is where an SDK bug fix would be waiting.
- **Fix (when someone owns the risk):** `npx expo install --check` in the mobile app, then re-run the three gates and re-drive the messaging walkthrough. Deliberately not done during a feature pass: bumping `expo`, `expo-router` and `react-native` together is a broad dependency change with its own regression surface, and the guardrail for this project is not to disturb working code on the way past a feature.
