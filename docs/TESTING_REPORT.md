# TRACK — Testing Report

**Phase 7 audit date:** 2026-10-21
**Environment:** Windows 11, Python 3.15, Node.js (LTS), local SQLite database
**Tester:** Kiro (automated + manual inspection)

> This is a point-in-time audit record and is not updated in place. Re-run on
> 2026-11-01: backend 324 tests and frontend 368 tests all passing, `oxlint`
> clean (0 warnings), production build succeeding. Re-run on 2026-11-02: frontend
> 953 tests across 68 files passing, `oxlint` clean over 242 files, production
> build succeeding — see the design-system sections at the end of this file for
> what each pass covered. Enrollment coverage is
> tracked separately in `docs/ENROLLMENT.md`.

---

## Summary

| Category | Total | Passed | Failed | Blocked | Not Tested |
|---|---|---|---|---|---|
| Backend automated tests | 197 | 197 | 0 | 0 | 0 |
| Frontend automated tests | 202 | 202 | 0 | 0 | 0 |
| Backend system checks | 1 | 1 | 0 | 0 | 0 |
| Migration consistency | 1 | 1 | 0 | 0 | 0 |
| Frontend production build | 1 | 1 | 0 | 0 | 0 |
| Frontend lint | 1 | 1 (warnings only) | 0 | 0 | 0 |
| Mobile TypeScript check | 1 | 1 | 0 | 0 | 0 |
| Mobile ESLint | 1 | 1 (1 warning) | 0 | 0 | 0 |
| Python dependency audit | 1 | 1 | 0 | 0 | 0 |
| Frontend dependency audit | 1 | 1 | 0 | 0 | 0 |
| Mobile dependency audit | 1 | — | 0 | 0 (advisories in build toolchain only) | 0 |
| Live API integration (gunicorn) | — | — | — | 1 (Windows) | — |
| PostgreSQL connection | — | — | — | 1 (no server) | — |
| Android emulator tests | — | — | — | 1 (no emulator) | — |
| EAS build / physical device | — | — | — | 1 (no Expo account / device) | — |

---

## Test execution details

### T-001: Backend automated test suite
- **Command:** `python backend/manage.py test core --verbosity=1`
- **Executed:** Yes
- **Result:** PASS — 197/197 tests in 121.167s
- **Notes:** One expected test log line appeared — `TRACK: notification write failed / RuntimeError: notification backend down` — this is a deliberate test that mocks a down notification service and verifies the system does not propagate the error to the caller. It is a passing test, not a failure.

### T-002: Django system check
- **Command:** `python backend/manage.py check`
- **Executed:** Yes
- **Result:** PASS — "System check identified no issues (0 silenced)"

### T-003: Django deploy check (development keys, expected warnings)
- **Command:** `python backend/manage.py check --deploy`
- **Executed:** Yes
- **Result:** PASS with expected warnings — all 6 warnings are the documented development-mode settings (`DEBUG=True`, dev `SECRET_KEY`, non-secure cookies). These warnings disappear when `DJANGO_PRODUCTION=1` is set and a real `SECRET_KEY` is provided. This was verified in the Phase 5 audit: `check --deploy` with a generated 50-character key returned 0 issues.

### T-004: Migration consistency
- **Command:** `python backend/manage.py makemigrations --check` and `python backend/manage.py showmigrations core`
- **Executed:** Yes
- **Result:** PASS — "No changes detected"; all 4 migrations marked `[X]` (applied).

### T-005: Database record counts
- **Command:** Django shell count query
- **Executed:** Yes
- **Result:** PASS — users: 9, students: 5, submissions: 9, sessions: 20, records: 38. All tables present and populated.

### T-006: collectstatic
- **Command:** `python backend/manage.py collectstatic --noinput`
- **Executed:** Yes
- **Result:** PASS — "0 static files copied to staticfiles, 157 unmodified" (already current from Phase 5).

### T-007: SQLite dumpdata
- **Command:** `python backend/manage.py dumpdata --exclude contenttypes --exclude auth.permission`
- **Executed:** Yes
- **Result:** PASS — dump produced valid JSON with session, user, and model data.

### T-008: Frontend automated test suite
- **Command:** `npm test` (vitest run)
- **Executed:** Yes (from `frontend/` directory)
- **Result:** PASS — 202/202 tests across 13 test files in 10.51s

### T-009: Frontend production build
- **Command:** `npm run build`
- **Executed:** Yes (from `frontend/` directory)
- **Result:** PASS — exit 0; 85 modules transformed; 497.56 kB JS, 59.82 kB CSS

### T-010: Frontend lint (oxlint)
- **Command:** `npm run lint`
- **Executed:** Yes
- **Result:** PASS (exit 0) — warnings only, no errors:
  - `SchedulesPage.jsx`: 9 warnings (React purity/deps/only-export-components) — pre-existing, non-blocking
  - `AttendancePage.jsx`: 3 warnings (unused vars, missing useEffect dependency) — pre-existing
  - `SectionsPage.jsx`: 1 warning (unused import)
  - No errors.

### T-011: Mobile TypeScript check
- **Command:** `npx tsc --noEmit`
- **Executed:** Yes (from `mobile/` directory)
- **Result:** PASS — exit 0, no type errors.

### T-012: Mobile ESLint
- **Command:** `npm run lint` (expo lint)
- **Executed:** Yes
- **Result:** PASS — exit 0; 1 warning: unused `eslint-disable` directive in `(app)/_layout.tsx`.

### T-013: Python dependency vulnerability audit
- **Command:** `.venv\Scripts\pip-audit`
- **Executed:** Yes
- **Result:** PASS — 0 known vulnerabilities.

### T-014: Frontend npm audit
- **Command:** `npm audit` (from `frontend/`)
- **Executed:** Yes
- **Result:** PASS — 0 vulnerabilities in 150 packages.

### T-015: Mobile npm audit
- **Command:** `npm audit` (from `mobile/`)
- **Executed:** Yes
- **Result:** 26 advisories (7 moderate, 19 high) — all in Expo's **build toolchain** packages (`braces`, `node-forge`, `uuid` chains via `metro/@expo/cli/config-plugins/xcode`). These packages are not included in the shipped JavaScript bundle. The only proposed fix (`npm audit fix --force`) would downgrade Expo from SDK 58 to SDK 44, which is a breaking change. **Not applied.** Mitigation: keep the Expo SDK updated with each release (`npx expo install --check`).

---

## Real-time messaging verification — 2026-11-02

The Phase 7 audit above is a frozen point-in-time record. The numbers below are
from the messaging implementation and are reported separately rather than
written over that record.

**Environment:** Windows 10 (19045), the repo virtualenv at `.venv` (Python 3.12),
Node 24.18, SQLite dev database, daphne ASGI server on `127.0.0.1:8010`, Vite dev
server on `localhost:5199`.

| Check | Command / surface | Result |
|---|---|---|
| Backend full suite | `../.venv/Scripts/python.exe backend/manage.py test core` | PASS — 425 tests, OK, exit 0 (~190s) |
| Messaging suite alone | `... manage.py test core.tests_messaging` | PASS — 101 tests, OK |
| Frontend suite | `npm test` (vitest) | PASS — 597 tests across 56 files, 25.3s |
| Frontend lint | `npm run lint` (oxlint) | PASS — 0 warnings, 0 errors on 197 files |
| Frontend build | `npm run build` | PASS — exit 0; `MessagesPage` chunk 32.00 kB / 9.84 kB gzip |
| Live end-to-end probe | `node track_e2e_probe.mjs` against daphne + real accounts | PASS — 24/24 checks |
| Dev-proxy socket policy | `node proxy_ws_check.mjs` through Vite | PASS — REST 200, upgrade accepted from the listed dev origin, refused from an unlisted origin |

### What the live probe covered

Every check ran against the real ASGI server, the real SQLite rows and the real
seeded accounts (`teacher1`, `student1`) — no mocks, no fixture transport.

- Handshake: single-use 30-second ticket, ticket replay refused, forged ticket
  refused, DRF `?token=` accepted for the native client, `Authorization` header
  accepted, missing Origin (native) accepted, `null` Origin refused.
- Authorization: a non-member's REST read is refused, and the same user's socket
  `subscribe` to that thread is refused with an `error` frame before any message
  data crosses the wire.
- Delivery: instant inbound push on `message.new`, `typing.update` in both
  directions, presence transitions, read and delivered receipts echoed to the
  other member.
- Integrity: per-conversation `seq` monotonic, duplicate `client_reference`
  returns the stored row with `duplicate: not created` and leaves one row,
  `sync since_seq` after a reconnect returns exactly the REST rows above the same
  watermark, messages written while a member is offline are stored and resumed.
- Limits: over-long and empty bodies refused, non-UUID `client_reference`
  refused, 60/min throttle enforced with a 429 on burst.
- Notifications: a bell item is created for a message to an idle recipient,
  reading the thread clears it, and an actively-viewing recipient gets no bell
  item (proven by the absence of a `message_received` row for the message sent
  while `viewing_since` was live).

### Defects the verification found and that are now fixed

1. `GET /api/notifications/` returned 500 for any user with a message
   notification: `NotificationSerializer.message` was an `IntegerField` bound to
   a foreign-key instance, so DRF tried `int(message)`. Now
   `source="message_id"`, with `conversation` exposed so the bell can deep-link
   into the thread. Covered by two regression tests.
2. `since_seq` / `before_seq` were parsed with an unguarded `int()`, so a
   hand-typed cursor was a server error. Now a 400 with an explanatory message.
3. `newReference()`'s fallback for origins without `crypto.randomUUID` produced a
   28-digit string (the dash consumed a digit slot), which the server's UUID
   column rejects — every send from a plain-http origin would have failed.
   Rewritten to emit a valid 8-4-4-4-12 v4 UUID; covered by tests.

### Follow-up: the detail column and action feedback

A first pass through the running screen found three things that answered to
nothing a user could see. All three are fixed, and four new tests cover them
(the frontend count above includes them).

- The header's details button and the panel's close button only rewrote a class
  no CSS rule read. At desktop width the column was hard-wired open, so pressing
  either changed nothing; at tablet width the drawer sat over the thread
  permanently and could not be dismissed. Both controls now move the column at
  every breakpoint, measured in the live page: at 1335px three tracks
  (320 / 356 / 300 px) become two (320 / 672) when hidden and three again when
  restored; at tablet width the grid is list + thread with the details closed,
  then a 340px absolutely-positioned drawer that the close button removes; at
  phone width exactly one column is on screen and each press moves it — thread →
  details → thread → list.
- Archive, Add member, Re-sync and Leave ran without any in-flight feedback: a
  round trip that fast looked identical to a dead button, and a second press sent
  a second write. The control that started the request now spins, every action
  goes inert for its length, and the result is said out loud
  ("Conversation archived.").
- The notice carrying those answers was rendered *after* a viewport-tall grid,
  so it fell below the fold — the click looked silent even when it worked. It now
  floats over the bottom edge (measured top 683px, bottom 731px inside a 733px
  viewport) and has its own dismiss control.
- Leaving a conversation is two presses, because nothing on that screen puts you
  back in.
- The page itself scrolled. `/messages` sized its grid with
  `100vh - topbar - one spacing token`, which cannot know how tall the shell's
  own content padding is (28px/48px at desktop, 18px/116px on a phone), so the
  document was exactly 44px scrollable at an 803px viewport. The page now asks
  the shell for a definite height and passes it down the flex chain
  (`:has(.messages-page)` keeps that reach scoped to this route only), so the
  columns fill the fold and only their own bodies scroll. Measured after the
  change: document `scrollHeight` 803 = `innerHeight` 803, `window.scrollTo(0,
  200)` leaves `scrollY` at 0, the grid runs to 755px with the composer bottom at
  754, the thread body scrolls 2262px of content inside a 502px box, and the same
  holds with the tablet drawer open and in the phone pane (one 659px column,
  composer at 754). A neighbouring route was probed to prove the reach does not
  leak: `/teacher/attendance` still scrolls normally (1405px in an 803px
  viewport).

### Not verified in this pass

- Narrow and medium layout were driven by stubbing `matchMedia` in the live page
  (the browser surface cannot be resized), so the page's own column gating and
  the class-based tablet rules are measured; the `@media (max-width: 767px)`
  block itself is still code-reviewed only.
- Browser web push end to end: inert until the deployment generates its own VAPID
  key pair (see `docs/KNOWN_LIMITATIONS.md` L-020); the subscribe path and the UI
  warning are tested, delivery to a browser is not.
- Multi-process fan-out: the dev channel layer is in-memory (L-019), so the
  simultaneous-user checks ran on one daphne process.
- Native mobile: the Expo client was not run against the socket in this pass; its
  `?token=` handshake is covered by backend tests only (L-023).
- No deployment was performed.

*Note (2026-11-02, later pass): the last two bullets are superseded. The Expo
client was driven live against a real daphne process with a **ticket** handshake,
and `REDIS_URL`'s configuration branch is now unit-tested — see
"Mobile messaging verification" further down. Cross-process fan-out itself is
still unproven on this machine.*

### Follow-up: the thread behaves like a chat client

The screen was then reworked to the conventions people already bring to a
messaging app, and the whole gate was run again after the rework.

| Check | Command / surface | Result |
|---|---|---|
| Backend full suite | `../.venv/Scripts/python.exe backend/manage.py test core` | PASS — 426 tests, OK, exit 0 (329s) |
| Messaging suite alone | `... manage.py test core.tests_messaging` | PASS — 102 tests, OK |
| Frontend suite | `npm test` (vitest) | PASS — 669 tests across 59 files, 21.2s |
| Frontend lint | `npm run lint` (oxlint) | PASS — 0 warnings, 0 errors on 200 files |
| Frontend build | `npm run build` | PASS — exit 0; `MessagesPage` chunk 40.59 kB / 12.49 kB gzip |
| Live probe | `http://localhost:5199/messages`, signed in as `teacher1` | PASS — measurements below |

What changed, and where it was measured:

- **Turns.** Consecutive rows from one speaker inside two minutes fold into one
  turn: one avatar, one name, and the clock line on the last bubble only. Live in
  a 35-row thread: 14 `.bubble-group` elements, 6 avatars (own bubbles carry
  none), one day divider, no stray sender names in a direct thread.
- **Delivered apart from read.** `ConversationMemberSerializer` now exposes
  `last_delivered_seq` next to `last_read_seq`, both read off columns the consumer
  already writes, so the first paint can say "reached the device" without waiting
  for a live frame. The tick walks Sent → Delivered → Read, and a read marker that
  sits below a row no longer prints a delivery the server never confirmed.
- **Where the new mail starts.** Opening a thread sends the read marker, so the
  unread split has to be caught while the list row still carries its count; that
  number is now held per thread and drawn as a `2 new` rule above the first turn
  that was unread — including on a deep link, where the thread and the list land
  in either order.
- **Scrolled back.** Measured live: setting `scrollTop` to 0 raises a sticky
  "Jump to latest" pill, pressing it returns the box to the bottom (2136px of
  overflow inside the thread) and the pill goes away; the page itself stays
  unscrollable throughout (`scrollHeight - clientHeight` measured 0).
- **Composer.** Autosize measured live: 4-line draft grew the field from 86px to
  108px with the 176px ceiling holding. Enter sends, Shift+Enter breaks a line,
  the remaining-character counter takes over inside the last 200, and an unsent
  draft survives leaving the thread and coming back — switching conversations and
  reading the field again showed the text in one thread and nothing in the other.
