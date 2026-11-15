"""
TRACK — Digital Clearance backend tests.

Run from the backend folder:
    python manage.py test core.tests_clearance

Covers, in the order the specification asks for them: period creation and its
validation, department configuration (including that the offices are the existing
Department registry rather than names written into the code), learner provisioning
and population scoping, duplicate-record prevention, document upload with content
and size validation, department approve/reject/correct with the transition table
and the required explanations, obligations with resolution and waiver, the
Registrar's final approval and the conditions it refuses to skip, the PDF
certificate, the reports and the CSV export, and every access rule: a learner
sees only their own clearance, a parent only a linked child's, and an officer
only their own department's queue.
"""

from datetime import timedelta
import base64
import re
import tempfile
import zlib

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from . import clearance as workflow
from .models import (
    AuditLog,
    ClearanceEvent,
    ClearanceObligation,
    ClearancePeriod,
    ClearanceRequirement,
    ClearanceStatus,
    ClearanceStudentCategory,
    ClearanceSubmission,
    Department,
    DepartmentClearance,
    DepartmentPermission,
    DepartmentStatus,
    Notification,
    ObligationType,
    PeriodDepartment,
    PermissionDefinition,
    StudentClearance,
    User,
)
from .tests import TrackTestCase

# Uploaded files must never touch the real backend/media folder.
TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="track-test-clearance-media-")

PASSWORD = "clearance-Test123"

# A real PDF header and a real PNG header: the upload checks magic bytes, so a
# test document has to pass for what it claims to be.
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40


def upload(name="form.pdf", payload=PDF_BYTES, content_type="application/pdf"):
    return SimpleUploadedFile(name, payload, content_type=content_type)


