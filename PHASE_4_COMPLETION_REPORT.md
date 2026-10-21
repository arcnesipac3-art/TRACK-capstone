# TRACK — Phase 4 Completion Report: Mobile Integration

**Date:** 2026-10-21
**Scope:** Connect the Expo mobile app (`mobile/`) to the existing Django backend and complete the main user workflows for all four roles, without changing the database, the API contract, or the web app.

**Status: complete.** Every planned item (P0/P1/P2 in `PHASE_4_MOBILE_INTEGRATION_AUDIT.md`) is implemented and verified. All write-path testing ran against a **disposable copy** of the database on a sandbox backend; the real database and the web app were not touched. Nothing was committed — every change below is uncommitted in the working tree, per the standing instruction.

---

## 1. Features connected

All data comes from the existing Django API. No endpoint, field, model, or response format was invented; where the backend could not support a mobile need, it is listed in §5 (backend gaps) rather than mocked.

### Authentication & role routing (all roles)
- Real Django token auth: `POST /api/auth/token/` (username **or** email, mirroring the web login), identity from `GET /api/auth/me/` — the server's `role` decides the tab set, never a client guess. No credentials are hardcoded in any screen.
- Token stored with `expo-secure-store` on Android/iOS (keystore-backed); on web it falls back to `localStorage` (dev/testing parity only — see §9).
- Session restore on cold start, and a shared auth snapshot (`auth-state.ts`) so login, logout, and any 401 swap the stack immediately — no app restart.
- 401 anywhere in the app clears the token inside the API client, publishes the snapshot, and the UI lands back on the login screen.
- Network failures (offline/unreachable server) surface a retryable error state; the token is kept (the server may just be down). Server errors (5xx) show a generic message — no internals or secrets are logged or displayed.
- Cold start at `/` now resolves correctly: signed out → login form; signed in → the user's own role dashboard (role resolved via `/auth/me/`).
- `SignOutButton` on every dashboard: revokes the token server-side (`POST /api/auth/token/logout/`) and forwards to the login screen.

### Student
- **Dashboard** `GET /api/dashboard/` — real totals, not-submitted/awaiting counts, present rate, unread count.
- **Requirements** `GET /api/requirements/` + `GET /api/submissions/` (server-scoped to the student) joined client-side per requirement, with real statuses (submitted/verified/returned/overdue) and teacher feedback.
- **Submit work** — the previously inert "Submit work" button is now a real form: link URL validation, `POST /api/submissions/ {requirement, link_url, status:'submitted'}` (exactly what the web app sends — `link_url` only, no file upload exists on the backend), duplicate-tap protection, server-side refresh afterwards. Resubmission upserts (no duplicate rows) and appends history, per the backend contract.
- The student **cannot** self-verify: the client never sends `status:'verified'`, and the server rejects it anyway (verified by probe).
- **Attendance** `GET /api/attendance/records/` with rows joined from `session_detail` (subject/section/date/status).
- **Notices** — announcements (`GET /api/announcements/`) and personal notifications (`GET /api/notifications/`) in one screen; tapping an unread notification marks it read (`POST /api/notifications/<id>/read/`).

### Parent
- **Dashboard** `GET /api/dashboard/` — real linked children (`children[].student_id` = StudentProfile pk).
- **My Children** `GET /api/students/` — only the explicitly linked children (server-enforced).
- **Requirements / Attendance per child** — child picker; requests are scoped with `?child=<profile id>` / `?student=<profile id>`; the server returns 403 for a child that is not linked (verified by probe).
- **Notices** — announcements + notifications, mark-read.

### Teacher
- **Dashboard** `GET /api/dashboard/` — pending reviews, unread count, attendance rate, own classes, upcoming deadlines, recent submissions.
- **Attendance** `GET /api/attendance/sessions/` (newest first, per-session present/absent/late/excused summaries) + **generate next 7 days** via `POST /api/attendance/generate/` **only** (idempotent — verified: second call generates 0). Tapping a session shows the roster from `GET /api/students/` (teacher-scoped); marks are written with `POST /api/attendance/records/ {session, student, status}` / `PATCH /api/attendance/records/<id>/` using **only** the existing statuses (present/absent/late/excused). Server rules confirmed live: only own sessions, only enrolled students (403 otherwise), unique (session, student), session/student frozen on update.
- **Review** `GET /api/submissions/` (server-scoped to own assignments) — expandable per-requirement list with pending counts; status control sends `PATCH /api/submissions/<id>/ {status, teacher_feedback}` for submitted/verified/returned; history is appended server-side with the teacher as actor. Cross-teacher access returns 403/404 (verified by probe).
- **Timetable** `GET /api/schedules/` grouped by day.
- **Notices** — announcements + compose (`POST /api/announcements/`, own section only — the server rejects a foreign section with 400, verified), notifications + mark-read.

