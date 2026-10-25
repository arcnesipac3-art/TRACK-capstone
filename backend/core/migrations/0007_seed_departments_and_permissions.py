"""
Seed the permission registry and the default departments.

  * PermissionDefinition rows are synced from `core/rbac.py` (the registry is
    the source of truth; stale keys are removed, which also drops their grants).
  * The five suggested departments are created if an equivalent record does
    not already exist (matched on code *or* name, so a renamed department is
    never duplicated).
  * Their default permission sets are added — missing grants only, so an
    already-customised matrix is never silently rewritten.
  * Every administrator that already exists becomes a Super Administrator, so
    no account loses access it had before this migration.

Run with: python manage.py migrate
"""

from django.db import migrations

from core.rbac import DEFAULT_DEPARTMENTS, PERMISSIONS


def sync_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model("core", "PermissionDefinition")

    seen = set()
    for key, definition in PERMISSIONS.items():
        seen.add(key)
        PermissionDefinition.objects.update_or_create(
            key=key,
            defaults={
                "module": definition["module"],
                "action": definition["action"],
                "label": definition["label"],
                "description": definition["description"],
                "position": definition["position"],
            },
        )
    # A key that left the registry must leave the database too, otherwise the
    # matrix would keep offering a permission nothing enforces any more.
    PermissionDefinition.objects.exclude(key__in=seen).delete()


def seed_departments(apps, schema_editor):
    Department = apps.get_model("core", "Department")
    PermissionDefinition = apps.get_model("core", "PermissionDefinition")
    DepartmentPermission = apps.get_model("core", "DepartmentPermission")
    User = apps.get_model("core", "User")

    for spec in DEFAULT_DEPARTMENTS:
        # Match on the stable code first, then on the name, so re-running the
        # migration (or a renamed department) never creates a duplicate.
        department = (
            Department.objects.filter(code=spec["code"]).first()
            or Department.objects.filter(name=spec["name"]).first()
        )
        if department is None:
            department = Department.objects.create(
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                is_active=True,
            )
        else:
            department.description = spec["description"] or department.description
            department.save(update_fields=["description"])

        grants = PermissionDefinition.objects.filter(key__in=spec["permissions"])
        existing = set(
            DepartmentPermission.objects.filter(department=department)
            .values_list("permission_id", flat=True)
        )
        for permission in grants:
            if permission.id not in existing:
                DepartmentPermission.objects.create(
                    department=department, permission=permission
                )

    # Existing administrators already had full access; keep it that way. New
    # accounts are created least-privilege (is_super_admin=False).
    User.objects.filter(role="admin", is_super_admin=False).update(
        is_super_admin=True
    )


def unseed(apps, schema_editor):
    """Reverse: drop seeded departments and grants, clear the super flag."""
    Department = apps.get_model("core", "Department")
    User = apps.get_model("core", "User")

    for spec in DEFAULT_DEPARTMENTS:
        Department.objects.filter(code=spec["code"]).delete()
    User.objects.filter(role="admin").update(is_super_admin=False)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_department_permissiondefinition_user_is_super_admin_and_more"),
    ]

    operations = [
        migrations.RunPython(sync_permissions, migrations.RunPython.noop),
        migrations.RunPython(seed_departments, unseed),
    ]
