# TRACK — Enrollment & Admissions Management

Complete enrollment management for Junior High (Grades 7–10) and Senior High
(Grades 11–12) at Kiwalan National High School. This document covers the
architecture, workflows, permissions, configuration behavior, API surface,
migration notes, test results, and the manual school-policy decisions that
remain.

---

## 1. Architecture overview

### Backend

| Layer | File | Responsibility |
|---|---|---|
| Models | `backend/core/models.py` (§ Enrollment & Admissions) | `EnrollmentPeriod`, `EnrollmentRequirement`, `EnrollmentApplication`, `ApplicationDocument`, `ApplicationReviewEvent`, `Enrollment` |
| Workflow service | `backend/core/enrollment.py` | Status state machine, requirement snapshotting, document materialization, section recommendations & capacity accounting, student identity matching, the atomic final-confirmation transaction, dashboard/report aggregates |
| Guest auth | `backend/core/enrollment_auth.py` | `Authorization: Guest <token>` authenticator + `IsAuthenticatedOrGuest` permission for account-less applicants (see §7) |
| Serializers | `backend/core/enrollment_serializers.py` | Applicant-facing (internal notes stripped) and staff-facing serializers, period/requirement configuration, action payloads |
| API views | `backend/core/enrollment_views.py` | Applicant endpoints (`/api/enrollment/applications/my/...`), public endpoints (track/claim), and staff endpoints (`/api/enrollment/applications/...`), document upload/download, reports |
| Notifications | `backend/core/enrollment_notifications.py` → re-exported by `core/notifications.py` | In-app notifications for submission, corrections, decisions, confirmation — all delivered post-commit and failure-swallowing |
| Permissions | `backend/core/rbac.py` keys `enrollment.view`, `enrollment.manage`, `enrollment.confirm` | Seeded to the **REGISTRAR** department (and SYSADMIN) by migration `0007` |
| Migrations | `backend/core/migrations/0008_...`, `0009_...` | `0008` creates the six enrollment tables + `Section.capacity` + notification additions; `0009` adds the guest/claim credentials to `EnrollmentApplication` (both additive only) |

### Frontend

All pages live in `frontend/src/pages/enrollment/` (plain JSX, existing TRACK
design system):

- **Public portal** (`/enroll`, no account required): `PublicEnrollPage`
  (open periods + start/track CTAs), `PublicTrackPage` (reference + contact
  lookup to recover a lost token), plus `ApplicationWizardPage` and
  `ApplicationDetailPage` mounted without login in guest mode (the detail page
  renders the **Create your account** panel once enrollment is confirmed).
- **Applicant portal** (mounted for both `/student/enrollment` and
  `/parent/enrollment`): `EnrollmentPortal` (layout), `EnrollmentLandingPage`,
  `ApplicationWizardPage` (5-step), `MyApplicationsPage`,
  `ApplicationDetailPage` (timeline, documents, actions, account-claim panel),
  `MyEnrollmentsPage`.
- **Registrar portal** (`/admin/enrollment/*`, gated on `enrollment.view`):
  `RegistrarDashboard`, `RegistrarApplicationsPage` (server-paginated queue),
  `RegistrarApplicationReviewPage` (full review workspace),
  `RegistrarEnrollmentsPage`, `EnrollmentPeriodsPage` + `PeriodFormModal`,
  `EnrollmentRequirementsPage` + `RequirementFormModal`, `RegistrarReportsPage`.
- Shared helpers: `frontend/src/utils/enrollment.js` (status maps, SHS
  detection, authorized file download); `frontend/src/services/api.js` carries
  the auth header — `Token` when signed in, otherwise `Guest <token>` when a
  public application token is stored in `sessionStorage`.

### Design principles

- **Accepted ≠ Enrolled.** An accepted application only becomes an enrollment
  when the Registrar runs the final confirmation, which re-validates
  everything inside one database transaction.