### Admin
- **Dashboard** `GET /api/dashboard/` — account totals, people/requirements/attendance summaries, and the real audit trail ("signed in (mobile)" entries appeared for every test login).
- **Directory** `GET /api/students/`, teachers, parents, sections — segmented directory with LRNs, sections, accounts.
- **Classes** (tab label; route `admin/attendance`) — full timetable plus attendance-session monitoring.
- **Requirements** `GET /api/requirements/` + `GET /api/submissions/` joined — every class's requirements with submission counts and statuses.
- **Notices** — announcements + compose, notifications + mark-read.

### Cross-cutting
- Consistent loading / empty / error(+retry) states via shared `StateViews`; safe response parsing (pagination-aware `list()`); `EXPO_PUBLIC_API_URL` drives the base URL; `page_size=100` requested like the web app; no tokens or secrets in logs.
- Small-screen layout, touch targets, keyboard avoidance, and accessibility labels throughout (e.g. "Submit work for *Personal Essay Draft*").

---

## 2. Files changed and why

All paths under `mobile/` unless noted. The whole `mobile/` directory is new/untracked from Phase 2–4 (nothing committed, by standing rule).

### New shared infrastructure
| File | Why |
|---|---|
| `src/auth-state.ts` | Module-level auth snapshot (pub/sub + `useAuthSnapshot`). RootLayout mounts once and reads storage once, so without this a login/logout/401 never reached it — the user stayed stuck on the boot stack (defect D7). |
| `src/api/types.ts` | One shared set of response types (per-role dashboards, `Submission`, `AttendanceRecord` with `session_detail`, `StudentProfile`, `Announcement`, `Notification`) so every screen parses the *real* contract. |
| `src/api/client.ts` *(rewritten)* | Central API layer: token storage adapter (SecureStore native / `localStorage` web), consistent `Token` auth header, 401→publish, `auth.login/logout` publish, pagination-aware `list()`, timeout/network/server-error mapping to typed `ApiError`, safe JSON parsing. |
| `src/components/StateViews.tsx` | Shared loading/empty/error(+retry) components — before this every screen swallowed failures with `console.warn` and rendered an "empty" state (D11). |
| `src/components/SignOutButton.tsx` | No logout existed anywhere (D7). Server-side token revoke + snapshot flip + forward to `/login`. |
| `src/components/NoticesScreen.tsx` | One announcements+notifications screen (segments, compose for staff, mark-read, mark-all) reused by all four roles (D14). |
| `src/components/ScreenList.tsx` | FlatList nested in a ScrollView (`scrollEnabled={false}`) renders rows on native but **nothing** on react-native-web (virtualized list needs a bounded height). Plain-map list with identical visuals; migrated 13 sites across 12 files. |
| `src/app/index.tsx` | There was no `/` route — every cold start (phone or browser) rendered Expo Router's "Unmatched Route". Redirects signed-out users to `/login` and signed-in users to their own role's dashboard via `/auth/me/`. |

### New screens
| File | Why |
|---|---|
| `src/app/(app)/teacher/{dashboard,attendance,review,timetable,notices}.tsx` | Teacher role had no screens at all (D12). |
| `src/app/(app)/admin/{dashboard,directory,attendance,requirements,notices}.tsx` | Admin role had no screens at all (D13). |
| `src/app/(app)/parent/children.tsx` | Explicit children list (was missing; the old derivation crashed on the wrong shape and used user ids where profile ids are required — D3). |
| `src/app/(app)/{student,parent}/notifications.tsx`, `teacher/notices.tsx`, `admin/notices.tsx` | Thin wrappers configuring the shared `NoticesScreen` per role (teacher/admin can compose). |

