"""
TRACK — Enrollment & Admissions backend tests.

Run from the backend folder:
    python manage.py test core.tests_enrollment

Covers: period validation, draft/submit/resubmit/withdraw workflow, the
status state machine, requirement configuration and snapshotting, document
upload authorization and content validation, applicant/parent object-level
access, staff authorization keys, section recommendation and capacity
enforcement (including duplicate/racing confirmations), student identity
matching, idempotent confirmation, transaction rollback, post-commit
notification failure isolation, audit events, and reporting.
"""

from datetime import timedelta
import tempfile
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    ApplicationDocument,
    ApplicationReviewEvent,
    ApplicationStatus,
    AuditLog,
    Department,
    Enrollment,
    EnrollmentApplication,
    EnrollmentPeriod,
    EnrollmentRequirement,
    EnrollmentType,
    GradeLevel,
    Notification,
    SchoolYear,
    Section,
    StudentProfile,
    User,
)
from .tests import TrackTestCase

# Uploaded files must never touch the real backend/media folder.
TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="track-test-media-")


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class EnrollmentTestCase(TrackTestCase):
    """Enrollment fixtures on top of the shared TRACK fixture."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        now = timezone.now()
        cls.period = EnrollmentPeriod.objects.create(
            school_year=cls.school_year,
            name="SY 2026-2027 Registration",
            status=EnrollmentPeriod.Status.OPEN,
            opens_at=now - timedelta(days=7),
            closes_at=now + timedelta(days=30),
            created_by=cls.admin,
        )
        cls.req_birth = EnrollmentRequirement.objects.create(
            period=cls.period,
            name="Birth Certificate",
            is_required=True,
            requires_verification=True,
            position=1,
        )
        cls.req_form = EnrollmentRequirement.objects.create(
            period=cls.period,
            name="Form 137",
            is_required=False,
            requires_verification=False,
            position=2,
        )
        # Department-scoped Registrar administrator (enrollment keys granted
        # by the seeded DEFAULT_DEPARTMENTS registry).
        registrar_dept = Department.objects.get(code="REGISTRAR")
        cls.registrar = User.objects.create_user(
            username="t_registrar", password="enroll-Test123",
            role=User.Role.ADMIN, first_name="Ria", last_name="Registrar",
        )
        cls.registrar.departments.add(registrar_dept)
        # An administrator with NO enrollment permissions.
        cls.plain_admin = User.objects.create_user(
            username="t_plain_admin", password="enroll-Test123",
            role=User.Role.ADMIN, first_name="Pat", last_name="NoKeys",
        )
        # A brand-new applicant (no student profile yet).
        cls.applicant1 = User.objects.create_user(
            username="t_applicant1", password="enroll-Test123",
            role=User.Role.STUDENT, first_name="New", last_name="Kid",
        )
        cls.applicant2 = User.objects.create_user(
            username="t_applicant2", password="enroll-Test123",
            role=User.Role.STUDENT, first_name="Other", last_name="Kid",
        )

    def login_as(self, user):
        password = {
            "t_admin": "pass-Admin123",
            "t_teacher1": "pass-Teach123",
            "t_teacher2": "pass-Teach123",
            "t_student1": "pass-Stud123",
            "t_student2": "pass-Stud123",
            "t_parent": "pass-Parent1",
        }.get(user.username, "enroll-Test123")
        assert self.client.login(username=user.username, password=password)
        return self.client

    def make_draft(self, user=None, **overrides):
        payload = {
            "period": self.period.pk,
            "enrollment_type": EnrollmentType.NEW,
            "grade_level": self.grade7.pk,
        }
        payload.update(overrides)
        self.login_as(user or self.applicant1)
        response = self.client.post(
            "/api/enrollment/applications/my/", payload, format="json"
        )
        assert response.status_code == 201, response.content
        return EnrollmentApplication.objects.get(pk=response.data["id"])

    def fill_required_documents(self, application):
        """Upload a valid file for every required document slot."""
        for document in application.documents.filter(is_required=True):
            upload = SimpleUploadedFile(
                "certificate.pdf", b"%PDF-1.4 test content", content_type="application/pdf"
            )
            self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
                {"file": upload},
            )

    def accept_application(self, application, registrar=None):
        for document in application.documents.filter(is_required=True):
            document.status = ApplicationDocument.Status.VERIFIED
            document.verified_at = timezone.now()
            document.verified_by = registrar or self.registrar
            document.save()
        self.login_as(registrar or self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "accept"},
            format="json",
        )
        assert response.status_code == 200, response.content
        application.refresh_from_db()
        return application

    def guest_create(self, **overrides):
        """Start an application with no account at all (public portal)."""
        self.client.logout()
        payload = {
            "period": self.period.pk,
            "enrollment_type": EnrollmentType.NEW,
            "grade_level": self.grade7.pk,
        }
        payload.update(overrides)
        response = self.client.post(
            "/api/enrollment/applications/my/", payload, format="json"
        )
        assert response.status_code == 201, response.content
        return response.data

    @staticmethod
    def guest_headers(token):
        return {"HTTP_AUTHORIZATION": f"Guest {token}"}

    def guest_upload_required_documents(self, application, token):
        """Upload a valid file for every required slot, as a public applicant."""
        headers = self.guest_headers(token)
        for document in application.documents.filter(is_required=True):
            upload = SimpleUploadedFile(
                "certificate.pdf", b"%PDF-1.4 test content", content_type="application/pdf"
            )
            response = self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
                {"file": upload},
                **headers,
            )
            assert response.status_code == 200, response.content


# ---------------------------------------------------------------------------
# Enrollment periods
# ---------------------------------------------------------------------------

class EnrollmentPeriodTests(EnrollmentTestCase):
    def test_period_with_invalid_date_range_is_rejected(self):
        self.login_as(self.registrar)
        response = self.client.post(
            "/api/enrollment/periods/",
            {
                "school_year": self.school_year.pk,
                "status": "upcoming",
                "opens_at": "2027-01-10T08:00:00+08:00",
                "closes_at": "2027-01-01T08:00:00+08:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("closes_at", response.data)

    def test_period_create_requires_manage_permission(self):
        self.login_as(self.plain_admin)
        response = self.client.post(
            "/api/enrollment/periods/",
            {
                "school_year": self.school_year.pk,
                "status": "upcoming",
                "opens_at": "2027-01-01T08:00:00+08:00",
                "closes_at": "2027-02-01T08:00:00+08:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_applicant_sees_only_open_periods(self):
        EnrollmentPeriod.objects.create(
            school_year=self.school_year, name="Closed window",
            status=EnrollmentPeriod.Status.CLOSED,
            opens_at=timezone.now() - timedelta(days=90),
            closes_at=timezone.now() - timedelta(days=60),
            created_by=self.admin,
        )
        self.login_as(self.applicant1)
        response = self.client.get("/api/enrollment/periods/")
        self.assertEqual(response.status_code, 200)
        labels = [row["name"] for row in response.data["results"]]
        self.assertIn("SY 2026-2027 Registration", labels)
        self.assertNotIn("Closed window", labels)

    def test_closing_period_stops_new_submissions_but_keeps_applications(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.registrar)
        response = self.client.patch(
            f"/api/enrollment/periods/{self.period.pk}/",
            {"status": "closed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.DRAFT)
        # The stored application is untouched; only new submissions stop.
        self.login_as(self.applicant1)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("no longer accepting", str(response.data))

    def test_school_year_immutable_once_applications_exist(self):
        application = self.make_draft()
        other_year = SchoolYear.objects.create(
            label="2027-2028",
            start_date=timezone.now().date() + timedelta(days=200),
            end_date=timezone.now().date() + timedelta(days=500),
        )
        self.login_as(self.registrar)
        response = self.client.patch(
            f"/api/enrollment/periods/{self.period.pk}/",
            {"school_year": other_year.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertTrue(application.period_id == self.period.pk)

    def test_period_delete_blocked_when_applications_exist(self):
        application = self.make_draft()
        self.login_as(self.registrar)
        response = self.client.delete(f"/api/enrollment/periods/{self.period.pk}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot be deleted", str(response.data))


# ---------------------------------------------------------------------------
# Draft creation, prefill, submission
# ---------------------------------------------------------------------------

class ApplicationDraftTests(EnrollmentTestCase):
    def test_draft_creation_freezes_checklist_and_materializes_documents(self):
        self.login_as(self.applicant1)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": "new", "grade_level": self.grade7.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        application = EnrollmentApplication.objects.get(pk=response.data["id"])
        self.assertTrue(application.reference.startswith("APP-"))
        self.assertEqual(application.status, ApplicationStatus.DRAFT)
        self.assertEqual(len(application.requirements_snapshot), 2)
        names = set(application.documents.values_list("name", flat=True))
        self.assertEqual(names, {"Birth Certificate", "Form 137"})

    def test_draft_reuses_existing_student_profile_fields(self):
        # student1 returns for the same school year — identity prefilled.
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": "returning", "grade_level": self.grade7.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        application = EnrollmentApplication.objects.get(pk=response.data["id"])
        self.assertEqual(application.lrn, "100000000001")
        self.assertEqual(application.first_name, "Sara")
        self.assertEqual(application.last_name, "Student")
        self.assertEqual(application.student_id, self.student1.pk)

    def test_parent_can_apply_for_linked_child_only(self):
        self.login_as(self.parent)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {
                "period": self.period.pk, "enrollment_type": "returning",
                "grade_level": self.grade7.pk, "student": self.student1.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        application = EnrollmentApplication.objects.get(pk=response.data["id"])
        self.assertEqual(application.student_id, self.student1.pk)
        self.assertEqual(application.applicant_id, self.parent.pk)
        self.assertEqual(application.guardian_name, "Pia Parent")

    def test_parent_cannot_apply_for_unrelated_student(self):
        self.login_as(self.parent)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {
                "period": self.period.pk, "enrollment_type": "new",
                "grade_level": self.grade7.pk, "student": self.student2.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("linked children", str(response.data))

    def test_student_cannot_open_two_open_applications_same_year(self):
        self.make_draft()
        self.login_as(self.applicant1)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": "new", "grade_level": self.grade7.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("already have an active application", str(response.data))

    def test_grade_level_not_in_period_is_rejected(self):
        self.period.grade_levels.add(self.grade7)
        self.period.save()
        grade8 = GradeLevel.objects.create(name="Grade 8", order=8)
        self.login_as(self.applicant1)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": "new", "grade_level": grade8.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_teacher_and_admin_cannot_create_applications(self):
        self.login_as(self.teacher1)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": "new", "grade_level": self.grade7.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_submit_requires_required_documents(self):
        application = self.make_draft()
        self.login_as(self.applicant1)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Birth Certificate", str(response.data))

    def test_submit_succeeds_with_documents_and_notifies(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        with self.captureOnCommitCallbacks(execute=True):
            self.login_as(self.applicant1)
            response = self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
            )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.SUBMITTED)
        self.assertIsNotNone(application.submitted_at)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.applicant1,
                notif_type=Notification.NotifType.ENROLLMENT_SUBMITTED,
                application=application,
            ).exists()
        )

    def test_double_submit_is_rejected_not_duplicated(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        first = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        second = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)

    def test_draft_update_rebuilds_checklist_on_grade_change(self):
        application = self.make_draft()
        grade8 = GradeLevel.objects.create(name="Grade 8", order=8)
        EnrollmentRequirement.objects.create(
            period=self.period, grade_level=grade8, name="Good Moral",
            is_required=True, requires_verification=True,
        )
        self.login_as(self.applicant1)
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"grade_level": grade8.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.grade_level_id, grade8.pk)
        names = set(application.documents.values_list("name", flat=True))
        self.assertIn("Good Moral", names)

    def test_applicant_edit_blocked_after_submission(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"first_name": "Changed"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_submitted_application_cannot_be_deleted(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        response = self.client.delete(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 400)
        # A draft may be discarded by its owner — but not by someone else.
        draft = self.make_draft(user=self.applicant2)
        self.login_as(self.applicant1)
        response = self.client.delete(
            f"/api/enrollment/applications/my/{draft.pk}/"
        )
        self.assertEqual(response.status_code, 404)
        self.login_as(self.applicant2)
        response = self.client.delete(
            f"/api/enrollment/applications/my/{draft.pk}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(EnrollmentApplication.objects.filter(pk=draft.pk).exists())

    def test_finished_applications_can_be_deleted_by_their_owner(self):
        # Withdrawn — the applicant's own terminal decision.
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/withdraw/",
                format="json",
            )
        response = self.client.delete(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(EnrollmentApplication.objects.filter(pk=application.pk).exists())

        # Cancelled — staff called it off; the state machine offers no way out.
        application = self.make_draft()
        self.login_as(self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "cancel", "reason": "Duplicate filing."}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.login_as(self.applicant1)
        response = self.client.delete(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 204, response.content)

        # Rejected — a final decision against the applicant.
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "reject", "reason": "Grade level is full."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.login_as(self.applicant1)
        response = self.client.delete(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(EnrollmentApplication.objects.filter(pk=application.pk).exists())

    def test_live_and_enrolled_applications_cannot_be_deleted(self):
        # Everything still in play keeps its history: applications in the
        # Registrar's queue (withdraw first) and the enrollment record itself.
        application = self.make_draft()
        self.login_as(self.applicant1)
        for live in (
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.UNDER_REVIEW,
            ApplicationStatus.INCOMPLETE,
            ApplicationStatus.RESUBMITTED,
            ApplicationStatus.ACCEPTED,
            ApplicationStatus.WAITLISTED,
            ApplicationStatus.ENROLLED,
        ):
            application.status = live
            application.save(update_fields=["status", "updated_at"])
            response = self.client.delete(
                f"/api/enrollment/applications/my/{application.pk}/"
            )
            self.assertEqual(response.status_code, 400, live)
        self.assertTrue(EnrollmentApplication.objects.filter(pk=application.pk).exists())

    def test_withdraw_flow(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/withdraw/",
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.WITHDRAWN)
        self.assertTrue(
            Notification.objects.filter(
                application=application,
                notif_type=Notification.NotifType.ENROLLMENT_DECISION,
            ).exists()
        )


# ---------------------------------------------------------------------------
# Status state machine
# ---------------------------------------------------------------------------

class StatusTransitionTests(EnrollmentTestCase):
    def test_applicant_cannot_move_arbitrary_status(self):
        application = self.make_draft()
        self.login_as(self.applicant1)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "accept"}, format="json",
        )
        # Applicant never reaches the staff endpoint (403), and PATCH cannot
        # smuggle a status either (status is not an editable field).
        self.assertEqual(response.status_code, 403)
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"status": "accepted"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.DRAFT)

    def test_staff_cannot_skip_review_to_accepted(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "accept"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot move", str(response.data))

    def test_review_corrections_resubmit_accept_happy_path(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertIsNotNone(application.reviewed_at)
        self.assertEqual(application.reviewer_id, self.registrar.pk)
        # Corrections round: return the required document, request corrections.
        document = application.documents.get(is_required=True)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/documents/{document.pk}/action/",
            {"action": "return", "note": "The scan is unreadable."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/action/",
                {"action": "request_corrections", "note": "Please upload a clearer birth certificate."},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.INCOMPLETE)
        self.assertTrue(
            Notification.objects.filter(
                application=application,
                notif_type=Notification.NotifType.ENROLLMENT_CORRECTIONS,
            ).exists()
        )
        # Applicant replaces the returned file and resubmits.
        self.login_as(self.applicant1)
        self.fill_required_documents(application)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/resubmit/", format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.RESUBMITTED)
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        application = self.accept_application(application)
        self.assertEqual(application.status, ApplicationStatus.ACCEPTED)
        events = list(application.events.values_list("action", flat=True))
        self.assertIn("submitted", events)
        self.assertIn("accept", events)

    def test_accept_blocked_until_required_documents_verified(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "accept"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("verified", str(response.data))

    def test_reject_requires_recorded_reason(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "reject"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "reject", "reason": "Grade level is full for this year."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.REJECTED)
        self.assertIn("full", application.decision_reason)

    def test_waitlist_requires_period_opt_in(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "waitlist"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.period.allow_waitlist = True
        self.period.save()
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "waitlist"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.WAITLISTED)


# ---------------------------------------------------------------------------
# Requirement configuration & snapshots
# ---------------------------------------------------------------------------

class RequirementConfigurationTests(EnrollmentTestCase):
    def test_changing_requirements_does_not_touch_existing_applications(self):
        application = self.make_draft()
        snapshot_before = list(application.requirements_snapshot)
        EnrollmentRequirement.objects.create(
            period=self.period, name="Good Moral Certificate",
            is_required=True, requires_verification=True, position=3,
        )
        self.req_birth.is_active = False
        self.req_birth.save()
        application.refresh_from_db()
        self.assertEqual(application.requirements_snapshot, snapshot_before)
        self.assertEqual(
            set(application.documents.values_list("name", flat=True)),
            {"Birth Certificate", "Form 137"},
        )

    def test_requirement_delete_blocked_once_referenced(self):
        application = self.make_draft()
        self.login_as(self.registrar)
        response = self.client.delete(
            f"/api/enrollment/requirements/{self.req_birth.pk}/"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Deactivate", str(response.data))
        # Deactivation works and hides it from new checklists.
        response = self.client.patch(
            f"/api/enrollment/requirements/{self.req_birth.pk}/",
            {"is_active": False}, format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_requirement_writes_need_manage_key(self):
        self.login_as(self.plain_admin)
        response = self.client.post(
            "/api/enrollment/requirements/",
            {"period": self.period.pk, "name": "Whatever"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Document uploads & downloads
# ---------------------------------------------------------------------------

class DocumentUploadTests(EnrollmentTestCase):
    def test_upload_valid_pdf_and_replace(self):
        application = self.make_draft()
        document = application.documents.get(is_required=True)
        self.login_as(self.applicant1)
        upload = SimpleUploadedFile(
            "bc.pdf", b"%PDF-1.4 the real content", content_type="application/pdf"
        )
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
            {"file": upload},
        )
        self.assertEqual(response.status_code, 200, response.content)
        document.refresh_from_db()
        self.assertEqual(document.status, ApplicationDocument.Status.SUBMITTED)
        self.assertEqual(document.original_filename, "bc.pdf")
        self.assertIsNotNone(document.submitted_at)
        # Replacing resets review state to submitted.
        document.status = ApplicationDocument.Status.RETURNED
        document.save()
        upload = SimpleUploadedFile(
            "bc2.pdf", b"%PDF-1.4 replaced", content_type="application/pdf"
        )
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
            {"file": upload},
        )
        self.assertEqual(response.status_code, 200)
        document.refresh_from_db()
        self.assertEqual(document.status, ApplicationDocument.Status.SUBMITTED)
        self.assertEqual(document.review_note, "")

    def test_upload_rejects_disallowed_extension_and_content(self):
        application = self.make_draft()
        document = application.documents.get(is_required=True)
        self.login_as(self.applicant1)
        url = f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/"
        response = self.client.post(
            url, {"file": SimpleUploadedFile("evil.exe", b"MZ\x90\x00", content_type="application/pdf")}
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            url, {"file": SimpleUploadedFile("fake.pdf", b"MZ\x90\x00", content_type="application/pdf")}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("does not match", str(response.data))
        document.refresh_from_db()
        self.assertEqual(document.status, ApplicationDocument.Status.NOT_SUBMITTED)

    def test_upload_rejects_oversized_file(self):
        application = self.make_draft()
        document = application.documents.get(is_required=True)
        self.login_as(self.applicant1)
        big = SimpleUploadedFile(
            "big.pdf", b"%PDF" + b"0" * (10 * 1024 * 1024 + 1), content_type="application/pdf"
        )
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
            {"file": big},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", str(response.data))

    def test_other_applicant_cannot_upload_or_download(self):
        application = self.make_draft()
        document = application.documents.get(is_required=True)
        document.file.name = "enrollment/documents/2026/secret.pdf"
        document.save()
        self.login_as(self.applicant2)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
            {"file": SimpleUploadedFile("x.pdf", b"%PDF-1.4 x", content_type="application/pdf")},
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.get(
            f"/api/enrollment/applications/{application.pk}/documents/{document.pk}/download/"
        )
        self.assertEqual(response.status_code, 404)

    def test_owner_and_staff_can_download_teacher_cannot(self):
        application = self.make_draft()
        document = application.documents.get(is_required=True)
        document.file.save(
            "bc.pdf", SimpleUploadedFile("bc.pdf", b"%PDF-1.4 stored", content_type="application/pdf")
        )
        url = f"/api/enrollment/applications/{application.pk}/documents/{document.pk}/download/"
        self.login_as(self.applicant1)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.login_as(self.teacher1)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)
        self.login_as(self.registrar)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_upload_blocked_outside_editable_states(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        document = application.documents.get(is_required=True)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/documents/{document.pk}/upload/",
            {"file": SimpleUploadedFile("x.pdf", b"%PDF-1.4 x", content_type="application/pdf")},
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Object-level access
# ---------------------------------------------------------------------------

class ApplicantAccessTests(EnrollmentTestCase):
    def test_applicant_cannot_see_another_applications_record(self):
        application = self.make_draft()
        self.login_as(self.applicant2)
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.get("/api/enrollment/applications/my/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_parent_sees_only_linked_children(self):
        application = self.make_draft(user=self.student1_user)
        self.login_as(self.parent)
        response = self.client.get("/api/enrollment/applications/my/")
        self.assertEqual(response.data["count"], 1)
        # A parent of nobody's application: student2 has no linked parent, but
        # create one unrelated parent to prove the negative.
        other_parent = User.objects.create_user(
            username="t_other_parent", password="enroll-Test123",
            role=User.Role.PARENT, first_name="Ung", last_name="Linked",
        )
        from .models import ParentProfile
        ParentProfile.objects.create(user=other_parent)
        self.login_as(other_parent)
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 404)

    def test_applicant_events_never_leak_internal_notes(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review", "internal_note": "CONFIDENTIAL STAFF NOTE"},
            format="json",
        )
        self.login_as(self.applicant1)
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("CONFIDENTIAL", str(response.data))
        self.assertNotIn("internal_note", str(response.data))

    def test_unauthenticated_and_wrong_role_access(self):
        application = self.make_draft()
        self.client.logout()
        response = self.client.get("/api/enrollment/applications/my/")
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/api/enrollment/applications/")
        self.assertEqual(response.status_code, 401)
        self.login_as(self.teacher1)
        response = self.client.get("/api/enrollment/applications/")
        self.assertEqual(response.status_code, 403)
        response = self.client.get(f"/api/enrollment/applications/{application.pk}/action/", )
        self.assertEqual(response.status_code, 405)  # GET not allowed; POST below
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.login_as(self.plain_admin)
        response = self.client.get("/api/enrollment/applications/")
        self.assertEqual(response.status_code, 403)
        response = self.client.get("/api/enrollment/dashboard/")
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Section recommendations & capacity
# ---------------------------------------------------------------------------

class SectionCapacityTests(EnrollmentTestCase):
    def build_accepted_application(self, applicant, **draft_overrides):
        application = self.make_draft(user=applicant, **draft_overrides)
        self.fill_required_documents(application)
        self.login_as(applicant)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        return self.accept_application(application)

    def test_recommendations_use_real_capacity(self):
        self.section_a.capacity = 1
        self.section_a.save()
        # Occupy the single slot in section_a with a confirmed enrollment.
        application = self.build_accepted_application(self.applicant1)
        application.lrn = "100000000201"
        application.save()
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        # A second applicant asks for recommendations.
        second = self.build_accepted_application(self.applicant2)
        self.login_as(self.registrar)
        response = self.client.get(
            f"/api/enrollment/applications/{second.pk}/section-recommendations/"
        )
        self.assertEqual(response.status_code, 200)
        rows = {r["name"]: r for r in response.data["recommendations"]}
        self.assertEqual(rows["Sampaguita"]["assigned"], 1)
        self.assertEqual(rows["Sampaguita"]["available"], 0)
        self.assertEqual(rows["Gumamela"]["available"], None)  # no configured cap
        # Assignment to the full section is refused with 409.
        response = self.client.post(
            f"/api/enrollment/applications/{second.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("full", str(response.data))

    def test_assignment_to_wrong_grade_section_is_rejected(self):
        application = self.build_accepted_application(self.applicant1)
        grade8 = GradeLevel.objects.create(name="Grade 8", order=8)
        section8 = Section.objects.create(
            school_year=self.school_year, grade_level=grade8, name="Rosal"
        )
        self.login_as(self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": section8.pk}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_confirmation_requires_approved_section(self):
        application = self.build_accepted_application(self.applicant1)
        self.login_as(self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("section", str(response.data).lower())

    def test_capacity_recheck_at_confirmation_time(self):
        self.section_a.capacity = 1
        self.section_a.save()
        first = self.build_accepted_application(self.applicant1)
        first.lrn = "100000000211"
        first.save()
        second = self.build_accepted_application(self.applicant2)
        second.lrn = "100000000212"
        second.save()
        self.login_as(self.registrar)
        # Both get the assignment approved while the slot is still free…
        for application in (first, second):
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/assign-section/",
                {"section": self.section_a.pk}, format="json",
            )
            self.assertEqual(response.status_code, 200, response.content)
        # …but only one confirmation can win the last slot.
        response = self.client.post(
            f"/api/enrollment/applications/{first.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        response = self.client.post(
            f"/api/enrollment/applications/{second.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertFalse(
            Enrollment.objects.filter(application=second).exists()
        )
        second.refresh_from_db()
        self.assertEqual(second.status, ApplicationStatus.ACCEPTED)

    def test_duplicate_active_enrollment_blocked_by_db(self):
        self.section_a.capacity = 5
        self.section_a.save()
        application = self.build_accepted_application(self.applicant1)
        application.lrn = "100000000221"
        application.save()
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        application.refresh_from_db()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Enrollment.objects.create(
                    student=application.student, school_year=self.school_year,
                    grade_level=self.grade7, section=self.section_b,
                    confirmed_by=self.registrar,
                )


# ---------------------------------------------------------------------------
# Final confirmation
# ---------------------------------------------------------------------------

class ConfirmEnrollmentTests(EnrollmentTestCase):
    def build_confirmed(self, **kwargs):
        application = self.make_draft(**kwargs)
        self.fill_required_documents(application)
        applicant = application.applicant
        self.login_as(applicant)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        application = self.accept_application(application)
        # Brand-new applicants need an LRN before a student record can exist.
        application.lrn = "100000000123"
        application.save()
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
            )
        assert response.status_code == 201, response.content
        return application, response.data["enrollment"]

    def test_confirmation_creates_student_enrollment_and_audit(self):
        application, enrollment = self.build_confirmed()
        application.refresh_from_db()
        self.assertIsNotNone(application.student_id)
        self.assertEqual(application.status, ApplicationStatus.ENROLLED)
        row = Enrollment.objects.get(application=application)
        self.assertEqual(row.status, Enrollment.Status.ACTIVE)
        self.assertEqual(row.section_id, self.section_a.pk)
        self.assertEqual(row.confirmed_by_id, self.registrar.pk)
        self.assertEqual(row.student_id, application.student_id)
        self.assertTrue(
            AuditLog.objects.filter(
                action="enrollment.confirmed", target_id=str(row.pk)
            ).exists()
        )

    def test_only_registrar_key_holders_can_confirm(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        # A student certainly cannot confirm.
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 403)
        # Neither can an administrator without the enrollment.confirm key.
        self.login_as(self.plain_admin)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_repeated_confirmation_is_idempotent(self):
        application, enrollment = self.build_confirmed()
        self.login_as(self.registrar)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["created"])
        self.assertEqual(response.data["enrollment"]["id"], enrollment["id"])
        self.assertEqual(Enrollment.objects.filter(application=application).count(), 1)
        # Both the submitting account and the linked student account are told —
        # but only once, ever, no matter how many times confirmation is retried.
        self.assertEqual(
            Notification.objects.filter(
                application=application,
                notif_type=Notification.NotifType.ENROLLMENT_CONFIRMED,
            ).count(),
            2,
        )
        self.assertEqual(User.objects.filter(role=User.Role.STUDENT).count(), 5)
        # The permanent student identity was created once, with the LRN.
        self.assertEqual(
            StudentProfile.objects.filter(lrn="100000000123").count(), 1
        )

    def test_returning_student_is_matched_not_duplicated(self):
        # student1 (existing identity) applies for the same school year.
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": "returning", "grade_level": self.grade7.pk},
            format="json",
        )
        application = EnrollmentApplication.objects.get(pk=response.data["id"])
        self.fill_required_documents(application)
        self.login_as(self.student1_user)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.accept_application(application)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_b.pk}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        row = Enrollment.objects.get(application=application)
        self.assertEqual(row.student_id, self.student1.pk)
        # No new user account was created for an existing student.
        self.assertEqual(User.objects.filter(role=User.Role.STUDENT).count(), 4)
        # The roster source points at the new section.
        self.student1.refresh_from_db()
        self.assertEqual(self.student1.section_id, self.section_b.pk)

    def test_lrn_match_links_existing_identity(self):
        application = self.make_draft()
        # Give the application student2's LRN; staff will confirm and the
        # existing identity must be reused, not duplicated.
        application.lrn = self.student2.lrn
        application.first_name = "Sam"
        application.last_name = "Student2"
        application.date_of_birth = None
        application.save()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.accept_application(application)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        application.refresh_from_db()
        self.assertEqual(application.student_id, self.student2.pk)
        self.assertEqual(
            User.objects.filter(role=User.Role.STUDENT).count(), 4,
            "LRN match must not create a duplicate student account",
        )

    def test_new_student_creation_requires_lrn(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.accept_application(application)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Learner Reference Number", str(response.data))
        # With an LRN supplied, confirmation succeeds and creates the profile.
        # (update() avoids clobbering the section assignment with stale state)
        EnrollmentApplication.objects.filter(pk=application.pk).update(
            lrn="100000000099"
        )
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        application.refresh_from_db()
        self.assertEqual(application.student.lrn, "100000000099")
        self.assertEqual(application.student.user.role, User.Role.STUDENT)
        self.assertFalse(
            User.objects.filter(username=application.reference.lower().replace("-", "") + "x").exists()
        )

    def test_notification_failure_does_not_undo_confirmation(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.accept_application(application)
        application.lrn = "100000000231"
        application.save()
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        with mock.patch.object(
            Notification.objects, "bulk_create", side_effect=RuntimeError("queue down")
        ):
            try:
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.client.post(
                        f"/api/enrollment/applications/{application.pk}/confirm/",
                        format="json",
                    )
                self.assertEqual(response.status_code, 201)
            except RuntimeError:
                pass  # the post-commit notification failure surfaces here
        self.assertTrue(
            Enrollment.objects.filter(application=application).exists(),
            "the committed enrollment must survive a notification failure",
        )

    def test_mid_confirmation_failure_rolls_back_everything(self):
        application = self.make_draft()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.accept_application(application)
        application.lrn = "100000000241"
        application.save()
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        users_before = User.objects.count()
        with mock.patch.object(
            Enrollment.objects, "create", side_effect=RuntimeError("disk full")
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(
                    f"/api/enrollment/applications/{application.pk}/confirm/",
                    format="json",
                )
        self.assertEqual(User.objects.count(), users_before, "no partial student creation")
        self.assertFalse(Enrollment.objects.filter(application=application).exists())
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.ACCEPTED)


# ---------------------------------------------------------------------------
# Staff queue, dashboard & reports
# ---------------------------------------------------------------------------

class StaffQueueAndReportTests(EnrollmentTestCase):
    def build_application(self, applicant, **overrides):
        application = self.make_draft(user=applicant, **overrides)
        self.fill_required_documents(application)
        self.login_as(applicant)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        return application

    def test_staff_queue_filters_and_pagination(self):
        self.build_application(self.applicant1)
        self.build_application(self.applicant2)
        self.login_as(self.registrar)
        response = self.client.get("/api/enrollment/applications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        response = self.client.get(
            f"/api/enrollment/applications/?status={ApplicationStatus.SUBMITTED}"
        )
        self.assertEqual(response.data["count"], 2)
        response = self.client.get(
            f"/api/enrollment/applications/?status={ApplicationStatus.ACCEPTED}"
        )
        self.assertEqual(response.data["count"], 0)
        response = self.client.get("/api/enrollment/applications/?search=APP-")
        self.assertEqual(response.data["count"], 2)
        response = self.client.get(
            "/api/enrollment/applications/?school_year=999999"
        )
        self.assertEqual(response.data["count"], 0)

    def test_dashboard_and_report_use_real_data(self):
        application = self.build_application(self.applicant1)
        self.login_as(self.registrar)
        response = self.client.get(
            f"/api/enrollment/dashboard/?school_year={self.school_year.pk}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_applications"], 1)
        self.assertEqual(response.data["submitted"], 1)
        self.assertEqual(response.data["pending_documents"], 1)
        self.assertIn("sections", response.data)
        response = self.client.get(
            f"/api/enrollment/reports/school-year/?school_year={self.school_year.pk}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["school_year"]["label"], "2026-2027")
        statuses = {row["status"]: row["total"] for row in response.data["by_status"]}
        self.assertEqual(statuses.get(ApplicationStatus.SUBMITTED), 1)

    def test_my_enrollments_scoped_to_owner(self):
        application = self.make_draft(user=self.student1_user)
        self.fill_required_documents(application)
        self.login_as(self.student1_user)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.accept_application(application)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/confirm/", format="json"
        )
        self.login_as(self.student1_user)
        response = self.client.get("/api/enrollment/my-enrollments/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.login_as(self.parent)
        response = self.client.get("/api/enrollment/my-enrollments/")
        self.assertEqual(len(response.data), 1)
        self.login_as(self.student2_user)
        response = self.client.get("/api/enrollment/my-enrollments/")
        self.assertEqual(len(response.data), 0)

    def test_manual_student_link(self):
        application = self.make_draft()
        application.lrn = ""
        application.save()
        self.fill_required_documents(application)
        self.login_as(self.applicant1)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/", format="json"
        )
        self.login_as(self.registrar)
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        # The staff detail view surfaces plausible matches.
        response = self.client.get(
            f"/api/enrollment/applications/{application.pk}/"
        )
        self.assertEqual(response.status_code, 200)
        # Manual link.
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/link-student/",
            {"student": self.student2.pk}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.student_id, self.student2.pk)
        # Linking twice is refused.
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/link-student/",
            {"student": self.student1.pk}, format="json",
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Public (account-less) applications
# ---------------------------------------------------------------------------

class GuestEnrollmentTests(EnrollmentTestCase):
    """The public portal: apply, track and manage an application with no
    account, authenticated solely by the application's guest token."""

    def setUp(self):
        super().setUp()
        # The public lookup/claim endpoints share the "auth" throttle scope;
        # reset its counters so tests never trip the per-minute rate.
        cache.clear()

    def tearDown(self):
        cache.clear()
        super().tearDown()

    def test_periods_and_requirements_are_public(self):
        self.client.logout()
        response = self.client.get("/api/enrollment/periods/")
        self.assertEqual(response.status_code, 200)
        labels = [row["name"] for row in response.data["results"]]
        self.assertIn("SY 2026-2027 Registration", labels)

        response = self.client.get(
            "/api/enrollment/requirements/", {"period": self.period.pk}
        )
        self.assertEqual(response.status_code, 200)
        names = [row["name"] for row in response.data["results"]]
        self.assertIn("Birth Certificate", names)

    def test_grade_levels_are_public_for_the_anonymous_wizard(self):
        # Step 1 of the public wizard needs the grade list before any
        # credential exists; writes stay school-structure management.
        self.client.logout()
        response = self.client.get("/api/grade-levels/")
        self.assertEqual(response.status_code, 200)
        names = [row["name"] for row in response.data["results"]]
        self.assertIn("Grade 7", names)
        response = self.client.post(
            "/api/grade-levels/", {"name": "Grade X", "order": 99}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_guest_creates_application_without_an_account(self):
        data = self.guest_create()
        self.assertTrue(data.get("guest_token"))
        self.assertEqual(len(data["guest_token"]), 32)
        application = EnrollmentApplication.objects.get(pk=data["id"])
        self.assertIsNone(application.applicant_id)
        self.assertEqual(application.guest_token, data["guest_token"])
        self.assertTrue(application.reference.startswith("APP-"))

        # The list is scoped to exactly this one application.
        response = self.client.get(
            "/api/enrollment/applications/my/",
            **self.guest_headers(data["guest_token"]),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], application.pk)

    def test_guest_edits_only_their_own_application(self):
        first = self.guest_create()
        second = self.guest_create()
        headers = self.guest_headers(first["guest_token"])

        response = self.client.get(
            f"/api/enrollment/applications/my/{second['id']}/", **headers
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.patch(
            f"/api/enrollment/applications/my/{first['id']}/",
            {"first_name": "Juan", "last_name": "Dela Cruz",
             "guardian_email": "guardian@example.com"},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["first_name"], "Juan")

        response = self.client.patch(
            f"/api/enrollment/applications/my/{second['id']}/",
            {"first_name": "Someone Else"},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 404)

    def test_invalid_or_missing_guest_token_is_rejected(self):
        self.client.logout()
        response = self.client.get("/api/enrollment/applications/my/")
        self.assertEqual(response.status_code, 401)
        response = self.client.get(
            "/api/enrollment/applications/my/",
            HTTP_AUTHORIZATION="Guest not-a-real-token",
        )
        self.assertEqual(response.status_code, 401)

    def test_guest_cannot_start_a_second_open_application(self):
        first = self.guest_create()
        response = self.client.post(
            "/api/enrollment/applications/my/",
            {"period": self.period.pk, "enrollment_type": EnrollmentType.NEW,
             "grade_level": self.grade7.pk},
            format="json",
            **self.guest_headers(first["guest_token"]),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            EnrollmentApplication.objects.filter(applicant__isnull=True).count(), 1
        )

    def test_guest_can_delete_own_finished_application(self):
        # Same delete rule as signed-in applicants, scoped to the guest's own
        # row: a cancelled application can be cleared from the public portal.
        data = self.guest_create()
        application = EnrollmentApplication.objects.get(pk=data["id"])
        application.status = ApplicationStatus.CANCELLED
        application.save(update_fields=["status", "updated_at"])

        response = self.client.delete(
            f"/api/enrollment/applications/my/{application.pk}/",
            **self.guest_headers(data["guest_token"]),
        )
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(
            EnrollmentApplication.objects.filter(pk=application.pk).exists()
        )

        # The token dies with the application: it no longer authenticates.
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/",
            **self.guest_headers(data["guest_token"]),
        )
        self.assertEqual(response.status_code, 401)

    def test_anonymous_create_is_rate_limited_per_ip(self):
        # The public create branch is AllowAny — without a cap a script
        # could mint one guest application per request and flood the
        # Registrar's queue. The "auth" scope keys anonymous callers by IP.
        self.client.logout()
        url = "/api/enrollment/applications/my/"
        payload = {
            "period": self.period.pk,
            "enrollment_type": EnrollmentType.NEW,
            "grade_level": self.grade7.pk,
        }
        codes = [
            self.client.post(url, payload, format="json").status_code
            for _ in range(11)
        ]
        self.assertEqual(codes[:10], [201] * 10, codes)
        self.assertEqual(codes[10], 429, codes)
        # The throttled request never reached the view: exactly the cap
        # worth of rows exists.
        self.assertEqual(
            EnrollmentApplication.objects.filter(applicant__isnull=True).count(),
            10,
        )
        last = self.client.post(url, payload, format="json")
        self.assertIn("throttled", str(last.data).lower())

        # A signed-in applicant is keyed by user id, not by IP — a flood
        # against the public endpoint cannot lock an account out of
        # starting its one allowed application.
        self.login_as(self.applicant1)
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)

    def test_guest_full_flow_edit_upload_submit_withdraw(self):
        data = self.guest_create()
        headers = self.guest_headers(data["guest_token"])
        application = EnrollmentApplication.objects.get(pk=data["id"])

        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"first_name": "Juan", "middle_name": "Cruz",
             "last_name": "Dela Cruz", "date_of_birth": "2012-05-04",
             "sex": "male", "address": "Poblacion",
             "contact_number": "09171234567",
             "guardian_name": "Maria Dela Cruz",
             "guardian_relationship": "Mother",
             "guardian_contact": "09171234567",
             "guardian_email": "maria@example.com"},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)

        self.guest_upload_required_documents(application, data["guest_token"])

        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/",
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["status"], ApplicationStatus.SUBMITTED)

        # The history records a guest actor without inventing a user.
        event = ApplicationReviewEvent.objects.filter(
            application=application, action="submitted"
        ).first()
        self.assertIsNotNone(event)
        self.assertIsNone(event.actor_id)
        self.assertEqual(event.actor_name, "Applicant (guest)")

        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/withdraw/",
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.WITHDRAWN)

    def test_guest_document_download_requires_ownership(self):
        data = self.guest_create()
        application = EnrollmentApplication.objects.get(pk=data["id"])
        self.guest_upload_required_documents(application, data["guest_token"])
        document = application.documents.filter(is_required=True).first()
        url = (
            f"/api/enrollment/applications/{application.pk}/"
            f"documents/{document.pk}/download/"
        )
        response = self.client.get(url, **self.guest_headers(data["guest_token"]))
        self.assertEqual(response.status_code, 200)

        self.client.logout()
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)

    def test_guest_header_does_not_open_staff_endpoints(self):
        data = self.guest_create()
        headers = self.guest_headers(data["guest_token"])
        response = self.client.get("/api/enrollment/applications/", **headers)
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/api/enrollment/dashboard/", **headers)
        self.assertEqual(response.status_code, 401)

    def test_public_lookup_recovers_a_lost_token(self):
        data = self.guest_create()
        headers = self.guest_headers(data["guest_token"])
        application = EnrollmentApplication.objects.get(pk=data["id"])
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"guardian_email": "maria@example.com",
             "guardian_contact": "0917 123-4567"},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.client.logout()

        # Email (any casing) works.
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": data["reference"], "contact": "MARIA@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["guest_token"], data["guest_token"])
        self.assertEqual(response.data["application_id"], application.pk)

        # So does a phone number written with spaces and dashes.
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": data["reference"], "contact": "0917 123-4567"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        # Wrong contact and wrong reference give the same generic 404.
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": data["reference"], "contact": "attacker@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": "APP-0000000000", "contact": "maria@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_lookup_never_returns_account_applications(self):
        application = self.make_draft()
        self.client.logout()
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": application.reference, "contact": "anything@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_guest_duplicate_lrn_is_rejected(self):
        first = self.guest_create()
        second = self.guest_create()
        response = self.client.patch(
            f"/api/enrollment/applications/my/{first['id']}/",
            {"lrn": "100000000777"}, format="json",
            **self.guest_headers(first["guest_token"]),
        )
        self.assertEqual(response.status_code, 200, response.content)
        response = self.client.patch(
            f"/api/enrollment/applications/my/{second['id']}/",
            {"lrn": "100000000777"}, format="json",
            **self.guest_headers(second["guest_token"]),
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("lrn", response.data)


# ---------------------------------------------------------------------------
# Post-enrollment account claim
# ---------------------------------------------------------------------------

class AccountClaimTests(EnrollmentTestCase):
    """Only a confirmed enrollment may mint a login — through the one-time
    claim token issued when the student account is created."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def tearDown(self):
        cache.clear()
        super().tearDown()

    def build_guest_confirmed(self, lrn="100000000555"):
        """Drive a public application all the way to a confirmed enrollment."""
        data = self.guest_create()
        headers = self.guest_headers(data["guest_token"])
        application = EnrollmentApplication.objects.get(pk=data["id"])
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"first_name": "Juan", "last_name": "Dela Cruz",
             "date_of_birth": "2012-05-04", "guardian_email": "maria@example.com"},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.guest_upload_required_documents(application, data["guest_token"])
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/",
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)

        self.login_as(self.registrar)
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        application = self.accept_application(application)
        application.lrn = lrn
        application.save()
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/confirm/",
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        application.refresh_from_db()
        return application, data

    def test_confirmation_issues_a_one_time_claim_token(self):
        application, data = self.build_guest_confirmed()
        self.assertEqual(application.status, ApplicationStatus.ENROLLED)
        self.assertTrue(application.account_claim_token)
        self.assertEqual(len(application.account_claim_token), 32)
        self.assertIsNone(application.account_claimed_at)

        # The public owner sees the claim offer through their token.
        self.client.logout()
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/",
            **self.guest_headers(data["guest_token"]),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.data["account_claim_available"])
        self.assertEqual(response.data["claim_token"], application.account_claim_token)

    def test_enrolled_student_claims_their_account(self):
        application, data = self.build_guest_confirmed()
        claim_token = application.account_claim_token
        old_guest_token = data["guest_token"]
        self.client.logout()

        response = self.client.post(
            "/api/enrollment/claim-account/",
            {"claim_token": claim_token, "username": "juandelacruz",
             "password": "Claim-Passw0rd!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["user"]["username"], "juandelacruz")
        self.assertTrue(response.data["token"])

        # The application is now owned by the new account; guest access dies.
        application.refresh_from_db()
        self.assertIsNotNone(application.applicant_id)
        self.assertEqual(application.student.user.username, "juandelacruz")
        self.assertIsNone(application.guest_token)
        self.assertIsNone(application.account_claim_token)
        self.assertIsNotNone(application.account_claimed_at)

        response = self.client.get(
            "/api/enrollment/applications/my/",
            **self.guest_headers(old_guest_token),
        )
        self.assertEqual(response.status_code, 401)

        # The chosen credentials really sign in.
        response = self.client.post(
            "/api/auth/token/",
            {"username": "juandelacruz", "password": "Claim-Passw0rd!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        # ...and the claim token is single-use.
        response = self.client.post(
            "/api/enrollment/claim-account/",
            {"claim_token": claim_token, "username": "secondaccount",
             "password": "Claim-Passw0rd!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_claim_requires_a_confirmed_enrollment(self):
        self.client.logout()
        response = self.client.post(
            "/api/enrollment/claim-account/",
            {"claim_token": "f" * 32, "username": "someone",
             "password": "Claim-Passw0rd!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        # A real token on an unconfirmed application is still too early.
        data = self.guest_create()
        application = EnrollmentApplication.objects.get(pk=data["id"])
        application.account_claim_token = "e" * 32
        application.save()
        response = self.client.post(
            "/api/enrollment/claim-account/",
            {"claim_token": "e" * 32, "username": "someone",
             "password": "Claim-Passw0rd!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Registrar confirms", str(response.data))

    def test_claim_validates_credentials(self):
        application, data = self.build_guest_confirmed()
        claim_token = application.account_claim_token
        self.client.logout()

        # Taken username.
        response = self.client.post(
            "/api/enrollment/claim-account/",
            {"claim_token": claim_token, "username": "t_applicant1",
             "password": "Claim-Passw0rd!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.data)

        # Weak password.
        response = self.client.post(
            "/api/enrollment/claim-account/",
            {"claim_token": claim_token, "username": "freshstudent",
             "password": "12345678"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

        # Missing pieces.
        response = self.client.post(
            "/api/enrollment/claim-account/", {"claim_token": claim_token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        # Failed attempts never consume the token.
        application.refresh_from_db()
        self.assertIsNotNone(application.account_claim_token)
        self.assertIsNone(application.account_claimed_at)

    def test_existing_student_match_is_not_reissued_an_account(self):
        # The LRN already belongs to a student who has an account: confirm
        # links the existing identity instead of minting a second user.
        application, data = self.build_guest_confirmed(lrn="100000000001")
        application.refresh_from_db()
        self.assertEqual(application.student_id, self.student1.pk)
        self.assertIsNone(application.account_claim_token)

        self.client.logout()
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/",
            **self.guest_headers(data["guest_token"]),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.data["account_claim_available"])
        self.assertIsNone(response.data["claim_token"])

    def test_guest_sees_their_confirmed_enrollment(self):
        application, data = self.build_guest_confirmed()
        self.client.logout()
        response = self.client.get(
            "/api/enrollment/my-enrollments/",
            **self.guest_headers(data["guest_token"]),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.data), 1)
        expected = Enrollment.objects.get(application=application)
        self.assertEqual(response.data[0]["id"], expected.pk)


# ---------------------------------------------------------------------------
# Registrar trash bin (soft delete / restore / permanent purge)
# ---------------------------------------------------------------------------

class ApplicationTrashTests(EnrollmentTestCase):
    """The Registrar's trash bin: finished applications can be moved there,
    brought back, or purged for good — and they vanish from every queue,
    figure and portal while they sit in it."""

    def trash_url(self, application):
        return f"/api/enrollment/applications/{application.pk}/trash/"

    def restore_url(self, application):
        return f"/api/enrollment/applications/{application.pk}/restore/"

    def make_terminal(self, kind):
        """Build an application really sitting in the terminal status `kind`."""
        application = self.make_draft()
        if kind == ApplicationStatus.CANCELLED:
            self.login_as(self.registrar)
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/action/",
                {"action": "cancel", "reason": "Duplicate filing."},
                format="json",
            )
            self.assertEqual(response.status_code, 200, response.content)
        elif kind == ApplicationStatus.REJECTED:
            self.fill_required_documents(application)
            self.login_as(self.applicant1)
            self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/submit/",
                format="json",
            )
            self.login_as(self.registrar)
            for payload in (
                {"action": "start_review"},
                {"action": "reject", "reason": "Grade level is full."},
            ):
                response = self.client.post(
                    f"/api/enrollment/applications/{application.pk}/action/",
                    payload, format="json",
                )
                self.assertEqual(response.status_code, 200, response.content)
        else:  # withdrawn — the applicant's own decision
            self.fill_required_documents(application)
            self.login_as(self.applicant1)
            self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/submit/",
                format="json",
            )
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(
                    f"/api/enrollment/applications/my/{application.pk}/withdraw/",
                    format="json",
                )
            self.assertEqual(response.status_code, 200, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, kind)
        return application

    def test_trash_hides_finished_applications_from_every_queue(self):
        for kind in (
            ApplicationStatus.CANCELLED,
            ApplicationStatus.REJECTED,
            ApplicationStatus.WITHDRAWN,
        ):
            application = self.make_terminal(kind)
            self.login_as(self.registrar)

            response = self.client.post(self.trash_url(application), format="json")
            self.assertEqual(response.status_code, 204, response.content)
            application.refresh_from_db()
            self.assertIsNotNone(application.deleted_at)
            self.assertEqual(application.deleted_by_id, self.registrar.pk)
            self.assertTrue(application.events.filter(action="trash").exists())

            # Out of the active queue, into the trash bin.
            active = self.client.get("/api/enrollment/applications/")
            self.assertNotIn(
                application.pk, [row["id"] for row in active.data["results"]]
            )
            trash = self.client.get("/api/enrollment/applications/trash/")
            self.assertIn(
                application.pk, [row["id"] for row in trash.data["results"]]
            )
            self.assertIsNotNone(
                next(
                    row["deleted_at"]
                    for row in trash.data["results"]
                    if row["id"] == application.pk
                )
            )

            # And out of the applicant's own portal.
            self.login_as(self.applicant1)
            detail = self.client.get(
                f"/api/enrollment/applications/my/{application.pk}/"
            )
            self.assertEqual(detail.status_code, 404)
            listing = self.client.get("/api/enrollment/applications/my/")
            self.assertNotIn(
                application.pk, [row["id"] for row in listing.data["results"]]
            )

    def test_only_finished_applications_can_be_trashed(self):
        application = self.make_draft()
        self.login_as(self.registrar)
        response = self.client.post(self.trash_url(application), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("cancelled, rejected or withdrawn", str(response.data))

        # A submitted application is still live.
        self.login_as(self.applicant1)
        self.fill_required_documents(application)
        self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/",
            format="json",
        )
        self.login_as(self.registrar)
        response = self.client.post(self.trash_url(application), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        application.refresh_from_db()
        self.assertIsNone(application.deleted_at)

        # An enrolled application is the enrollment record itself — it stays.
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        application = self.accept_application(application)
        application.lrn = "100000000999"
        application.save()
        self.client.post(
            f"/api/enrollment/applications/{application.pk}/assign-section/",
            {"section": self.section_a.pk}, format="json",
        )
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/{application.pk}/confirm/",
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.ENROLLED)

        response = self.client.post(self.trash_url(application), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        application.refresh_from_db()
        self.assertIsNone(application.deleted_at)

    def test_restore_returns_an_application_to_the_active_queue(self):
        application = self.make_terminal(ApplicationStatus.CANCELLED)
        self.login_as(self.registrar)
        self.client.post(self.trash_url(application), format="json")

        response = self.client.post(self.restore_url(application), format="json")
        self.assertEqual(response.status_code, 204, response.content)
        application.refresh_from_db()
        self.assertIsNone(application.deleted_at)
        self.assertIsNone(application.deleted_by_id)
        self.assertTrue(application.events.filter(action="restore").exists())

        active = self.client.get("/api/enrollment/applications/")
        self.assertIn(application.pk, [row["id"] for row in active.data["results"]])
        trash = self.client.get("/api/enrollment/applications/trash/")
        self.assertNotIn(application.pk, [row["id"] for row in trash.data["results"]])

        # The applicant owns it again…
        self.login_as(self.applicant1)
        detail = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(detail.status_code, 200, detail.content)

        # …and restoring a row that never went to the trash is refused.
        self.login_as(self.registrar)
        response = self.client.post(self.restore_url(application), format="json")
        self.assertEqual(response.status_code, 400, response.content)

    def test_permanent_delete_requires_the_trash_and_removes_everything(self):
        application = self.make_terminal(ApplicationStatus.REJECTED)
        self.login_as(self.registrar)

        # Two-step rule: nothing outside the trash can be destroyed.
        response = self.client.delete(
            f"/api/enrollment/applications/{application.pk}/"
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("trash first", str(response.data))
        self.assertTrue(
            EnrollmentApplication.objects.filter(pk=application.pk).exists()
        )

        self.client.post(self.trash_url(application), format="json")
        response = self.client.delete(
            f"/api/enrollment/applications/{application.pk}/"
        )
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(
            EnrollmentApplication.objects.filter(pk=application.pk).exists()
        )
        # The audit trail goes with it — this is the permanent purge.
        self.assertFalse(application.events.exists())
        trash = self.client.get("/api/enrollment/applications/trash/")
        self.assertEqual(trash.data["count"], 0)

    def test_trash_endpoints_require_enrollment_manage(self):
        application = self.make_terminal(ApplicationStatus.CANCELLED)
        detail_url = f"/api/enrollment/applications/{application.pk}/"

        # A student may not use any of it — not even to look at the bin.
        self.login_as(self.applicant1)
        response = self.client.post(self.trash_url(application), format="json")
        self.assertEqual(response.status_code, 403)
        response = self.client.get("/api/enrollment/applications/trash/")
        self.assertEqual(response.status_code, 403)
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 403)

        # Nor an administrator without the enrollment permission keys.
        self.login_as(self.plain_admin)
        response = self.client.post(self.trash_url(application), format="json")
        self.assertEqual(response.status_code, 403)
        response = self.client.post(self.restore_url(application), format="json")
        self.assertEqual(response.status_code, 403)
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 403)

        application.refresh_from_db()
        self.assertIsNone(application.deleted_at)
        self.assertTrue(
            EnrollmentApplication.objects.filter(pk=application.pk).exists()
        )

    def test_trashed_application_is_frozen_until_restored(self):
        application = self.make_terminal(ApplicationStatus.CANCELLED)
        self.login_as(self.registrar)
        self.client.post(self.trash_url(application), format="json")

        # Staff actions demand a restore first, whatever the state machine says.
        response = self.client.post(
            f"/api/enrollment/applications/{application.pk}/action/",
            {"action": "start_review"}, format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("trash", str(response.data))

        # The applicant side cannot even see it — every verb404s.
        self.login_as(self.applicant1)
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"first_name": "Renamed"}, format="json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/",
            format="json",
        )
        self.assertEqual(response.status_code, 404)

        # After the restore it is visible again (its status still guards
        # every workflow move, exactly as before the trash round trip).
        self.login_as(self.registrar)
        self.client.post(self.restore_url(application), format="json")
        self.login_as(self.applicant1)
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/"
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_trashed_applications_leave_the_dashboard_and_report_figures(self):
        application = self.make_terminal(ApplicationStatus.REJECTED)
        self.login_as(self.registrar)
        sy = str(self.school_year.pk)

        before_dash = self.client.get("/api/enrollment/dashboard/").data
        before_report = self.client.get(
            f"/api/enrollment/reports/school-year/?school_year={sy}"
        ).data

        self.client.post(self.trash_url(application), format="json")

        after_dash = self.client.get("/api/enrollment/dashboard/").data
        after_report = self.client.get(
            f"/api/enrollment/reports/school-year/?school_year={sy}"
        ).data

        self.assertEqual(
            after_dash["rejected"], before_dash["rejected"] - 1
        )
        self.assertEqual(
            after_dash["total_applications"], before_dash["total_applications"] - 1
        )

        def status_total(payload, code):
            return next(
                (row["total"] for row in payload["by_status"] if row["status"] == code),
                0,
            )

        self.assertEqual(
            status_total(after_report, ApplicationStatus.REJECTED),
            status_total(before_report, ApplicationStatus.REJECTED) - 1,
        )

    def test_trashed_guest_application_cannot_be_tracked_or_reopened(self):
        data = self.guest_create()
        token = data["guest_token"]
        application = EnrollmentApplication.objects.get(pk=data["id"])
        response = self.client.patch(
            f"/api/enrollment/applications/my/{application.pk}/",
            {"guardian_email": "guardian@example.com"},
            format="json", **self.guest_headers(token),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.guest_upload_required_documents(application, token)
        response = self.client.post(
            f"/api/enrollment/applications/my/{application.pk}/submit/",
            format="json", **self.guest_headers(token),
        )
        self.assertEqual(response.status_code, 200, response.content)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/enrollment/applications/my/{application.pk}/withdraw/",
                format="json", **self.guest_headers(token),
            )
        self.assertEqual(response.status_code, 200, response.content)

        # Control: the public track lookup still finds it while alive.
        self.client.logout()
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": application.reference, "contact": "guardian@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        # Registrar trashes it — now the portal pretends it never existed.
        self.login_as(self.registrar)
        response = self.client.post(self.trash_url(application), format="json")
        self.assertEqual(response.status_code, 204, response.content)

        self.client.logout()
        response = self.client.post(
            "/api/enrollment/public/track/",
            {"reference": application.reference, "contact": "guardian@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 404, response.content)
        response = self.client.get(
            f"/api/enrollment/applications/my/{application.pk}/",
            **self.guest_headers(token),
        )
        self.assertEqual(response.status_code, 404)