- **Snapshots preserve history.** Every application freezes its effective
  requirement checklist (`requirements_snapshot` + per-document snapshot
  fields) at creation. Later configuration edits never rewrite evidence.
- **Ownership is server-derived.** Applicants/parents never pass a student id
  as proof of ownership; access is resolved server-side — either the
  authenticated session (submitting user, linked student account, or verified
  parent–child link) or, for a public applicant, the one application their
  non-guessable guest token authenticates.
- **Accounts follow enrollment, never the reverse.** There is no open signup
  anywhere in TRACK. A student without an account can apply publicly; a login
  is only ever minted by an administrator, or by the one-time account claim
  that becomes possible **after** the Registrar confirms enrollment.
- **Capacity is backend-authoritative.** Rechecked at assignment *and* at
  confirmation under `select_for_update()` row locks (real on PostgreSQL; on
  SQLite the transaction + unique constraints still guarantee correctness).

---

## 2. Application & enrollment status transitions

```
draft ──submit(applicant)──▶ submitted ──start_review(staff)──▶ under_review
  │                                                     │
  │                                     request_corrections(staff)
  │                                                     ▼
  │                                               incomplete
  │                                                     │
  │                                     resubmit(applicant)
  │                                                     ▼
  │                                              resubmitted ──start_review──▶ under_review
  │                                                                              │
  │                        accept(staff) ◀───────────────────────────────────────┤
  │                            │                                                 │ reject(staff, reason required)
  │                            ▼                                                     ▼
  │                        accepted                                               rejected ◀ (terminal)
  │                            │
  │        confirm(staff, registrar key) — requires approved section + verified docs
  │                            ▼
  └──────────────▶ enrolled ◀ (terminal)

under_review ──waitlist(staff, if period.allow_waitlist)──▶ waitlisted
waitlisted ──start_review / reject(staff)──▶ under_review / rejected

Any live state (submitted, under_review, incomplete, resubmitted, accepted,
waitlisted) ──withdraw(applicant)──▶ withdrawn ◀ (terminal)
Draft & live states ──cancel(staff, reason required)──▶ cancelled ◀ (terminal)
```

Rules enforced in `enrollment.py::ALLOWED_TRANSITIONS` — the client can never
smuggle an arbitrary status through a serializer (`status` is not writable).
Each transition writes an immutable `ApplicationReviewEvent`
(actor, action, from→to, applicant-facing note, staff-only internal note).

### Document statuses

`not_submitted → submitted → verified | returned → submitted …`, plus
`waived` (staff-authorized only). A returned document blocks submission until
replaced. "Verified" is set only by a reviewer — uploading never verifies.

---

## 3. Role & permission matrix

| Capability | Public (no account) | Student | Parent/Guardian | Teacher | Admin (dept-scoped) |
|---|---|---|---|---|---|
| Browse open periods & document requirements | ✅ (no credential) | ✅ | ✅ | ✅ | ✅ |
| Start/save/submit/withdraw/resubmit an application | ✅ own, via guest token | ✅ own | ✅ linked children only | ❌ 403 | ❌ (use Registrar) |
| Upload/replace documents (draft or corrections only) | ✅ own, via guest token | ✅ own | ✅ linked children | ❌ | ❌ |
| View progress timeline (applicant-facing notes) | ✅ own, via guest token | ✅ own | ✅ linked children | ❌ | ❌ |
| Download uploaded documents | ✅ own, via guest token | ✅ own | ✅ linked children | ❌ (404) | ✅ `enrollment.view` |
| Recover access (reference + contact lookup) | ✅ own application only | n/a (account) | n/a (account) | ❌ | n/a |
| Create a student login (account claim) | ✅ own, only after enrollment is confirmed | — | — | ❌ | ✅ `users.manage` (any time) |
| Application queue, filters, review workspace | ❌ | ❌ | ❌ | ❌ (403) | ✅ `enrollment.view` |
| Verify/return/waive documents, decisions, corrections, section assignment, student linking | ❌ | ❌ | ❌ | ❌ | ✅ `enrollment.manage` |
| Final enrollment confirmation | ❌ | ❌ | ❌ | ❌ | ✅ `enrollment.confirm` |
| Configure periods & document requirements | ❌ | ❌ | ❌ | ❌ | ✅ `enrollment.manage` |
| Reports & dashboard | ❌ | ❌ | ❌ | ❌ | ✅ `enrollment.view` |