### Modified screens (shape/scoping/workflow fixes)
| File | Why |
|---|---|
| `src/app/_layout.tsx` | Subscribe to the auth snapshot so auth transitions swap stacks without a restart (D7). |
| `src/app/(app)/_layout.tsx` | Role-based tab navigators for all four roles (teacher/admin were "dashboard is on the web app" fallbacks); `/auth/me/` failure now shows retry + sign-out instead of an infinite spinner (D8); unknown-role defensive sign-out with forward. |
| `src/app/(auth)/login.tsx` | Real error handling (single invalid-credentials message, network-error retry); **explicit** post-login forwarding — after the token exists the URL stays `/login` (routes are file-based on web too), so it resolves the role via `/auth/me/` and `router.replace('/{role}/dashboard')`; fixed an RNW crash from `{error && …}` with `error = ''`. |
| `src/app/(app)/student/dashboard.tsx` | Real dashboard contract (`total_requirements`, `attendance.by_status`, …) — every tile rendered `undefined` before (D1). |
| `src/app/(app)/student/requirements.tsx` | Requirements ⨝ submissions join with real statuses/feedback; the inert "Submit work" text is now a validated submit/resubmit modal → `POST /submissions/` with refresh (D9); migrated to `ScreenList`. |
| `src/app/(app)/student/submissions.tsx`, `student/attendance.tsx` | Attendance rows read nested `session_detail` (D6); `notes` render fixed (empty-string RNW crash); `ScreenList`. |
| `src/app/(app)/parent/dashboard.tsx` | Real `children[].{student_id, name, section, …}` shape — `child.user.full_name` used to throw (D2). |
| `src/app/(app)/parent/{requirements,attendance}.tsx` | Child picker + server-side scoping `?child=` / `?student=` with StudentProfile pks (D4/D5); `session_detail` rows (D6); children from `GET /students/` `.id`; empty-`notes`/`lrn` render fixes; `ScreenList`. |
| `package.json` | Web parity for the smoke test: `react-dom`, `react-native-web`, `@expo/metro-runtime` (installed via `npx expo install`). |

### Not changed
- **No backend file was modified in Phase 4.** `backend/` diffs in `git status` are the Phase 1–3 security work (uncommitted).
- Web app (`frontend/`) untouched.

---

## 3. Defects found by testing (and fixed)

The Expo web smoke test surfaced five real defects that static checks could not:

1. **No `/` route** — every cold start showed "Unmatched Route" (this would have hit the Android app on launch too). → `src/app/index.tsx`.
2. **No navigation after login** — the token was stored but the URL stayed `/login`; the boot comment claiming the layout "forwards to (app)" was wrong. → explicit `router.replace` via `/auth/me/` (also catches a revoked-role login).
3. **No navigation after logout** — the URL kept pointing at the old screen, which remounted the app shell and spun on a 401. → `router.replace('/login')` after the server-side revoke.
4. **RNW empty-string crashes** — `{x && <View>…}` with `x = ''` renders an empty text node; native silently drops it, react-native-web throws. Found live on the login screen (`error = ''`) and parent attendance (`item.notes = ''`); swept the codebase and also hardened `student/attendance` (`notes`) and `parent/children` (`lrn` — the admin form allows a blank LRN). All converted to `? … : null`.
5. **Nested lists invisible on web** — 13 FlatList-in-ScrollView sites rendered empty content areas. → shared `ScreenList` (plain map; identical output on native).

---

## 4. Test results (all actually executed)

| Check | Command | Result |
|---|---|---|
| TypeScript | `cd mobile && npx tsc --noEmit` | **exit 0** (re-run after every fix batch; final run clean) |
| ESLint | `cd mobile && npx expo lint` | **exit 0, no warnings** (final run clean) |
| Backend suite | `backend> ..\.venv\Scripts\python.exe manage.py test core` | **197/197 OK** |
| Frontend suite | `cd frontend && npm run test` | **202/202 passed** |
| Native bundle | `cd mobile && npx expo export -p android` | **Android Bundled 14.7 s, 1174 modules**, Hermes bundle exported — every route compiles for Android |
| HTTP probe (sandbox) | `phase4_probe.ps1` against `127.0.0.1:8001` with a **disposable DB copy** | **44/44 PASS** |
| Expo web smoke (sandbox) | `npx expo start --port 5173`, `EXPO_PUBLIC_API_URL=http://localhost:8001/api` | all four roles exercised — see below |

