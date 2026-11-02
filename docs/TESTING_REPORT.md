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
| Email / SMTP | Console backend only. No SMTP configured. |
| Multi-worker login throttle behavior | Throttle uses per-process memory; behavior with 2+ workers is a known limitation, not tested. |
| Production gunicorn + PostgreSQL | Blocked (see BT-001, BT-002). |
| Render / Vercel live deployment | Not deployed. |