- **Message tools.** Copy and Quote sit on every bubble, revealed on hover and on
  keyboard focus. Quote put `> Ma’am, here is my portfolio draft.` into the draft
  live; a clipboard the browser refused left the button unchanged instead of
  claiming a copy.
- **Scanning the list.** All/Unread tabs carry counts (`All5` / `Unread0`), the
  preview starts with `You:` for your own last message, `Ctrl+K` moved focus to
  the search field in the live page, Escape clears it, arrow keys walk the rows,
  and the empty states say three different things depending on why the list is
  empty.
- **Sending.** Submitted from the live composer: the message appeared exactly once
  (pending copy replaced, not duplicated), the field emptied, Send went disabled,
  and its receipt read `Sent`.

Three defects this pass found and fixed:

1. A deep-linked thread never drew the unread divider — the count was captured in
   the render block that only runs when the open thread *changes*, which a first
   paint straight onto `?conversation=7` skips.
2. `receiptFor` fell back from a missing delivery marker to the read marker. That
   branch could only fire after the read branch had already returned, so it was
   dead code that promised a tick the server had not earned; it is gone.
3. The unseen-message count read a ref during render. It is state now, written by
   the same handlers that set the pinned flag, which also made the component
   lint-clean under `react(refs)`.

Then, from the running screen, a fourth: the page never used the width it was
given. `margin: 0 auto` on a flex item absorbs the free space instead of leaving
the cross size stretched, so `/messages` was shrink-wrapped to whatever its
columns wanted — measured 718px inside a 1023px route — and an empty thread asked
for least of all. The page now asks for `width: 100%` and keeps the 1440px cap
centred, and with the details column out the two remaining tracks take the freed
space instead of leaving a gap: measured live at a 1335px viewport, details in is
320 / 371 / 300, details out is 380 / 627, and the tablet grid is 300 / 707.
Bubble width is still capped at `min(640px, 78%)`, so the wider column does not
turn into a full-justified line of text.

Not verified in this pass:

- The in-app Browser surface was not attached, so there are no screenshots and no
  pixel review; every live number above is a DOM measurement taken through the
  running page, and the reduced-motion and `@media (hover: none)` rules remain
  code-reviewed only.
- The `N new` divider, the Unread filter and the typing indicator were verified in
  the page tests against the server's real response shapes and event frames. The
  dev account held no unread mail during the probe, and no second signed-in
  client was driven in this pass (the two-user behaviour was proven earlier by
  `track_e2e_probe.mjs`).

---

## Teacher Class Management Workspace verification — 2026-11-02

The My Classes redesign is reported separately from the Phase 7 audit and the
messaging work, in the same point-in-time style.

**Environment:** Windows 10 (19045), repo `.venv` (Python 3.12), Node 24.18, the
real SQLite dev database, daphne on `127.0.0.1:8010`, Vite on `localhost:5199`.
No backend code changed in this pass, so every figure below is derived from the
endpoints that already existed.

| Check | Command / surface | Result |
|---|---|---|
| Backend full suite | `../.venv/Scripts/python.exe manage.py test core` (from `backend`) | PASS — 426 tests, OK, exit 0 (351.9s) |
| Frontend suite | `npm test` (vitest) | PASS — 718 tests across 61 files, 28.4s |
| New derivation tests | `src/utils/classes.test.js` | PASS — 18 tests |
| New page tests | `src/pages/TeacherClassesPage.test.jsx` | PASS — 25 tests |
| Touched page tests | Attendance / Requirements / Submissions suites | PASS — 30 / 12 / 7 tests |
| Frontend lint | `npx oxlint` | PASS — 0 warnings, 0 errors on 203 files |
| Frontend build | `npm run build` | PASS — exit 0; `TeacherClassesPage` chunk 16.46 kB / 5.00 kB gzip |
| Live probe | `http://localhost:5199/teacher/classes`, seeded `teacher1` and `teacher2` | PASS — measurements below |

### Statistics checked against the API in the live page

Each figure the page prints was recomputed inside the browser from the same
teacher-scoped rows the page reads (`/teacher-assignments/`, `/sections/`,
`/students/`, `/requirements/`, `/submissions/?status=submitted`), so the
comparison is against the server, not against a sample.

| Account | Assignments | Unique sections | Unique students | Requirements | Pending | Page showed |
|---|---|---|---|---|---|---|
| `teacher1` (Teresa Reyes) | 2 | 1 | 4 | 6 | 0 | 2 / 1 / 4 / 0 — match |
| `teacher2` (Marco Dizon) | 1 | 1 | 2 | 3 | 1 | 1 / 1 / 2 / 1 — match |

`teacher1` teaches two subjects in the *same* section, and that is the case the
dedupe rule exists for: 2 assignments produced 1 section and 4 students, not
2 sections and 8 students. Per-card requirement counts (2 + 4) summed to the 6
the API returned, and the pending KPI counted only rows in `Awaiting
verification`.

### Class context hand-off (`?class=<assignment id>`)

Verified live on `teacher1`'s English assignment (id 2):

- Requirements — banner `Showing requirements for English — Grade 7 —
  Sampaguita (2026-2027)` plus a *Show all classes* escape, and the create form
  opened with `#req-class` already set to `2`.
- Submission Review — same banner, the list narrowed to that class, and the
  empty state said *No student has sent work for this class that matches the
  filter* rather than the generic one.
- Attendance — `#filter-class` arrived pre-selected on `2`, and the history
  panel (`#hist-class`) opened on `2` too, listing 7 of 17 sessions with only
  English rows present; *Clear history filters* restored the other class.

### Responsiveness measured, not assumed

The page was loaded in same-origin frames at three widths; `horizontal overflow`
is `scrollWidth - clientWidth` of the document element.

| Viewport | Class grid | KPI columns | Hero layout | Horizontal overflow | Card width |
|---|---|---|---|---|---|
| 1440×900 | 3 tracks | 5 | row | 0 px | 341 px |
| 820×1024 | 2 tracks | 3 | column | 0 px | 358 px |
| 390×844 | 1 track | 1 | column | 0 px | 321 px (40 px buttons) |

Interaction on the live card: *Open class* flipped `aria-expanded` false → true,
`aria-controls="class-detail-2"` resolved to a panel holding the four real
roster names with LRNs, the published requirements with their pending counts,
and the three scoped links; the button relabelled to *Close class*. Search, the
no-match empty state (`Nothing in your 1 assignment matches this search`) and
*Clear filters* were driven through the real inputs.

### Defects this pass found and fixed

1. The history panel of Attendance kept its own class filter and ignored
   `?class=`, so the hand-off only narrowed the take-attendance list. It now
   receives `initialClassId` and opens scoped, matching the session list.
2. Two controls shared the accessible name *Filter by class* (the session list
   select and `#hist-class`), which made the scoped state ambiguous to query and
   to a screen reader. The history control's label now matches its `aria-label`,
   *History class filter*.
3. `formatCount(value, noun)` appends `s` and takes no plural argument, so
   `formatCount(n, 'class', 'classes')` would have printed *classs*. The hero
   line builds the plural itself.

### Not verified in this pass

- A teacher account with **zero** assignments: the dev database has only
  `teacher1` and `teacher2`, both of which hold work. The empty, no-match and
  missing-school-year states are covered by page tests against the real
  response shapes, not by a live account.
- Screenshots: this conversation's browser surface refuses viewport capture
  (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), so the live evidence above is DOM and
  computed-style measurement rather than images.
- Grades: no model, route or endpoint exists for them, so the workspace links
  to the five modules that do exist and reports the sixth as absent instead of
  pointing at a dead route.

---

## My Classes as the central teacher workspace — 2026-11-02

Supersedes the two open items at the end of the previous section: the teacher
sidebar no longer carries Requirements / Submission Review / Attendance /
Grades as stand-alone entries, and Grades is no longer reported as absent — it
is now an activity inside each class, built from the verification and
attendance rows that already exist.

**Environment:** Windows 10 (19045), repo `.venv` (Python 3.12), Node 24.18, the
real SQLite dev database, daphne on `127.0.0.1:8010`, Vite on `localhost:5199`.
No model, endpoint or migration changed: the restructuring is routes,
derivation and presentation over the API that already existed.

| Check | Command / surface | Result |
|---|---|---|
| Backend full suite | `../.venv/Scripts/python.exe manage.py test core` (from `backend`) | PASS — 426 tests, OK, exit 0 (397.0s) |
| Frontend suite | `npx vitest run` | PASS — 789 tests across 62 files |
| Derivation | `src/utils/classes.test.js` | PASS — 37 tests |
| Hub | `src/pages/TeacherClassesPage.test.jsx` | PASS — 29 tests |
| Workspace shell | `src/pages/TeacherClassWorkspace.test.jsx` | PASS — 33 tests (new file) |
| Navigation config | `src/config/navigation.test.js` | PASS — 32 tests |
| Reused modules (embedded) | Requirements / Submissions / Attendance suites | PASS — 15 / 10 / 34 tests |
| Frontend lint | `npx oxlint` | PASS — 0 warnings, 0 errors on 209 files |
| Frontend build | `npm run build` | PASS — exit 0; `TeacherClassWorkspace` 26.4 kB, `TeacherClassesPage` 12.5 kB, `AttendancePage` 49.3 kB (10.5 kB gzip) |
| Live probe | `teacher1` and `teacher2` on the dev server | PASS — measurements below |

### What the live teacher sees

Sidebar (both accounts, every route): `Dashboard · My Classes · Announcements ·
Messages · Notifications · Profile` — six entries, nothing class-specific.
The legacy screens still resolve at their old URLs (`/teacher/requirements`,
`/teacher/review`, `/teacher/attendance`) and are titled correctly; they are
simply no longer offered in the menu.

Hub (`/teacher/classes`) for `teacher1`: hero greeting + `SY 2026-2027`, KPIs
`2 subject assignments · 1 assigned section · 4 students · 0 pending`, one
section room card (`Grade 7 — Sampaguita`, `2 subjects · 4 students · Adviser
Teresa Reyes`) carrying `62.9% present across 18 sessions` and `16 sessions
still missing marks`, plus subject rows that open `/teacher/classes/2` (English)
and `/teacher/classes/1` (Mathematics). Search, status filter, sort and the
students disclosure were driven through the real controls.

Class workspace (`/teacher/classes/1/…`), each activity checked against the
rows the API returns for that assignment only:

| Activity | Live evidence |
|---|---|
| Overview | class trail `My Classes / Grade 7 — Sampaguita / Mathematics`, sibling chip → `/teacher/classes/2`, attention list (10 sessions unmarked, 11 pieces of work missing across 4 closed deadlines) with links into the right activity, four KPI links, timetable (Monday 07:30–08:30), 4 closed deadlines with per-requirement `3/4 handed in`, attendance rollup `Present: 11 of 19` |
| Students | 4 enrolled students with LRNs and per-student work/mark links |
| Requirements | 4 Mathematics requirements only (English's 2 absent), no page header, `Only this class is listed` note, *New requirement* prefilled, no *Show all classes* escape |
| Submission review | 5 Mathematics submissions (4 English rows absent), `0 awaiting verification` badge, no page header, no scope banner |
| Attendance | `11 of 18 sessions`, locked: neither `#filter-class` nor `#hist-class` is rendered; groups `Today's (1) · Upcoming (1) · Recent History (9)`, all Mathematics / Grade 7 — Sampaguita |
| Grades | statement that TRACK stores no numeric score, then the matrix: 4 requirement columns × 4 students plus an attendance column (`66.7% · 4/6`), `3/4 in · …% verified` headers, print view |

### Isolation

- `teacher1` → `/teacher/classes/3/grades`: *This class is not yours to open —
  Assignment 3 is not among the 2 classes this account can reach*, with no tab
  rail and no data. The activity slug is ignored while refusing.
- `teacher2` → `/teacher/classes/1/grades`: same refusal, worded *the 1 class*.
- `teacher2`'s own hub is a different world: `1 assignment · 1 section · 2
  students · 1 submission awaiting verification`, one room
  (`Grade 8 — Gumamela`) opening `/teacher/classes/3`, whose review queue holds
  exactly its 3 Science submissions.
- Server-side scoping is unchanged and still enforced by the 426 backend tests
  (session history, submissions and dashboards are already teacher-filtered);
  the frontend never receives foreign rows to hide.

### Responsiveness measured, not assumed

Same-origin frames, `scrollWidth - clientWidth` of the document element:

| Viewport | Surface | Horizontal overflow | Widest element inside `main` |
|---|---|---|---|
| 1440 | hub / attendance activity | 0 px | `route-view` 1097 px (content cap) / `tabs` 928 px |
| 885 | hub / grades matrix | 0 px | `table-wrap cw-matrix-wrap` 1223 px — scrolls inside its own wrapper |
| 415 | hub / grades matrix | 0 px | `tabs` 856 px — the activity rail scrolls horizontally, KPI grid collapses to 1 column |

### Defects this pass found and fixed

1. `groupRowsBySection()` merged attendance without computing `presentRate` or
   `lastDate`, so every section room on the hub reported *no marks yet* even
   with sessions on record. Both fields are now derived with the same rule the
   server uses.
2. The hub rendered two `h1`s (the shared `PageHeader` and the hero greeting).
   The hero is the page's `h1`; `PageHeader` stays in the error branch.
3. Embedded Submission review was always empty: the requirements fetch that
   builds the class scope was disabled while the scope filter still applied.
   The workspace now hands the module the requirement ids it already has
   (`requirementIds`, sorted for a stable queue), which also drops a duplicate
   request.
4. Attendance kept a stale class across sibling navigation — moving from one
   class's attendance to another's could stay filtered on the first class,
   because the locked id was only read when the state was seeded. Both the
   session list and the history panel now derive the class from the route on
   every render; *Clear* resets the optional filters, never the class.
5. `formatCount(n, 'class')` printed *classs* in the refusal copy; the plural is
   built in the sentence.

### Known behaviour, deliberately not changed

- The workspace fetches the seven class lists once per document load and keeps
  them mounted across activities, but each reused module still reads its own
  endpoints when its activity opens (network trace: entering Attendance issues
  its four GETs and one `POST /attendance/generate/`). Generation is scoped to
  the calling teacher and skips days that already have a session, so tab
  clicking adds no rows — it is chatter, not drift.
- A teacher account with **zero** assignments is still not covered live (the dev
  database has only `teacher1` and `teacher2`, both with work); the empty,
  no-match and missing-school-year states are covered by page tests against the
  real response shapes.
- Screenshots remain unavailable in this conversation's browser surface
  (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), so the live evidence is DOM and
  computed-style measurement.

### Attendance Management Module redesign — 2026-11-02

The teacher attendance screen was rebuilt in place as a management module: a
four-card dashboard over server-computed totals, Sessions / Attendance history as
the primary tabs, a hybrid card-and-list session board, a one-pass recording
sheet that saves the whole register in a single request, and a history that reads
from the server page by page. Student, parent and administrator attendance keep
their own screens and were re-verified, not re-designed.

**What changed behind it.** `backend/core/views.py` gained one shared filter
helper (`attendance_session_filters`) plus `SESSION_ORDERING` / `RECORD_ORDERING`,
query-param filtering, sorting and search on both attendance list endpoints, a
`?brief=1` row shape with per-session counts annotated in SQL, and a bulk
`POST /attendance/sessions/<id>/records/` that writes the register inside one
transaction. Migration `0013_attendance_scalability_indexes` adds indexes only —
no field, no table, no data touched. The old nested session shape and every
existing route still work; the mobile app is unaffected. `Missed` is derived in
the UI (past + not completed), because the model has no such status.
`frontend/src/pages/AttendancePage.jsx` went from 2,562 lines to a 49-line shell
over 13 modules in `pages/attendance/`, plus `hooks/useServerList.js`,
`hooks/useServerCounts.js` and `utils/attendance.js`. History is inspect-only: the
session-delete affordance is gone and there is no DELETE endpoint behind it.

**Environment.** Windows 10 (19045), repo `.venv`, Node 24.18, the real SQLite dev
database. The two long-running dev servers on `127.0.0.1:8000` / daphne `:8010`
were started before this work and still serve the pre-redesign code (a `?brief=1`
row there has no `record_count`/`enrolled`, and `?date=` is ignored), so the probe
ran against a fresh pair: `manage.py runserver 127.0.0.1:8020 --noreload` and
`VITE_PROXY_TARGET=http://127.0.0.1:8020 npx vite --port 5203`.

| Check | Command | Result |
|---|---|---|
| Backend full suite | `manage.py test` (from `backend`) | PASS — 475 tests, OK, exit 0 (422.7s) |
| Attendance backend suite | `core/tests_attendance.py` (inside the 475) | PASS — filters, ordering, brief shape, bulk save, indexes |
| Frontend suite | `npx vitest run` | PASS — 875 tests across 66 files (29.6s) |
| Attendance page suite | `src/pages/AttendancePage.test.jsx` | PASS — 46 tests (new file; the 1,073-line legacy suite is retired) |
| List hooks | `useServerList.test.jsx` / `useServerCounts.test.jsx` | PASS — 12 / 6 tests |
| Frontend lint | `npx oxlint --max-warnings=0 src` | PASS — 0 warnings, 0 errors on 227 files |
| Frontend build | `npm run build` | PASS — exit 0; `AttendancePage` 55.56 kB (13.59 kB gzip) |
| Data integrity after the live probe | read-only `manage.py shell` query | PASS — 47 records, 0 duplicate `(session, student)` pairs, 0 null FKs |

### What the live teacher sees (`teacher1`, 1335 × and 415 × viewports)

Dashboard cards read the database, not the page: `Today's Sessions 1 ·
Completed Sessions 4 · Pending Sessions 14 · Assigned Students 4`, with tones
default/green/amber/default. The four cards cost four `page_size=1` GETs —
`date=2026-11-02`, `status=completed`, `status=outstanding`, `students/?page=1` —
so the numbers cannot drift when a teacher has more than one page of sessions.

Sessions board: one `is-completed` card for today (`Mathematics · Grade 7 —
Sampaguita · 07:30 · Complete · 4/4`) with exactly one action button, and one
upcoming row for Nov 9 with its single `Take attendance` action. Filters are the
server's: search, class, subject, status (`Not started / In progress / Completed /
Missed`) and date.

History is server-paged and proved it: 18 sessions at `page_size=20`, then
`page_size=10` → `Showing 18 of 18` across two pages, page 2 returning the eight
older rows; `status=missed` returned 13 of 13 (matching the derived count), and
`Newest first` / `Oldest first` both re-read with `ordering=-date` / `date`.
Rows carry `View details` only — no edit, no delete. `By student` searched the real
roster (`Sofia Cruz · Juan Dela Cruz · Angel Lopez · Joel Santos`), and Juan's
record list came back as 3 server-paged rows with a status filter and a
`View session` jump.

Recording sheet (session 21, completed, 4 enrolled): live counters moved with the
marks (`4 Present → 3 Present 1 Absent` after one click, `4 Present 0 Unmarked`
after `Mark all present`), the dirty label tracked the diff (`1 unsaved change`,
`4 unsaved changes`) and returned to `All changes saved` when a mark was undone —
so undoing a click costs no request. Keyboard worked on the real widget: `ArrowRight`
from `att-1-present` moved focus to `att-1-absent` and checked it. `thead` is
`position: sticky` inside a scroll box capped at `calc(100vh - 320px)`.

Saving was driven twice against the live endpoint and sent **one** POST each time:
`POST /api/attendance/sessions/21/records/ [200]`, then a re-read of the session
and the four count reads. Three rapid presses of *Save attendance* produced one
request (the button disables mid-flight) and one announcement,
`1 mark saved · session completed`. Pressing *Save* with the register complete on a
`not_started` session raised `Finalize this session?` — cancelled, then
`Discard unsaved changes?` — confirmed, and the network log shows no write for
either. Session 21 was returned to its original state (4 present, no notes) and
session 22 was never written; the final DB read confirms it.

Responsiveness was measured in a same-origin frame at a true 415 × 880 viewport
(the browser surface here still cannot resize or screenshot, so this is DOM and
computed-style evidence): document scroll width 400 px — no horizontal overflow;
the primary rail becomes a full-width pill strip (372 px); the four stat cards
stack at 372 px; the day card and the upcoming row sit at 342 px; the roster
table renders as stacked blocks with `thead` hidden and each cell carrying its
`data-label` (`Student`, `Student ID`, `Status`, `Notes`); the save bar stays
`sticky` above the mobile dock; the history table and pager fit with the filter
row wrapping to 213 px.

Other portals re-checked with real accounts on the same server: `/admin/attendance`
(one bounded `brief=1&page_size=20&ordering=-date` read, `View details` only,
`admin-search / -from / -to / -status / -sort`) and `/student/attendance`
("My Attendance", 12 records over one `page_size=20` read plus five `page_size=1`
count reads). No attendance screen used `api.list` any more — the ten-page crawl is
gone from this module's network trace.

---

### Cross-portal polish pass — 2026-11-02

One sweep over the four authenticated shells (admin, teacher, student, parent)
and the registrar's enrollment screens, driven by the items the earlier
design-system phases had deferred. No model, endpoint, migration or public page
changed: this is the confirmation primitive, the loading/empty/error states, the
type and spacing cascade, long-table headers and the phone-width tab rail.

#### Files changed

| File | Change |
|---|---|
| `components/ConfirmDialog.jsx`, `context/ConfirmContext.js`, `context/ConfirmProvider.jsx` | new — the app's own yes/no dialog, one provider-owned instance, `confirm(request) -> Promise<boolean>` |
| `main.jsx` | `<ConfirmProvider>` installed between `AuthProvider` and `App` |
| `pages/UsersPage.jsx`, `DepartmentsPage.jsx`, `SectionsPage.jsx`, `AssignmentsPage.jsx`, `SystemSettingsPage.jsx`, `AnnouncementsPage.jsx`, `AdminFeesPage.jsx`, `AdminFeeCategoryDetailPage.jsx`, `AdminFeeAssessmentDetailPage.jsx` | ten `window.confirm` gates → `await confirm({...})`; five failure `alert()`s → in-page error surfaces |
| `index.css`, `App.css`, `AnnouncementsPage.css` | `.btn-xs`/`.btn.btn-xs` geometry in one token-layer rule (legacy twin deleted), `.table-wrap--pin`, `.confirm-message`/`.confirm-detail`, `.progress-fill.navy` made explicit, redundant `.announcement-actions .btn-xs` removed |
| `pages/SchedulesPage.jsx`, `pages/dashboards/TeacherDashboard.jsx`, `pages/enrollment/RegistrarDashboard.jsx` + `RegistrarEnrollment.css`, `pages/TeacherClassWorkspace.css` | `responsive-table` on the schedule grid, live `InlineLoader` on the dashboard footnote, `enr-stat-grid` → shared `kpi-grid`, phone tab rail as a grid |
| Fifteen admin/enrollment/dashboard JSX files | inline `gap`/`padding`/`margin`/`font-size` literals → the spacing and type tokens that compute identically |
| `UsersPage.test.jsx`, `SectionsPage.test.jsx`, `App.test.jsx`, `test/confirm.jsx`, `context/ConfirmProvider.test.jsx`, `enrollment/RegistrarDashboard.test.jsx` | specs drive the real dialog instead of stubbing `window.confirm`; 7 new primitive tests |

#### Functionality preserved

- Every guarded write keeps its old shape: the call still sits in front of the
  request and a declined dialog still runs nothing. The row button, the busy
  state, the reload after a write and the server's own refusal copy are
  untouched — only the question moved from a browser chrome into the page.
- Failure copy that used to disappear into an `alert()` now stays next to the
  rows that caused it (`actionError` banner on Announcements, `saveError` on the
  two fee detail pages, a `categoryError` on the Fee Categories card).
- No new endpoint, no new dependency, no route or navigation change; the public
  landing, public track and `/enroll` wizard were left alone, including their
  inline styles.

#### Tests actually run

| Check | Command | Result |
|---|---|---|
| Frontend suite | `npx vitest run` | PASS — 882 tests across 67 files, three consecutive green runs during and at the close of this pass (29.5s, then 35.7s) |
| New primitive | `src/context/ConfirmProvider.test.jsx` | PASS — 7 tests (labels, accept, decline, Escape, replaced request, string form, provider-less throw) |
| Dialog specs | `UsersPage.test.jsx` / `SectionsPage.test.jsx` | PASS — 15 / 16 tests, both now clicking the real dialog |
| Frontend lint | `npx oxlint src` | PASS — 0 warnings, 0 errors on 232 files |
| Frontend build | `npm run build` | PASS — exit 0; `index` 382.76 kB (111.28 kB gzip), `UsersPage` 20.04 kB, `SectionsPage` 21.64 kB |
| Backend suite | not re-run | **not verified this pass** — `git status` confirms no file outside `frontend/src` changed, so the 475-test baseline recorded in the attendance section still stands |

#### Live measurements (`admin`, `teacher1` on the dev server)

The browser surface here still cannot screenshot or resize
(`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), so this is DOM and computed-style
evidence, read from the running app and from same-origin frames.

| Surface | Measured |
|---|---|
| `/admin/teachers` header | `.table-wrap--pin` `overflow-x: auto`, `max-height: 546.04px`, `thead th` `position: sticky; top: 0px` over 2 rows |
| `/admin/audit-logs` header | 172 rows in a scrollable wrapper; after `scrollTop = 240` the header's top sits **0 px** from the wrapper's top with its inset bottom rule painted — the sticky header is real, not declared |
| Deactivate dialog | `aria-label="Deactivate Marco Dizon?"`, body *"…will not be able to sign in until the account is reactivated. No record of theirs is deleted."*, footer `[Cancel] [Deactivate]` (`btn btn-danger btn-sm`), panel `max-width: 460px`; **Escape** closed it and restored `body` scroll |
| Discard dialog | Typed a title, pressed Cancel → a second panel `Discard unsaved changes?` opened over the form (both labelled, no `window.confirm`); confirming closed both, posted nothing, and the page returned to the list |
| Announcements row actions (desktop) | 8 `.btn-xs`, all exactly **28 px** tall, `font-size: 13px`, `padding: 0 10px`, `gap: 6px`; `.btn-sm` still 32 px — the consolidated rule computes what the deleted legacy pair did |
| Announcements row actions (415 px) | `.btn-xs` **42 px** (`min-height: 42px`), `.btn-sm` 42 px — the phone touch target survives the consolidation |
| Registrar KPI row | `.kpi-grid` (was `.enr-stat-grid`): `display: grid`, `grid-template-columns: 240px 240px 240px`, `gap: 16px`, 8 `.stat-card`s from the live dashboard payload |
| Class rail, 415 px | `display: grid`, `grid-template-columns: 180px 180px`, `overflow-x: visible`, tabs **40 px** tall, document `scrollWidth` 400 → **no horizontal overflow** (was a 856 px scrolling strip) |
| Class rail, 520 / 700 px | 3 columns (153.7 px / 213.7 px), 40 px tabs, no overflow; 1100 px is unchanged: `display: flex`, `overflow-x: auto`, `position: sticky` |
| Phone buttons in the 415 px frame | `.btn-sm` measures **42 px** — the legacy touch-target rule still wins below 768 px, which is why `min-height` was left one class deep |

#### Why the earlier sticky headers did nothing

`position: sticky` on a `thead` needs a real scrollport. `.table-wrap` sets
`overflow-x: auto`, and CSS resolves the paired `overflow-y` from `visible` to
`auto` — so with no height bound the wrapper never actually becomes scrollable
and a bare sticky header silently does nothing. `.table-wrap--pin` therefore
bounds the wrapper (`max-height: min(68vh, 680px)`) **and** styles the header;
only the three genuinely unbounded tables took the modifier, so ordinary paged
tables keep their natural height.

#### One defect this pass introduced and its own probe caught

Consolidating `.btn-xs` into a single token-layer rule wrote the geometry onto
`.btn-xs, .btn.btn-xs` together. The compound selector was needed so App.css's
later `.btn { height: 40px }` cannot outbid the size — but the same (0,2,0) also
outbid the phone block's `.btn { min-height: 42px }`, so at 415 px the row-action
buttons measured **28 px**, undoing the touch target Phase 6 added. Found by
measuring the 415 px frame rather than trusting the desktop number: the
`min-height` lift is now restated at the same specificity inside
`@media (max-width: 767px)` (`index.css:176-184`), and both widths are in the
table above.

#### A test that only passed when the machine was idle

`TeacherClassWorkspace.test.jsx` "opens each reused module scoped to this class"
failed twice in this session's full runs and passed on every isolated run. The
cause is in the test, not the app: the three reused modules are `lazy()` imports
(`TeacherClassWorkspace.jsx:21-23`), so asserting with `getByTestId` on the line
after a tab click only works if Vite has already resolved that chunk — under
contention it has not. The three assertions are now `await findByTestId(...)`,
which waits for the Suspense boundary like the browser does. Two consecutive
full runs after the change: 67 files / 882 tests green both times.

#### Two reported defects were stale

Open-issues items 2 (`btn-xs` not 28 px) and 8 (`StatCard` navy/blue tones)
were re-measured before being "fixed": every `btn-xs` in the app computes 28 px
on desktop and 42 px on a phone, and all five `StatCard` tones already resolve to
their own token. `.progress-fill` was already `--navy-800` by default — the
`navy` tone was never broken, it just had no rule of its own, so it now has one
instead of relying on fall-through.

#### Remaining issues

1. **Off-scale type literals stay.** The pass normalised only where a token
   computes the identical value. `0.85 / 0.82 / 0.9 / 0.92 / 0.87 / 1.1rem` have
   no matching token in the scale, so ~15 inline font sizes (and the 6 px /
   10 px gaps that only exist as `.gap-xs`/`.gap-sm`, plus `width: 42%`,
   `maxHeight: 340px`, `top: -8px`) are still literals. Converting them would
   shift text sizes on already-approved screens.
2. **The public side keeps its own literals.** `pages/enrollment/` — the wizard,
   landing and requirements pages — still uses inline `gap: 6 / 8` and
   `fontSize: '0.75rem'`. Those pages are outside this pass by the standing
   guardrail, and `.gap-xs`/`.gap-sm` already give them the same values; no
   native dialog survives anywhere in the frontend (the mobile app never had
   one).
3. **Not driven live:** the fee screens' new `saveError` / `categoryError`
   banners and the Announcements pin/unpin failure banner. Nothing was deleted,
   archived or pinned against the dev database in this session — the deliberate
   rule is not to create or destroy records unasked — so those three paths are
   covered by their specs and by the same `ErrorMessage` component the pages
   already rendered for their own save failures.
4. `useConfirm()` throws outside `<ConfirmProvider>`, which is why three page
   suites had to be wrapped; any future screen rendered in a bare test harness
   needs `renderConfirmed()` from `src/test/confirm.jsx`.