- The **public/guest** column is served by `IsAuthenticatedOrGuest` +
  `Authorization: Guest <token>` (`enrollment_auth.py`). The token scopes to
  exactly one application row; staff endpoints ignore it entirely (401).
- The **Registrar** department holds all three keys by default (seeded).
  **Finance/Comms/Attendance** departments do **not** receive enrollment keys;
  grant them explicitly via Departments & Roles if school policy needs it.
- **Super administrators** hold every key but are **not** exempt from workflow
  validation (documents must still be verified, capacity still enforced).
- Frontend hides unavailable actions (`can('enrollment.manage')` etc.), but
  every rule is enforced again at the API and object level.

---

## 4. Document requirement configuration

- Requirements are configured **per enrollment period**, optionally narrowed
  to a grade level and/or enrollment type. Each has: name, description,
  required/optional, verification required, active flag, display order.
- **Deactivate instead of delete**: once any application references a
  requirement, deletion is refused (400) — deactivation hides it from future
  checklists while historical documents keep their snapshot.
- **Application snapshotting**: creating a draft freezes the applicable
  checklist into `requirements_snapshot` and materializes one
  `ApplicationDocument` slot per requirement. A draft's checklist follows
  grade/type changes; once staff are reviewing, the checklist is frozen.
- Waivers exist (`waive` document action) as an explicit staff decision
  recorded in review history — whether waivers are allowed at all is a school
  policy decision (default: Registrar may waive with a recorded note).
- Admission documents are **separate** from academic `Requirement`
  assignments — the two systems never interact.

---

## 5. Section recommendation & capacity

- Recommendations list every section of the application's school year +
  grade level with: configured capacity (`Section.capacity`; blank = no
  limit), current **active** enrollments, available slots, and the current
  assignment marker. Ordering: most free slots first (unlimited-capacity
  sections sort last among equals), then name. **No invented criteria** —
  no gender balancing, academic ranking, or teacher preferences.
- Assignment (`POST .../assign-section/`) rechecks capacity under a section
  row lock; a full section returns **409 Conflict** with a human-readable
  message; staff refresh recommendations and pick another or leave the
  application awaiting assignment.
- Confirmation rechecks capacity again. Occupancy counts only
  `Enrollment.status = active` rows; dropped/withdrawn never occupy slots.
- Reassignment is allowed while the application is still live; each change is
  recorded as a `section_reassigned` review event with the previous section.
- Assignment alone never confirms an enrollment.

---

## 6. Registrar final confirmation

`confirm_enrollment()` runs in one atomic transaction and re-validates:

1. valid enrollment period; 2. status == accepted; 3. required documents
   satisfy the verification policy; 4. grade level valid for the period;
   5. staff-approved section assignment exists; 6. section still has capacity
   (row-locked recheck); 7. no other active enrollment for student + year
   (DB constraint `uniq_active_enrollment_per_student_year` as backstop);
   8. acting user holds `enrollment.confirm`.

**Student identity matching** (in order): explicitly linked profile → reuse;
exact **LRN** match → link existing identity (recorded as a review event);
otherwise create a brand-new student account (username derived from the
application reference, random password nobody is issued, LRN required). A
newly created account is **claimable**: the application receives a one-time
`account_claim_token`, and the enrolled student uses it after confirmation to
choose their own username and password (see §7 — `POST /enrollment/claim-account/`).
If the LRN matched an existing student, no new account and no claim token are
created — that student signs in with their existing credentials. Uncertain
name/DOB matches are only *suggested* in the review workspace and must be
linked manually by staff — nothing auto-merges.

