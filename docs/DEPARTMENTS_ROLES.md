# TRACK — Departments, Roles & Permissions

This document describes TRACK's department-scoped access control: what a
department is, which permission keys exist, how they are enforced, and how a
Super Administrator configures all of it. It is the reference for the
**Departments & Roles** screen (`/admin/departments`) and the rules Django
enforces behind it.

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Role** | The four TRACK roles (`admin`, `teacher`, `student`, `parent`) — unchanged. Teachers, students and parents keep their existing role-scoped record access. |
| **Department** | A configurable unit *inside* the admin role (e.g. "Registrar — Student Records"). Administrators belong to one or more departments; inactive departments grant nothing. |
| **Permission key** | A code-defined capability such as `fees.record_payment`. The registry lives in `backend/core/rbac.py`; the database only records *who holds* a key, so a client can never invent a new one. |
| **Super Administrator** | An administrator with `is_super_admin` set. Holds every key regardless of departments, and is the only role that can grant the flag. |
| **Effective permissions** | An administrator's set = *personal grants* ∪ *grants of their active departments*. A Super Administrator holds all of them. Everyone else — every teacher, student and parent — holds none: their access stays role-based. |

Least privilege is the default posture: a department never implicitly grants
"everything" — only the keys explicitly ticked in its matrix. The web
interface hides what you cannot do, but Django re-checks every key on every
request; the UI is a courtesy, not the boundary.

---

## 2. The permission registry (24 keys)

| Module | Keys |
|---|---|
| User Management | `users.view`, `users.manage`, `users.manage_admins` |
| Departments & Roles | `departments.view`, `departments.manage`, `departments.permissions` |
| Student Records | `students.view`, `students.manage` |
| School Structure | `structure.manage` |
| Requirements | `requirements.view`, `requirements.manage`, `requirements.verify` |
| Fee Management | `fees.view`, `fees.manage`, `fees.record_payment`, `fees.reverse` |
| Attendance | `attendance.view`, `attendance.manage` |
| Announcements | `announcements.view`, `announcements.publish` |
| Reports | `reports.view`, `reports.export` |
| Audit Logs | `audit.view` |
| System Settings | `settings.manage` |

Notable combinations enforced server-side:

- Creating a **student account** needs `users.manage` **and** `students.manage`.
- Touching an **administrator account** needs `users.manage` **and**
  `users.manage_admins`.
- Changing the **school year calendar** needs `settings.manage`; grade levels,
  sections, subjects, assignments and schedules need `structure.manage`.

---

## 3. Seeded departments (starting points, not policy)

Migration `0007_seed_departments_and_permissions` creates five departments the
first time it runs. They are **configurable defaults**: rename them, rewrite
their matrices, deactivate them — nothing is hard-coded to their names.

| Code | Department | Granted keys (count) |
|---|---|---|
| `SYSADMIN` | System Administration | all 24 — same reach as a Super Administrator |
| `REGISTRAR` | Registrar — Student Records | 11: `users.view`, `users.manage`, `students.view`, `students.manage`, `structure.manage`, `requirements.view`, `requirements.manage`, `requirements.verify`, `reports.view`, `reports.export`, `announcements.view` |
| `FINANCE` | Finance — Fee Management | 8: `students.view` (fee screens pick students), `fees.view`, `fees.manage`, `fees.record_payment`, `fees.reverse`, `reports.view`, `reports.export`, `announcements.view` |
| `ATTENDANCE` | Attendance — Student Affairs | 6: `students.view`, `attendance.view`, `attendance.manage`, `requirements.view`, `reports.view`, `announcements.view` |
| `COMMS` | Communications — Announcements | 3: `announcements.view`, `announcements.publish`, `reports.view` |

The migration is idempotent: re-running it re-syncs the permission
definitions, creates only departments that do not exist yet (matched by code
or name), adds *missing* default grants without touching edited ones, and
marks pre-existing admin accounts as Super Administrators so nobody is locked
out by the upgrade.

**School-policy decisions left to the school** (deliberately not invented by
the implementation): the official department names and structure, which
department a given staff member belongs to, and the exact grants each
department ends up with. The seeded sets above follow the job descriptions
collected during gathering; adjust them to actual school policy.

---

## 4. Day-to-day administration