---

### Schedules portal rebuild — 2026-11-02

The last Phase-3 holdout. `/admin/schedules` was 1,305 lines in one file with
inline-styled summary cards, its own delete confirmation, off-scale type
literals, a filter dropdown fed by a second crawl on every visit, and a
five-day week that silently dropped Saturday and Sunday rows the model already
allowed. It is now a 346-line container over nine `components/schedules`
modules, the shared primitives, and 99 tests where it previously had 28
(all of them duplicates of the util specs).

#### Files changed

| File | Change |
|---|---|
| `pages/SchedulesPage.jsx` | 1,305 → **346** lines: state, fetch, save/delete orchestration only — no markup for the grid, filters, panels or modals left in the page |
| `components/schedules/` (new, 9 files) | `TimetableGrid.jsx` 326 (+ `TimetableSkeleton`), `ScheduleFormModal.jsx` 340, `ScheduleList.jsx` 101, `ConflictPanel.jsx` 126, `ScheduleSummary.jsx` 84, `ScheduleFilters.jsx` 64, `UndoToast.jsx` 40, `ScheduleDetailModal.jsx` 54, `subjectColors.js` 42 |
| `utils/schedules.js` | 140 → **409** lines: seven-day `DAYS_OF_WEEK`, `timetableDays` (Mon–Fri always, a weekend day once used), `todayWeekday` pinned to Asia/Manila, `filterOptions`, `detectConflicts` with named reasons, `groupConflicts`, `reasonsBySchedule`, `scheduleSummary` |
| `pages/SchedulesPage.css` | rewritten, 810 → 1,118 lines, **token-only**: no `rem`, no numeric `font-size`, no raw hex; sticky headers on `thead th` with hairlines carried in `box-shadow`; the permanent `sched-pulse` keyframe deleted; 1023/767/479 breakpoints, `prefers-reduced-motion`, and `@media print` |
| `pages/SchedulesPage.test.jsx` | 428 → 716 lines; **28 duplicated util tests → 37 page/component tests** |
| `utils/schedules.test.js` (new) | 798 lines, **62 tests** over the overlap, labelling, grouping and filter helpers |
| `components/Icon.jsx`, `components/StatCard.jsx`, `index.css` | additive: `alertTriangle` / `list` / `moreVertical`; `StatCard onClick` → `stat-card-button`; one token-layer rule for that button |

No endpoint, serializer, model, migration or route changed, and no backend file
was touched — the weekend gap was purely a frontend constant (`DAYS_OF_WEEK`
stopped at 5 while the model allows 1–7).

#### Functionality preserved

- Every existing behaviour moved rather than changed: add / edit / detail /
  delete, the browser-side double-booking block, the softer 20-minute and
  shared-room warnings that do not block, room suggestions, the timetable/list
  toggle, the week label, and the delete-and-undo round trip.
- The delete gate is the shared `useConfirm()` dialog now, with the same
  refusal semantics (a declined dialog runs nothing), and the old inline
  confirm plus its `.sched-summary-card` styles are gone — `sched-summary*`,
  `sched-empty-row` and `btn-group` have zero references repo-wide.
- Admin-only access, the `/admin/schedules` route and every request path are
  unchanged. `.sched-*` / `.timetable-*` namespacing kept the screen
  self-contained, so no page wrapper was needed.
- Figures that cannot be derived show an em dash, never a `0` — the failure
  state keeps all four cards and their "Could not be counted" hints.

#### Tests actually run

| Check | Command | Result |
|---|---|---|
| Schedules page | `npx vitest run src/pages/SchedulesPage.test.jsx` | PASS — 37 tests in 9.0s |
| Schedules utils | `npx vitest run src/utils/schedules.test.js` | PASS — 62 tests in 2.7s |
| Frontend suite | `npx vitest run` | PASS — **953 tests across 68 files** (35.5s); the baseline before this phase was 67 files / 882 tests |
| Frontend lint | `npx oxlint src` | PASS — 0 warnings, 0 errors on 242 files |
| Frontend build | `npm run build` | PASS — exit 0; `SchedulesPage-DxOeKULg.js` 27.45 kB (7.53 kB gzip), `index` 382.78 kB (111.30 kB gzip) |
| Dead CSS | class-by-class `grep` of every `.sched-*` / `.timetable-*` selector against the JSX | 0 unused rules |
| Backend suite | not re-run | **not verified this pass** — no file outside `frontend/src` and `docs/` was modified |

#### Live measurements (`admin` on the dev server, `/admin/schedules`)