**Idempotency**: retrying confirmation returns the existing enrollment
(`created: false`) without duplicating rows or notifications.
**Rollback**: any failure rolls back student creation, the enrollment row,
the status transition and the audit event together.
**Notifications** are queued `transaction.on_commit` — a notification failure
can never undo a committed confirmation.

On success: `Enrollment` row created (with section-name snapshot),
`StudentProfile.section` updated (attendance roster source), application →
`enrolled`, `AuditLog` entry written, applicant + student accounts notified.

---

## 7. API endpoints

All under `/api/`. Authentication: DRF token (`Authorization: Token …`) as
the rest of TRACK. Applicant endpoints scope to the caller's own records;
staff endpoints require admin + permission keys.

### Public portal (no account required)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /enrollment/periods/` | none | Open periods (closed history stays staff-only) |
| `GET /enrollment/requirements/?period=` | none | The document checklist for a period |
| `GET /grade-levels/` | none | Reference data for the wizard's grade dropdown (writes stay `structure.manage`) |
| `POST /enrollment/applications/my/` | none, throttled | Start an **account-less** application → 201 detail including `guest_token` (store it — it is the credential for every later call); anonymous creates are rate-limited per IP under the shared `auth` scope (10/min) so the public branch cannot be used to flood the Registrar's queue |
| `POST /enrollment/public/track/` | none, throttled | `{reference, contact}` → `{application_id, status, guest_token}`; `contact` must match the guardian email or a contact number on the application; every failure returns the same 404 (no reference probing) |
| `POST /enrollment/claim-account/` | none, throttled | `{claim_token, username, password}` → `{token, user}` (identical shape to `/auth/token/`). Only works on an **enrolled** application whose student account was just minted; single-use; validates username uniqueness + Django password validators; consumes the guest token |

All other applicant endpoints accept **either** a signed-in account **or**
`Authorization: Guest <token>` (guest requests are scoped to that single
application; `Token`/`Session` credentials always take precedence when both
could apply).

### Applicant

| Method & path | Purpose |
|---|---|
| `GET /enrollment/periods/` | Open/upcoming periods (staff see all; public for everyone) |
| `POST /enrollment/applications/my/` | Create draft `{period, enrollment_type, grade_level, strand?, previous_school?, previous_school_address?, student?}` → 201 detail (prefilled + snapshot + document slots; `guest_token` in the response for public applicants). Anonymous calls throttled 10/min per IP (`auth` scope) |
| `GET /enrollment/applications/my/` | Paginated own applications |
| `GET/PATCH/DELETE /enrollment/applications/my/{id}/` | Detail / edit (draft & corrections only) / delete draft |
| `POST /enrollment/applications/my/{id}/submit/` | Draft → Submitted (all required documents must be uploaded; period must still accept submissions) |
| `POST /enrollment/applications/my/{id}/resubmit/` | Corrections → Resubmitted |
| `POST /enrollment/applications/my/{id}/withdraw/` | Applicant withdrawal from live states |
| `POST /enrollment/applications/my/{id}/documents/{docId}/upload/` | Multipart (`file`), replace/verify-safety: PDF/JPG/PNG/WEBP/DOC/DOCX, ≤10 MB, magic-byte content check |
| `GET /enrollment/applications/{id}/documents/{docId}/download/` | Authorized streaming download (owner-side or `enrollment.view`; 404 for everyone else) |
| `GET /enrollment/my-enrollments/` | Own/children's confirmed enrollments |

### Staff