### Departments & Roles — `/admin/departments` (`departments.view`)

- The table lists each department with its code, administrator count, granted
  permission count and active status.
- **Permissions** opens the permission matrix: rows grouped by module, one
  checkbox per key. Saving replaces the whole set with exactly what is ticked.
  Viewing the matrix needs `departments.view`; editing it needs
  `departments.permissions`.
- **Add / Edit / Deactivate / Delete** need `departments.manage`.
  - *Deactivate* is the safe retirement path: the administrators keep their
    accounts but immediately lose the department's grants.
  - *Delete* only works for departments with nobody assigned — the error tells
    you how many administrators to reassign first.

### Assigning administrators — the account dialog (`users.manage_admins`)

Creating or editing an administrator offers:

- **Department assignment** — tick the departments the administrator belongs
  to. New administrator accounts must be scoped: at least one department, or
  the Super Administrator flag. (Scoping rules are validated by Django, not
  just the form.)
- **Super Administrator** checkbox — only visible to, and accepted from, a
  Super Administrator.
- **Personal permission grants** — extra keys for that one administrator,
  on top of their departments' matrices (`departments.permissions` to see and
  change them). A failed read is never treated as "no grants": the dialog
  refuses to overwrite grants it could not load.

### Super-administrator safeguards

Django refuses, with a 400 naming the reason, any change that would leave the
school with **no active Super Administrator**: demoting, deactivating or
deleting the last one. Granting `is_super_admin` requires the actor to be a
Super Administrator; demoting an administrator also clears their department
assignments so no orphaned access lingers.

### Audit trail — `/admin/audit-logs` (`audit.view`)

Account changes, password resets, department changes, permission grants and
super-administrator changes are recorded by the server at the moment of the
action (actor, action, target, description, timestamp, IP). The screen offers
search and date filters and is read-only — entries cannot be edited or
deleted through the API.

### Other screens

- **Dashboard** (`/admin/dashboard`) — every administrator sees only the
  modules their keys unlock: cards, statistics, shortcuts and the dashboard
  blocks all come from the permission-scoped payload. A missing block means
  "not authorized", never "no data".
- **Reports** (`/admin/reports`, `reports.view`) — school-wide account,
  attendance and submission summaries with CSV exports (`reports.export`).
  Fee collection and outstanding reports stay on the Fees screen's Reports
  tab, which already carries their filters.
- **System Settings** (`/admin/settings`, `settings.manage`) — the school-year
  calendar: one active year at a time (the model enforces it), plus live API
  status. Grade levels, sections and subjects remain under School Structure.

---

## 5. API endpoints

| Endpoint | Methods | Permission |
|---|---|---|
| `/api/departments/` | GET / POST | `departments.view` / `departments.manage` |
| `/api/departments/<id>/` | GET / PATCH / DELETE | `departments.view` / `departments.manage` |
| `/api/departments/<id>/permissions/` | GET / PUT | `departments.view` / `departments.permissions` |
| `/api/permissions/` | GET | any administrator (the read-only registry) |
| `/api/users/<id>/permissions/` | GET / PUT | `departments.permissions` |
| `/api/audit-logs/` | GET | `audit.view` (filters: `search`, `action`, `actor`, `target_model`, `date_from`, `date_to`) |
| `/api/users/`, `/api/users/<id>/` | GET / POST, PATCH, DELETE | read: `users.view`; write: `users.manage` (+ `users.manage_admins` for admin targets, + `students.manage` for student targets) |

Unauthorized requests return **403** for authenticated administrators missing
the key, **401** for anonymous callers — never a silent empty success.

---

## 6. Operations notes

- **Upgrades**: `python manage.py migrate` is sufficient; `0006` adds the
  schema and `0007` seeds/syncs data idempotently. Existing admin accounts
  become Super Administrators automatically — re-scope them to departments
  once you have decided your structure, then clear the flag if you wish.
- **Lockout protection**: as long as one active Super Administrator exists,
  the system will not let itself be left without one.
- **Emergency lockdown**: deactivate a department to revoke its whole
  permission set at once; reactivate it to restore the previous grants.
- **Verification**: `python manage.py test core` (227 tests) and
  `npm run test` in `frontend/` (227 tests) cover the RBAC rules, safeguards
  and screens, including the permission-gated navigation and the matrix.