The browser surface still cannot screenshot or deliver trusted input
(`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), so this is DOM, computed-style and
network-log evidence read from the running app; dialogs were driven with DOM
clicks.

| Surface | Measured |
|---|---|
| Requests on entry | exactly one `GET /api/schedules/?page_size=100` and **no** `/api/teacher-assignments/` — the crawl the old page ran on every visit is gone; the two assignment GETs later in the log came from the Add and Edit dialog mounts (`ScheduleFormModal.jsx:35`) |
| Write safety | the whole probe's fetch/xhr log is GET-only; the delete confirm was opened and cancelled and the single live row stayed (`timetable-card` count 1 → 1) |
| Add dialog exits | Cancel: `dialogs 1 → 0`, route unchanged. `Close dialog` ×: same. Escape: same, via a `document` `keydown` — a *trusted* `press_key Escape` never reached the page, the same input limitation as pointer clicks |
| Dialog state after each exit | `body.style.overflow` back to default (scroll lock released), no stray `[role=dialog]`, no `iframe` left from earlier width probes |
| Delete confirm | `Delete Schedule?` · "Remove Mathematics · Grade 7 — Sampaguita (2026-2027) · Monday 07:30–08:30 from the weekly timetable?" · footer `[Cancel] [Delete Schedule]` — the shared `ConfirmDialog`, not page markup |
| Card menu | `.timetable-card-menu-trigger` → `[Edit] [Delete]`; Edit opens `Edit Class Schedule` with `Save Changes`, Cancel closes it and PATCHes nothing |
| Filter selects | 4 fields, each `LABEL+SELECT`; teacher `Teresa Reyes`, section `Grade 7 — Sampaguita (2026-2027)`, subject `Mathematics`, and the day select lists **all seven days** |
| Narrow + clear | Friday → 0 blocks and the `No matching schedules` empty state; Clear reset all four selects and restored the grid (1 card, 6 header cells = time column + Mon–Fri) |
| Headline figures | `Scheduled periods = 1`, `Classes today = 1`, `Teachers scheduled = 1`, `Scheduling conflicts = 0` — with zero conflicts the fourth card is not a button (`stat-card-button` count 0) |
| Column maths (forced) | `.timetable-table` `min-width` 828 / 976 / 1,124 px at `--tt-cols` 5 / 6 / 7 — a weekend row widens the grid instead of vanishing |
| Narrow viewports (same-origin frames) | 767 and 390 px: toolbar stacks, filter field 690 px wide, `.sched-view-toggle .btn` 40 px tall, KPI grid 2-col then 1-col, table scrolls inside its own container, `documentElement.scrollWidth === clientWidth` |
| Console | 3 messages, all vite/React-DevTools chatter — no React warning, no runtime error |

#### Six latent defects this pass surfaced

1. **`ScheduleFilters` crashed on mount** — `TypeError: Cannot read properties
   of undefined (reading 'map')`: the component indexed `options['teacher']`
   while `filterOptions()` returns plural keys. It blank-screened the portal;
   the new page tests found it on their first run.
2. **The teacher filter keyed on the wrong id.** The selects were built from
   assignment-row ids, so "filter by teacher" matched nothing. Narrowing is now
   keyed on the person (`applyFilters` + `filterOptions` in `utils/schedules.js`).
3. **The dialog's double-booking warning could never fire.** The old inline
   check compared `d1?.teacher_id === d2?.teacher_id`, but the two sides are not
   the same shape: `teacher_assignment_detail` on a schedule serializes
   `teacher_id` / `section_id` (`backend/core/serializers.py:836-839`) while the
   `/teacher-assignments/` row the dialog looked up serializes `teacher` /
   `section` (`:585-588`). Left-hand side permanently `undefined`, so the
   comparison was always false and an admin could save a teacher or a section
   into two overlapping classes with no warning — the server has no overlap rule
   either. `ScheduleFormModal` now normalises the assignment row into the
   schedule shape before comparing, and guards both sides for truthiness, and
   the same ids feed `detectConflicts` for the grid.
4. **Five icons rendered nothing** — `alertTriangle`, `moreVertical` and `list`
   were never in `Icon.jsx`, and the page used `x` / `rotateCcw` where the set
   has `close` / `undo`. The card menu trigger and the conflict badge were
   invisible in practice.
5. **The Add dialog could not be closed** — `onClose={() => openForm(null)}`
   set `formOpen` back to `true`, so Cancel stacked another dialog (the probe
   showed three open at once with the footer `[Cancel] [Add Schedule]`). Fixed
   with an explicit `closeForm()` that clears both halves of the dialog's
   identity, and pinned by two regression specs.
6. **A refresh blanked the week** — `loaded` was gated on `!loading`, so the
   grid and the figures disappeared on every background re-read. Now
   `loaded = !failed && data !== null` and only the *first* read shows the
   skeleton, so the previous week stays legible until the new one lands.

#### Remaining issues

1. **No live weekend row.** Saturday/Sunday can now be created, are counted,
   and get their own column — but the dev database holds one Monday period and
   the rule for this project is not to create or destroy records unasked. The
   weekend column and the "conflict names Saturday" behaviour are proven by
   specs and by the forced `--tt-cols` measurement, not by a live row.
2. **Not driven live:** the conflict panel opening from its KPI card and the
   delete → undo toast round trip, for the same reason — one needs a
   double-booked pair, the other a real DELETE. Both are covered by their
   specs.
3. **Trusted keyboard input is unavailable in this probe surface**, so Escape is
   verified against the shared trap in tests (`ConfirmProvider.test.jsx`) rather
   than by a real key press here.
4. **One unexplained navigation mid-probe**: the tab moved itself to
   `/admin/dashboard` between two read-only inspections. Re-running the whole
   dialog sequence with a route check after every step kept it on
   `/admin/schedules`, so nothing in this feature navigates — recorded as a
   probe artifact, not a defect claim.

---

## Mobile messaging verification — 2026-11-02

The Phase 7 audit and the sections above it stay as written. This one records
the Expo client's messaging feature and the documentation/verification housekeeping
that came with it.

**Environment:** Windows 10 (19045), `.venv` Python 3.15.0, Node 24.18, SQLite
dev database. Backend on `daphne config.asgi:application` at `127.0.0.1:8012`
(one process, in-memory channel layer), Expo web at `localhost:8099`, driven
from the in-app browser. `TRACK_DEV_CORS_ORIGINS` / `TRACK_WS_ALLOWED_ORIGINS`
were set to that dev origin; the standard :8000 server and other sessions'
ports were left alone.

### Gates

| Check | Command | Result |
|---|---|---|
| Backend full suite | `../.venv/Scripts/python.exe backend/manage.py test core` | PASS — 481 tests OK in 444.7s, exit 0. The three tracebacks in the log are the deliberate `_silently` tests that mock a down notification service; none is a failure |
| Messaging suite alone | `... manage.py test core.tests_messaging` | PASS — 108 tests (102 before `ChannelLayerConfigTests`) |
| Frontend suite | `npm test` (vitest) | PASS — 953 tests across 68 files, 37.3s |
| Mobile typecheck | `npx tsc --noEmit` | PASS — exit 0 |
| Mobile lint | `npx expo lint` | PASS — 0 errors, 8 warnings, all in the pre-existing fee screens (`Alert`/`Button`/`Ionicons`/`EmptyState` unused, one dead local). The 9th warning this session was a stale `eslint-disable` for a rule that no longer fires in `_layout.tsx`; removed. |
| Mobile bundle | `npx expo export --platform android` | PASS — exit 0, Hermes bytecode |
| Mobile doctor | `npx expo-doctor` | 19/20 checks pass. The one failure is patch drift on eight Expo/RN packages (`expo` 58.0.16 vs ~58.0.22 etc.) that predates this work — `git diff HEAD -- mobile/package.json` shows only `expo-font` added, at the version `npx expo install` chose. Recorded as L-033; not upgraded, because bumping `expo` + `expo-router` + `react-native` together is a separate risk with its own regression surface |
| Migration state | `makemigrations --check`, `showmigrations core` | PASS — no changes; `0001`–`0013` applied |

### What was driven live (not mocked)

Every step below ran on the real ASGI server with the real seeded accounts and
the real dev database; `list_network_requests` captured the calls.

1. Signed in to the Expo app as `admin` over `POST /api/auth/token/` — the
   release/localhost guard in `mobile/src/api/client.ts` did not fire because
   this is a dev bundle.
2. Opened the Messages tab: `GET /api/messaging/conversations/` 200, inbox
   rendered "1 conversation · Live", search box, and the unread badge absent at
   zero.
3. New-conversation screen at `/messages/new`: A PERSON listed the nine real
   reachable accounts with their roles; A GROUP offered TYPE (group / class /
   department), a name field and the roster it permits — and nothing was
   created, so no extra rows.
4. Taped "Message Teresa Reyes" → URL became `/messages/8`, the thread rendered
   with the real participant line and "No messages yet".
5. Typed and sent: the optimistic row was replaced by the server row, composer
   cleared, receipt showed `Sent`, and the message is a real
   `core_message` row.
6. A Node script signed in as `teacher1` over REST and posted a reply into the
   same conversation (server returned the stored row; `id` was absent from the
   response envelope, which the client never depends on — noted, not patched,
   because the thread updates from the socket frame).
7. **The reply appeared in the admin's open thread with no reload** while the
   page sat in `visibilityState: hidden` the whole time, so it can only have
   arrived over `/api/ws/messaging/` (ticket from `POST /api/messaging/ws-ticket/`).
   Going back to the inbox showed the new preview line and timestamp.

### Two defects this pass found, and fixed

1. **`DenyConnection` raised in the ASGI auth middleware** —
   `backend/core/websocket_auth.py` refused a foreign browser origin by raising
   the exception Channels uses inside consumer `connect` handlers. Above the
   router nothing catches it, so every scanner probe reached daphne as an
   unhandled error: **HTTP 500 plus a traceback**, exactly what a quiet refusal
   should not cost. The probe that saw it was the live curl documented in
   `docs/DEPLOYMENT.md` §8.3, and the pre-existing unit test tolerated either
   outcome (`assertIn(outcome, (False, "denied"))`), which is why it had never
   failed. Now the middleware sends
   `{"type": "websocket.close", "code": 4403}` and the test asserts the close
   code *and* fails if a `DenyConnection` escapes. Re-probed live: 403, one
   WARNING line, no traceback.
2. **Every undeclared detail route in the mobile app fell back to a tab** —
   expo-router hands a `<Tabs>` navigator any path it cannot match, so
   `/messages/7` rendered the role's dashboard with `?id=7`. The messaging
   screens would have shipped unreachable; the admin fee editors
   (`admin/fees/category/[id]`, `admin/fees/assessment/[id]`) had the same defect
   before this feature existed, unnoticed because a tap on a phone navigates
   through the navigator's own state rather than resolving a URL. Fixed by
   declaring them with `tabBarButton: () => null` — `href: null` was tried first
   and is the wrong tool: it drops the screen from the route table, so no
   navigation works either (the bundle was grepped to confirm the new code was
   actually served before concluding the mechanism itself was wrong).
   Verified live: cold load of `/messages/8` from the URL bar, `/messages/new`,
   and a tab bar with no phantom stop.

### Recorded, not claimed

- **Cross-process fan-out was not tested.** `where redis-server` and `docker`
  both find nothing on this machine, so the honest claim is single-process.
  The `REDIS_URL` branch itself is now under test
  (`ChannelLayerConfigTests`, 6 tests) so the deployment switch cannot rot
  silently — see L-019.
- **Browser push delivery was not tested.** Keys generate, the PEM-path form
  loads, the pair matches the advertised `vapid_public_key`, the signed header
  has the right shape, and delivery code is mock-covered; a real subscription
  needs HTTPS plus a granted prompt plus eyes (L-020).
- **No physical phone.** The walkthrough above is Expo *web* — same JS, same
  router, but not Hermes-on-Android (L-008/L-009).
- **One probe artifact reproduced:** mid-walkthrough the route jumped itself from
  `/messages/8` to `/admin/dashboard` once, right after a synthetic
  `new Event('input')` was dispatched on the composer. A realistic input
  (`execCommand('insertText')`) plus a click did not reproduce it in any later
  step, and the same signature is already logged in the schedules section above
  ("unexplained navigation mid-probe… recorded as a probe artifact"). Reported
  rather than smoothed over; if it ever appears without synthetic events it is a
  real bug.
- **Test data written today, and left in place:** conversation 8 (admin ↔
  Teresa Reyes) with two messages — one sent from the mobile UI, one over REST —
  on top of the direct conversation the transport probe created earlier. No rows
  were deleted, and no server other than the two this session started was
  touched.

### Documentation closed out

`DEPLOYMENT.md` (root) and `docs/DEPLOYMENT.md` were two guides that disagreed;
the root file is now a pointer and `docs/DEPLOYMENT.md` is the single source —
ASGI-only start commands (§2), the real token-auth model for both clients (§1),
`REDIS_URL` / VAPID / `EXPO_PUBLIC_WS_URL` / `TRACK_DEV_CORS_ORIGINS` (§5), the
nginx `/api/ws/` upgrade block (§7), the 404/403/101 handshake legend and a
verified-versus-unprovable table (§8.3), and a troubleshooting row for the tab
fallback above. `docs/KNOWN_LIMITATIONS.md` gained L-032 (the routing rule) and
updated L-007, L-019, L-020 and L-023 with what is now covered. CI's header
comment matches what runs, and the `mobile` job (typecheck → lint → bundle) is in
`.github/workflows/ci.yml`.

---

## Enrollment confirmation email and account claim — 2026-11-08

The last gap in the enrollment loop: after the Registrar confirmed an
application, nothing told the family, and the learner account that confirmation
created had a random never-issued password with no way in. The claim machinery
already existed (`account_claim_token`, `POST /enrollment/claim-account/`) but
was only reachable from inside the applicant's own application page. This pass
adds the two missing pieces — a message on confirmation, and a public page the
link in that message opens.

#### Scope calls (chose by the user, in this order)

| Question | Decision |
|---|---|
| Transport | Env-configured SMTP, **no send**: `EMAIL_*` + `DEFAULT_FROM_EMAIL` read from the environment, `console.EmailBackend` stays the default so nothing leaves the machine until credentials exist |
| Recipient | A **new `applicant_email` field** on the application — model + migration `0014` + wizard step + serializer + display — rather than reusing `guardian_email` alone |
| Landing | A **new public page** `/enroll/claim?token=…` that resolves the token before asking for a username, not a deep-link into the existing track form |

#### Files changed

| File | Change |
|---|---|
| `core/models.py` | `applicant_email = EmailField(blank=True)` in the applicant-identity block, with the fallback to the guardian email stated in its `help_text` |
| `core/migrations/0014_enrollmentapplication_applicant_email.py` (new) | additive `AddField`; reversible; applied to the dev DB |
| `core/emails.py` (new, ~115 lines) | `notification_email_for()` (applicant → guardian → linked account, first non-blank wins), `send_enrollment_confirmation_email()` (claim link when the token is live, sign-in link when the account already exists, no send at all when no address is on file), `_app_url()` over `TRACK_APP_BASE_URL` |
| `core/enrollment.py` | the created student `User` now carries `application.applicant_email`; `_notify_enrolled()` sends the mail alongside the in-app notification |
| `core/enrollment_views.py` | `ClaimAccountView.get()` (new — the lookup behind the emailed link) and `_resolve()`, shared with `POST` for one credential resolution; `PublicApplicationTrackView` now matches `applicant_email` as well as `guardian_email` |
| `core/enrollment_serializers.py` | `applicant_email` on the applicant detail/update and staff detail; a signed-in applicant inherits their own login email instead of retyping it |
| `config/settings.py` | env-driven `EMAIL_HOST/PORT/USERNAME/PASSWORD/USE_TLS/SSL/DEFAULT_FROM_EMAIL` and `TRACK_APP_BASE_URL` (default `http://localhost:5173`) |
| `pages/enrollment/ClaimAccountPage.jsx` (new) | the page the link opens: five states — incomplete link, checking, lookup failed, not claimable, ready |
| `components/enrollment/ClaimAccountForm.jsx` (new) | the credential panel extracted from `ApplicationDetailPage` so the portal page and the emailed page share one form, same field ids and checks |
| `App.jsx`, `services/api.js` | `/enroll/claim` route + lazy import; `api.claimLookup(token)` |
| `pages/enrollment/ApplicationWizardPage.jsx` | step-2 email field with the fallback explained inline, review row, and the field in the submit payload |
| `pages/enrollment/ApplicationDetailPage.jsx`, `RegistrarApplicationReviewPage.jsx`, `PublicTrackPage.jsx` | renders the shared form / shows the address the decision will reach / copy widened to "email or contact number" |
| `docs/DEPLOYMENT.md`, `backend/.env.example` | the new variables documented; the stale "no SMTP integration" paragraph replaced with what `core/emails.py` actually does |

#### What is covered by tests

Backend — `core/tests_enrollment.py`, **12 new specs**, module total now 105:

| Group | Specs |
|---|---|
| The message itself | `test_confirmation_emails_the_claim_link` (recipient + full `TRACK_APP_BASE_URL/enroll/claim?token=…` body), `test_confirmation_email_prefers_the_applicants_own_address`, `test_confirmation_email_links_sign_in_when_the_account_already_exists`, `test_no_email_when_the_application_holds_no_address` |
| Mail must not gate the enrollment | `test_a_dead_mail_server_does_not_undo_the_confirmation` — `send_mail` raises `OSError`, confirmation still 201, still `enrolled`, token still issued |
| The lookup the link opens | `test_claim_lookup_names_the_enrollment_and_nothing_else` (exact key set — no documents, no LRN, no section roster), `test_claim_lookup_rejects_an_unknown_or_empty_token` (404 for `""`, all-zeros, all-f), `test_claim_lookup_says_so_while_the_enrollment_is_unconfirmed`, `test_a_trashed_application_stops_answering_its_emailed_link`, `test_a_spent_claim_link_stops_answering` |
| The new field | `test_the_applicant_email_must_actually_be_an_address`, `test_an_account_holder_inherits_their_own_login_email` |

Frontend — `pages/enrollment/ClaimAccountPage.test.jsx` (new, **7 specs**): the
lookup is asked with `{token}` and only when a token exists; a ready link shows
the learner and reference and spends *that* token on submit; an incomplete link
fetches nothing; a 404 says the link is not valid; an unconfirmed enrollment
offers sign-in; per-field server errors land on the field; a password mismatch
is caught client-side without burning the link. Enrollment + API suites: **158
passed** across 16 files. Full backend `core` suite after this feature: **510
passed** (422s). Oxlint: 0 warnings / 0 errors on 259 files. Build: clean.

#### Live probe (real server, real browser, nothing mocked)

`runserver` on `:8020` with `TRACK_APP_BASE_URL=http://localhost:5203`, Vite on
`:5203` proxying to it. One script drove the whole loop as a stranger: create →
PATCH identity with `applicant_email` → upload the required birth certificate →
submit → Registrar (`admin`) start review → verify document → accept → assign
section → **confirm**.

| Step | Result |
|---|---|
| Confirmation | `201` — enrollment 2, student 11, `Sampaguita`, `2026-2027` |
| The email | printed to the console backend, addressed to `probe.claim.20261108@example.com`, subject `Enrollment confirmed — Probe Claimant (APP-22A570FA94)`, body carrying `Grade 7 — Sampaguita` and the claim URL |
| Open the link in the browser | `/enroll/claim?token=…` rendered "Your enrollment is confirmed" + the enrollment card + the create-account form |
| Fill and submit in the browser | navigated to `/student/enrollment`, signed in as the learner, showing `APP-22A570FA94 · Enrolled` |
| Fresh sign-in from the API | `POST /auth/token/` with the chosen credentials → `200`, `/auth/me/` → role `student`, `/enrollment/applications/my/` → the enrolled application |
| Link reused after the claim | lookup `404` "This account setup link is not valid", `POST` `400` — the page shows the same message in the browser |
| Token-less link | `/enroll/claim` → "This link is incomplete — it carries no account setup credential" |
| Public track after the claim | `404` — the pre-existing `applicant__isnull=True` gate now refuses, because the application belongs to an account |

**Not provable in this pass:** that a real SMTP host delivers the message. The
console backend renders exactly the body a mail client would show, and a
transport failure is covered by the dead-mail-server spec, but no message left
this machine — by design, since no credentials are configured and nothing is
deployed.

#### Data this probe wrote to the dev database (left in place)

Application 19 `APP-22A570FA94` (enrolled) with Student 11 / User 18
`probeclaimant`, Enrollment 2, its verified document and PDF, its
notifications — plus application **18 `APP-559FA7A620`, an orphaned draft** from
a first probe run that lost its guest token before the identity PATCH. Nothing
was deleted. No row outside these was touched.

---

## The setup link can be resent, and the adult who applied gets an account too — 2026-11-08

Two promises the previous pass left unpaid. The review screen told the Registrar
that the family could "ask the Registrar to resend", but no such action existed
anywhere in the product. And a learner confirmed from an application that a
signed-in parent had filed left that parent with nothing: confirmation created
the student account, the claim link issued credentials for exactly one person,
and the adult who did the paperwork still could not see the record.

#### Scope calls (chose by the user, in this order)

| Question | Decision |
|---|---|
| Where the guardian's account is created | **Same link, a second panel on the claim page** — the learner's credentials first, then an optional fieldset that creates a parent `User` plus its `ParentProfile` and links it to the learner. One token, one email, no new column |
| What a resend does | **Re-issue a new token — the old link dies.** A staff action writes a fresh `account_claim_token`, emails again, and the URL already in the inbox stops answering. Who resent it, and to which address, is written to the audit trail |
| When the applicant is already a parent | **Link the applicant, skip the panel.** Confirmation adds the learner to that account's `ParentProfile.children`, so the claim page asks only for the learner's credentials |

#### Files changed

| File | Change |
|---|---|
| `core/enrollment_views.py` | `ClaimAccountView` now reports the guardian the application names (`guardian_name`, `guardian_relationship`, `guardian_account_exists`) and accepts an optional `guardian_username` / `guardian_password` pair on `POST`; every guardian check runs *before* `transaction.atomic()`. `StaffResendClaimLinkView` (new) — `enrollment.manage`, `select_for_update()`, four refusals, new token, event + audit row, mail on commit |
| `core/urls.py` | `POST /enrollment/applications/<id>/resend-claim-link/` |
| `core/enrollment_serializers.py` | staff detail gains `claim_link_pending` (a live token **and** unclaimed **and** `enrolled` **and** a deliverable address) and `account_claimed_at` |
| `core/enrollment.py` | `confirm_enrollment()` links a signed-in parent applicant to the learner through `ParentProfile.children` |
| `core/emails.py` | `send_enrollment_confirmation_email(..., resent=True)` — the re-sent message says it is a new link |
| `core/tests_enrollment.py` | `build_guest_confirmed()` takes a `guardian=` block, `build_parent_confirmed()` added, **14 new specs** |
| `components/enrollment/ClaimAccountForm.jsx` | the optional guardian fieldset — a `<fieldset>`/`<legend>` with its own three fields, same checks as the learner's — and an `ERROR_ANCHOR` map so every `aria-describedby` points at an error id that actually exists (it did not, for the two confirm fields) |
| `pages/enrollment/ClaimAccountPage.jsx` | hands the guardian trio from the lookup to the form; the panel is not offered when the applicant already holds a parent account |
| `pages/enrollment/RegistrarApplicationReviewPage.jsx` | the setup-link card — pending / already-used / never-issued copy, `Resend setup link` behind `enrollment.manage` with its confirmation modal — and one fix: the stale "Confirmation unlocks once the application is accepted." sentence no longer shows under an application that is already `enrolled` |
| `pages/enrollment/EnrollmentPages.css` | `.claim-guardian` fieldset spacing |
| `pages/enrollment/ClaimAccountPage.test.jsx`, `pages/enrollment/RegistrarApplicationReviewPage.test.jsx`, `services/api.js` | the new specs below; the unclaimed `resendClaimLink()` helper was dropped — the review screen's actions all post through `api.post` |

#### What is covered by tests

Backend — `core/tests_enrollment.AccountClaimTests`, **14 new specs**, class
total now 34:

| Group | Specs |
|---|---|
| The guardian on the link | `test_claim_lookup_offers_the_guardian_the_application_names`, `test_claim_lookup_keeps_the_guardian_quiet_while_the_link_is_not_live` |
| One link, two accounts | `test_the_same_link_opens_the_guardians_account_too` — both roles, names and emails, `check_password` on each, the guardian `contact_number`, both sides of `children` / `parents`, the two audit rows and the two review events, and the guardian's own `my-enrollments` length 1; `test_confirmation_links_the_parent_who_filed_the_application` (children 2 — the fixture child is untouched) |
| The panel is skipped | `test_the_guardian_panel_is_skipped_when_a_parent_filed_the_application`, `test_a_second_guardian_account_is_refused_when_the_parent_applied` |
| Guardian input is checked first | `test_guardian_credentials_are_validated_before_the_claim_runs` (both-or-neither, same-as-learner, taken, weak), `test_a_taken_guardian_username_writes_nothing_at_all` — the learner's stored password hash is compared before and after, because the refusal happens upstream of the claim rather than as a rollback |
| The resend | `test_resend_writes_a_new_link_and_voids_the_one_in_the_inbox`, and five refusals: `test_resend_refuses_a_link_the_family_already_used`, `test_resend_refuses_a_learner_who_already_had_an_account`, `test_resend_refuses_when_there_is_nothing_to_email`, `test_resend_refuses_before_the_enrollment_is_confirmed`, `test_resend_of_a_trashed_application_is_not_found`; plus `test_resend_needs_the_enrollment_manage_key` (plain admin / teacher / student → 403, anonymous → 401, token unchanged) and `test_staff_detail_marks_only_a_genuinely_pending_setup_link` |

Frontend — **11 new specs**: `ClaimAccountPage.test.jsx` (6 — the panel is
offered when the link names a guardian; leaving it unchecked spends the link on
the learner alone and sends no guardian keys; checking it sends both pairs and
navigates; a guardian password mismatch blocks the request; a server
`guardian_username` refusal lands on that field with `aria-invalid`;
`guardian_account_exists: true` hides the panel) and
`RegistrarApplicationReviewPage.test.jsx` (5 — resend fires through the
confirmation modal and reports the address the new mail went to; the used-link
copy; the never-issued copy; `enrollment.manage` withheld hides the button but
keeps the explanation; a rejected POST leaves the dialog open carrying the
server's objection).

Gates: `AccountClaimTests` **34 passed** (43.4s) · `core.tests_enrollment`
**121 passed** · full backend `core` **526 passed** (428.7s) · frontend
`vitest run` **1049 passed / 76 files** · `oxlint src` **0 warnings / 0 errors
on 260 files** · `npm run build` clean.

#### Live probe (real server, real browser, nothing mocked)

`runserver` on `:8010`, Vite on `:5199` proxying to it, console email backend.

| Step | Result |
|---|---|
| Confirm a public application (`APP-B20EEA40BD`) | `enrolled`; console email carries the claim URL. Reading note: the console body is quoted-printable, so the log shows `token=3D<32 hex>` — the real token is the hex only |
| Open the link in the browser | learner card + create-account form + the guardian fieldset naming the mother from the application |
| Submit both pairs in the browser | learner signed in at `/student/enrollment` showing `APP-B20EEA40BD · Enrolled` |
| The guardian's own account | `martaprobeclaim` (role parent, `marta.probeclaim@example.com`, contact `0917 555 0101`) — first login lands on `/parent/dashboard` → "Showing records for Aira Probeclaim · Grade 7 — Sampaguita (2026-2027)" |
| Application row after the claim | `guest_token` and `account_claim_token` both null, `account_claimed_at` set, `enrolled`, owned by the learner; events `account_claimed` + `guardian_account_created` |
| Resend on a second enrollment (`APP-6DE9829942`, link still pending) | button → modal → confirm: "Setup link resent — Bruno Proberesend (APP-6DE9829942)" and a fresh email to `bella.proberesend@example.com` |
| Token in the database | changed — new value `33ffca57…`, `account_claimed_at` still null, StudentProfile 13 / User 20 still unclaimed, guest token still live |
| The **old** URL after resend | the browser renders "This account setup link is not valid" |
| The **new** URL | answers, and with the guardian panel present |
| Audit trail | `AuditLog('enrollment.claim_link_resent', actor: admin)` and `ApplicationReviewEvent('claim_link_resent', internal_note '…Recipient: bella.proberesend@example.com.')` |

#### The message really left the process — SMTP against a local sink

The console backend proves the words, not the transport, so the transport was
then measured for real. `runserver :8010` was launched with
`EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`,
`EMAIL_HOST=127.0.0.1`, `EMAIL_PORT=8025`, `EMAIL_USE_TLS=0`,
`EMAIL_TIMEOUT=5`, `DEFAULT_FROM_EMAIL="TRACK Admissions <admissions@track.local>"`,
`TRACK_APP_BASE_URL=http://localhost:5199`, pointed at a ~110-line dependency-free
SMTP socket server written in `%TEMP%` for the purpose and deleted with its
captured messages afterwards — nothing was added to the repo, no package
installed. The action under test was a real
`POST /api/enrollment/applications/23/resend-claim-link/` as `admin`.

What the sink recorded on the wire:

```
ehlo COUGAR
mail from:<admissions@track.local> size=1133
rcpt to:<bella.proberesend@example.com>
data            → 1136 bytes received
quit
```

Received headers: `From: TRACK Admissions <admissions@track.local>`, `To:
bella.proberesend@example.com`, `Subject: Setup link resent — Bruno Proberesend
(APP-6DE9829942)`, `Date: Sun, 08 Nov 2026 01:46:05 +0000`, and a body carrying
`http://localhost:5199/enroll/claim?token=3Dfb3bd87196…` — quoted-printable
again, so the token is the hex that follows `3D`.

| Check | Result |
|---|---|
| Token in the delivered message vs. the row | identical — `fb3bd871…` on both sides |
| The link that arrived | `GET /enrollment/claim-account/?token=fb3bd871…` → `200`, `claim_available: true`, `guardian_name: Bella Proberesend`, `guardian_relationship: Father`, `guardian_account_exists: false` |
| The link it replaced | `404` "This account setup link is not valid" |
| Transport **down** (sink stopped, port refuses) | the resend still returned `200` and rotated the token to `d49a1bbd…`; nothing reached the sink; the `ConnectionRefusedError` appeared in the server log as a logged send failure while the request completed — the promise the mocked dead-mail spec makes, now made over a real socket |
| Transport **restored** | `200` again, and the sink received a second message carrying `4468fc95…`, which answers `200` while `d49a1bbd…` answers `404` |

**Still not proven here:** an outside provider. No SMTP credentials exist on
this machine, so `EMAIL_USE_TLS` was forced to `0` and no `AUTH` was negotiated
— what is measured is Django's own half of the transaction (connect, envelope,
headers, body bytes) plus the failure path, not a relay accepting a login or a
mailbox somewhere else receiving it.

**Not proven in this pass:** that a **real parent** filing an application sees
the panel skipped was proven in the backend spec
(`test_the_guardian_panel_is_skipped_…`) and not re-walked in the browser this
time; the live claim used a public, account-less application. Mobile has no
claim page at all, so nothing was tested there.

#### Data this probe wrote to the dev database (left in place)

Application **22 `APP-B20EEA40BD`** (Aira — enrolled, claimed) with Student /
User 19 `airaprobeclaim`, guardian User 21 `martaprobeclaim` + its
`ParentProfile`, and its Enrollment — plus application **23
`APP-6DE9829942`** (Bruno — enrolled, unclaimed, StudentProfile 13 / User 20 with
no password set). The SMTP walk resent its link three more times, so that row
now carries `claim_link_resent` events for `33ffca57…`, `fb3bd871…`, `d49a1bbd…`
and the live one, `4468fc95…`, with the matching `AuditLog` rows; the enrollment
itself is unchanged. Two earlier probe drafts (20, 21) that lost their guest token were removed through the real
`DELETE /enrollment/applications/my/<id>/` endpoint — 204 each — not by editing
rows. Orphan 18 from the previous pass is still there. Nothing else was touched.

---

## Attendance history as one recorded date at a time — 2026-11-08

The user asked, screenshot in hand, that each history list show "1 date each —
like heres the button example `< nov 1 >`". Three scope decisions were put to them
and all three answered "Recommended": the arrows step **only between dates that
have records**; **both** history tabs get the one-date view and the stepper
**replaces the from/to date inputs** (search, class, subject, status and sort
stay); the layout is a **date card with that day's rows inside**.

No backend change, no new endpoint. `attendance_session_filters()` in
`backend/core/views.py` already honours `date`, inclusive `date_after` /
`date_before`, `section`, `subject`, `status`, `search` and `ordering`, and
`AttendanceRecordListCreateView` reuses it with `alias="session"` — so a mark
narrows on its **session's** date exactly like a session row narrows on its own.

### Request contract (measured, not assumed)

Per visible day: **one** `page_size=20&date=<day>` read for the rows, plus **two**
`page_size=1` reachability probes. A probe must start from the day *past* the one
shown (`date_before = day-1` when walking earlier, `date_after = day+1` when
walking later) and sort *away* from the current day, otherwise it returns the day
already on screen. Every probe carries the active filters, so a walk covers "the
days matching this search", not the whole term.

| Piece | File |
|---|---|
| The walk hook (landing probe + two neighbour probes, abort-guarded) | `frontend/src/hooks/useRecordedDay.js` |
| Pure probe/heading derivations | `frontend/src/utils/attendance.js:323-352` |
| `< date >` control | `DateStepper` in `frontend/src/pages/attendance/parts.jsx` |
| By-session tab | `frontend/src/pages/attendance/SessionHistory.jsx` |
| By-student tab | `frontend/src/pages/attendance/StudentHistory.jsx` |
| Day-card + stepper styling (incl. ≤767px) | `frontend/src/pages/attendance/AttendancePage.css` |

### Defects found and fixed during verification

1. **The By-student walk could never move.** `useRecordedDay` read
   `page.rows[0].date`, but `AttendanceRecordSerializer` does not put a date on
   the record row — the day lives inside `session_detail`. Added the `dateOf`
   accessor and `StudentHistory` passes `(row) => row?.session_detail?.date`.
2. **A filter that leaves no day froze the screen on a skeleton.** Changing a
   filter aborts the neighbour probes started for the day being replaced, and an
   aborted promise chain never reaches its `finally`, so `walking` stayed `true`.
   Cleared in the hook's early-return branch. **This one was caught only by the
   live probe** — jsdom never reproduced it. The regression test slows just the
   `page_size===1 && (date_before||date_after)` reads by 40 ms and does fail
   without the fix.

### Gates actually run

Final numbers after both fixes (the chevrons and the ghost trap) — re-run at the
end, not carried over from earlier in the pass:

- `npx oxlint` → **0 warnings, 0 errors on 262 files**.
- `npx vitest run` → **Test Files 76 passed (76) / Tests 1038 passed (1038)**.
  Two `BootError` act() warnings remain in files outside this feature; three
  act() warnings introduced by the new history tests were drained inside `act()`
  and are gone.
- `npm run build` → clean. `AttendancePage` chunk **59.02 kB / 14.84 kB gzip**,
  `AttendancePage` CSS **10.25 kB / 2.39 kB gzip**, `Icon` chunk 8.04 kB / 2.12 gzip.
- **Live probe**, `/teacher/attendance` on 5173 as teacher1: backward walk
  **Mon, Nov 9 → Mon, Nov 2 → Mon, Oct 26 → Fri, Oct 23 2026** (weekends and
  un-recorded days skipped, arrows disabled at both ends of the term), records
  walk `1 mark on this day` with `page_size=1&date_before=2026-11-01&ordering=-date`
  style probes, no console errors or warnings, narrow layout measured in a
  same-origin 415×880 iframe.
- Empty-filter case after the fix: `["No attendance recorded"]`, `skeleton: false`.

**Not proven in this pass:** no screenshot exists, so the day card is documented
by measured geometry and computed styles only. Nothing was written to the dev
database by this feature's probe; the only residue is that the automation browser
is left signed in as teacher1 and the login form created teacher1's API token.

### The arrows were invisible — root cause was the shared icon set

The user reported the stepper arrows looking invisible. Measured live, the cause
was not contrast: `Icon.jsx` has **no `chevronLeft` or `chevronRight` path**
(it only defined `chevronDown`), and `Icon` returns `null` for an unknown name —
so each button's only child was `<span class="btn-content"></span>` in a 40×40
box with a transparent background and a transparent border. Nothing to see, and
no test could tell, because the specs asserted the button's label, not its paint.

Seven call sites were affected, not just this screen: `components/Pagination.jsx`
(prev/next on **every** paginated table in the app), `attendance/parts.jsx`
(the new stepper), `attendance/SessionsBoard.jsx` (day navigation),
`enrollment/ApplicationDetailPage.jsx`, and `LandingPage.jsx` (the FAQ expander —
a public page, whose markup and CSS were not touched; it simply gets the glyph
that was always asked for).

| Fix | Where |
|---|---|
| `chevronLeft` / `chevronRight` added to the stroke registry | `components/Icon.jsx:102-104` |
| Stepper arrows moved from `ghost` (no chrome at all) to the pager idiom `secondary` — surface background, `--border-strong` border | `pages/attendance/parts.jsx` `DateStepper` |
| A test that renders every literal `<Icon name="…">` found in `src`, so a name missing from the registry fails the suite instead of shipping a blank control | `components/Icon.test.jsx` |

After the fix, measured live on the same screen: both arrows are `btn-secondary`
boxes of `rgb(255,255,255)` on a white card with `1px solid rgb(205,214,228)`
borders, each painting a 16×16 svg with `stroke: rgb(15,32,68)` and the real
paths (`m15 18-6-6 6-6`, `m9 18 6-6-6-6`); the Sessions tab's day arrows paint
14px glyphs. The registry-coverage test was shown to **fail without the paths**
(it names `chevronLeft`/`chevronRight` and the four files asking for them).

**Not re-probed live after the fix:** the shared `Pagination` arrows in a real
paginated table — `/teacher/students` turned out not to be a route, and the
attendance day had no overflow page strip. They are covered by the registry test
and use the identical `Icon` name that was measured painting on this screen.

### The chromeless-ghost trap, closed in the shared button layer

The stepper had been written as `variant="ghost"` + icon only. `.btn-ghost` sets
**transparent background and transparent border**, so with no label to carry the
affordance the control is invisible even when the glyph paints. Rather than
special-case one screen, `Button.jsx` now detects the shape: when its children
are exactly one `<Icon>`, it adds `btn-symbol`, and `App.css` gives
`.btn-ghost.btn-symbol` the secondary chrome (surface background,
`--border-strong` border; hover at (0,4,0) so it outranks `.btn-ghost:hover`).
The stepper went back to `ghost` to prove the shared rule is what frames it.

Sites the marker now reaches (found by a multiline-aware source scan, then
confirmed in the live DOM): the history `DateStepper` (2 controls), the sessions
board day arrows (2), and the schedules screen's list row edit/delete plus the
conflict-panel and undo-toast dismissals. 77 other ghost buttons carry text and
are untouched; `Modal`'s close button uses its own `.icon-btn`, not `Button`, so
it is unaffected too.

Measured live after the change:

| Control | Classes | Box | Background / border | Glyph |
|---|---|---|---|---|
| History `<` / `>` | `btn btn-ghost btn-sm btn-symbol btn-icon` | 42×42 | `rgb(255,255,255)` / `1px solid rgb(205,214,228)` | 16px, `rgb(15,32,68)` |
| Sessions day arrows | `btn btn-ghost btn-sm btn-symbol` | 40×42 | same | 14px, navy |
| Schedules list row actions | `btn btn-ghost btn-xs btn-symbol` | 36×42 | same | 14px |
| Document overflow, `/admin/schedules` | — | — | `scrollWidth - clientWidth` = **0** | — |

**Cascade trap found while doing this:** the first draft of the rule also
declared `color: var(--navy-800)`, which would have outbid a call site's own
tone class — `.sched-action-danger` is (0,1,0) against this rule's (0,2,0). The
declaration was removed, so the rule changes background and border only and can
never recolour an icon.

**Open question filed, not fixed:** on `/admin/schedules` the delete glyph
computes `rgb(15, 32, 68)` (navy) although `SchedulesPage.css:765` declares
`.sched-action-danger { color: var(--red-700) }` (`#b3261e`) in a sheet that
loads after App.css, and neither rule carries `!important` — the cascade
inspection lists exactly three matching color declarations and the red one is
last. The measurement is itself suspicious: even an **inline**
`color: rgb(179, 38, 30)` read back as navy after a 260 ms settle, which real
CSS cannot do, so this smells like a probe artifact (a node React recreated
under the reference) rather than a stylesheet impossibility. The tint reads the
same with and without `btn-symbol`, so this pass neither caused it nor masked
it; it is filed as an open question, not reported as a defect.

---

## Mobile motion pass — 2026-11-08

Request: **"add animations to the mobile UI"**, scoped by two answers the user
picked from the options offered: reach **both** the shared component layer and
every screen that hand-rolls its own layout, and **honour the OS "remove
animations" setting everywhere**. Expo app only — `frontend/` untouched.

### What the pass found before changing anything

`mobile/src/anim.ts` already existed but reached seven files, `useEntrance` and
`useGrow` were dead code, and reduce-motion had no handling at all. An inherited
audit figure ("16 of 28 routes mount `Screen`") was wrong: `grep -rL "ui/Screen"`
returned **8 with / 26 without**, and the sweep list was rebuilt from that output
rather than from the remembered number.

### The gate, and why it is a module store

`AccessibilityInfo.isReduceMotionEnabled()` + `reduceMotionChanged` is the only
portable read; react-native-web implements both over
`matchMedia('(prefers-reduced-motion: reduce)')` and **resolves `true` when
matchMedia is missing**. Because most of what moves does so from an event handler
— a press, a sheet closing, a tab capsule — where a hook cannot be called, the
state lives in a module store with two accessors: `useReducedMotion()` for code
that must re-render, `getReduceMotion()` for code that only needs to know at the
moment it would animate. `startMotion()` is the single funnel: under reduce-motion
it applies `toValue` in the same frame and still calls the completion callback, so
a sheet scheduled its own unmount from the callback rather than stranding itself.

The dialect chosen: movement (translate, scale, loops) collapses to an instant
landing; the dim an affordance gives on press is **kept**, because a control that
stopped answering a tap is a worse trade than a colour change that arrives in no
time at all.

### Files changed

| Surface | What moved |
|---|---|
| `src/anim.ts` | reduce-motion store, `MotionConfig`, `startMotion`, `delay` on `useEntrance`, gate in `usePress`/`useShimmer`/`useGrow`/`animateLayout` |
| `ui/Screen.tsx` | body rises 8dp over 220ms, restarted by `useFocusEffect` (a tab switch is a focus, not a render) |
| `ui/ListRow.tsx`, `ui/Card.tsx`, `ui/Chip.tsx`, `ui/QuickActions.tsx` | press feedback: `AnimatedPressable` + `usePress`, static `pressed` rules deleted |
| `ui/StatTile.tsx`, `ui/MetricsCard.tsx`, `StateViews.tsx` | entrance on arrival and on value change; loading, empty and error states rise |
| `ui/ProgressBar.tsx` | the previously dead `useGrow` now drives the fill |
| `ui/Sheet.tsx`, `ui/Toast.tsx`, `SegmentedControl.tsx`, `DaySelector.tsx`, `FloatingTabBar.tsx`, `BarSeries.tsx` | routed through `startMotion` so the gate covers them |
| 21 routes under `src/app/(app)/` | converted from `<View style={styles.screen}>` to `<Screen header={…}>` |
| `auth/login.tsx` | brand block and form arrive one after the other (8dp rise, 110ms apart) |

The dead `screen: { flex: 1, backgroundColor: colors.bg }` key that the sweep left
behind was removed from all 21 route files by a script that refuses any file whose
line is not the exact expected text or that still references `styles.screen`; each
file was then diffed against a pre-edit copy and shows **exactly one deleted line,
no additions**.

### Two traps this pass had to design around

1. **An interpolation cannot live in a `Pressable` function style.** A
   `({pressed}) => […]` style rejects it, so the press-bearing components moved to
   static style arrays wrapped in `Animated.createAnimatedComponent(Pressable)` —
   the pattern `Button.tsx` already used, not a new one.
2. **An animated `opacity` in a style array outranks a static one.** A disabled
   control that dimmed through a stylesheet rule alone never dimmed. The dim is now
   expressed as `usePress({ restingOpacity })`, i.e. the floor the press works down
   from. `QuickActions` and `ListRow` changed on this finding.

### Gates actually run

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 errors — this is also the structural check on the sweep, since a mismatched `</Screen>` is a parse error |
| Lint | `npx expo lint` | exit 0, no warnings |
| Bundle | `npx expo export --platform web` | exit 0 — every converted module resolves and compiles |
| Doctor | `npx expo-doctor` | 19/20 checks pass. The one failure is dependency-version drift (`expo 58.0.16` vs `~58.0.23` and eight siblings), which predates this pass and was not touched: upgrading the SDK is not this task |

### What was driven live

Metro served the app at `:8081` against the running API at `:8000`, and sixteen of
the converted surfaces were rendered with real records by signing in as
`teacher1`, `student1`, `parent1` and `admin` (no seeded or mock data):
`/login`, `/teacher/dashboard`, `/teacher/classes`, `/teacher/classes/1` (opened by
pressing the row, not by typing the URL), `/teacher/attendance`, `/teacher/review`,
`/teacher/timetable`, `/messages/8`, `/student/dashboard`, `/student/fees`,
`/student/submissions`, `/parent/attendance`, `/admin/accounts`,
`/admin/accounts/18`, `/admin/requirements`, `/profile`. Each returned its own
heading and live content, e.g. "9 absent marks on record", "Outstanding:
₱8,900.00", "Sofia Cruz · Grade 7 — Sampaguita". The console for the session held
no React errors and no key/prop warnings from the sweep; it holds one pre-existing
warning (`useNativeDriver` is not available on web, so RNW falls back to the JS
driver — it has always applied to this app's buttons, sheets and toasts) and the
known failure of `ws://…/api/ws/messaging/` against the WSGI dev server.

### DOM-verified, not visually verified

The probe surface is hidden: `document.visibilityState` is `hidden`,
`take_screenshot` answers `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`, and a
`requestAnimationFrame` counter sampled three seconds after scheduling is still
`0`. RNW's JS-driven animation therefore never advances, so the probe reads the
entrance exactly at its start (`opacity: 0`, `translateY: 10`) on content the
accessibility tree reports in full. **That is a measurement artifact, and it is
also a fact worth recording:** on web, an entrance that begins at `opacity: 0`
holds its content transparent until the tab paints — a page loaded into a
background tab shows nothing until it is foregrounded. Native (Expo Go, where the
native driver runs the same animation on the UI thread) is not affected. Frames
were not observed for any screen in this pass, and no claim about how the motion
looks should be read into the table above.

### Recorded, not claimed

- No mobile unit suite exists (`mobile/package.json` has no `test` script); the
  1038 web specs and the Django suite do not exercise this code and were not
  re-run for a mobile-only change.
- Reduce-motion was verified by reading the implementation and by the shape of the
  gate (one funnel, `setValue` + callback on the reduced path), not by toggling the
  setting on a device or in an OS accessibility panel.
- The 21-file sweep was scripted, and its output was reviewed against backups file
  by file — `teacher/dashboard`, `messages/[id]`, `student/submissions`,
  `admin/requirements` were read line by line, the rest by exact-diff count. A
  tool that reports success is not evidence; the diffs are.
- The web dev server and Metro were left running for the user; nothing was
  committed.

---

## Play-Store / web compliance pass — 2026-11-08

The brief was a twenty-item store-listing compliance checklist, filtered to the
items that can actually apply to this product: a web-only school system with no
paid tier, no SDK, no reviews and no marketing mail. Four scope calls were put
to the user and approved before any code was written — self-host the third-party
assets and gate the map embed; record consent on the application itself;
implement the deletion right as export plus a staff-answered request queue; and
extend the existing legal pages in place with a footer on every public surface.

### Every item, with what was done to it

| # | Checklist item | Applies here? | What the code does |
|---|---|---|---|
| 1 | Privacy policy | Yes | `/privacy` — eleven sections naming the controller, each collection, retention and every right, linked from every public page (PrivacyPage.jsx) |
| 2 | Terms of service | Yes | `/terms` — eleven sections including account duties, acceptable use and suspension (TermsPage.jsx) |
| 3 | Refund policy | No paid product | Terms §6 "Charges — there are none" states the app is free, so nothing can be refunded. Stated on the face of the terms rather than invented as a refund form |
| 4 | Cookie policy | Yes, as a section | Privacy §5 names the two strictly-necessary stores (session token in `sessionStorage`, the Django session cookie) and states that nothing else is set |
| 5 | Cookie consent banner | No — and documented why | There is no optional storage to consent to, so a banner would only train dismissal. Privacy §5 says in words: "Because there is nothing optional to consent to, TRACK shows no cookie banner." |
| 6 | Form consents | Yes | `ConsentCheckbox` on the wizard review step and on the account-claim form; unticked by default; the backend refuses a submit or resubmit without it |
| 7 | Collect only needed data | Yes | Four purpose statements on the collected-data groups (`enr-purpose`) naming who sees each group and what it is used for; the export in item 20 is the inventory a person can check |
| 8 | Audit third-party SDKs | Yes | No third-party script, pixel, font CDN or image host ships: `grep -rn "unsplash\|fonts.googleapis\|gstatic\|cdn\." frontend/src` and every `https?://` in `frontend/index.html` return nothing. The campus photograph is served from the bundle (`public/campus-hero.jpg`), so restoring it did not reopen the cross-origin request. The one remaining external request is the Google map, now behind a click |
| 9 | Remove dark patterns | Yes | The consent box starts empty every time the dialog opens; the push prompt is a deliberate opt-in (`PushPreferences`), not a load-time permission ask; a request to delete answers with the legal reason instead of quietly disappearing |
| 10 | No hidden fees | Yes | Terms §6 — no charges, no upsell, no card form anywhere in the app |
| 11 | No fake reviews | Not present | TRACK ships no review, rating or testimonial surface, so there is nothing to fake |
| 12 | No unsupported claims | Yes | Every public claim was checked against the code in the claims pass that opened this program. The three hero counters describe structure, not volume — 4 roles, 8 feature areas, 1 portal — and each is countable in the source the same page renders (`FEATURES` in LandingPage.jsx holds exactly eight titled cards). No enrollment totals, graduate outcomes or improvement percentages are asserted anywhere on the public surface, and the two researcher images carry `alt=""` — the card states the name in text, and the picture beside it is presented as decoration rather than as a photograph of that person (item 19) |
| 13 | Alt text | Yes | Every `<img>` in the web frontend carries `alt` — descriptive for the dashboard and figure shots, `alt=""` for the seal and the sidebar mark that sit beside their own text |
| 14 | Colour contrast | Yes | Measured, not eyeballed — see the measurement table below |
| 15 | Keyboard navigation | Yes | Mobile nav dialog traps focus and returns it (4 specs); the landing feature cards carry `role="button"`, `aria-expanded` and an Enter/Space handler; the wizard, document viewer and modals keep the focus order established in earlier passes |
| 16 | Business details | Yes | `/privacy` §1 names the controller (Kiwalan National High School), its address (Purok 10 Mato-og, Kiwalan, Iligan City, Lanao del Norte 9200) and the office that receives every data request; `PublicFooter` repeats the controller line on all eight public surfaces. No telephone number or email address is published, because none is recorded anywhere in this repository — `PublicFooter.jsx:12` says so in a comment, and inventing an inbox to satisfy a checklist was rejected |
| 17 | Age consent for minors | Yes | Enrollment is filed by the adult, and the tick they give is stamped with `POLICY_VERSION` (`consent_given_at`, `consent_policy_version` on `EnrollmentApplication`); Privacy §7 states the under-18 rule in the school's own voice |
| 18 | Unsubscribe link | No marketing mail | Outgoing mail is one transactional thread — enrollment confirmation and the account-setup link (`core/emails.py`). There is no newsletter, so there is no list to leave; in-app and push notifications are opt-in per category |
| 19 | License stock images | Partly — the imagery is back, the record is not | Reopened on 2026-11-08 at the user's request ("bring them back"), so this row no longer describes the state this pass left. What is true now: every picture ships inside the bundle and the browser makes no image request off-origin. The hero backdrop is `public/campus-hero.jpg`, downloaded once from the Unsplash source that `/researchers` used to hotlink and served locally — that file is the one whose licence is settled (Unsplash License, no attribution required, self-hosting is permitted). What is still not settled: `public/student.png` and `public/student2.webp` are back in `public/`, and nothing in the repository records where they came from or what rights the school holds — see the subsection below. The earlier version of this row claimed they had been taken out of the shipped bundle; they have not been |
| 20 | Data deletion option | Yes | `GET /api/account/export/` returns the requester's own records as a JSON document; `/account/data-requests/` files a correction, objection or erasure ask; the enrollment office answers it in writing at `/admin/enrollment/data-requests`, and academic history is retained with the legal reason stated rather than deleted by a button |

### Consent, as it is stored

`EnrollmentApplication.consent_given_at` and `consent_policy_version`
(`backend/core/models.py:1354-1364`, migration `0015_enrollmentapplication_consent`)
record *when* the tick was given and *which version of the notice* it referred
to, so a dispute about a 2026 filing is answered by the text that person saw.
`POLICY_VERSION = '2026.11'` lives in `frontend/src/config/legal.js` and the
comment there is the rule: bump both together, never reuse a version. The
server-side refusal is pinned by `test_submit_without_consent_is_refused`,
`test_submit_reads_a_form_encoded_false_as_no_consent` and
`test_resubmit_without_consent_is_refused`.

### Contrast, measured

A throwaway harness (`frontend/public/__contrast-audit.js`, deleted before the
build — it is not in `dist/`) walked every rendered text node in the real
browser, resolved its paint order including multi-layer gradients composited at
the text's own rectangle, and compared against WCAG 2.x: 4.5:1 for text, 3:1 for
large text and for non-text glyphs. Every failing pair found in the pass:

| Surface | Was | Measured | Now | Measured |
|---|---|---|---|---|
| Landing `.ls-eyebrow` | `--brand-cyan` | 2.60 (documented decorative-only) | `--blue-600` | 4.94 on the tinted band, 5.17 on white |
| Landing `.solution-quote` | `rgba(255,255,255,.72)` on the `#2347E8` card | 4.22 | `rgba(255,255,255,.86)` | 5.36 |
| Privacy `.lp-toc-list a` | `#2196f3` on the tinted band | 2.80 | `--blue-700` | 6.01 |
| Researchers `.rp-card--partner .rp-role` | `#2196F3` on the white card | 3.12 | `#1565c0` | 5.75 |
| Researchers/About `.rp-team-sub`, `.ap-section-sub` | `#5c7199` | 4.91 on white, 4.40 on the tinted band | `--text-subtle` | 5.63 / 5.09 |
| Login `.auth-lede`, `.auth-note` | `#6b7f9f` on the `#f2f6fb` panel | 3.75 | `--text-subtle` | 5.19 |
| Enroll hero reference-number link | app link blue on the navy hero | 2.33 | `--on-navy-accent` | 7.10 |
| `.badge-green`, `.alert-success` | `--green-700` on `--green-100` | 4.42 | new `--green-800` | 6.27 |
| Messages `.unread-chip`, own `.bubble` | white on `--brand-blue` | 3.12 | white on `--blue-600` | 5.17 |
| Messages `.search-field:focus-within` (inherits into the typed text) | `--brand-blue` on the surface | 3.12 | `--blue-600` | 5.17 |
| Messages `.empty-mark` glyph | `--brand-blue` on `--blue-50` | 2.85 | `--blue-600` on `--blue-50` | 4.72 |
| Messages read-receipt label | `#c9f0d5` on `#f7f9fc` | **1.18** | rule deleted; base `--success` | 5.02 |
| Attendance checked "Present" segment | `--green-700` on `--green-100` | 4.42 | `--green-800` | 6.27 |
| Upload drop-zone hint | `--ink-muted` on the `--blue-50` drag state | 4.35 | `--text-muted` | 5.60 |
| Login `.back-home` | `#2563eb` on the `#f2f6fb` panel | 4.76 — already passing | `--blue-700`, tokenized | 6.18 |

The last row is recorded because it is the one change this pass made that did not
have to be made: the static scan reported 4.11 for it against `--navy-100`, a
surface `.back-home` never actually sits on, and measuring it live against the
auth panel gave 4.76. It was kept only to replace a hardcoded hex with the
documented link token, and the comment on the rule says so rather than claiming a
rescue that the measurement does not support.


The read-receipt label is the one worth reading twice: `#c9f0d5` was written for
a time when the timestamp line sat *inside* the coloured bubble. The markup moved
out and the rule did not, so the word "Read" rendered at 1.18:1 — present in the
accessibility tree, invisible on screen. Deleting the override restores the base
`--success`, and the diff is one rule removed rather than a new colour invented.

Two rules from `styles/tokens.css` were followed rather than worked around:
`--brand-blue` (3.12:1) is documented as a graphics token — "never body text and
never a white-text button" — and `--text-subtle` as the lightest value that still
clears 4.5:1 on every surface. The one new token this pass adds, `--green-800`,
mirrors the existing `--amber-800` precedent and carries its measured ratio in the
comment.

### Pictures restored, and re-measured against them — 2026-11-08

The compliance pass had swapped the photographs for three hand-drawn SVGs. The
user asked for the pictures back, so they are back — but in the self-hosted form,
not the form they were in when this program started:

| Slot | Was (before the compliance pass) | Is now |
|---|---|---|
| Landing, About, Privacy, Terms, Location, Researchers hero | a `coresg-normal.trae.ai` `text_to_image` hotlink (and an Unsplash hotlink on `/researchers`) | `public/campus-hero.jpg`, one file, served from the bundle |
| Login branding panel | the same Trae endpoint, portrait crop | the same `public/campus-hero.jpg` |
| Landing hero figure | `/student.png`, `alt="A KNHS student in school uniform holding a tablet"` | `/student.png`, `alt="A student in school uniform holding a tablet"` |
| Researcher cards | `/student2.webp` + `/student.png`, `alt="Portrait of <name>"` | the same two files, `alt=""` — decorative |

Two of those rows are not a pure revert. The Trae URLs could not be restored:
they are an IDE-internal endpoint that answers 301 and would 404 for a real
visitor, so the picture it generated could never have shipped. And the two `alt`
changes stayed, because both asserted something the image cannot support — that a
generic figure is a pupil of this school, and that a standing illustration is a
photograph of a named person.

The reason to re-measure rather than assume is that a photograph is brighter than
the artwork that replaced it, and the hero text is read against the navy washes
*composited over* that photograph. So the wash stack was resolved per surface —
`::before` (the photo, with its `cover` position) under `::after` (two linear and
two radial navy washes), each gradient evaluated at the text's own rectangle and
alpha-composited over the real JPEG pixels sampled from a canvas — for all seven
surfaces:

| Surface | Text nodes | Worst measured | Floor | Fails |
|---|---|---|---|---|
| `.landing-hero` | 24 | 3.36 | 3 (55px/900 display line) | 0 |
| `.rp-hero` | 4 | 6.60 | 4.5 | 0 |
| `.ap-hero` | 7 | 7.39 | 4.5 | 0 |
| `.lp-hero` (Privacy) | 4 | 7.53 | 4.5 | 0 |
| `.lp-hero` (Terms) | 4 | 7.53 | 4.5 | 0 |
| `.loc-hero` | 3 | 7.63 | 4.5 | 0 |
| `.auth-aside` | 11 | 7.53 | 4.5 | 0 |

The 3.36 is `.hero-heading-line2` — "One portal." at 55px/900 in `--blue-600`. It
clears the 3:1 large-text floor, and it is not something the photograph caused:
`#2563eb` against the wash's own navy is about 3.3 no matter what sits under the
wash, so this number was already the design's, not a regression from this change.
It is recorded rather than fixed for that reason.

The harness was `frontend/public/__probe.js`, deleted before the final build, and
`dist/` was listed afterwards to prove it. Screenshots were again not available —
the in-app Browser surface reports `visibilityState=hidden`, so the verification
here is arithmetic on the real computed styles and the real JPEG, not a picture of
the result. One consequence of that hidden surface is worth naming: the hero photo
layer's 900 ms fade-in never advances in a hidden tab, so `opacity` reads `0`
until the animation is finished by hand. That was checked and is a probe artifact,
not a broken image — the same layer reaches `opacity: 1` when the transition is
allowed to complete.

### What the live sweep covered

Signed in as `admin`, `teacher1`, `juandelacruz` (learner) and `parent1` against
the running dev API with real records, one browser tab, same-origin iframes so
each route got its own render: **36 route renders across 35 distinct paths —
2,419 text nodes measured in the batch runs, plus the 98 on the top-level
dashboard — 0 failing pairs.** The
routes: `/admin/enrollment/data-requests`,
`/admin/enrollment/overview`, `/admin/enrollment/applications`, `/admin/students`,
`/admin/sections`, `/admin/fees`, `/admin/attendance`, `/admin/audit-logs`,
`/admin/settings`, `/teacher/classes`, `/teacher/requirements`,
`/teacher/schedule`, `/teacher/attendance`, `/teacher/dashboard`,
`/teacher/review`, `/messages`, `/profile`, `/notifications`, `/announcements`,
`/student/dashboard`, `/student/attendance`, `/student/requirements`,
`/student/schedule`, `/student/fees`, `/student/submissions`,
`/student/enrollment`, `/parent/dashboard`, `/parent/children`,
`/parent/attendance`, `/parent/requirements`, `/parent/schedule`, `/parent/fees`,
`/parent/enrollment`, `/enroll`, `/enroll/apply`. `/messages` and
`/teacher/dashboard` were swept a second time at the top level of the tab (not in
an iframe) after the messaging fixes, with a conversation opened by pressing its
row, and `/login` was measured directly for the one link changed there.

Three teacher URLs requested as `admin` answered `/unauthorized` and were
excluded — which is the role gate working, and is recorded rather than counted as
a pass.

`reveal: true` was passed, so hover- and opacity-hidden content (the message
timestamp line, the feature-card hint, the conversation tools) was measured while
hidden. Three teacher URLs requested as `admin` answered `/unauthorized` and were
excluded — which is the role gate working, and is recorded rather than counted as
a pass.

### Gates

| Gate | Command | Result |
|---|---|---|
| Lint | `npx oxlint src` | 0 warnings, 0 errors, 268 files |
| Frontend suite | `npx vitest run` | **1076 passed / 1076** in 79 files, exit 0 |
| Backend suite | `.venv/Scripts/python.exe backend/manage.py test core` | **592 tests, 3 skipped, OK** in 41.76s |
| Build | `npm run build` | ✓ built — and `dist/` was listed afterwards to confirm the audit harness did not ship |
| External requests | grep of `index.html` and `src` | no third-party URL remains except the map embed behind its click-to-load facade |

### Recorded, not claimed

- Seven applications sit in the dev database and **none of them carries a consent
  stamp** (`consent_given_at` is null on all seven) — they were filed before the
  column existed. The field is nullable on purpose: `models.py:1354-1359` says an
  unrecorded consent must stay blank rather than be back-filled, because writing a
  timestamp for a tick nobody gave would be the exact forgery the field exists to
  prevent. `DataRequest` holds **0 rows**, and none of the 22 notifications in the
  dev database is of the `data_request.answered` type — so no test ask was ever
  answered against someone's real record, and the queue's on-screen behaviour is
  carried by `RegistrarDataRequestsPage.test.jsx` (11 specs) rather than by dev
  data.
- The three skipped backend tests are the pre-existing ones (`L-014` in
  KNOWN_LIMITATIONS) — nothing in this pass added a skip.
- Contrast was measured against the *rendered* surface. A style that only appears
  in a state nobody reached — a dialog opened by a workflow the dev database has
  no record for — is not covered by the sweep, which is why the two static scans
  over the CSS were run alongside it, and why every state they flagged was then
  read in the source to separate real text from `aria-hidden` glyphs before
  anything was changed.
- Glyphs marked `aria-hidden` (`.fc-icon`, `.rp-mark`, the wizard's completed step
  number, the conflict "✕" in `.sched-conflict-vs`) were judged against the 3:1
  non-text floor and left as they are. That is a deliberate pass, not an oversight.
- Item 20 answers an erasure request in writing; it does not delete a learner's
  academic history, because DepEd retention is the school's obligation to keep it.
  `L-017` in KNOWN_LIMITATIONS stays open for that reason: the software now
  supports the rights, a data protection officer still has to sign off on them.
- The two student images are back in `frontend/public/` and their licence is still
  unrecorded. Nothing in the repository says who made them or that the school may
  publish them, and `public/` is copied verbatim into `dist/`. `frontend/unshipped/`
  — the folder that held them while they were out of the bundle — was deleted when
  they came back, so the audit trail is this row and nothing else. Before any
  public deployment, either record the provenance next to the files or take them
  out again.
- The map facade still reaches Google once pressed. That is disclosed in Privacy §5
  in the same words a reviewer would need, and it is the only outbound request the
  frontend makes to a third party.
- Nothing was committed and nothing was deployed.

---

## Blocked tests

### BT-001: Gunicorn production server boot
- **Status:** BLOCKED
- **Reason:** Gunicorn imports `fcntl`, which is not available on Windows. The audit environment is Windows.
- **What was verified instead:** Package is installed (`pip show gunicorn` confirms 26.2.0); startup command documented; Phase 5 production-mode rehearsal confirmed all Django behavior (security headers, WhiteNoise static, CORS, auth) using `manage.py runserver` in `DJANGO_PRODUCTION=1` mode.
- **Next step:** Run `gunicorn config.wsgi --chdir backend --bind 0.0.0.0:8000 --workers 2` on the Linux deployment host and verify `GET /api/health/` returns 200.

### BT-002: PostgreSQL live connection
- **Status:** BLOCKED
- **Reason:** No PostgreSQL server available in the audit environment.
- **What was verified instead:** The `dj-database-url` parsing path was verified by inspecting the parsed settings dict with a postgres:// URL. `psycopg[binary]==3.3.6` is installed. The SQLite-to-PostgreSQL dump/load procedure was verified end-to-end against a scratch SQLite target in Phase 5.
- **Next step:** Provision Supabase PostgreSQL, set `DATABASE_URL`, run `python backend/manage.py migrate`, load data if needed, verify counts.

### BT-003: Android emulator testing
- **Status:** BLOCKED
- **Reason:** Android Studio and a compatible AVD are not available in the audit environment.
- **What was verified instead:** The mobile web app (`npx expo start --web`) runs in browser. TypeScript and ESLint pass. The API client's localhost guard was verified via code inspection.
- **Next step:** Install Android Studio, create an AVD, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api` in `mobile/.env.local`, run `npx expo start --android`, and verify login and dashboard for each role.

### BT-004: EAS build and physical device testing
- **Status:** BLOCKED
- **Reason:** Requires the project owner's Expo account credentials and a physical Android device.
- **What was verified instead:** `npx expo export -p android` (Hermes bytecode export) was verified in Phase 5 with exit 0. The `eas.json` build profiles are configured (preview APK, production AAB). The `EXPO_PUBLIC_API_URL` placeholder in `eas.json` must be replaced with the deployed backend URL before building.
- **Next step:** Replace the placeholder in `eas.json`, run `npx eas-cli@latest build -p android --profile preview`, install the APK on a device, and test login for all 4 roles against the deployed API.

---

## Manual workflow tests (local, dev mode)

The following tests were verified through code inspection and test coverage rather than live browser interaction. The backend automated tests directly cover these scenarios.

| Test ID | Feature | Test class | Evidence |
|---|---|---|---|
| M-001 | Login with valid credentials | AuthTests.test_login_success_returns_user_with_role | PASS — test verifies 200 + role in response |
| M-002 | Login with invalid password | AuthTests.test_login_invalid_credentials | PASS — test verifies 400 + non_field_errors |
| M-003 | Login / logout round trip | AuthTests.test_login_and_logout_roundtrip | PASS — verifies /me after login (200), /me after logout (401) |
| M-004 | Unauthenticated API access | AuthTests.test_me_requires_authentication | PASS — 401/403 without session |
| M-005 | Student sees only own submissions | AuthorizationTests.test_student_sees_only_own_submissions | PASS |
| M-006 | Student cannot verify own submission | AuthorizationTests.test_student_cannot_verify_own_submission | PASS — 400 |
| M-007 | Teacher can verify own class submission | AuthorizationTests.test_teacher_can_verify_own_class_submission | PASS — 200 |
| M-008 | Student cannot access user list | AuthorizationTests.test_student_cannot_list_users | PASS — 403 |
| M-009 | Student cannot use foreign student ID | SubmissionWriteTests.test_an_explicit_foreign_student_is_refused_not_honoured | PASS — 403 |
| M-010 | Student submission (actual browser payload) | SubmissionWriteTests.test_a_student_can_submit_with_the_payload_the_browser_actually_sends | PASS — 201 |
| M-011 | Resubmission refreshes row, no duplicate | SubmissionWriteTests.test_handing_in_twice_refreshes_the_row_instead_of_erroring | PASS — 201, count=1 |
| M-012 | Parent sees only linked child submissions | ParentScopedDataTests.test_parent_sees_all_linked_children_submissions | PASS |
| M-013 | Parent cannot access unlinked child | ParentScopedDataTests.test_parent_cannot_request_unlinked_child_submissions | PASS — 403 |
| M-014 | Parent cannot read unlinked attendance | ParentScopedDataTests.test_parent_cannot_read_unlinked_child_attendance | PASS — 403 |
| M-015 | Teacher cannot record foreign session | AttendanceWriteTests.test_teacher_cannot_record_attendance_for_foreign_session | PASS — 403 |
| M-016 | Duplicate session per day blocked | AttendanceWriteTests.test_session_per_day_uniqueness_enforced | PASS — 400 |
| M-017 | Attendance records include session detail | AttendanceRecordShapeTests.test_record_includes_nested_session_detail | PASS |
| M-018 | Session history scoped to teacher | AttendanceHistoryTests.test_session_history_is_scoped_to_the_teachers_own_classes | PASS |
| M-019 | Foreign session not reachable | AttendanceHistoryTests.test_another_teachers_session_is_not_reachable | PASS — 404 |
| M-020 | Dashboard shape per role | DashboardTests (4 tests) | PASS |
| M-021 | Notification on new requirement | In notify_new_requirement, covered by submission tests | PASS (silently handled on failure) |
| M-022 | Notification on attendance absent/late | notify_attendance_marked | PASS (covered by notification tests) |
| M-023 | Admin cannot self-deactivate | AdminUserSerializer.validate | PASS (serializer test coverage) |

---

## Known untested areas

| Area | Reason not tested |
|---|---|
| Web frontend browser interaction (each page/workflow) | No headless browser automation configured. Covered by unit tests and backend integration tests. |
| Mobile native Android UI | Emulator not available. |
| Physical device push notifications | No push notification service configured. In-app notifications are tested through the backend. |
| File upload end-to-end (frontend → backend → storage) | No frontend currently sends files. File validation is tested in the serializer (`validate_file_upload`). |
| Supabase Storage integration | Not implemented. Local filesystem only. |
| Email / SMTP delivery | The message, its recipient rules and its failure modes are tested (`core/tests_enrollment.py`, 5 specs) and the body is read from the console backend live, but no SMTP host is configured, so real delivery is unverified. |
| Multi-worker login throttle behavior | Throttle uses per-process memory; behavior with 2+ workers is a known limitation, not tested. |
| Production gunicorn + PostgreSQL | Blocked (see BT-001, BT-002). |
| Render / Vercel live deployment | Not deployed. |