### HTTP probe coverage (44/44, exact request sequences the app sends)
- **Auth:** valid login → token+role; wrong password → 400; garbage token → 401; anonymous → 401.
- **Student workflow:** submissions scoped to own profile only; submit → 201/200, `submitted_at` stamped server-side, `verified_at` null; resubmit upserts (no duplicate row); student cannot create or PATCH to `verified` (400).
- **Teacher review:** sees own submissions; verify → `verified_at` + feedback + history entry; return → 200; **cross-teacher PATCH → 403**; invalid status → 400.
- **Attendance:** sessions list with records; generate → 200/201 and **idempotent** (second call: `generated: 0`); record POST → 201 with `recorded_at`; **duplicate (session, student) → 400**; PATCH status → 200; invalid status → 400; **cross-section student → 403** ("not enrolled in this class"); **student POST → 403**.
- **Parent scoping:** `/students/` returns only linked children (profiles 1 and 4); unlinked child `?child=5` / `?student=5` → 403/404 with no data; dashboard children carry `student_id`.
- **Notifications/announcements:** mark-read → 200 and `is_read=true` on re-fetch; **student POST announcements → 403**; teacher own section → 201; **teacher foreign section → 400**.

### Expo web smoke (per role)
- **Cold start:** `/` → login (signed out) and `/` → `/student/dashboard` with real data (signed in).
- **student1:** login → dashboard ("Sofia Cruz", "Grade 7 — Sampaguita", 77.8 % present / 9 records, 4 unread) → requirements (returned rows show the teacher's feedback; submit buttons per row) → submit modal blocked on an empty link with an inline message → valid link → `POST /submissions/ 201` + list refresh ("Submitted Today", flash message, no duplicates) → notices (real notifications) → sign-out (`POST /auth/token/logout/ 200` + forward to `/login`).
- **teacher1:** login → dashboard (2 pending reviews, 64 % present / 25 records, real classes/students) → review (per-requirement counts; **two real `PATCH /submissions/…/ 200` writes** through the status controls, attributed to teacher1 in `SubmissionHistory`) → attendance (sessions incl. the probe-generated ones and its "late" mark) → timetable (Monday Mathematics) → notices compose (**`POST /announcements/ 201`** + list refresh).
- **parent1:** login → dashboard ("Rosa Cruz", 2 linked children with per-child present rates) → per-child requirements (child picker; statuses/feedback match the student's own view) → per-child attendance (records fetched; empty-`notes` crash fixed and re-verified).
- **admin:** login → dashboard (account totals; audit trail shows every test login as "signed in (mobile)") → directory (all students, LRNs, sections) → classes/timetable → requirements (all classes with due dates).
- A **person at the machine** independently drove the app during the session (switched a parent's child via the picker, navigated, signed out) — the flows responded correctly to real human input.

### Data safety
- All write flows ran against `C:\Users\dragon\AppData\Local\Temp\opencode\track_audit\track_audit_copy.sqlite3` (a fresh copy of `track_db.sqlite3`) served by a sandbox Django process on `127.0.0.1:8001` with `audit_settings`. The real database was never written to by any test; no data was deleted; no auth or permission was disabled; no test account was modified (logins only).

---

## 5. Backend gaps (documented, not mocked)

1. **No file upload for submissions.** The mobile submit form accepts a **link URL only** (`link_url`), exactly like the web app. If file upload is wanted later it is a backend feature first.
2. **`?requirement=` is ignored for students** on `GET /api/submissions/` — by design the student branch already returns only their own rows, so the app fetches the (small, scoped) list once and joins client-side. Teachers/admins do get the filter. Not a defect; noted so nobody "fixes" the client to depend on it.
3. **`GET /api/auth/me/` has no profile pk** (`UserSerializer` returns id/username/email/name/role/is_active). The app never needs it: students don't send `student` on create (the server stamps it) and parents get profile ids from `/students/` and `/dashboard/`.
4. **Attendance sessions can only be generated from the timetable** (`POST /api/attendance/generate/`) — no ad-hoc session creation. This matches the task requirement; the teacher UI exposes exactly that one action.
5. **Teachers cannot set a submission to `overdue`**-style non-review states through the UI — the mobile review control offers exactly submitted/verified/returned, the three review states the backend records with history.

No backend change was required for Phase 4: server-side authorization (student self-verification blocked, cross-teacher/cross-section 403, parent foreign-child 403, announcements permissions, mark-read ownership) was verified to already enforce the rules.

---

## 6. How to run

Backend (repo venv — system Python has no Django):

```powershell
cd C:\Users\dragon\Desktop\TRACK-capstone\backend
..\.venv\Scripts\python.exe manage.py runserver 8000
```

Web app (existing, unchanged; shares port 5173 with Expo web — run **one of the two** at a time):

```powershell
cd C:\Users\dragon\Desktop\TRACK-capstone\frontend
npm install
npm run dev          # http://localhost:5173
```

Expo app — web (smoke/development; CORS-allowed origin):

```powershell
cd C:\Users\dragon\Desktop\TRACK-capstone\mobile
npm install
npx expo start --port 5173      # http://localhost:5173
```

`mobile/.env` already sets `EXPO_PUBLIC_API_URL=http://localhost:8000/api`. To point the web app at a different backend, set it in the shell before starting (shell env wins over `.env`):

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://localhost:8000/api'
```

## 7. Physical Android device testing — steps (NOT executed in this environment; no device/emulator available here)

Everything below was verified in code and on Expo web; the on-device run is the remaining manual step.

1. **Backend reachable from the phone.** The phone sends `Host: <your-LAN-IP>:8000`, which Django would reject unless allowed. The settings already support this:
   ```powershell
   cd C:\Users\dragon\Desktop\TRACK-capstone\backend
   $env:DJANGO_EXTRA_ALLOWED_HOSTS = '192.168.x.x'   # your PC's LAN IP (ipconfig)
   ..\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
   ```
   (CORS does not apply to the native app — it is a browser-only control. Phone and PC must be on the same Wi-Fi; allow Python through the Windows firewall when prompted.)
2. **Set the API URL for the native build** (a phone cannot reach `localhost` — that is the phone itself):
   ```powershell
   cd C:\Users\dragon\Desktop\TRACK-capstone\mobile
   $env:EXPO_PUBLIC_API_URL = 'http://192.168.x.x:8000/api'
   npx expo start
   ```
3. **Install Expo Go** from the Play Store on the Android phone; scan the QR code in the terminal (same Wi-Fi; if the tunnel fails, press `s` → tunnel or set `EXPO_DEV_CLIENT_HOST`).
4. **Walk the flows** with the seeded accounts (password `track2026`): `student1` → dashboard → requirements → submit work → notices → sign out; `teacher1` → attendance (expand a session, mark a roster, "Generate next 7 days") → review (verify/return one submission) → notices (compose); `parent1` → dashboard → pick each child → requirements/attendance; `admin` → dashboard/directory/classes/requirements/notices.
5. **Confirm session restore:** kill the app from the recents drawer, reopen — it should land on the same role's dashboard without re-login. Then sign out and confirm the login screen; toggle airplane mode and confirm the error+retry state instead of a hang.
   (An Android **emulator** would instead use `http://10.0.2.2:8000/api`.)

---

## 8. Incomplete / not executed

- **Physical Android device run** — no device/emulator in this environment. The native bundle itself compiles (`expo export -p android`: 1174 modules, 0 errors) and all logic was exercised on Expo web; step-by-step device instructions are in §7.
- **Attendance roster tap-to-mark and the review expand/collapse could not be driven reliably by the browser automation** (react-native-web press events resisted synthetic clicks; the DOM-event attempts that did land produced two genuine, server-recorded review writes). The underlying endpoints are probe-verified with the exact request bodies the app sends, and the screens render real data; the taps themselves are the manual device step in §7.
- **Biometric app lock, push notifications, file-upload submissions, offline queueing** — out of Phase 4 scope.
- **Expo web is a development/testing surface only**: `localStorage` token storage is not hardened like SecureStore. The production target is Android via Expo Go/dev build, where tokens live in the keystore-backed SecureStore.

## 9. Standing state

- Nothing was committed; `git status` shows the Phase 1–4 work uncommitted (`backend/`, `frontend/`, `mobile/`, and the phase documents).
- The database, migrations, seeded accounts, and the web app are unchanged by Phase 4 (backend untouched; all writes went to the sandbox copy).
- Phase 3 security posture was not regressed: the backend suite (197 tests, incl. the 25 Phase 3 regression tests) passes, and the probe re-confirmed the server-side authorization rules end-to-end.