| Method & path | Permission | Purpose |
|---|---|---|
| `GET /enrollment/applications/` | `enrollment.view` | Queue: filters `school_year, grade_level, enrollment_type, status, period, submitted_from/to, search, ordering` + pagination |
| `GET /enrollment/applications/{id}/` | `enrollment.view` | Full workspace detail (documents, events incl. internal notes, student matches, blockers, available actions) |
| `POST /enrollment/applications/{id}/action/` | `enrollment.manage` | `{action: start_review\|request_corrections\|accept\|reject\|waitlist\|cancel, note, internal_note, reason}` — reason required for reject/cancel, note required for corrections; accept blocked while required documents are unverified; waitlist blocked unless `period.allow_waitlist` |
| `POST /enrollment/applications/{id}/documents/{docId}/action/` | `enrollment.manage` | `{action: verify\|return\|waive, note}` — note required for return |
| `GET /enrollment/applications/{id}/section-recommendations/` | `enrollment.view` | Live capacity rows |
| `POST /enrollment/applications/{id}/assign-section/` | `enrollment.manage` | `{section}` — 400 workflow errors, **409** when full |
| `POST /enrollment/applications/{id}/link-student/` | `enrollment.manage` | `{student}` manual identity link (review states only) |
| `POST /enrollment/applications/{id}/confirm/` | `enrollment.confirm` | Final confirmation → `{enrollment, created}` (201 created / 200 already-confirmed / 409 conflict) |
| `GET /enrollment/enrollments/` | `enrollment.view` | Confirmed enrollment history (filters + search) |
| `GET /enrollment/dashboard/` | `enrollment.view` | Real status counts, pending documents, section utilization, `by_grade` (`?school_year=` adds occupancy) |
| `GET /enrollment/reports/school-year/` | `enrollment.view` | `by_status`, `by_grade`, `by_type`, section occupancy (`?school_year=` required) |
| `GET/POST /enrollment/periods/`, `GET/PATCH/DELETE /enrollment/periods/{id}/` | read: public / write: `enrollment.manage` | Period configuration; delete refused (400) when applications exist; closing never deletes/cancels anything |
| `GET/POST /enrollment/requirements/`, `GET/PATCH/DELETE /enrollment/requirements/{id}/` | read: public / write: `enrollment.manage` | Requirement configuration; delete refused (400) once referenced |

Status codes: 401 unauthenticated · 403 missing permission · 404 not found
**or not owned** (no record enumeration) · 400 workflow/validation ·
409 capacity/concurrent-state conflicts.

### Example — confirm a filing (staff)

```http
POST /api/enrollment/applications/42/confirm/
Authorization: Token <registrar token>

{}→ 201 {"enrollment": {"id": 7, "student_name": " Juan Dela Cruz", "grade_level_name": "Grade 7", "section_display": "Sampaguita", "school_year_label": "2026-2027", "status": "active", ...}, "created": true}
```

### Example — public applicant to claimed account

```http
POST /api/enrollment/applications/my/                # no credentials
{"period": 3, "enrollment_type": "new", "grade_level": 1}
→ 201 {"id": 42, "reference": "APP-9F3C21AB07", "guest_token": "6b1f…", "status": "draft", ...}

Authorization: Guest 6b1f…                            # every later call
PATCH /api/enrollment/applications/my/42/             # identity + guardian block
POST   /api/enrollment/applications/my/42/documents/7/upload/   (multipart)
POST   /api/enrollment/applications/my/42/submit/
        … registrar reviews, accepts, assigns a section, confirms …

GET /api/enrollment/applications/my/42/               # still Guest …
→ {"status": "enrolled", "claim_token": "9aa2…", "account_claim_available": true, ...}

POST /api/enrollment/claim-account/                   # no credentials
{"claim_token": "9aa2…", "username": "juandelacruz", "password": "…"}
→ 200 {"token": "…", "user": {"username": "juandelacruz", "role": "student", …}}   # sign in as student
```

---

## 8. Migration & environment

- **Migrations**: 
  - `backend/core/migrations/0008_section_capacity_alter_notification_notif_type_and_more.py`
    — additive only (six new tables, nullable `Section.capacity`, one new
    nullable `Notification.application` FK, notification choice-list update).
  - `backend/core/migrations/0009_enrollmentapplication_account_claim_token_and_more.py`
    — additive only (three nullable columns on `EnrollmentApplication`:
    `guest_token`, `account_claim_token`, `account_claimed_at`).
  - Both applied to the dev SQLite DB; reversible; no existing rows touched;
    no data fabricated. Fresh environments: `python manage.py migrate`.
