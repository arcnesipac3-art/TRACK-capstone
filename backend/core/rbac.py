"""
TRACK — department-scoped role-based access control.

The four TRACK roles (admin / teacher / student / parent) stay exactly as they
are: teachers, students and parents keep the role-based record scoping they
already have. This module adds a second layer *inside* the admin role:

  * an administrator belongs to one or more departments,
  * each department carries an explicit set of permission keys
    (configured by the Super Administrator in the permission matrix),
  * an administrator may also hold extra keys granted personally,
  * a Super Administrator holds every key.

Rules the whole system relies on:

  * Permission keys are code-defined here — the database only records *who
    holds* a key, so a client can never invent a new one.
  * A department never implicitly grants "everything": only the keys that were
    explicitly granted to it.
  * This module must stay import-free of Django models so it can be used from
    migrations without circular imports.
"""

from collections import OrderedDict


# ---------------------------------------------------------------------------
# Modules (matrix rows) — keys must match navigation labels where possible
# ---------------------------------------------------------------------------

MODULES = OrderedDict([
    ("users", "User Management"),
    ("departments", "Departments & Roles"),
    ("students", "Student Records"),
    ("structure", "School Structure"),
    ("requirements", "Requirements"),
    ("fees", "Fee Management"),
    ("attendance", "Attendance"),
    ("announcements", "Announcements"),
    ("reports", "Reports"),
    ("audit", "Audit Logs"),
    ("settings", "System Settings"),
])


# ---------------------------------------------------------------------------
# Permission definitions — (module, action, label, description)
# The key is derived as "<module>.<action>".
# ---------------------------------------------------------------------------

PERMISSION_DEFS = (
    # ── User Management ────────────────────────────────────────────────────
    ("users", "view", "View accounts",
     "List and open user accounts."),
    ("users", "manage", "Manage accounts",
     "Create, edit and deactivate student, teacher and parent accounts, and "
     "reset their passwords."),
    ("users", "manage_admins", "Manage administrators",
     "Create and edit administrator accounts, assign departments and grant "
     "the Super Administrator flag."),

    # ── Departments & Roles ────────────────────────────────────────────────
    ("departments", "view", "View departments",
     "See departments and how they are configured."),
    ("departments", "manage", "Manage departments",
     "Create, edit, rename, activate and deactivate departments."),
    ("departments", "permissions", "Change permissions",
     "Grant or revoke permission keys for departments and administrators."),

    # ── Student Records ────────────────────────────────────────────────────
    ("students", "view", "View records",
     "List students and open student records."),
    ("students", "manage", "Manage records",
     "Create and edit student records (LRN, section, enrollment). Managing a "
     "student account also requires Manage accounts."),

    # ── School Structure ───────────────────────────────────────────────────
    ("structure", "manage", "Manage structure",
     "Create, edit and delete grade levels, sections, subjects, class "
     "assignments and class schedules."),

    # ── Requirements ───────────────────────────────────────────────────────
    ("requirements", "view", "View records",
     "See every requirement issued across the school."),
    ("requirements", "manage", "Manage records",
     "Create, edit and delete requirements for any class."),
    ("requirements", "verify", "Verify / approve",
     "Verify, return or otherwise change the status of student submissions."),

    # ── Fee Management ─────────────────────────────────────────────────────
    ("fees", "view", "View records",
     "See fee categories, assessments, payments and the fee dashboard."),
    ("fees", "manage", "Manage fee setup",
     "Create, edit and archive fee categories and fee assessments."),
    ("fees", "record_payment", "Record payments",
     "Record full and partial payments against an assessment."),
    ("fees", "reverse", "Reverse transactions",
     "Void or refund recorded payments; every reversal keeps its audit trail."),

    # ── Attendance ─────────────────────────────────────────────────────────
    ("attendance", "view", "View records",
     "See attendance sessions, records and summaries."),
    ("attendance", "manage", "Manage records",
     "Create and correct attendance sessions and marks."),

    # ── Announcements ──────────────────────────────────────────────────────
    ("announcements", "view", "View records",
     "Read every announcement, including ones aimed at other audiences."),
    ("announcements", "publish", "Publish announcements",
     "Create, edit, publish and archive announcements."),

    # ── Reports ────────────────────────────────────────────────────────────
    ("reports", "view", "View reports",
     "Open the reporting screens and their figures."),
    ("reports", "export", "Export reports",
     "Export report data out of the system."),

    # ── Audit ──────────────────────────────────────────────────────────────
    ("audit", "view", "View audit logs",
     "Read the audit trail of administrative actions."),

    # ── Settings ───────────────────────────────────────────────────────────
    ("settings", "manage", "Configure settings",
     "Manage school-wide settings such as the school year calendar."),
)


def _key(module, action):
    return f"{module}.{action}"


#: Key -> definition dict, in registry order.
PERMISSIONS = OrderedDict(
    (
        _key(module, action),
        {
            "key": _key(module, action),
            "module": module,
            "module_label": MODULES[module],
            "action": action,
            "label": label,
            "description": description,
            "position": position,
        },
    )
    for position, (module, action, label, description) in enumerate(PERMISSION_DEFS)
)

#: Every valid permission key, in registry order.
PERMISSION_KEYS = tuple(PERMISSIONS.keys())


# ---------------------------------------------------------------------------
# Default departments and the permission sets they are seeded with
# ---------------------------------------------------------------------------
#
# These are starting points, not policy: the Super Administrator can rename
# every department and rewrite its matrix after installation.

DEFAULT_DEPARTMENTS = (
    {
        "code": "SYSADMIN",
        "name": "System Administration",
        "description": (
            "Full authorized system oversight: administrator accounts, "
            "departments, roles, permissions, audit logs and school-wide "
            "settings."
        ),
        "permissions": PERMISSION_KEYS,  # every key, like a super administrator
    },
    {
        "code": "REGISTRAR",
        "name": "Registrar — Student Records",
        "description": (
            "Student profiles and enrollment records, student lists, grade "
            "levels and section assignments, requirements tracking and "
            "verification, and authorized student-record reports."
        ),
        "permissions": (
            "users.view",
            "users.manage",
            "students.view",
            "students.manage",
            "structure.manage",
            "requirements.view",
            "requirements.manage",
            "requirements.verify",
            "reports.view",
            "reports.export",
            "announcements.view",
        ),
    },
    {
        "code": "FINANCE",
        "name": "Finance — Fee Management",
        "description": (
            "Fee categories and assessments, full and partial payments, "
            "payment histories and receipts, outstanding balances, financial "
            "reports and authorized transaction reversals."
        ),
        "permissions": (
            "students.view",   # the fee screens pick students to assess
            "fees.view",
            "fees.manage",
            "fees.record_payment",
            "fees.reverse",
            "reports.view",
            "reports.export",
            "announcements.view",
        ),
    },
    {
        "code": "ATTENDANCE",
        "name": "Attendance — Student Affairs",
        "description": (
            "Attendance records and summaries, absence monitoring and "
            "attendance concerns."
        ),
        "permissions": (
            "students.view",
            "attendance.view",
            "attendance.manage",
            "requirements.view",
            "reports.view",
            "announcements.view",
        ),
    },
    {
        "code": "COMMS",
        "name": "Communications — Announcements",
        "description": (
            "Create, edit, publish and archive announcements, and manage "
            "announcement categories and audiences."
        ),
        "permissions": (
            "announcements.view",
            "announcements.publish",
            "reports.view",
        ),
    },
)
