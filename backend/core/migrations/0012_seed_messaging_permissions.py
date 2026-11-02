"""
Register the messaging permission keys on an existing installation.

core/rbac.py is the source of truth and 0007 seeds from it, but 0007 has
already run on any database that predates messaging — so the three new keys
would never reach the matrix, and the departments that should hold them would
stay without. This adds the missing rows and grants them only to the two
departments the feature was designed for (System Administration and
Communications); a customised matrix is otherwise left exactly as it was.
"""

from django.db import migrations

from core.rbac import DEFAULT_DEPARTMENTS, PERMISSIONS

MESSAGING_KEYS = tuple(k for k in PERMISSIONS if k.startswith("messaging."))
SEED_DEPARTMENT_CODES = ("SYSADMIN", "COMMS")


def forward(apps, schema_editor):
    PermissionDefinition = apps.get_model("core", "PermissionDefinition")
    Department = apps.get_model("core", "Department")
    DepartmentPermission = apps.get_model("core", "DepartmentPermission")

    for key in MESSAGING_KEYS:
        definition = PERMISSIONS[key]
        PermissionDefinition.objects.get_or_create(
            key=key,
            defaults={
                "module": definition["module"],
                "action": definition["action"],
                "label": definition["label"],
                "description": definition["description"],
                "position": definition["position"],
            },
        )

    spec_by_code = {spec["code"]: spec for spec in DEFAULT_DEPARTMENTS}
    for code in SEED_DEPARTMENT_CODES:
        department = Department.objects.filter(code=code).first()
        if department is None:
            continue
        wanted = [k for k in spec_by_code[code]["permissions"] if k in MESSAGING_KEYS]
        existing = set(
            DepartmentPermission.objects.filter(department=department)
            .values_list("permission_id", flat=True)
        )
        for permission in PermissionDefinition.objects.filter(key__in=wanted):
            if permission.id not in existing:
                DepartmentPermission.objects.create(
                    department=department, permission=permission
                )


def reverse(apps, schema_editor):
    PermissionDefinition = apps.get_model("core", "PermissionDefinition")
    PermissionDefinition.objects.filter(key__in=MESSAGING_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0011_alter_notification_notif_type_conversation_message_and_more"),
    ]

    operations = [migrations.RunPython(forward, reverse)]