- **No new environment variables** are required. Existing `DATABASE_URL`
  (PostgreSQL in production) enables real row locking for capacity checks;
  on SQLite the transaction + unique constraints provide the same guarantees
  for this workload.
- Files upload to `MEDIA_ROOT/enrollment/documents/<year>/` (private local
  storage in development; served only through the authorized download
  endpoint, never through the public media URL). For production object
  storage, point Django's `STORAGES` at the chosen backend — the download
  endpoint keeps authorizing access either way.

---

## 9. Tests & actual results

### Backend — `python manage.py test core`

```
Ran 313 tests — all passing (last full run; includes the 75
core.tests_enrollment tests and every pre-existing TRACK test).
```

New coverage (`backend/core/tests_enrollment.py`, 75 tests):
period validation/close semantics/historical immutability · draft creation,
prefill, snapshotting, duplicate-open-application guard · submit/resubmit/
withdraw + double-submit · the full state machine (illegal moves by
applicants and staff, corrections round trip, accept gating on verification,
reject-with-reason, waitlist opt-in) · requirement config immutability of
existing evidence · upload authorization, content/extension/size validation,
replacement, teacher exclusion · applicant/parent object-level access and
internal-note redaction · section recommendations with real capacity ·
assignment/confirmation 409 conflicts · DB-level duplicate active enrollment
block · LRN matching, no-duplicate student creation, LRN-required new
creation · idempotent repeat confirmation (single row, single notification
pair) · notification-failure isolation (committed enrollment survives) ·
mid-confirmation rollback (no partial student/enrollment) · audit events ·
queue filters, dashboard and report figures · manual student linking ·
unauthorized/anonymous/wrong-role access · **public (account-less)
applications** (guest create/edit/upload/submit/withdraw, guest-token
scoping to exactly one application, staff endpoints ignoring guest tokens,
public period/requirement/grade-level reads, lost-token recovery through
reference + contact lookup, LRN duplicate guard for account-less filings) ·
**anonymous-create rate limit** (10/min per IP under the `auth` scope; the
throttled 11th request is refused before the view runs, and a signed-in
applicant is keyed per user so a public flood cannot lock an account out) ·
**post-enrollment account claim** (claim token minted only when confirmation
creates a *new* student account; claim requires ENROLLED status; single-use;
username uniqueness + password validators; guest credential consumed on
success; LRN match to an existing student never reissues an account).

### Frontend — `npm test` (Vitest)

```
Test Files  31 passed (31)
     Tests  347 passed (347)
```

56 enrollment-related tests: landing/wizard/detail flows, draft + prefill +
duplicate handling, missing-document submit block, confirmation dialogs with
single-submission guards, 404/permission/conflict states, period close &
delete rules, registrar action payloads, confirm button gating, dashboard
error-not-zeros, **public portal** (public landing + periods, track page
success/failure, guest-token persistence, header precedence Token > Guest,
claim form mismatch guard + successful claim storing the auth token,
returning-guest “Continue your application” on `/enroll`, guest duplicate
banner linking straight to the open application, `/auth/me/` skipped when no
token is stored).

### End-to-end browser walkthrough (live dev servers)

The full public flow was exercised against `runserver` + Vite in a real
browser: public landing → wizard (draft created, guest token persisted,
5 steps, PDF upload) → submit → registrar queue (start review, verify
document, accept, assign section, confirm) → applicant page shows
**ENROLLED** with the **Create your account** panel → claim (mismatch guard
first, then success) → auto-login as the new student at
`/student/enrollment` with the guest token cleared.

### Error-hunt pass (browser console + network audit)

Every public and Registrar screen was then audited for console errors and
4xx/5xx responses across ~80 requests. Findings and fixes:

1. **Spurious `401` on every anonymous page** — `AuthProvider` called
   `/auth/me/` on boot even with no credential stored (token auth is the
   SPA's only sign-in path, so the call could only ever fail). It now skips
   the request when no token is stored.
2. **`0:`-prefixed error text** — the duplicate-application guard answers
   with a bare JSON array of messages; `messageFrom` iterated it as an
   object and rendered `"0: This browser already…"`. Array payloads are now
   joined as plain text.
3. **Guest duplicate dead-end** — the wizard's duplicate detection only
   matched the account-holder wording, so a public applicant who tried to
   start a second application saw a generic error with no way back. Both
   wordings now match, and the banner resolves the applicant's existing
   application to offer **Open my application**.
4. **Returning-guest dead-end** — `/enroll` always offered *Start an
   Application*, which the one-open-application rule can only refuse. The
   landing now looks up the stored guest application (when a guest token
   exists) and offers **Continue your application** with its reference and
   status; terminal statuses keep *Start* plus a *view it* link. A rejected
   (401/403) guest token is cleared, but network failures never are.

After the fixes: zero console errors on `/enroll`, `/enroll/apply`,
`/enroll/track`, `/login`, the Registrar dashboard, application queue and
review workspace; the only non-2xx left in the audit is the deliberate 404
from a wrong track lookup.

### Other commands run

- `python manage.py check` — no issues.
- `python manage.py makemigrations --check --dry-run` — no pending changes.
- `npm run build` — succeeds; enrollment pages code-split into lazy chunks.
- `npm run lint` (oxlint) — no errors (7 pre-existing warnings elsewhere in
  the codebase, unchanged by this work).

---

## 10. Known limitations & school-policy decisions

1. **Public applications are bearer-token based.** A guest applicant's
   access is their `guest_token`, stored in browser storage. If the browser
   is cleared, recovery needs the reference + guardian email/contact lookup
   (`/enrollment/public/track/`); with neither, the Registrar must help
   manually. There is no email delivery of tokens (TRACK has no mail backend).
2. **LRN required for new students.** Confirmation refuses to mint a student
   identity without a Learner Reference Number; staff must link an existing
   record or obtain the LRN. (Reliable-identifier policy.) A public applicant
   who cannot provide an LRN stalls at confirmation, not before.
3. **Waitlisting is opt-in per period** (`allow_waitlist`); default off.
4. **Waivers** are a staff action (`waive`) with recorded note; whether any
   requirement *may* be waived is school policy — the system records the
   decision, it does not decide policy.
5. **Checklist freeze point** is draft creation (a draft's checklist follows
   grade/type changes; after submission it never changes). Config changes
   after submission intentionally do not touch existing applications.
6. **Closing a period** blocks new submissions (including drafts being
   submitted) but never deletes or cancels anything; staff can cancel a
   stuck draft explicitly with a reason.
7. **STRAND** is a free-text field; offering specific SHS strands per period
   is not yet configurable.
8. **Notifications are in-app only** (the whole TRACK system currently has no
   email/SMS delivery). A guest applicant therefore has no notification
   channel until they claim their account — they track progress through the
   portal instead.
9. **Concurrency testing** runs on SQLite in CI-style tests; the row-lock
   paths (`select_for_update`) are exercised for real on PostgreSQL in
   production.
10. **Duplicate public applications** are guarded on the LRN (one open
    application per LRN per school year) — a determined applicant without an
    LRN could still file twice; the registrar sees both in the queue.
11. **Account claims are self-service only after confirmation**; a lost
    claim token is recovered by the Registrar resetting the password through
    the existing admin flow (the account exists but has no known password
    until claimed or reset).
 12. **Anonymous endpoints share one per-IP rate budget** (the `auth` scope,
    10/min): public application creation, track lookup, claim and login all
    count against the caller's IP. Generous for individual applicants, but a
    whole computer lab behind a single NAT address could exhaust it during a
    rush — raise `TRACK_AUTH_THROTTLE_RATE` if the school's egress needs it.
    Signed-in applicants are keyed by user id and are unaffected.
