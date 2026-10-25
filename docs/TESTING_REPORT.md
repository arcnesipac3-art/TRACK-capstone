# TRACK — Testing Report

**Phase 7 audit date:** 2026-10-21
**Environment:** Windows 11, Python 3.15, Node.js (LTS), local SQLite database
**Tester:** Kiro (automated + manual inspection)

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