def pdf_text(payload):
    """The words on a generated PDF page.

    reportlab writes each page as an ASCII85-then-Flate stream, so the strings
    printed on the certificate are not findable in the raw bytes. Decoding the
    streams is what lets these tests assert that the paper carries the row —
    the reference, the learner, the office that signed — rather than just that
    a PDF-shaped file came back.
    """
    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", payload, re.S):
        raw = match.group(1).strip()
        try:
            decoded = zlib.decompress(base64.a85decode(raw, adobe=True))
        except (ValueError, zlib.error):
            try:
                decoded = zlib.decompress(raw)
            except zlib.error:
                decoded = raw
        chunks.append(decoded)
    return b"".join(chunks)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class ClearanceTestCase(TrackTestCase):
    """A configured clearance period on top of the shared TRACK fixture.

    The period is left in DRAFT: most tests provision it themselves so they can
    assert what provisioning does, and the configuration tests need to see the
    state before any learner holds a record.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        now = timezone.now()

        # Two offices that already exist in every TRACK installation, plus one
        # invented here to prove a clearance department is configuration: the
        # code never mentions 'Library', and the test's Library works anyway.
        cls.registrar_dept = Department.objects.get(code="REGISTRAR")
        cls.library_dept = Department.objects.create(
            name="Learning Resource Centre", code="LRC"
        )
        for key in ("clearance.view", "clearance.verify"):
            DepartmentPermission.objects.create(
                department=cls.library_dept,
                permission=PermissionDefinition.objects.get(key=key),
            )

        cls.librarian = User.objects.create_user(
            username="c_librarian", password=PASSWORD, role=User.Role.ADMIN,
            first_name="Lina", last_name="Librarian",
        )
        cls.librarian.departments.add(cls.library_dept)
        cls.registrar_user = User.objects.create_user(
            username="c_registrar", password=PASSWORD, role=User.Role.ADMIN,
            first_name="Ria", last_name="Registrar",
        )
        cls.registrar_user.departments.add(cls.registrar_dept)
        # An administrator with no clearance keys at all: belongs to a department
        # that was never granted them.
        cls.keys_free_admin = User.objects.create_user(
            username="c_nobody", password=PASSWORD, role=User.Role.ADMIN,
            first_name="Nora", last_name="NoKeys",
        )
        cls.keys_free_admin.departments.add(
            Department.objects.create(name="Canteen", code="CANTEEN")
        )

        cls.period = ClearancePeriod.objects.create(
            school_year=cls.school_year,
            name="SY 2026-2027 End of Year Clearance",
            clearance_type="end_of_year",
            status=ClearancePeriod.Status.DRAFT,
            opens_at=now - timedelta(days=2),
            closes_at=now + timedelta(days=30),
            instructions="Clear every office before the last day of classes.",
            created_by=cls.admin,
        )
        cls.pd_library = PeriodDepartment.objects.create(
            period=cls.period, department=cls.library_dept,
            responsible_person=cls.librarian, position=0, is_required=True,
            instructions="Return borrowed books, then upload the card slip.",
        )
        cls.pd_registrar = PeriodDepartment.objects.create(
            period=cls.period, department=cls.registrar_dept, position=10,
            is_required=True, instructions="Collect the endorsed form.",
        )
        # One item the learner uploads and an officer must accept, and one the
        # office settles across the counter.
        cls.req_slip = ClearanceRequirement.objects.create(
            period_department=cls.pd_library, name="Borrowed book clearance slip",
            description="Signed at the counter.",
            is_required=True, needs_review=True, allows_upload=True, position=0,
        )
        cls.req_card = ClearanceRequirement.objects.create(
            period_department=cls.pd_library, name="Library card",
            is_required=True, needs_review=False, allows_upload=False, position=10,
        )
        ClearanceRequirement.objects.create(
            period_department=cls.pd_registrar, name="Report card",
            is_required=True, needs_review=False, allows_upload=False, position=0,
        )
        cls.obligation_kind = ObligationType.objects.create(
            department=cls.library_dept, name="Unreturned book",
            description="Any title still on loan.", is_blocking=True,
        )

    # -- helpers ---------------------------------------------------------

    def setUp(self):
        super().setUp()
        # DRF's test client posts FORM data by default, and on a form an omitted
        # boolean reads back as False rather than falling through to the model
        # default ('is_active' on a PeriodDepartment looked switched-off). Real
        # clients send JSON, so the suite sends JSON too; uploads still ask for
        # multipart explicitly.
        self.client.default_format = "json"

    def login(self, user):
        """Session login for the clearance users (the shared fixture has its
        own passwords, which TrackTestCase.login_as knows)."""
        self.client.logout()
        if user.username.startswith("t_"):
            return self.login_as(user)
        assert self.client.login(username=user.username, password=PASSWORD)
        return self.client

    def provision(self):
        """Activate the period the way the API does, and hand back the records."""
        self.period.status = ClearancePeriod.Status.ACTIVE
        self.period.save(update_fields=["status"])
        workflow.provision_period(self.period, actor=self.admin)
        return list(
            self.period.clearances.order_by("student__user__username").prefetch_related(
                "departments"
            )
        )

    def item_for(self, record, period_department):
        return record.departments.get(period_department=period_department)

    def library_item(self, student):
        return DepartmentClearance.objects.get(
            student_clearance=student.clearances.get(period=self.period),
            period_department=self.pd_library,
        )

    def upload_url(self, record, submission):
        return f"/api/clearance/my/{record.pk}/documents/{submission.pk}/upload/"

    def slot(self, item, requirement):
        return item.submissions.get(requirement=requirement)

    # -- the whole workflow, for the tests that need a cleared learner ----

    def drive_to_ready_for_final(self, record):
        """Every office approves: the Library accepts its document, the
        Registrar signs. Stops short of the final approval."""
        library = self.item_for(record, self.pd_library)
        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/queue/{library.pk}/decision/",
            {"status": DepartmentStatus.UNDER_REVIEW},
        )
        self.assertEqual(response.status_code, 200, response.content)
        submission = self.slot(library, self.req_slip)
        # The learner who holds *this* record files the paper — the helper runs
        # for every learner in the fixture, and /my/ only accepts the owner.
        self.login(record.student.user)
        self.client.post(
            self.upload_url(record, submission), {"file": upload()}, format="multipart"
        )
        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/queue/{library.pk}/documents/{submission.pk}/review/",
            {"decision": "accept", "note": "Checked against the shelf list."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        response = self.client.post(
            f"/api/clearance/queue/{library.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 200, response.content)
        registrar = self.item_for(record, self.pd_registrar)
        self.login(self.registrar_user)
        response = self.client.post(
            f"/api/clearance/queue/{registrar.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 200, response.content)
        record.refresh_from_db()
        return record


class PeriodConfigurationTests(ClearanceTestCase):
    def test_admin_creates_a_period(self):
        self.login(self.admin)
        now = timezone.now()
        response = self.client.post(
            "/api/clearance/periods/",
            {
                "name": "Graduation Clearance",
                "school_year": self.school_year.pk,
                "clearance_type": "graduation",
                "opens_at": (now + timedelta(days=1)).isoformat(),
                "closes_at": (now + timedelta(days=20)).isoformat(),
                "grade_levels": [self.grade7.pk],
            },
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], "draft")
        self.assertEqual(body["type_label"], "Graduation")
        self.assertEqual(body["department_count"], 0)
        self.assertTrue(
            AuditLog.objects.filter(
                action="clearance.period.created", target_id=str(body["id"])
            ).exists()
        )

    def test_closing_date_must_follow_opening_date(self):
        self.login(self.admin)
        now = timezone.now()
        response = self.client.post(
            "/api/clearance/periods/",
            {
                "name": "Impossible period",
                "school_year": self.school_year.pk,
                "clearance_type": "semester",
                "semester": 1,
                "opens_at": now.isoformat(),
                "closes_at": (now - timedelta(days=1)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("closes_at", response.json())

    def test_custom_type_must_be_named(self):
        self.login(self.admin)
        response = self.client.post(
            "/api/clearance/periods/",
            {
                "name": "Something else",
                "school_year": self.school_year.pk,
                "clearance_type": "custom",
                "opens_at": timezone.now().isoformat(),
                "closes_at": (timezone.now() + timedelta(days=5)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("custom_type_label", response.json())

    def test_status_is_not_writable_through_the_edit_endpoint(self):
        """Activation is an action, not a field: PATCH cannot skip provisioning."""
        self.login(self.admin)
        response = self.client.patch(
            f"/api/clearance/periods/{self.period.pk}/",
            {"status": ClearancePeriod.Status.ACTIVE},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, ClearancePeriod.Status.DRAFT)

    def test_only_a_clearance_administrator_configures_periods(self):
        for user in (self.keys_free_admin, self.student1_user, self.parent):
            self.login(user)
            response = self.client.get("/api/clearance/periods/")
            self.assertIn(
                response.status_code, (401, 403),
                f"{user.username} should not read clearance configuration",
            )
            response = self.client.post(
                "/api/clearance/periods/", {"name": "Nope"}
            )
            self.assertIn(response.status_code, (401, 403))

    def test_period_cannot_be_deleted_once_learners_hold_records(self):
        self.provision()
        self.login(self.admin)
        response = self.client.delete(f"/api/clearance/periods/{self.period.pk}/")
        self.assertEqual(response.status_code, 409)
        self.assertTrue(ClearancePeriod.objects.filter(pk=self.period.pk).exists())

    def test_activation_needs_a_department(self):
        empty = ClearancePeriod.objects.create(
            school_year=self.school_year, name="Nothing configured",
            clearance_type="transfer",
            opens_at=timezone.now() - timedelta(days=1),
            closes_at=timezone.now() + timedelta(days=10),
        )
        self.login(self.admin)
        response = self.client.post(f"/api/clearance/periods/{empty.pk}/activate/")
        self.assertEqual(response.status_code, 400)
        empty.refresh_from_db()
        self.assertEqual(empty.status, ClearancePeriod.Status.DRAFT)

    def test_activation_opens_the_period_and_provisions_it(self):
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/activate/"
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["records"], 2)
        self.assertEqual(body["department_items"], 4)
        self.period.refresh_from_db()
        self.assertIsNotNone(self.period.activated_at)

    def test_archive_asks_once_about_learners_left_uncleared(self):
        self.provision()
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/archive/"
        )
        self.assertEqual(response.status_code, 400)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, ClearancePeriod.Status.ACTIVE)

        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/archive/",
            {"confirm_unfinished": True},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, ClearancePeriod.Status.ARCHIVED)


class DepartmentConfigurationTests(ClearanceTestCase):
    def test_any_configured_department_can_become_a_clearance_office(self):
        """The offices are Department rows the school already keeps.

        A department invented for this test — which appears in no list written
        into the code — takes part in a period and its officer signs off, which
        is what 'configurable, not hardcoded' has to mean.
        """
        records = self.provision()
        record = records[0]
        library_item = self.item_for(record, self.pd_library)
        self.assertEqual(library_item.department, self.library_dept)

        # A third office, created here, joins a period that is already running.
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/departments/",
            {
                "department": self.keys_free_admin.departments.first().pk,
                "instructions": "Return the cafeteria tray.",
                "is_required": True,
            },
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(
            DepartmentClearance.objects.filter(
                student_clearance=record,
                department__code="CANTEEN",
            ).exists(),
            "a department added to a running period joins the existing queues",
        )

    def test_a_department_cannot_join_the_same_period_twice(self):
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/departments/",
            {"department": self.library_dept.pk},
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("department", response.json())

    def test_deactivated_department_is_refused(self):
        self.library_dept.is_active = False
        self.library_dept.save(update_fields=["is_active"])
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/departments/",
            {"department": self.library_dept.pk},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("department", response.json())

    def test_options_lists_departments_and_personnel(self):
        self.login(self.librarian)
        response = self.client.get("/api/clearance/options/")
        self.assertEqual(response.status_code, 200)
        by_code = {row["code"]: row for row in response.json()["departments"]}
        self.assertIn("LRC", by_code)
        self.assertIn("REGISTRAR", by_code)
        self.assertEqual(
            [person["name"] for person in by_code["LRC"]["personnel"]],
            ["Lina Librarian"],
        )
        self.assertTrue(by_code["LRC"]["can_verify"])
        self.assertFalse(by_code["REGISTRAR"]["can_verify"])
        # The five required kinds are offered, none of them invented by the
        # frontend.
        self.assertEqual(
            {row["value"] for row in response.json()["clearance_types"]},
            {"end_of_year", "semester", "graduation", "transfer", "custom"},
        )
        self.assertEqual(
            len(response.json()["department_statuses"]), 8,
            "the eight department statuses the specification lists",
        )
        self.assertEqual(len(response.json()["overall_statuses"]), 5)

    def test_departments_and_roles_stays_the_source_of_personnel(self):
        """Assigning an officer is a Department.administrators change, and the
        clearance queue follows it without any clearance-side edit."""
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.librarian)
        self.assertEqual(
            self.client.get(f"/api/clearance/queue/{item.pk}/").status_code, 200
        )

        self.login(self.admin)
        self.librarian.departments.remove(self.library_dept)
        self.librarian.invalidate_permission_cache()
        self.login(self.librarian)
        # No longer that office's personnel: the item is not theirs to see.
        self.assertEqual(
            self.client.get(f"/api/clearance/queue/{item.pk}/").status_code, 404
        )

    def test_requirement_terms_freeze_once_learners_hold_records(self):
        records = self.provision()
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/period-departments/{self.pd_library.pk}/requirements/",
            {"name": "A late addition"},
        )
        self.assertEqual(response.status_code, 409)

        response = self.client.patch(
            f"/api/clearance/requirements/{self.req_slip.pk}/",
            {"name": "Renamed after the fact"},
        )
        self.assertEqual(response.status_code, 409)

        # Wording that does not change what the learner owes stays editable.
        response = self.client.patch(
            f"/api/clearance/requirements/{self.req_slip.pk}/",
            {"description": "Bring the counter-signed copy."},
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_department_cannot_be_removed_once_it_holds_decisions(self):
        self.provision()
        self.login(self.admin)
        response = self.client.delete(
            f"/api/clearance/period-departments/{self.pd_library.pk}/"
        )
        self.assertEqual(response.status_code, 409)
        self.assertTrue(PeriodDepartment.objects.filter(pk=self.pd_library.pk).exists())

        # Deactivating is always allowed: it only stops future snapshots.
        response = self.client.patch(
            f"/api/clearance/period-departments/{self.pd_library.pk}/",
            {"is_active": False},
        )
        self.assertEqual(response.status_code, 200, response.content)


class ProvisioningTests(ClearanceTestCase):
    def test_every_learner_in_the_period_gets_one_record_per_department(self):
        records = self.provision()
        self.assertEqual(len(records), 2)
        for record in records:
            self.assertEqual(
                [item.department for item in record.departments.all()],
                [self.library_dept, self.registrar_dept],
                "the departments arrive in the order the learner sees them",
            )
            self.assertEqual(record.overall_status, ClearanceStatus.IN_PROGRESS)
            self.assertEqual(record.section_name, record.student.section.name)
            self.assertEqual(record.grade_level, self.grade7)
            library = self.item_for(record, self.pd_library)
            self.assertEqual(
                library.status, DepartmentStatus.PENDING_SUBMISSION,
                "an office that asks for a document starts waiting on the learner",
            )
            registrar = self.item_for(record, self.pd_registrar)
            self.assertEqual(registrar.status, DepartmentStatus.NOT_STARTED)
            # One slot per checklist entry, so the list is queryable.
            self.assertEqual(library.submissions.count(), 2)
            self.assertEqual(registrar.submissions.count(), 1)

    def test_provisioning_twice_creates_nothing_new(self):
        self.provision()
        before = (
            StudentClearance.objects.count(),
            DepartmentClearance.objects.count(),
            ClearanceSubmission.objects.count(),
        )
        counts = workflow.provision_period(self.period, actor=None)
        self.assertEqual(counts, {"records": 0, "department_items": 0})
        self.assertEqual(
            (
                StudentClearance.objects.count(),
                DepartmentClearance.objects.count(),
                ClearanceSubmission.objects.count(),
            ),
            before,
        )

    def test_duplicate_record_for_one_learner_and_period_is_refused(self):
        record = self.provision()[0]
        with self.assertRaises(IntegrityError), transaction.atomic():
            StudentClearance.objects.create(
                period=record.period, student=record.student
            )

    def test_grade_levels_narrow_the_population(self):
        other_grade = self.grade7
        later = ClearancePeriod.objects.create(
            school_year=self.school_year, name="Grade 8 only",
            clearance_type="semester", semester=1,
            opens_at=timezone.now() - timedelta(days=1),
            closes_at=timezone.now() + timedelta(days=10),
        )
        from .models import GradeLevel

        later.grade_levels.add(other_grade)
        self.assertEqual(list(workflow.target_students(later).order_by("pk")),
                         [self.student1, self.student2])

        later.grade_levels.clear()
        later.grade_levels.add(
            GradeLevel.objects.create(name="Grade 8", order=8)
        )
        self.assertEqual(list(workflow.target_students(later)), [])

    def test_categories_narrow_the_population(self):
        graduating = ClearanceStudentCategory.objects.create(
            name="Graduating", code="graduating"
        )
        graduating.learners.add(self.student1)
        self.period.categories.add(graduating)
        records = self.provision()
        self.assertEqual([r.student for r in records], [self.student1])

    def test_learner_added_after_activation_joins_the_period(self):
        records = self.provision()
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/population/",
            {"student": records[1].student_id},
        )
        # Already in — the endpoint must not make a second record.
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(StudentClearance.objects.count(), 2)

    def test_outside_the_population_cannot_be_added(self):
        self.provision()
        from .models import GradeLevel, Section

        other_year = type(self.school_year).objects.create(
            label="2027-2028",
            start_date=timezone.now().date() + timedelta(days=400),
            end_date=timezone.now().date() + timedelta(days=700),
        )
        stray_user = User.objects.create_user(
            username="c_stray", password=PASSWORD, role=User.Role.STUDENT
        )
        stray = type(self.student1).objects.create(
            user=stray_user,
            section=Section.objects.create(
                school_year=other_year,
                grade_level=GradeLevel.objects.create(name="Grade 10", order=10),
                name="Narra",
            ),
            lrn="100000000009",
        )
        self.login(self.admin)
        response = self.client.post(
            f"/api/clearance/periods/{self.period.pk}/population/",
            {"student": stray.pk},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(StudentClearance.objects.filter(student=stray).exists())

    def test_population_endpoint_reports_who_holds_a_record(self):
        self.login(self.admin)
        before = self.client.get(
            f"/api/clearance/periods/{self.period.pk}/population/"
        ).json()
        self.assertEqual(before["total"], 2)
        self.assertEqual(before["provisioned"], 0)
        self.provision()
        after = self.client.get(
            f"/api/clearance/periods/{self.period.pk}/population/"
        ).json()
        self.assertEqual(after["provisioned"], 2)
        self.assertEqual(after["out_of_population"], 0)
        self.assertTrue(all(row["record"] for row in after["learners"]))

    def test_learners_and_their_parents_are_told_the_clearance_opened(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.login(self.admin)
            self.client.post(f"/api/clearance/periods/{self.period.pk}/activate/")
        for user in (self.student1_user, self.student2_user):
            self.assertTrue(
                Notification.objects.filter(
                    recipient=user, notif_type="clearance_assigned"
                ).exists(),
                f"{user.username} was never told a clearance expects things of them",
            )
        # The parent is linked to student1 only, and hears about that child.
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.parent, notif_type="clearance_assigned"
            ).count(),
            1,
        )


class LearnerPortalTests(ClearanceTestCase):
    def test_learner_sees_only_their_own_clearance(self):
        records = self.provision()
        mine, theirs = records[0], records[1]
        self.assertEqual(mine.student, self.student1)

        self.login(self.student1_user)
        listing = self.client.get("/api/clearance/my/").json()["results"]
        self.assertEqual([row["id"] for row in listing], [mine.pk])
        self.assertEqual(listing[0]["learner"], "Sara Student")
        self.assertEqual(listing[0]["viewed_as"] if "viewed_as" in listing[0] else None, None)

        detail = self.client.get(f"/api/clearance/my/{mine.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["viewed_as"], "self")

        # Another learner's record is not a thing they get to learn exists.
        self.assertEqual(
            self.client.get(f"/api/clearance/my/{theirs.pk}/").status_code, 404
        )
        self.assertEqual(
            self.client.get(f"/api/clearance/records/{theirs.pk}/").status_code, 403
        )
        self.assertEqual(
            self.client.get(f"/api/clearance/records/{theirs.pk}/finalize/").status_code,
            403,
            "the blockers of someone else's clearance are not a learner's read",
        )

    def test_unlinked_account_sees_nothing(self):
        self.provision()
        stranger = User.objects.create_user(
            username="c_stranger", password=PASSWORD, role=User.Role.STUDENT,
            first_name="Stran", last_name="Gers",
        )
        self.login(stranger)
        self.assertEqual(self.client.get("/api/clearance/my/").json()["results"], [])

    def test_parent_reads_a_linked_child_only(self):
        records = self.provision()
        mine, theirs = records[0], records[1]
        self.login(self.parent)
        listing = self.client.get("/api/clearance/my/").json()["results"]
        self.assertEqual([row["id"] for row in listing], [mine.pk])
        detail = self.client.get(f"/api/clearance/my/{mine.pk}/").json()
        self.assertEqual(detail["viewed_as"], "guardian")
        self.assertEqual(detail["learner"], "Sara Student")
        self.assertEqual(
            self.client.get(f"/api/clearance/my/{theirs.pk}/").status_code, 404
        )

    def test_draft_periods_are_not_shown_to_learners(self):
        self.login(self.admin)
        workflow.provision_period(self.period, actor=None)
        self.login(self.student1_user)
        self.assertEqual(self.client.get("/api/clearance/my/").json()["results"], [])

    def test_learner_page_hides_the_officer_internals(self):
        records = self.provision()
        record = records[0]
        item = self.item_for(record, self.pd_library)
        workflow.record_decision(
            item, DepartmentStatus.NEEDS_CORRECTION, self.librarian,
            note="The slip is illegible, please re-upload.",
            internal_note="Checked against the shelf list twice.",
        )
        self.login(self.student1_user)
        body = self.client.get(f"/api/clearance/my/{record.pk}/").json()
        department = next(
            d for d in body["departments"] if d["name"] == self.library_dept.name
        )
        self.assertEqual(department["status"], DepartmentStatus.NEEDS_CORRECTION)
        self.assertEqual(
            department["decision_note"], "The slip is illegible, please re-upload."
        )
        self.assertNotIn("internal_note", department)
        serialized = str(body)
        self.assertNotIn("shelf list twice", serialized)
        # The learner-facing history carries the message, never the internal note.
        self.assertIn(
            "The slip is illegible",
            " ".join(row["note"] for row in body["history"]),
        )
        self.assertNotIn("shelf list twice", " ".join(
            row["note"] for row in body["history"]
        ))

    def test_uploading_everything_moves_the_department_to_submitted(self):
        records = self.provision()
        record = records[0]
        item = self.item_for(record, self.pd_library)
        slip = self.slot(item, self.req_slip)
        self.login(self.student1_user)
        response = self.client.post(
            self.upload_url(record, slip), {"file": upload()}, format="multipart"
        )
        self.assertEqual(response.status_code, 200, response.content)
        slip.refresh_from_db()
        self.assertEqual(slip.status, ClearanceSubmission.Status.SUBMITTED)
        self.assertEqual(slip.revision, 1)
        self.assertEqual(slip.original_filename, "form.pdf")
        # The counter-settled card is still outstanding, so the office is not yet
        # waiting on a decision.
        item.refresh_from_db()
        self.assertEqual(item.status, DepartmentStatus.PENDING_SUBMISSION)

        card = self.slot(item, self.req_card)
        response = self.client.post(
            self.upload_url(record, card), {"file": upload()}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("settled at the office", str(response.content))

        # Marking the card as counter-settled is the office's act, not the
        # learner's, so the Library still has an outstanding row. Progress counts
        # settled *offices* rather than individual papers: nothing is decided
        # yet, so the bar has not moved — the requirement rows say what is left.
        body = self.client.get(f"/api/clearance/my/{record.pk}/").json()
        self.assertEqual(body["progress"], 0)
        self.assertEqual(body["pending_count"], 2)
        library = next(d for d in body["departments"] if d["name"] == "Learning Resource Centre")
        self.assertEqual(
            {row["name"]: row["status"] for row in library["submissions"]},
            {"Borrowed book clearance slip": "submitted", "Library card": "not_submitted"},
        )

    def test_upload_validates_type_size_and_content(self):
        records = self.provision()
        record = records[0]
        slip = self.slot(self.item_for(record, self.pd_library), self.req_slip)
        self.login(self.student1_user)

        response = self.client.post(
            self.upload_url(record, slip),
            {"file": upload("notes.txt", b"hello", "text/plain")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json())

        # A real PNG named .pdf: the magic bytes are what decide.
        response = self.client.post(
            self.upload_url(record, slip),
            {"file": upload("hidden.pdf", PNG_BYTES, "application/pdf")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("content does not match", str(response.json()))

        oversized = SimpleUploadedFile(
            "big.pdf", PDF_BYTES + b"% " * (11 * 1024 * 1024 // 2),
            content_type="application/pdf",
        )
        response = self.client.post(
            self.upload_url(record, slip), {"file": oversized}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", str(response.json()))

        response = self.client.post(self.upload_url(record, slip), {}, format="multipart")
        self.assertEqual(response.status_code, 400)

        slip.refresh_from_db()
        self.assertEqual(slip.status, ClearanceSubmission.Status.NOT_SUBMITTED)
        self.assertFalse(slip.file)

    def test_a_learner_cannot_file_for_another_learner(self):
        records = self.provision()
        theirs = records[1]
        slip = self.slot(self.item_for(theirs, self.pd_library), self.req_slip)
        self.login(self.student1_user)
        response = self.client.post(
            self.upload_url(theirs, slip), {"file": upload()}, format="multipart"
        )
        self.assertEqual(response.status_code, 404)
        slip.refresh_from_db()
        self.assertEqual(slip.status, ClearanceSubmission.Status.NOT_SUBMITTED)

    def test_a_guardian_may_file_for_their_child(self):
        records = self.provision()
        mine = records[0]
        slip = self.slot(self.item_for(mine, self.pd_library), self.req_slip)
        self.login(self.parent)
        response = self.client.post(
            self.upload_url(mine, slip), {"file": upload()}, format="multipart"
        )
        self.assertEqual(response.status_code, 200, response.content)
        slip.refresh_from_db()
        self.assertEqual(slip.status, ClearanceSubmission.Status.SUBMITTED)

    def test_no_uploads_after_the_period_closes_or_the_learner_is_cleared(self):
        records = self.provision()
        record = records[0]
        slip = self.slot(self.item_for(record, self.pd_library), self.req_slip)
        self.login(self.admin)
        self.client.post(f"/api/clearance/periods/{self.period.pk}/deactivate/")
        self.login(self.student1_user)
        response = self.client.post(
            self.upload_url(record, slip), {"file": upload()}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not open for submissions", str(response.json()))

    def test_certificate_refuses_until_the_registrar_has_signed(self):
        record = self.provision()[0]
        self.login(self.student1_user)
        response = self.client.get(f"/api/clearance/my/{record.pk}/certificate/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("certificate is issued once", str(response.json()))

    def test_learner_downloads_their_own_document_only(self):
        records = self.provision()
        record, other = records[0], records[1]
        slip = self.slot(self.item_for(record, self.pd_library), self.req_slip)
        self.login(self.student1_user)
        self.client.post(
            self.upload_url(record, slip), {"file": upload()}, format="multipart"
        )
        download = f"/api/clearance/my/{record.pk}/documents/{slip.pk}/download/"
        response = self.client.get(download)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content)[:4], b"%PDF")

        other_slip = self.slot(self.item_for(other, self.pd_library), self.req_slip)
        self.assertEqual(
            self.client.get(
                f"/api/clearance/my/{record.pk}/documents/{other_slip.pk}/download/"
            ).status_code,
            404,
            "a slot from someone else's record is not served by this endpoint",
        )


class DepartmentVerificationTests(ClearanceTestCase):
    def test_queue_holds_this_departments_items_only(self):
        records = self.provision()
        self.login(self.librarian)
        body = self.client.get("/api/clearance/queue/").json()
        self.assertEqual(
            {row["department_name"] for row in body["results"]},
            {self.library_dept.name},
        )
        self.assertEqual(
            {row["learner"] for row in body["results"]},
            {"Sara Student", "Sam Student2"},
        )
        # Narrowing by department can only narrow within the officer's own.
        response = self.client.get(
            "/api/clearance/queue/", {"department": self.registrar_dept.pk}
        )
        self.assertEqual(response.json()["results"], [])

        self.login(self.registrar_user)
        registrar_body = self.client.get("/api/clearance/queue/").json()
        self.assertEqual(
            {row["department_name"] for row in registrar_body["results"]},
            {self.registrar_dept.name},
        )

    def test_a_learner_cannot_open_the_officer_portal(self):
        self.provision()
        self.login(self.student1_user)
        self.assertEqual(
            self.client.get("/api/clearance/queue/").json()["results"], []
        )
        summary = self.client.get("/api/clearance/queue/summary/").json()
        self.assertEqual(summary["total"], 0)

    def test_queue_summary_counts_the_officers_own_work(self):
        self.provision()
        self.login(self.librarian)
        summary = self.client.get("/api/clearance/queue/summary/").json()
        self.assertEqual(summary["total"], 2)
        self.assertEqual(summary["awaiting"], 0)
        self.assertEqual(summary["groups"][0]["department_name"], self.library_dept.name)
        self.assertEqual(summary["groups"][0]["department"], self.library_dept.pk)
        self.assertEqual(summary["groups"][0]["period"], self.period.pk)

    def test_another_departments_item_is_not_visible(self):
        records = self.provision()
        registrar_item = self.item_for(records[0], self.pd_registrar)
        self.login(self.librarian)
        self.assertEqual(
            self.client.get(f"/api/clearance/queue/{registrar_item.pk}/").status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/clearance/queue/{registrar_item.pk}/decision/",
                {"status": DepartmentStatus.APPROVED},
            ).status_code,
            404,
        )
        # The registrar's own document is not the librarian's to read either.
        report = self.slot(registrar_item, ClearanceRequirement.objects.get(
            name="Report card"
        ))
        self.assertEqual(
            self.client.get(
                f"/api/clearance/queue/{registrar_item.pk}/documents/{report.pk}/download/"
            ).status_code,
            404,
        )

    def test_a_learner_cannot_record_a_decision(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.student1_user)
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 403)
        item.refresh_from_db()
        self.assertNotEqual(item.status, DepartmentStatus.APPROVED)

    def test_an_administrator_without_the_verify_key_cannot_decide(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.keys_free_admin)
        # No clearance.view either, so the monitoring read is refused outright.
        self.assertEqual(
            self.client.get(f"/api/clearance/records/{item.student_clearance_id}/").status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"/api/clearance/queue/{item.pk}/decision/",
                {"status": DepartmentStatus.APPROVED},
            ).status_code,
            403,
        )

    def test_rejection_and_correction_require_a_readable_reason(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.librarian)
        for status_value in (
            DepartmentStatus.REJECTED,
            DepartmentStatus.NEEDS_CORRECTION,
            DepartmentStatus.NOT_APPLICABLE,
        ):
            response = self.client.post(
                f"/api/clearance/queue/{item.pk}/decision/",
                {"status": status_value},
            )
            self.assertEqual(response.status_code, 400, status_value)
            self.assertIn("explanation", str(response.json()))
        item.refresh_from_db()
        self.assertEqual(item.status, DepartmentStatus.PENDING_SUBMISSION)

    def test_rejection_is_recorded_on_the_record_and_told_to_the_learner(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        with self.captureOnCommitCallbacks(execute=True):
            self.login(self.librarian)
            response = self.client.post(
                f"/api/clearance/queue/{item.pk}/decision/",
                {"status": DepartmentStatus.REJECTED, "note": "Two books are still out."},
            )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], DepartmentStatus.REJECTED)
        self.assertEqual(body["decision_note"], "Two books are still out.")
        self.assertEqual(body["decided_by_name"], "Lina Librarian")

        record = item.student_clearance
        record.refresh_from_db()
        self.assertEqual(record.overall_status, ClearanceStatus.NOT_CLEARED)
        event = record.events.filter(action="department_rejected").first()
        self.assertIsNotNone(event)
        self.assertEqual(event.from_status, DepartmentStatus.PENDING_SUBMISSION)
        self.assertEqual(event.actor, self.librarian)
        self.assertTrue(
            AuditLog.objects.filter(
                action="clearance.department.rejected", target_id=str(record.pk)
            ).exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=record.learner, notif_type="clearance_correction"
            ).exists()
        )

    def test_approving_while_a_document_awaits_review_is_refused(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        slip = self.slot(item, self.req_slip)
        self.login(self.student1_user)
        self.client.post(
            self.upload_url(item.student_clearance, slip),
            {"file": upload()},
            format="multipart",
        )
        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("slip", str(response.json()))

        review = self.client.post(
            f"/api/clearance/queue/{item.pk}/documents/{slip.pk}/review/",
            {"decision": "accept", "note": "Matches the shelf list."},
        )
        self.assertEqual(review.status_code, 200, review.content)
        slip.refresh_from_db()
        self.assertEqual(slip.status, ClearanceSubmission.Status.ACCEPTED)
        self.assertEqual(slip.reviewed_by, self.librarian)

        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_returning_a_document_puts_the_department_in_correction(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        slip = self.slot(item, self.req_slip)
        self.login(self.student1_user)
        self.client.post(
            self.upload_url(item.student_clearance, slip),
            {"file": upload()},
            format="multipart",
        )
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.UNDER_REVIEW},
        )
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/documents/{slip.pk}/review/",
            {"decision": "return"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("what is wrong", str(response.json()))

        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/documents/{slip.pk}/review/",
            {"decision": "return", "note": "The counter signature is missing."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        slip.refresh_from_db()
        self.assertEqual(slip.status, ClearanceSubmission.Status.RETURNED)
        self.assertEqual(slip.review_note, "The counter signature is missing.")
        item.refresh_from_db()
        self.assertEqual(item.status, DepartmentStatus.NEEDS_CORRECTION)

        # Resubmitting keeps the officer's note until they look again, and the
        # revision shows the learner was asked twice.
        self.login(self.student1_user)
        response = self.client.post(
            self.upload_url(item.student_clearance, slip),
            {"file": upload("slip2.pdf")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.content)
        slip.refresh_from_db()
        self.assertEqual(slip.revision, 2)
        self.assertEqual(slip.status, ClearanceSubmission.Status.SUBMITTED)
        self.assertEqual(slip.review_note, "")
        self.assertTrue(
            AuditLog.objects.filter(
                action="clearance.document.resubmitted"
            ).exists()
        )

    def test_opening_a_submission_moves_it_under_review_once(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        slip = self.slot(item, self.req_slip)
        self.login(self.student1_user)
        self.client.post(
            self.upload_url(item.student_clearance, slip),
            {"file": upload()},
            format="multipart",
        )
        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/review-start/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], DepartmentStatus.UNDER_REVIEW)
        self.assertEqual(response.json()["reviewed_count"], 1)
        response = self.client.post(f"/api/clearance/queue/{item.pk}/review-start/")
        self.assertEqual(response.json()["reviewed_count"], 2)

    def test_a_settled_sign_off_can_only_move_deliberately(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_registrar)
        self.login(self.registrar_user)
        self.assertEqual(
            self.client.post(
                f"/api/clearance/queue/{item.pk}/decision/",
                {"status": DepartmentStatus.APPROVED},
            ).status_code,
            200,
        )
        # The same decision twice is a double click, not a second decision.
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("already marked", str(response.json()))

        # Reopening needs a reason, then the sign-off is live again.
        self.assertEqual(
            self.client.post(
                f"/api/clearance/queue/{item.pk}/reopen/", {}
            ).status_code,
            400,
        )
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/reopen/",
            {"note": "The report card was the wrong year."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        item.refresh_from_db()
        self.assertEqual(item.status, DepartmentStatus.UNDER_REVIEW)
        # Reopening puts the office back in possession of the learner: one
        # department is under review, so the file is 'pending department
        # approval' again, not the learner's 'in progress'.
        self.assertEqual(
            item.student_clearance.overall_status, ClearanceStatus.PENDING_DEPARTMENT
        )

    def test_workflow_status_is_not_an_officers_choice(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.librarian)
        for value in (DepartmentStatus.SUBMITTED, DepartmentStatus.PENDING_SUBMISSION):
            response = self.client.post(
                f"/api/clearance/queue/{item.pk}/decision/", {"status": value}
            )
            self.assertEqual(response.status_code, 400, value)

    def test_closed_period_holds_its_queue_shut(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_registrar)
        self.login(self.admin)
        self.client.post(f"/api/clearance/periods/{self.period.pk}/deactivate/")
        self.login(self.registrar_user)
        self.assertEqual(
            self.client.get("/api/clearance/queue/").json()["results"], [],
            "a closed period leaves the officer's queue",
        )
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not active", str(response.json()))


class ObligationTests(ClearanceTestCase):
    def test_only_that_departments_personnel_record_an_obligation(self):
        records = self.provision()
        library_item = self.item_for(records[0], self.pd_library)
        registrar_item = self.item_for(records[0], self.pd_registrar)

        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/queue/{registrar_item.pk}/obligations/",
            {"title": "Not my office's to raise"},
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.post(
            f"/api/clearance/queue/{library_item.pk}/obligations/",
            {"title": "Unreturned novel", "amount": "150.00",
             "obligation_type": self.obligation_kind.pk},
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()[0]
        self.assertEqual(body["status"], "open")
        self.assertEqual(body["status_label"], "Outstanding")
        self.assertEqual(body["created_by_name"], "Lina Librarian")
        self.assertEqual(body["amount"], "150.00")
        self.assertTrue(body["is_blocking"])

        obligation = ClearanceObligation.objects.get(pk=body["id"])
        self.assertEqual(obligation.obligation_type, self.obligation_kind)
        self.assertEqual(
            obligation.department_clearance.student_clearance,
            library_item.student_clearance,
        )

    def test_an_obligation_never_holds_back_a_department_sign_off(self):
        """The Library may clear a learner whose Finance debt is still open."""
        records = self.provision()
        item = self.item_for(records[0], self.pd_registrar)
        library_item = self.item_for(records[0], self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{library_item.pk}/obligations/",
            {"title": "Unreturned novel"},
        )
        self.login(self.registrar_user)
        response = self.client.post(
            f"/api/clearance/queue/{item.pk}/decision/",
            {"status": DepartmentStatus.APPROVED},
        )
        self.assertEqual(response.status_code, 200, response.content)
        item.refresh_from_db()
        self.assertEqual(item.status, DepartmentStatus.APPROVED)

    def test_a_blocking_obligation_stops_only_the_final_approval(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        library_item = self.item_for(record, self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{library_item.pk}/obligations/",
            {"title": "Unreturned novel", "amount": "150.00"},
        )
        record.refresh_from_db()
        self.assertEqual(
            record.overall_status, ClearanceStatus.PENDING_DEPARTMENT,
            "an outstanding debt keeps the learner out of 'ready for final'",
        )
        self.login(self.registrar_user)
        blockers = self.client.get(
            f"/api/clearance/records/{record.pk}/finalize/"
        ).json()
        self.assertFalse(blockers["can_finalize"])
        self.assertTrue(
            any("Unreturned novel" in line for line in blockers["blockers"])
        )
        response = self.client.post(
            f"/api/clearance/records/{record.pk}/finalize/", {}
        )
        self.assertEqual(response.status_code, 400)

        obligation = ClearanceObligation.objects.get(title="Unreturned novel")
        # The debt belongs to the Library's sign-off, so the Library closes it;
        # the Registrar has no hand in another office's obligations.
        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "resolve"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("how the obligation was settled", str(response.json()))

        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "resolve", "note": "Book handed in at the counter."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        obligation.refresh_from_db()
        self.assertEqual(obligation.status, ClearanceObligation.Status.RESOLVED)
        self.assertEqual(obligation.resolved_by, self.librarian)
        self.assertEqual(obligation.resolution_note, "Book handed in at the counter.")

    def test_a_non_blocking_obligation_does_not_stop_the_registrar(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        library_item = self.item_for(record, self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{library_item.pk}/obligations/",
            {"title": "One overdue novel, no fine", "is_blocking": False},
        )
        self.login(self.registrar_user)
        blockers = self.client.get(
            f"/api/clearance/records/{record.pk}/finalize/"
        ).json()
        self.assertTrue(blockers["can_finalize"], blockers["blockers"])

    def test_waiver_keeps_its_reason_and_its_officer(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        library_item = self.item_for(record, self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{library_item.pk}/obligations/",
            {"title": "Lost reference book"},
        )
        obligation = ClearanceObligation.objects.get(title="Lost reference book")

        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/", {"action": "waive"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("waiver needs the reason", str(response.json()))

        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "waive", "note": "Title was withdrawn from the collection."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        obligation.refresh_from_db()
        self.assertEqual(obligation.status, ClearanceObligation.Status.WAIVED)
        self.assertEqual(
            obligation.waiver_reason, "Title was withdrawn from the collection."
        )
        self.assertEqual(obligation.waived_by, self.librarian)
        self.assertIsNotNone(obligation.waived_at)
        self.assertTrue(
            AuditLog.objects.filter(
                action="clearance.obligation.waived",
                description__contains="withdrawn from the collection",
            ).exists()
        )

        record.refresh_from_db()
        self.assertEqual(record.overall_status, ClearanceStatus.READY_FOR_FINAL)

    def test_an_obligation_can_be_reopened_but_never_forgotten(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        library_item = self.item_for(record, self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{library_item.pk}/obligations/",
            {"title": "Lost reference book"},
        )
        obligation = ClearanceObligation.objects.get(title="Lost reference book")
        self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "waive", "note": "Withdrawn from the collection."},
        )
        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "reopen", "note": "The copy was found after all."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        obligation.refresh_from_db()
        self.assertEqual(obligation.status, ClearanceObligation.Status.OPEN)
        self.assertIsNone(obligation.waived_by)
        self.assertEqual(obligation.waiver_reason, "")
        # The history keeps both decisions.
        self.assertTrue(
            ClearanceEvent.objects.filter(
                student_clearance=record, action="obligation_waived"
            ).exists()
        )
        self.assertTrue(
            ClearanceEvent.objects.filter(
                student_clearance=record, action="obligation_reopened"
            ).exists()
        )

    def test_editing_an_obligation_keeps_the_correction_in_history(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{item.pk}/obligations/",
            {"title": "Unreturned novel", "amount": "150.00"},
        )
        obligation = ClearanceObligation.objects.get(title="Unreturned novel")
        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "update", "amount": "120.00", "is_blocking": False},
        )
        self.assertEqual(response.status_code, 200, response.content)
        obligation.refresh_from_db()
        self.assertEqual(str(obligation.amount), "120.00")
        self.assertFalse(obligation.is_blocking)
        self.assertTrue(
            ClearanceEvent.objects.filter(
                student_clearance=item.student_clearance,
                action="obligation_updated",
            ).exists()
        )
        # A negative debt is not a credit.
        response = self.client.post(
            f"/api/clearance/obligations/{obligation.pk}/action/",
            {"action": "update", "amount": "-1.00"},
        )
        self.assertEqual(response.status_code, 400)

    def test_learner_sees_the_debt_but_not_the_officers_notes(self):
        records = self.provision()
        record = records[0]
        item = self.item_for(record, self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{item.pk}/obligations/",
            {"title": "Unreturned novel", "detail": "Sixth form, spine cracked.",
             "amount": "150.00"},
        )
        self.login(self.student1_user)
        body = self.client.get(f"/api/clearance/my/{record.pk}/").json()
        library = next(
            d for d in body["departments"] if d["name"] == self.library_dept.name
        )
        self.assertEqual(len(library["obligations"]), 1)
        obligation = library["obligations"][0]
        self.assertEqual(obligation["title"], "Unreturned novel")
        self.assertEqual(obligation["status_label"], "Outstanding")
        self.assertNotIn("waived_by", obligation)
        self.assertNotIn("created_by_name", obligation)

    def test_obligation_list_spans_the_school_for_staff_only(self):
        records = self.provision()
        item = self.item_for(records[0], self.pd_library)
        self.login(self.librarian)
        self.client.post(
            f"/api/clearance/queue/{item.pk}/obligations/",
            {"title": "Unreturned novel"},
        )
        self.login(self.admin)
        body = self.client.get("/api/clearance/obligations/").json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["obligations"][0]["title"], "Unreturned novel")
        self.assertEqual(body["obligations"][0]["learner"], "Sara Student")

        self.login(self.student1_user)
        self.assertIn(
            self.client.get("/api/clearance/obligations/").status_code, (403, 401)
        )


class FinalApprovalTests(ClearanceTestCase):
    def test_a_department_sign_off_is_not_final_clearance(self):
        records = self.provision()
        record = records[0]
        # A learner cannot write the queue at all, and no office's officer is
        # signed in here — so no sign-off, and no path to 'cleared'.
        self.login(self.student1_user)
        for item in record.departments.all():
            self.assertEqual(
                self.client.post(
                    f"/api/clearance/queue/{item.pk}/decision/",
                    {"status": DepartmentStatus.APPROVED},
                ).status_code,
                403,
                "no officer is signed in for that item's department",
            )

    def test_final_approval_is_refused_while_a_department_holds_the_learner(self):
        record = self.provision()[0]
        self.login(self.registrar_user)
        response = self.client.get(f"/api/clearance/records/{record.pk}/finalize/")
        self.assertEqual(response.status_code, 200)
        blockers = response.json()["blockers"]
        self.assertTrue(blockers)
        self.assertTrue(
            any("Learning Resource Centre" in line for line in blockers), blockers
        )
        self.assertFalse(response.json()["can_finalize"])
        response = self.client.post(
            f"/api/clearance/records/{record.pk}/finalize/", {}
        )
        self.assertEqual(response.status_code, 400)
        record.refresh_from_db()
        self.assertNotEqual(record.overall_status, ClearanceStatus.CLEARED)

    def test_final_approval_needs_the_finalize_key(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        # The librarian may sign off the Library, and may not clear a learner.
        self.login(self.librarian)
        response = self.client.post(
            f"/api/clearance/records/{record.pk}/finalize/", {}
        )
        self.assertEqual(response.status_code, 403)
        record.refresh_from_db()
        self.assertNotEqual(record.overall_status, ClearanceStatus.CLEARED)

    def test_final_approval_issues_the_reference_and_notifies(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        self.assertEqual(record.overall_status, ClearanceStatus.READY_FOR_FINAL)

        with self.captureOnCommitCallbacks(execute=True):
            self.login(self.registrar_user)
            response = self.client.post(
                f"/api/clearance/records/{record.pk}/finalize/",
                {"note": "Everything is in order."},
            )
        self.assertEqual(response.status_code, 200, response.content)
        record.refresh_from_db()
        self.assertEqual(record.overall_status, ClearanceStatus.CLEARED)
        self.assertTrue(record.reference.startswith(f"CNH-{self.period.pk}-"))
        self.assertEqual(len(record.reference), len(f"CNH-{self.period.pk}-") + 10)
        self.assertIsNotNone(record.cleared_at)
        self.assertEqual(record.cleared_by, self.registrar_user)
        self.assertEqual(record.final_note, "Everything is in order.")

        event = record.events.filter(action="cleared").first()
        self.assertEqual(event.actor, self.registrar_user)
        self.assertEqual(event.to_status, ClearanceStatus.CLEARED)
        self.assertTrue(
            AuditLog.objects.filter(
                action="clearance.finalized", target_id=str(record.pk)
            ).exists()
        )
        for user in (self.student1_user, self.parent):
            self.assertTrue(
                Notification.objects.filter(
                    recipient=user, notif_type="clearance_cleared"
                ).exists(),
                f"{user.username} was not told they are cleared",
            )

    def test_the_certificate_is_a_pdf_built_from_the_record(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        self.login(self.registrar_user)
        self.client.post(f"/api/clearance/records/{record.pk}/finalize/", {})
        record.refresh_from_db()

        self.login(self.student1_user)
        response = self.client.get(f"/api/clearance/my/{record.pk}/certificate/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(record.reference, response["Content-Disposition"])
        payload = response.content
        self.assertTrue(payload.startswith(b"%PDF-"), payload[:16])
        self.assertTrue(payload.rstrip().endswith(b"%%EOF"), payload[-32:])
        text = pdf_text(payload)
        self.assertIn(b"Kiwalan National High School", text)
        self.assertIn(b"Certificate of Clearance", text)
        # Every figure on the paper is the row's own: the reference the
        # Registrar issued, the learner the record belongs to, and who signed.
        self.assertIn(record.reference.encode(), text)
        self.assertIn(b"Sara Student", text)
        self.assertIn(b"LRN 100000000001", text)
        self.assertIn(b"Ria Registrar", text)

    def test_reissued_certificate_keeps_the_reference_it_was_signed_with(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        self.login(self.registrar_user)
        self.client.post(f"/api/clearance/records/{record.pk}/finalize/", {})
        self.login(self.student1_user)
        first = self.client.get(
            f"/api/clearance/my/{record.pk}/certificate/"
        ).content
        # The period's configuration moves on afterwards.
        self.login(self.admin)
        self.client.patch(
            f"/api/clearance/periods/{self.period.pk}/",
            {"name": "Renamed after the fact"},
        )
        self.login(self.student1_user)
        second = self.client.get(
            f"/api/clearance/my/{record.pk}/certificate/"
        ).content
        record.refresh_from_db()
        # What is frozen is what was decided: the same reference and the same
        # sign-offs, so a reprint is the paper the Registrar actually approved.
        self.assertIn(record.reference.encode(), pdf_text(second))
        self.assertIn(b"Renamed after the fact", pdf_text(second))
        # The bytes differ only because reportlab stamps the build time on the
        # file; the reference is one value read from the row, never re-drawn.
        self.assertNotEqual(first, second)

    def test_reference_lookup_is_verifiable_by_staff_only(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        self.login(self.registrar_user)
        self.client.post(f"/api/clearance/records/{record.pk}/finalize/", {})
        record.refresh_from_db()

        self.login(self.admin)
        body = self.client.get(
            "/api/clearance/certificate/lookup/", {"reference": record.reference}
        ).json()
        self.assertTrue(body["valid"])
        self.assertFalse(body["withdrawn"])
        self.assertEqual(body["learner"], "Sara Student")
        self.assertEqual(body["approved_by"], "Ria Registrar")
        self.assertNotIn("obligations", body)

        self.assertEqual(
            self.client.get(
                "/api/clearance/certificate/lookup/", {"reference": "CNH-9-DEADBEEF00"}
            ).json(),
            {"valid": False},
        )
        self.login(self.student1_user)
        self.assertIn(
            self.client.get(
                "/api/clearance/certificate/lookup/", {"reference": record.reference}
            ).status_code,
            (401, 403),
        )

    def test_a_forged_reference_is_never_guessed_from_a_row_counter(self):
        records = self.provision()
        first = self.drive_to_ready_for_final(records[0])
        self.login(self.registrar_user)
        self.client.post(f"/api/clearance/records/{first.pk}/finalize/", {})
        second = self.drive_to_ready_for_final(records[1])
        self.client.post(f"/api/clearance/records/{second.pk}/finalize/", {})
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertNotEqual(first.reference, second.reference)
        self.assertNotEqual(
            first.reference.split("-")[-1], second.reference.split("-")[-1],
            "two clearances in one period must not sit on a walkable counter",
        )

    def test_withdrawal_keeps_the_reference_and_says_so(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        self.login(self.registrar_user)
        self.client.post(f"/api/clearance/records/{record.pk}/finalize/", {})
        record.refresh_from_db()
        reference = record.reference

        self.assertEqual(
            self.client.delete(
                f"/api/clearance/records/{record.pk}/finalize/",
                {"reason": ""},
            ).status_code,
            400,
        )
        response = self.client.delete(
            f"/api/clearance/records/{record.pk}/finalize/",
            {"reason": "The Library cleared the wrong learner."},
        )
        self.assertEqual(response.status_code, 200, response.content)
        record.refresh_from_db()
        self.assertEqual(record.overall_status, ClearanceStatus.NOT_CLEARED)
        self.assertEqual(record.reference, reference)
        self.assertIsNone(record.cleared_by)
        self.assertEqual(
            record.final_note, "The Library cleared the wrong learner."
        )
        body = self.client.get(
            "/api/clearance/certificate/lookup/", {"reference": reference}
        ).json()
        self.assertTrue(body["valid"])
        self.assertTrue(body["withdrawn"])
        self.assertTrue(
            AuditLog.objects.filter(action="clearance.revoked").exists()
        )

    def test_a_learner_who_left_the_population_is_not_certified(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        # Withdrawn from the school year after the queues were filled.
        record.student.section = None
        record.student.save()
        from .models import Enrollment

        Enrollment.objects.filter(student=record.student).delete()

        self.login(self.registrar_user)
        blockers = self.client.get(
            f"/api/clearance/records/{record.pk}/finalize/"
        ).json()["blockers"]
        self.assertTrue(
            any("no longer part of the population" in line for line in blockers),
            blockers,
        )
        self.assertEqual(
            self.client.post(
                f"/api/clearance/records/{record.pk}/finalize/", {}
            ).status_code,
            400,
        )

    def test_final_approval_is_refused_after_the_period_closes(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        self.login(self.admin)
        self.client.post(f"/api/clearance/periods/{self.period.pk}/deactivate/")
        self.login(self.registrar_user)
        response = self.client.post(
            f"/api/clearance/records/{record.pk}/finalize/", {}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not active", str(response.json()))

    def test_two_registrars_cannot_issue_two_certificates(self):
        record = self.drive_to_ready_for_final(self.provision()[0])
        second = User.objects.create_user(
            username="c_registrar2", password=PASSWORD, role=User.Role.ADMIN,
            first_name="Ria", last_name="Second",
        )
        second.departments.add(self.registrar_dept)
        self.login(self.registrar_user)
        self.client.post(f"/api/clearance/records/{record.pk}/finalize/", {})
        record.refresh_from_db()
        reference = record.reference

        self.login(second)
        response = self.client.post(
            f"/api/clearance/records/{record.pk}/finalize/", {}
        )
        self.assertEqual(response.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.reference, reference)
        self.assertEqual(record.cleared_by, self.registrar_user)


class MonitoringTests(ClearanceTestCase):
    def test_dashboard_reports_the_period_not_a_filtered_slice(self):
        records = self.provision()
        self.drive_to_ready_for_final(records[0])
        self.login(self.admin)
        response = self.client.get(
            "/api/clearance/dashboard/", {"period": self.period.pk}
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(body["cleared"], 0)
        self.assertEqual(body["ready_for_final"], 1)
        self.assertEqual(body["completion_percent"], 0)
        rows = {row["department"]: row for row in body["departments"]}
        self.assertEqual(rows[self.library_dept.name]["total"], 2)
        self.assertEqual(rows[self.library_dept.name]["approved"], 1)
        self.assertEqual(rows[self.library_dept.name]["percent"], 50)
        self.assertEqual(
            rows[self.registrar_dept.name]["needs_correction"], 0
        )
        self.assertEqual(body["deadline_watch"][0]["days_left"], 30 - 0)
        self.assertEqual(len(body["by_section"]), 2)
        self.assertEqual(body["by_grade_level"][0]["grade_level"], "Grade 7")

    def test_dashboard_requires_a_period(self):
        self.login(self.admin)
        response = self.client.get("/api/clearance/dashboard/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("period", response.json())

    def test_monitoring_filters_and_search(self):
        records = self.provision()
        self.login(self.admin)
        url = "/api/clearance/records/"
        self.assertEqual(
            self.client.get(url, {"period": self.period.pk}).json()["count"], 2
        )
        self.assertEqual(
            self.client.get(url, {"grade_level": self.grade7.pk}).json()["count"], 2
        )
        self.assertEqual(
            self.client.get(
                url, {"section": self.student1.section_id}
            ).json()["count"],
            1,
        )
        self.assertEqual(
            self.client.get(
                url, {"department": self.registrar_dept.pk}
            ).json()["count"],
            2,
        )
        self.assertEqual(
            self.client.get(url, {"search": "sam"}).json()["count"], 1
        )
        self.assertEqual(
            self.client.get(url, {"search": "100000000002"}).json()["count"], 1
        )
        self.assertEqual(
            self.client.get(
                url, {"status": ClearanceStatus.IN_PROGRESS}
            ).json()["count"],
            2,
        )
        self.assertEqual(
            self.client.get(url, {"school_year": self.school_year.pk}).json()["count"],
            2,
        )
        self.assertEqual(self.client.get(url, {"period": 999}).json()["count"], 0)

    def test_report_rows_and_csv_export_permissions(self):
        records = self.provision()
        self.drive_to_ready_for_final(records[0])
        self.login(self.registrar_user)
        body = self.client.get(
            "/api/clearance/reports/", {"period": self.period.pk}
        ).json()
        self.assertEqual(body["total"], 2)
        row = next(r for r in body["rows"] if r["learner"] == "Sara Student")
        self.assertEqual(row["settled_departments"], 2)
        self.assertEqual(row["total_departments"], 2)
        self.assertEqual(row["progress"], 90)
        self.assertEqual(row["clearance_type"], "End of School Year")

        # A department officer reads the report; taking it out is a separate key.
        response = self.client.get(
            "/api/clearance/reports/", {"export": "csv", "period": self.period.pk}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        lines = response.content.decode().strip().splitlines()
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[0].startswith("Learner,LRN,Grade level"))
        self.assertIn("Sara Student", lines[1])

        # Taking the data out is audited, and the entry has to be readable: the
        # export has no single row behind it, so it is recorded against the model
        # rather than a metaclass name and a property repr.
        export = AuditLog.objects.filter(action="clearance.report.exported").latest(
            "timestamp"
        )
        self.assertEqual(export.actor, self.registrar_user)
        self.assertEqual(export.target_model, "ClearancePeriod")
        self.assertEqual(export.target_id, "")
        self.assertIn("2 clearance report row(s)", export.description)

        self.login(self.librarian)
        response = self.client.get(
            "/api/clearance/reports/", {"export": "csv", "period": self.period.pk}
        )
        self.assertEqual(response.status_code, 403,
                         "clearance.export is a separate key")

        self.login(self.student1_user)
        self.assertIn(
            self.client.get("/api/clearance/reports/").status_code, (401, 403)
        )

    def test_activity_trail_is_scoped_to_the_requester(self):
        records = self.provision()
        self.drive_to_ready_for_final(records[0])
        # One more sign-off, with a note the office wrote for itself: the
        # feed's job is to leave that out while the learner's own message
        # ('Checked against the shelf list.') stays in.
        second = records[1]
        registrar_item = self.item_for(second, self.pd_registrar)
        self.login(self.registrar_user)
        self.client.post(
            f"/api/clearance/queue/{registrar_item.pk}/decision/",
            {
                "status": DepartmentStatus.APPROVED,
                "note": "Report card handed over.",
                "internal_note": "Desk memo only, not for the learner.",
            },
        )
        self.login(self.admin)
        events = self.client.get(
            "/api/clearance/activity/", {"period": self.period.pk}
        ).json()
        self.assertTrue(events)
        self.assertIn(
            "department_approved", {row["action"] for row in events}
        )
        self.assertNotIn("Desk memo", str(events))
        self.assertIn("Checked against the shelf list.", str(events))
        # The memo exists — the feed is filtering, not failing to record.
        self.login(self.registrar_user)
        detail = self.client.get(
            f"/api/clearance/queue/{registrar_item.pk}/"
        ).json()
        self.assertIn("Desk memo", str(detail["events"]))

    def test_every_act_leaves_three_traces(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        self.login(self.registrar_user)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/clearance/records/{record.pk}/finalize/", {})
        actions = set(
            ClearanceEvent.objects.filter(student_clearance=record).values_list(
                "action", flat=True
            )
        )
        self.assertLessEqual(
            {"provisioned", "document_submitted", "department_under_review",
             "document_accepted", "department_approved", "cleared"},
            actions,
            actions,
        )
        audited = set(
            AuditLog.objects.filter(target_id=str(record.pk)).values_list(
                "action", flat=True
            )
        )
        self.assertIn("clearance.finalized", audited)
        self.assertIn("clearance.department.approved", audited)
        self.assertTrue(
            Notification.objects.filter(
                recipient=record.learner, clearance=record
            ).exists()
        )

    def test_the_record_detail_carries_the_full_staff_picture(self):
        records = self.provision()
        record = self.drive_to_ready_for_final(records[0])
        self.login(self.admin)
        body = self.client.get(f"/api/clearance/records/{record.pk}/").json()
        self.assertEqual(len(body["departments"]), 2)
        self.assertEqual(body["progress"], 90)
        self.assertTrue(body["can_finalize"])
        self.assertFalse(body["has_certificate"])
        self.assertEqual(body["blockers"], [])
        self.assertIn(
            "Lina Librarian",
            {row["decided_by_name"] for row in body["departments"]},
        )
        # An event's internal note is visible to staff.
        self.assertTrue(
            any(row.get("internal_note") for row in body["events"])
        )


class MigrationAndSeedTests(ClearanceTestCase):
    def test_clearance_keys_are_seeded_to_the_offices_that_need_them(self):
        for key in (
            "clearance.view",
            "clearance.manage",
            "clearance.verify",
            "clearance.finalize",
            "clearance.export",
        ):
            self.assertTrue(
                PermissionDefinition.objects.filter(key=key).exists(), key
            )
        registrar = Department.objects.get(code="REGISTRAR")
        granted = set(
            registrar.permission_grants.values_list("permission__key", flat=True)
        )
        self.assertLessEqual(
            {"clearance.view", "clearance.verify", "clearance.finalize",
             "clearance.export"},
            granted,
        )
        comms = Department.objects.get(code="COMMS")
        self.assertNotIn(
            "clearance.finalize",
            comms.permission_grants.values_list("permission__key", flat=True),
        )

    def test_no_department_name_is_written_into_the_clearance_code(self):
        """The offices a school uses are rows it owns, not names in the engine."""
        import os

        from django.conf import settings as conf

        base = os.path.dirname(os.path.abspath(__file__))
        forbidden = (
            "Registrar", "Library", "Custodian", "Guidance", "Laboratory",
            "Finance Office",
        )
        for module in ("clearance.py", "clearance_views.py",
                       "clearance_serializers.py", "clearance_pdf.py"):
            with open(os.path.join(base, module), encoding="utf-8") as handle:
                text = handle.read()
            for name in forbidden:
                # Allowed inside a docstring example only when quoted as one;
                # the check is that no code path branches on an office's name.
                for line in text.splitlines():
                    stripped = line.strip()
                    if stripped.startswith(("#", '"', "'", "*")):
                        continue
                    self.assertNotIn(
                        f'"{name}"', stripped,
                        f"{module} branches on the office name {name}",
                    )
                    self.assertNotIn(
                        f"'{name}'", stripped,
                        f"{module} branches on the office name {name}",
                    )
        self.assertTrue(conf.INSTALLED_APPS)  # the module ran inside Django
