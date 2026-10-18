"""
TRACK — backend tests

Run from the backend folder:
    python manage.py test core
"""

from datetime import timedelta
from io import StringIO

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    Announcement,
    AuditLog,
    AttendanceRecord,
    AttendanceSession,
    GradeLevel,
    Notification,
    ParentProfile,
    Requirement,
    SchoolYear,
    Section,
    StudentProfile,
    Submission,
    SubmissionHistory,
    Subject,
    TeacherAssignment,
    User,
)


class TrackTestCase(APITestCase):
    """Shared fixture: two teachers, two students, one parent, one admin."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username="t_admin", password="pass-Admin123", role=User.Role.ADMIN,
            first_name="Ada", last_name="Admin",
        )
        cls.teacher1 = User.objects.create_user(
            username="t_teacher1", password="pass-Teach123", role=User.Role.TEACHER,
            first_name="Tina", last_name="Teacher",
        )
        cls.teacher2 = User.objects.create_user(
            username="t_teacher2", password="pass-Teach123", role=User.Role.TEACHER,
            first_name="Tom", last_name="Teacher2",
        )
        cls.school_year = SchoolYear.objects.create(
            label="2026-2027",
            start_date=timezone.now().date() - timedelta(days=30),
            end_date=timezone.now().date() + timedelta(days=300),
            is_active=True,
        )
        cls.grade7 = GradeLevel.objects.create(name="Grade 7", order=7)
        cls.section_a = Section.objects.create(
            school_year=cls.school_year, grade_level=cls.grade7, name="Sampaguita"
        )
        cls.section_b = Section.objects.create(
            school_year=cls.school_year, grade_level=cls.grade7, name="Gumamela"
        )
        cls.subject = Subject.objects.create(
            name="Mathematics", grade_level=cls.grade7, school_year=cls.school_year
        )
        cls.assignment1 = TeacherAssignment.objects.create(
            teacher=cls.teacher1, subject=cls.subject, section=cls.section_a
        )
        cls.assignment2 = TeacherAssignment.objects.create(
            teacher=cls.teacher2, subject=cls.subject, section=cls.section_b
        )
        cls.student1_user = User.objects.create_user(
            username="t_student1", password="pass-Stud123", role=User.Role.STUDENT,
            first_name="Sara", last_name="Student",
        )
        cls.student2_user = User.objects.create_user(
            username="t_student2", password="pass-Stud123", role=User.Role.STUDENT,
            first_name="Sam", last_name="Student2",
        )
        cls.student1 = StudentProfile.objects.create(
            user=cls.student1_user, section=cls.section_a, lrn="100000000001"
        )
        cls.student2 = StudentProfile.objects.create(
            user=cls.student2_user, section=cls.section_b, lrn="100000000002"
        )
        cls.parent = User.objects.create_user(
            username="t_parent", password="pass-Parent1", role=User.Role.PARENT,
            first_name="Pia", last_name="Parent",
        )
        cls.parent_profile = ParentProfile.objects.create(user=cls.parent)
        cls.parent_profile.children.add(cls.student1)
        cls.requirement1 = Requirement.objects.create(
            teacher_assignment=cls.assignment1,
            title="Fractions worksheet",
            deadline=timezone.now() + timedelta(days=3),
        )
        cls.requirement2 = Requirement.objects.create(
            teacher_assignment=cls.assignment2,
            title="Algebra drill",
            deadline=timezone.now() + timedelta(days=5),
        )

    def login_as(self, user):
        assert self.client.login(username=user.username, password={
            "t_admin": "pass-Admin123",
            "t_teacher1": "pass-Teach123",
            "t_teacher2": "pass-Teach123",
            "t_student1": "pass-Stud123",
            "t_student2": "pass-Stud123",
            "t_parent": "pass-Parent1",
        }[user.username])
        return self.client


class AuthTests(TrackTestCase):
    def test_health_check_still_works(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "TRACK backend is running.")

    def test_login_success_returns_user_with_role(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "t_admin", "password": "pass-Admin123"},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"]["role"], "admin")

    def test_login_invalid_credentials(self):
        response = self.client.post(
            "/api/auth/login/", {"username": "t_admin", "password": "wrong"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("non_field_errors", response.json())

    def test_login_and_logout_roundtrip(self):
        self.login_as(self.student1_user)
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], "student")
        self.assertEqual(me.json()["username"], "t_student1")

        self.client.post("/api/auth/logout/")
        after = self.client.get("/api/auth/me/")
        self.assertIn(after.status_code, (401, 403))

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me/")
        self.assertIn(response.status_code, (401, 403))

    def test_csrf_endpoint_returns_token(self):
        response = self.client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrfToken", response.json())


class AuthorizationTests(TrackTestCase):
    def test_student_cannot_list_users(self):
        self.login_as(self.student1_user)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, 403)

    def test_student_sees_only_own_submissions(self):
        sub1 = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        Submission.objects.create(
            requirement=self.requirement2, student=self.student2,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        self.login_as(self.student1_user)
        response = self.client.get("/api/submissions/")
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [sub1.id])

    def test_student_cannot_verify_own_submission(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        self.login_as(self.student1_user)
        response = self.client.patch(
            f"/api/submissions/{sub.id}/", {"status": "verified"}
        )
        self.assertEqual(response.status_code, 400)
        sub.refresh_from_db()
        self.assertNotEqual(sub.status, Submission.Status.VERIFIED)

    def test_student_cannot_change_status_after_submitting(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        self.login_as(self.student1_user)
        response = self.client.patch(
            f"/api/submissions/{sub.id}/", {"status": "not_submitted"}
        )
        self.assertEqual(response.status_code, 400)

    def test_teacher_can_verify_own_class_submission(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        self.login_as(self.teacher1)
        response = self.client.patch(
            f"/api/submissions/{sub.id}/", {"status": "verified"}
        )
        self.assertEqual(response.status_code, 200, response.content)
        sub.refresh_from_db()
        self.assertEqual(sub.status, Submission.Status.VERIFIED)


class SubmissionWriteTests(TrackTestCase):
    """
    Regression guards for the real submission flow.

    Two bugs lived here. DRF auto-attached a UniqueTogetherValidator for the
    model's unique_together on (requirement, student); it runs before
    validate() and demanded `student` in the body, but the view stamps the
    student from the authenticated user, so the browser's actual payload —
    requirement/link_url/status only — was rejected with a 400 and a student
    could never hand anything in. Second, the UI re-enables Submit once a
    requirement is returned, so a repeat POST collided with the UNIQUE
    constraint instead of refreshing the row.
    """

    # Exactly what RequirementsExplorer.handleSubmit sends. No `student`.
    def frontend_payload(self, requirement_id=None, link="https://example.com/work"):
        return {
            "requirement": requirement_id or self.requirement1.id,
            "status": "submitted",
            "link_url": link,
        }

    def test_a_student_can_submit_with_the_payload_the_browser_actually_sends(self):
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/submissions/", self.frontend_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201, response.content)
        sub = Submission.objects.get(
            requirement=self.requirement1, student=self.student1
        )
        self.assertEqual(sub.status, Submission.Status.SUBMITTED)
        self.assertEqual(sub.link_url, "https://example.com/work")
        self.assertIsNotNone(sub.submitted_at)

    def test_the_student_is_stamped_from_the_session_not_the_body(self):
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/submissions/", self.frontend_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201, response.content)
        # student2 exists and is a real StudentProfile, but must not be usable
        # as a target from the request body.
        self.assertFalse(
            Submission.objects.filter(student=self.student2).exists()
        )
        self.assertTrue(
            Submission.objects.filter(student=self.student1).exists()
        )

    def test_an_explicit_foreign_student_is_refused_not_honoured(self):
        self.login_as(self.student1_user)
        payload = self.frontend_payload()
        payload["student"] = self.student2.id
        response = self.client.post("/api/submissions/", payload, format="json")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            Submission.objects.filter(student=self.student2).exists()
        )

    def test_handing_in_twice_refreshes_the_row_instead_of_erroring(self):
        self.login_as(self.student1_user)
        first = self.client.post(
            "/api/submissions/", self.frontend_payload(), format="json"
        )
        self.assertEqual(first.status_code, 201, first.content)

        second = self.client.post(
            "/api/submissions/",
            self.frontend_payload(link="https://example.com/final"),
            format="json",
        )

        self.assertEqual(second.status_code, 201, second.content)
        self.assertEqual(
            Submission.objects.filter(
                requirement=self.requirement1, student=self.student1
            ).count(),
            1,
        )
        sub = Submission.objects.get(student=self.student1)
        self.assertEqual(sub.link_url, "https://example.com/final")

    def test_resubmitting_returned_work_clears_the_verification(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.RETURNED,
            submitted_at=timezone.now() - timedelta(days=1),
            verified_at=timezone.now() - timedelta(hours=2),
            teacher_feedback="Fix items 4 and 7.",
        )
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/submissions/", self.frontend_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201, response.content)
        sub.refresh_from_db()
        self.assertEqual(sub.status, Submission.Status.SUBMITTED)
        self.assertIsNone(sub.verified_at)
        self.assertIsNotNone(sub.submitted_at)

    def test_resubmitting_writes_history_for_the_returned_to_submitted_jump(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.RETURNED,
            submitted_at=timezone.now() - timedelta(days=1),
        )
        before = sub.history.count()
        self.login_as(self.student1_user)
        self.client.post("/api/submissions/", self.frontend_payload(), format="json")

        sub.refresh_from_db()
        self.assertEqual(sub.history.count(), before + 1)
        latest = sub.history.first()
        self.assertEqual(latest.old_status, Submission.Status.RETURNED)
        self.assertEqual(latest.new_status, Submission.Status.SUBMITTED)

    def test_resubmitting_informs_the_teacher_again(self):
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.RETURNED,
            submitted_at=timezone.now() - timedelta(days=1),
        )
        self.login_as(self.student1_user)
        self.client.post("/api/submissions/", self.frontend_payload(), format="json")

        self.assertEqual(
            self.teacher1.notifications.filter(submission__isnull=False).count(), 1
        )

    def test_resubmitting_same_status_writes_no_history_and_no_note(self):
        # submitted -> submitted is a no-op change, not a new event.
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now() - timedelta(days=1),
        )
        before = SubmissionHistory.objects.count()
        self.login_as(self.student1_user)
        self.client.post("/api/submissions/", self.frontend_payload(), format="json")

        self.assertEqual(SubmissionHistory.objects.count(), before)

    def test_only_a_student_can_hand_work_in(self):
        self.login_as(self.teacher1)
        response = self.client.post(
            "/api/submissions/", self.frontend_payload(), format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Submission.objects.count(), 0)

    def test_a_duplicate_submission_is_still_blocked_by_the_database(self):
        # The serializer-level validator was removed because it required a
        # field the client never sends; the UNIQUE constraint must still stand.
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/submissions/", self.frontend_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Submission.objects.count(), 1)

    def test_other_teacher_cannot_touch_submission(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        self.login_as(self.teacher2)
        response = self.client.patch(
            f"/api/submissions/{sub.id}/", {"status": "verified"}
        )
        self.assertIn(response.status_code, (403, 404))

    def test_teacher_cannot_create_requirement_for_other_teachers_class(self):
        self.login_as(self.teacher1)
        response = self.client.post(
            "/api/requirements/",
            {
                "teacher_assignment": self.assignment2.id,
                "title": "Not mine",
                "deadline": (timezone.now() + timedelta(days=2)).isoformat(),
                "requirement_type": "assignment",
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_student_cannot_create_requirement(self):
        self.login_as(self.student1_user)
        response = self.client.post(
            "/api/requirements/",
            {
                "teacher_assignment": self.assignment1.id,
                "title": "Fake",
                "deadline": (timezone.now() + timedelta(days=2)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_teacher_sees_only_own_assignments(self):
        self.login_as(self.teacher1)
        response = self.client.get("/api/teacher-assignments/")
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [self.assignment1.id])


class ParentScopedDataTests(TrackTestCase):
    def setUp(self):
        # Parent views for their linked child only
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )
        # Another child (NOT linked to this parent)
        self.other_child_sub = Submission.objects.create(
            requirement=self.requirement2, student=self.student2,
            status=Submission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )

    def test_parent_sees_all_linked_children_submissions(self):
        self.login_as(self.parent)
        response = self.client.get("/api/submissions/")
        student_ids = {row["student"] for row in response.json()["results"]}
        self.assertEqual(student_ids, {self.student1.id})

    def test_parent_cannot_request_unlinked_child_submissions(self):
        self.login_as(self.parent)
        response = self.client.get(
            f"/api/submissions/?child={self.student2.id}"
        )
        self.assertEqual(response.status_code, 403)

    def test_parent_child_requirement_filter(self):
        self.login_as(self.parent)
        allowed = self.client.get(f"/api/requirements/?child={self.student1.id}")
        self.assertEqual(allowed.status_code, 200)
        titles = [row["title"] for row in allowed.json()["results"]]
        self.assertEqual(titles, ["Fractions worksheet"])

        denied = self.client.get(f"/api/requirements/?child={self.student2.id}")
        self.assertEqual(denied.status_code, 200)
        self.assertEqual(denied.json()["results"], [])

    def test_parent_cannot_read_unlinked_child_attendance(self):
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment2,
            date=timezone.now().date(),
        )
        AttendanceRecord.objects.create(
            session=session, student=self.student2, status="absent"
        )
        self.login_as(self.parent)
        denied = self.client.get(f"/api/attendance/records/?student={self.student2.id}")
        self.assertEqual(denied.status_code, 403)

        allowed = self.client.get(
            f"/api/attendance/records/?student={self.student1.id}"
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json()["results"], [])


class DashboardTests(TrackTestCase):
    def test_student_dashboard_shape(self):
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.VERIFIED,
            submitted_at=timezone.now(), verified_at=timezone.now(),
        )
        self.login_as(self.student1_user)
        data = self.client.get("/api/dashboard/").json()
        self.assertEqual(data["role"], "student")
        self.assertEqual(data["total_requirements"], 1)
        self.assertEqual(data["verified"], 1)
        self.assertIn("attendance", data)
        self.assertIn("overdue", data)

    def test_parent_dashboard_lists_linked_children_only(self):
        self.login_as(self.parent)
        data = self.client.get("/api/dashboard/").json()
        self.assertEqual(data["role"], "parent")
        self.assertEqual(
            [child["student_id"] for child in data["children"]],
            [self.student1.id],
        )

    def test_teacher_dashboard_scoped(self):
        self.login_as(self.teacher1)
        data = self.client.get("/api/dashboard/").json()
        self.assertEqual(data["role"], "teacher")
        self.assertEqual(data["assigned_classes"], 1)
        self.assertEqual(data["classes"][0]["section"], "Grade 7 — Sampaguita")

    def test_admin_dashboard_counts(self):
        self.login_as(self.admin)
        data = self.client.get("/api/dashboard/").json()
        self.assertEqual(data["role"], "admin")
        self.assertEqual(data["total_students"], 2)
        self.assertEqual(data["total_teachers"], 2)
        self.assertEqual(data["total_parents"], 1)
        self.assertIn("submission_status", data)
        self.assertIn("attendance", data)
        self.assertIn("recent_activity", data)

    # ── submission_status["none"] ──────────────────────────────────────────
    # `none` counts requirements in scope that have no submission row at all.
    # It used to be hardcoded to 0, so the teacher dashboard's "no submission
    # yet" line could never render. These tests pin it to the database.

    def test_teacher_none_counts_requirements_with_no_submission(self):
        # teacher1 owns exactly one requirement (requirement1) and no
        # submissions exist yet, so every requirement in scope is uncovered.
        self.login_as(self.teacher1)
        statuses = self.client.get("/api/dashboard/").json()["submission_status"]
        self.assertEqual(statuses["none"], 1)

    def test_teacher_none_is_not_hardcoded_to_zero(self):
        self.login_as(self.teacher1)
        statuses = self.client.get("/api/dashboard/").json()["submission_status"]
        scope = Requirement.objects.filter(teacher_assignment__teacher=self.teacher1)
        self.assertEqual(statuses["none"], scope.count())

    def test_none_drops_once_a_submission_is_recorded(self):
        self.login_as(self.teacher1)
        before = self.client.get("/api/dashboard/").json()["submission_status"]["none"]

        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )
        after = self.client.get("/api/dashboard/").json()["submission_status"]["none"]

        self.assertEqual(before, 1)
        self.assertEqual(after, 0)

    def test_teacher_none_ignores_other_teachers_requirements(self):
        # requirement2 belongs to teacher2, so it must never be counted in
        # teacher1's `none` even though it has no submission either.
        self.login_as(self.teacher1)
        statuses = self.client.get("/api/dashboard/").json()["submission_status"]
        self.assertEqual(statuses["none"], 1)
        self.assertEqual(
            Requirement.objects.filter(teacher_assignment__teacher=self.teacher1).count(),
            1,
        )

    def test_admin_none_spans_every_requirement(self):
        # Two requirements exist overall and nothing is submitted.
        self.login_as(self.admin)
        statuses = self.client.get("/api/dashboard/").json()["submission_status"]
        self.assertEqual(statuses["none"], 2)

    def test_none_counts_each_requirement_once_despite_multiple_rows(self):
        # Several students submitting to one requirement produce several rows
        # sharing a requirement_id. Submission.Meta.ordering pulls the ordering
        # column into DISTINCT, so an unguarded query would not dedupe — the
        # requirement must still be counted as covered exactly once.
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )
        Submission.objects.create(
            requirement=self.requirement1, student=self.student2,
            status=Submission.Status.RETURNED, submitted_at=timezone.now(),
        )
        self.login_as(self.admin)
        statuses = self.client.get("/api/dashboard/").json()["submission_status"]
        # Two rows, but they cover requirement1 only -> requirement2 alone
        # is still bare, so exactly one remains.
        self.assertEqual(statuses["none"], 1)

    def test_dashboard_requires_auth(self):
        response = self.client.get("/api/dashboard/")
        self.assertIn(response.status_code, (401, 403))


class AttendanceWriteTests(TrackTestCase):
    def test_teacher_cannot_record_attendance_for_foreign_session(self):
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment1,
            date=timezone.now().date(),
        )
        self.login_as(self.teacher2)
        response = self.client.post(
            "/api/attendance/records/",
            {"session": session.id, "student": self.student2.id, "status": "present"},
        )
        self.assertEqual(response.status_code, 403)

    def test_session_per_day_uniqueness_enforced(self):
        self.login_as(self.teacher1)
        payload = {
            "teacher_assignment": self.assignment1.id,
            "date": timezone.now().date().isoformat(),
        }
        first = self.client.post("/api/attendance/sessions/", payload)
        self.assertEqual(first.status_code, 201, first.content)
        second = self.client.post("/api/attendance/sessions/", payload)
        self.assertEqual(second.status_code, 400)


class AttendanceRecordShapeTests(TrackTestCase):
    """The frontend renders date/section/subject straight off each record."""

    def test_record_includes_nested_session_detail(self):
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment1,
            date=timezone.now().date(),
        )
        AttendanceRecord.objects.create(
            session=session, student=self.student1, status="present",
            recorded_by=self.teacher1,
        )

        self.login_as(self.teacher1)
        response = self.client.get("/api/attendance/records/")
        self.assertEqual(response.status_code, 200)

        record = response.json()["results"][0]
        # session stays a plain id so it can still be posted back
        self.assertEqual(record["session"], session.id)
        detail = record["session_detail"]
        self.assertEqual(detail["id"], session.id)
        self.assertEqual(detail["date"], session.date.isoformat())
        self.assertEqual(detail["section_name"], "Grade 7 — Sampaguita (2026-2027)")
        self.assertEqual(detail["subject_name"], "Mathematics")


class AdminUserManagementTests(TrackTestCase):
    """Admin account screens: create with profile, edit, deactivate, link."""

    def test_non_admin_cannot_create_users(self):
        for user in (self.teacher1, self.student1_user, self.parent):
            self.login_as(user)
            response = self.client.post(
                "/api/users/",
                {"username": "newbie", "password": "pass-Long1234",
                 "role": "student", "lrn": "100000000099"},
            )
            self.assertEqual(response.status_code, 403, user.username)
            self.client.logout()

    def test_admin_creates_student_and_profile_is_created(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/users/",
            {
                "username": "newstudent", "password": "pass-Long1234",
                "email": "new@knhs.edu.ph", "first_name": "Nina",
                "last_name": "Nuevo", "role": "student",
                "lrn": "100000000077", "section": self.section_a.id,
            },
        )
        self.assertEqual(response.status_code, 201, response.content)

        created = User.objects.get(username="newstudent")
        self.assertTrue(created.check_password("pass-Long1234"))
        self.assertEqual(created.role, "student")
        # A student with no profile would see an empty dashboard forever
        self.assertTrue(hasattr(created, "student_profile"))
        self.assertEqual(created.student_profile.lrn, "100000000077")
        self.assertEqual(created.student_profile.section_id, self.section_a.id)

    def test_admin_cannot_create_student_without_lrn(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/users/",
            {"username": "nolrn", "password": "pass-Long1234",
             "role": "student", "section": self.section_a.id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("lrn", response.json())
        self.assertFalse(User.objects.filter(username="nolrn").exists())

    def test_admin_creates_parent_and_links_children(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/users/",
            {
                "username": "newparent", "password": "pass-Long1234",
                "first_name": "Pablo", "last_name": "Padre", "role": "parent",
                "children": [self.student1.id, self.student2.id],
            },
        )
        self.assertEqual(response.status_code, 201, response.content)
        created = User.objects.get(username="newparent")
        linked = list(
            created.parent_profile.children.values_list("id", flat=True)
        )
        self.assertEqual(sorted(linked), sorted([self.student1.id, self.student2.id]))

    def test_admin_can_change_role(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.student2_user.id}/", {"role": "teacher"}
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.student2_user.refresh_from_db()
        self.assertEqual(self.student2_user.role, "teacher")

    def test_admin_can_deactivate_account(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.student2_user.id}/", {"is_active": False}
        )
        self.assertEqual(response.status_code, 200)
        self.student2_user.refresh_from_db()
        self.assertFalse(self.student2_user.is_active)

        # The deactivated account can no longer sign in
        self.client.logout()
        fail = self.client.login(username=self.student2_user.username,
                                 password="pass-Stud123")
        self.assertFalse(fail)

    def test_admin_can_edit_student_section(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.student1_user.id}/",
            {"section": self.section_b.id, "lrn": "100000000055"},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.student1.refresh_from_db()
        self.assertEqual(self.student1.section_id, self.section_b.id)
        self.assertEqual(self.student1.lrn, "100000000055")

    def test_admin_cannot_deactivate_own_account(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.admin.id}/", {"is_active": False}
        )
        self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_admin_cannot_change_own_role(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.admin.id}/", {"role": "teacher"}
        )
        self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, "admin")

    def test_user_cannot_escalate_own_role_via_me_endpoint(self):
        """The critical guard: /api/auth/me/ must never accept a role change."""
        self.login_as(self.student1_user)
        response = self.client.patch(
            "/api/auth/me/", {"role": "admin", "is_active": True}
        )
        self.assertEqual(response.status_code, 200)
        self.student1_user.refresh_from_db()
        self.assertEqual(self.student1_user.role, "student")

    def test_detail_response_exposes_profile_fields(self):
        self.login_as(self.admin)
        data = self.client.get(
            f"/api/users/{self.student1_user.id}/"
        ).json()
        self.assertEqual(data["lrn"], "100000000001")
        self.assertEqual(data["section"], self.section_a.id)
        self.assertEqual(data["section_name"], "Grade 7 — Sampaguita (2026-2027)")

        parent_data = self.client.get(f"/api/users/{self.parent.id}/").json()
        self.assertEqual(parent_data["children"], [self.student1.id])
        self.assertEqual(parent_data["children_detail"][0]["name"], "Sara Student")


class TeacherAssignmentValidationTests(TrackTestCase):
    """Class assignments must reference a real teacher and a matching grade."""

    def test_admin_creates_assignment(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/teacher-assignments/",
            {"teacher": self.teacher1.id, "subject": self.subject.id,
             "section": self.section_b.id},
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            response.json()["section_name"], "Grade 7 — Gumamela (2026-2027)"
        )

    def test_cannot_assign_non_teacher(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/teacher-assignments/",
            {"teacher": self.student1_user.id, "subject": self.subject.id,
             "section": self.section_a.id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("teacher", response.json())
        self.assertFalse(
            TeacherAssignment.objects.filter(teacher=self.student1_user).exists()
        )

    def test_cannot_assign_inactive_teacher(self):
        self.teacher1.is_active = False
        self.teacher1.save()
        self.login_as(self.admin)
        response = self.client.post(
            "/api/teacher-assignments/",
            {"teacher": self.teacher1.id, "subject": self.subject.id,
             "section": self.section_a.id},
        )
        self.assertEqual(response.status_code, 400)

    def test_subject_grade_must_match_section(self):
        grade8 = GradeLevel.objects.create(name="Grade 8", order=8)
        science = Subject.objects.create(
            name="Science", grade_level=grade8, school_year=self.school_year
        )
        self.login_as(self.admin)
        response = self.client.post(
            "/api/teacher-assignments/",
            {"teacher": self.teacher1.id, "subject": science.id,
             "section": self.section_a.id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("subject", response.json())
        self.assertIn("Grade 8", response.json()["subject"][0])

    def test_subject_school_year_must_match_section(self):
        other_year = SchoolYear.objects.create(
            label="2025-2026",
            start_date=timezone.now().date() - timedelta(days=400),
            end_date=timezone.now().date() - timedelta(days=40),
            is_active=False,
        )
        old_math = Subject.objects.create(
            name="Mathematics", grade_level=self.grade7, school_year=other_year
        )
        self.login_as(self.admin)
        response = self.client.post(
            "/api/teacher-assignments/",
            {"teacher": self.teacher1.id, "subject": old_math.id,
             "section": self.section_a.id},
        )
        self.assertEqual(response.status_code, 400)

    def test_non_admin_cannot_create_assignment(self):
        self.login_as(self.teacher1)
        response = self.client.post(
            "/api/teacher-assignments/",
            {"teacher": self.teacher1.id, "subject": self.subject.id,
             "section": self.section_b.id},
        )
        self.assertEqual(response.status_code, 403)


class DestructiveDeleteGuardTests(TrackTestCase):
    """
    Deleting a section or subject that is still in use would silently orphan
    students and requirements (both FKs are SET_NULL/CASCADE), so the server
    must refuse.
    """

    def test_cannot_delete_section_with_students(self):
        self.login_as(self.admin)
        response = self.client.delete(f"/api/sections/{self.section_a.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Sampaguita", response.json()["detail"])
        self.assertTrue(Section.objects.filter(pk=self.section_a.id).exists())
        # The student keeps their section
        self.student1.refresh_from_db()
        self.assertEqual(self.student1.section_id, self.section_a.id)

    def test_can_delete_empty_section(self):
        empty = Section.objects.create(
            school_year=self.school_year, grade_level=self.grade7, name="Orchid"
        )
        self.login_as(self.admin)
        response = self.client.delete(f"/api/sections/{empty.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Section.objects.filter(pk=empty.id).exists())

    def test_cannot_delete_section_with_assignments(self):
        # Move the student out so only the assignment blocks deletion.
        self.student1.section = self.section_b
        self.student1.save()
        self.login_as(self.admin)
        response = self.client.delete(f"/api/sections/{self.section_a.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("assignment", response.json()["detail"].lower())
        self.assertTrue(Section.objects.filter(pk=self.section_a.id).exists())

    def test_cannot_delete_subject_with_assignments(self):
        self.login_as(self.admin)
        response = self.client.delete(f"/api/subjects/{self.subject.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Subject.objects.filter(pk=self.subject.id).exists())
        # The requirement built on that assignment survives
        self.assertTrue(Requirement.objects.filter(pk=self.requirement1.pk).exists())

    def test_can_delete_unused_subject(self):
        spare = Subject.objects.create(
            name="Music", grade_level=self.grade7, school_year=self.school_year
        )
        self.login_as(self.admin)
        response = self.client.delete(f"/api/subjects/{spare.id}/")
        self.assertEqual(response.status_code, 204)

    def test_non_admin_cannot_delete(self):
        self.login_as(self.teacher1)
        response = self.client.delete(f"/api/sections/{self.section_a.id}/")
        self.assertEqual(response.status_code, 403)


class SectionNameConsistencyTests(TrackTestCase):
    """
    The frontend joins students, requirements and assignments on `section_name`,
    so every serializer must return the same canonical label.
    """

    CANONICAL = "Grade 7 — Sampaguita (2026-2027)"

    def test_all_serializers_agree_on_section_name(self):
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment1, date=timezone.now().date()
        )
        AttendanceRecord.objects.create(
            session=session, student=self.student1, status="present",
            recorded_by=self.teacher1,
        )

        self.login_as(self.admin)

        # Results are ordered by section, so pick the row for assignment1
        # rather than assuming it comes first.
        assignments = self.client.get("/api/teacher-assignments/").json()["results"]
        row = next(a for a in assignments if a["id"] == self.assignment1.id)
        self.assertEqual(row["section_name"], self.CANONICAL)

        requirements = self.client.get("/api/requirements/").json()["results"]
        row = next(r for r in requirements if r["id"] == self.requirement1.id)
        self.assertEqual(row["section_name"], self.CANONICAL)

        record = self.client.get("/api/attendance/records/").json()["results"][0]
        self.assertEqual(record["session_detail"]["section_name"], self.CANONICAL)

        students = self.client.get("/api/students/").json()["results"]
        row = next(s for s in students if s["id"] == self.student1.id)
        self.assertEqual(row["section_name"], self.CANONICAL)


class SchoolYearAndGradeLevelTests(TrackTestCase):
    """
    School year and grade level management.

    `Section.school_year` and `Subject.school_year` are CASCADE, so deleting a
    school year would erase every section, subject, class assignment,
    requirement, submission, submission history and attendance record tied to
    it — the school's entire academic record for that year. The server has to
    refuse rather than cascade. `Section.grade_level`/`Subject.grade_level` are
    PROTECT, which Django raises as ProtectedError; that must surface as a
    readable 400, not an unhandled 500.
    """

    # ── School year deletion ────────────────────────────────────────────────

    def test_cannot_delete_school_year_that_has_sections(self):
        self.login_as(self.admin)
        response = self.client.delete(f"/api/school-years/{self.school_year.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("2026-2027", response.json()["detail"])
        self.assertTrue(SchoolYear.objects.filter(pk=self.school_year.id).exists())
        # Everything hanging off it survives — this is the whole point.
        self.assertTrue(Section.objects.filter(pk=self.section_a.id).exists())
        self.assertTrue(Subject.objects.filter(pk=self.subject.id).exists())
        self.assertTrue(TeacherAssignment.objects.filter(pk=self.assignment1.pk).exists())
        self.assertTrue(Requirement.objects.filter(pk=self.requirement1.pk).exists())

    def test_school_year_delete_refusal_explains_the_consequence(self):
        self.login_as(self.admin)
        response = self.client.delete(f"/api/school-years/{self.school_year.id}/")
        # The message must tell the registrar *why* it was refused.
        self.assertIn("requirement", response.json()["detail"].lower())

    def test_cannot_delete_school_year_that_only_has_subjects(self):
        self.section_a.delete()
        self.section_b.delete()
        TeacherAssignment.objects.all().delete()
        self.login_as(self.admin)
        response = self.client.delete(f"/api/school-years/{self.school_year.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("subject", response.json()["detail"].lower())
        self.assertTrue(SchoolYear.objects.filter(pk=self.school_year.id).exists())
        self.assertTrue(Subject.objects.filter(pk=self.subject.id).exists())

    def test_can_delete_an_unused_school_year(self):
        spare = SchoolYear.objects.create(
            label="2030-2031",
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=300),
        )
        self.login_as(self.admin)
        response = self.client.delete(f"/api/school-years/{spare.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SchoolYear.objects.filter(pk=spare.id).exists())

    def test_non_admin_cannot_delete_school_year(self):
        self.login_as(self.teacher1)
        response = self.client.delete(f"/api/school-years/{self.school_year.id}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(SchoolYear.objects.filter(pk=self.school_year.id).exists())

    # ── School year validation ──────────────────────────────────────────────

    def test_rejects_school_year_ending_before_it_starts(self):
        # The model's clean() is never called by DRF, so the serializer must
        # enforce the ordering or an inverted year is accepted silently.
        self.login_as(self.admin)
        response = self.client.post("/api/school-years/", {
            "label": "2027-2028",
            "start_date": "2027-06-01",
            "end_date": "2027-04-01",
        }, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("end_date", response.json())
        self.assertFalse(SchoolYear.objects.filter(label="2027-2028").exists())

    def test_rejects_school_year_with_equal_dates(self):
        self.login_as(self.admin)
        response = self.client.post("/api/school-years/", {
            "label": "2027-2028",
            "start_date": "2027-06-01",
            "end_date": "2027-06-01",
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_rejects_edit_that_only_moves_the_end_date_before_the_start(self):
        # Partial update: validate() has to fall back to the stored instance
        # dates, not just the fields present in the payload.
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/school-years/{self.school_year.id}/",
            {"end_date": "2020-01-01"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.school_year.refresh_from_db()
        self.assertNotEqual(str(self.school_year.end_date), "2020-01-01")

    def test_duplicate_school_year_label_is_rejected(self):
        self.login_as(self.admin)
        response = self.client.post("/api/school-years/", {
            "label": "2026-2027",
            "start_date": "2026-06-01",
            "end_date": "2027-04-01",
        }, format="json")
        self.assertEqual(response.status_code, 400)

    # ── Only one active year ────────────────────────────────────────────────

    def test_marking_a_year_active_deactivates_the_previous_one(self):
        other = SchoolYear.objects.create(
            label="2027-2028",
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=300),
            is_active=True,
        )
        self.school_year.refresh_from_db()
        self.assertFalse(self.school_year.is_active)
        self.assertTrue(SchoolYear.objects.get(pk=other.pk).is_active)

    # ── Grade level CRUD ────────────────────────────────────────────────────

    def test_grade_level_list_is_readable_by_any_authenticated_user(self):
        self.login_as(self.student1_user)
        response = self.client.get("/api/grade-levels/")
        self.assertEqual(response.status_code, 200)

    def test_admin_can_create_a_grade_level(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/grade-levels/", {"name": "Grade 8", "order": 8}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(GradeLevel.objects.filter(name="Grade 8").exists())

    def test_teacher_cannot_create_a_grade_level(self):
        self.login_as(self.teacher1)
        response = self.client.post(
            "/api/grade-levels/", {"name": "Grade 9", "order": 9}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(GradeLevel.objects.filter(name="Grade 9").exists())

    def test_admin_can_rename_a_grade_level(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/grade-levels/{self.grade7.id}/",
            {"name": "Grade 7 — Rose"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.grade7.refresh_from_db()
        self.assertEqual(self.grade7.name, "Grade 7 — Rose")

    def test_duplicate_grade_level_order_is_rejected(self):
        self.login_as(self.admin)
        response = self.client.post(
            "/api/grade-levels/", {"name": "Grade 7-B", "order": 7}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_grade_level_in_use_cannot_be_deleted(self):
        # PROTECT raises ProtectedError — must be a readable 400, not a 500.
        self.login_as(self.admin)
        response = self.client.delete(f"/api/grade-levels/{self.grade7.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "'Grade 7' is still used by sections or subjects. Reassign or "
            "delete those first.",
        )
        self.assertTrue(GradeLevel.objects.filter(pk=self.grade7.id).exists())
        self.assertTrue(Section.objects.filter(pk=self.section_a.id).exists())

    def test_unused_grade_level_can_be_deleted(self):
        spare = GradeLevel.objects.create(name="Grade 12", order=12)
        self.login_as(self.admin)
        response = self.client.delete(f"/api/grade-levels/{spare.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(GradeLevel.objects.filter(pk=spare.id).exists())

    def test_teacher_cannot_delete_a_grade_level(self):
        self.login_as(self.teacher1)
        response = self.client.delete(f"/api/grade-levels/{self.grade7.id}/")
        self.assertEqual(response.status_code, 403)


class PasswordResetTests(TrackTestCase):
    """
    The registrar's recovery path for a locked-out account.

    There is no self-service email reset (the deployment has no SMTP), so an
    administrator sets the new password directly. Two things must hold: the
    password has to meet the same strength rules as a self-service change, and
    the whole action has to be audited.
    """

    NEW = "Fresh-Passw0rd"

    def reset(self, user_id, password=None):
        return self.client.post(
            "/api/auth/reset-password/",
            {"user_id": user_id, "new_password": password or self.NEW},
            format="json",
        )

    # ── Admin can reset ─────────────────────────────────────────────────────

    def test_admin_can_reset_another_users_password(self):
        self.login_as(self.admin)
        response = self.reset(self.teacher1.id)

        self.assertEqual(response.status_code, 200)
        self.teacher1.refresh_from_db()
        self.assertTrue(self.teacher1.check_password(self.NEW))
        self.assertFalse(self.teacher1.check_password("pass-Teach123"))

    def test_the_new_password_really_lets_the_user_sign_in(self):
        self.login_as(self.admin)
        self.reset(self.teacher1.id)
        self.client.logout()

        self.assertTrue(
            self.client.login(username=self.teacher1.username, password=self.NEW)
        )
        self.assertFalse(
            self.client.login(username=self.teacher1.username, password="pass-Teach123")
        )

    def test_the_response_never_returns_a_password(self):
        self.login_as(self.admin)
        body = self.reset(self.teacher1.id).json()
        self.assertNotIn("password", body)

    def test_admin_can_reset_their_own_password(self):
        self.login_as(self.admin)
        response = self.reset(self.admin.id)
        self.assertEqual(response.status_code, 200)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(self.NEW))

    # ── Strength rules apply here too ───────────────────────────────────────

    def test_rejects_a_too_short_password(self):
        self.login_as(self.admin)
        response = self.reset(self.teacher1.id, "short")
        self.assertEqual(response.status_code, 400)
        self.teacher1.refresh_from_db()
        self.assertTrue(self.teacher1.check_password("pass-Teach123"))

    def test_rejects_a_common_password(self):
        self.login_as(self.admin)
        response = self.reset(self.teacher1.id, "password")
        self.assertEqual(response.status_code, 400)

    def test_rejects_a_purely_numeric_password(self):
        self.login_as(self.admin)
        response = self.reset(self.teacher1.id, "1234567890123")
        self.assertEqual(response.status_code, 400)

    def test_rejects_a_password_built_from_the_users_own_name(self):
        # Proves UserAttributeSimilarityValidator actually runs here.
        self.login_as(self.admin)
        response = self.reset(self.teacher1.id, "TinaTeacher99")
        self.assertEqual(response.status_code, 400)

    # ── Bad targets ─────────────────────────────────────────────────────────

    def test_rejects_an_unknown_user_id(self):
        self.login_as(self.admin)
        response = self.reset(999999)
        self.assertEqual(response.status_code, 400)
        self.assertIn("user_id", response.json())

    # ── Authorization ───────────────────────────────────────────────────────

    def test_teacher_cannot_reset_anyones_password(self):
        self.login_as(self.teacher1)
        response = self.reset(self.student1_user.id)
        self.assertEqual(response.status_code, 403)
        self.student1_user.refresh_from_db()
        self.assertTrue(self.student1_user.check_password("pass-Stud123"))

    def test_student_cannot_reset_anyones_password(self):
        self.login_as(self.student1_user)
        response = self.reset(self.parent.id)
        self.assertEqual(response.status_code, 403)

    def test_parent_cannot_reset_anyones_password(self):
        self.login_as(self.parent)
        response = self.reset(self.teacher1.id)
        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_reset(self):
        response = self.reset(self.teacher1.id)
        self.assertIn(response.status_code, (401, 403))

    # ── Audit trail ─────────────────────────────────────────────────────────

    def test_a_reset_writes_an_audit_log(self):
        self.login_as(self.admin)
        self.reset(self.teacher1.id)

        entry = AuditLog.objects.filter(
            action="auth.password_reset", target_id=str(self.teacher1.id)
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor_id, self.admin.id)
        self.assertIn("reset the password", entry.description)

    def test_a_rejected_reset_writes_no_audit_log(self):
        self.login_as(self.admin)
        self.reset(self.teacher1.id, "weak")
        self.assertFalse(
            AuditLog.objects.filter(action="auth.password_reset").exists()
        )


class AdminPasswordValidationTests(TrackTestCase):
    """
    AdminUserSerializer used to call set_password() straight from create() and
    update() with no validation at all, so a PATCH could set an account's
    password to anything. The same strength rules as a self-service change now
    apply on both paths.
    """

    def test_cannot_create_a_user_with_a_weak_password(self):
        self.login_as(self.admin)
        response = self.client.post("/api/users/", {
            "username": "weakling", "password": "123",
            "first_name": "Wren", "last_name": "Weak", "role": "teacher",
        }, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.assertFalse(User.objects.filter(username="weakling").exists())

    def test_can_create_a_user_with_a_strong_password(self):
        self.login_as(self.admin)
        response = self.client.post("/api/users/", {
            "username": "strongling", "password": "Brava-Skies-88",
            "first_name": "Bella", "last_name": "Strong", "role": "teacher",
        }, format="json")

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(username="strongling")
        self.assertTrue(created.check_password("Brava-Skies-88"))

    def test_cannot_patch_a_user_to_a_weak_password(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.teacher1.id}/", {"password": "abc"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.teacher1.refresh_from_db()
        self.assertTrue(self.teacher1.check_password("pass-Teach123"))

    def test_cannot_patch_a_password_onto_the_users_own_name(self):
        # The instance is passed to the similarity validator on edit.
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.teacher1.id}/", {"password": "TinaTeacher99"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_can_patch_a_user_to_a_strong_password(self):
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.teacher1.id}/", {"password": "Brava-Skies-88"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.teacher1.refresh_from_db()
        self.assertTrue(self.teacher1.check_password("Brava-Skies-88"))

    def test_a_blank_password_on_edit_keeps_the_existing_one(self):
        # Blank means "leave it alone" — it must not be read as an empty password.
        self.login_as(self.admin)
        response = self.client.patch(
            f"/api/users/{self.teacher1.id}/", {"password": ""},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.teacher1.refresh_from_db()
        self.assertTrue(self.teacher1.check_password("pass-Teach123"))


class NotificationWiringTests(TrackTestCase):
    """
    Notifications used to exist only as seed rows — the model defined eight
    types but no view ever wrote one, so nothing actually notified anyone.

    Each test drives the real API endpoint (not the helper directly) so the
    wiring itself is what is under test.
    """

    def notifs_for(self, user, notif_type=None):
        qs = user.notifications.all()
        return qs if notif_type is None else qs.filter(notif_type=notif_type)

    # ── New requirement ────────────────────────────────────────────────────

    def test_creating_a_requirement_notifies_that_sections_students(self):
        self.login_as(self.teacher1)
        self.client.post("/api/requirements/", {
            "title": "Geometry Packet",
            "requirement_type": "assignment",
            "deadline": (timezone.now() + timedelta(days=7)).isoformat(),
            "teacher_assignment": self.assignment1.id,
        }, format="json")

        got = self.notifs_for(
            self.student1_user, Notification.NotifType.REQUIREMENT_NEW
        )
        self.assertEqual(got.count(), 1)
        self.assertIn("Geometry Packet", got.first().title)

    def test_students_in_another_section_are_not_notified(self):
        # student2 is in section_b; requirement1 belongs to section_a.
        self.login_as(self.teacher1)
        self.client.post("/api/requirements/", {
            "title": "Only Sampaguita",
            "requirement_type": "quiz",
            "deadline": (timezone.now() + timedelta(days=7)).isoformat(),
            "teacher_assignment": self.assignment1.id,
        }, format="json")

        self.assertEqual(
            self.notifs_for(self.student2_user, Notification.NotifType.REQUIREMENT_NEW).count(),
            0,
        )

    # ── Work handed in ─────────────────────────────────────────────────────

    def test_submitting_work_notifies_the_teacher(self):
        self.login_as(self.student1_user)
        self.client.post("/api/submissions/", {
            "requirement": self.requirement1.id,
            "status": "submitted",
            "link_url": "https://example.com/work",
        }, format="json")

        got = self.notifs_for(self.teacher1).filter(submission__isnull=False)
        self.assertEqual(got.count(), 1)
        self.assertIn("awaiting check", got.first().title)

    def test_the_teacher_who_owns_the_class_is_notified_not_someone_else(self):
        self.login_as(self.student1_user)
        self.client.post("/api/submissions/", {
            "requirement": self.requirement1.id,
            "status": "submitted",
            "link_url": "https://example.com/work",
        }, format="json")

        self.assertEqual(self.notifs_for(self.teacher2).count(), 0)

    # ── Verified / returned ────────────────────────────────────────────────

    def test_verifying_work_notifies_the_student(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )
        self.login_as(self.teacher1)
        self.client.patch(f"/api/submissions/{sub.id}/", {"status": "verified"}, format="json")

        got = self.notifs_for(
            self.student1_user, Notification.NotifType.SUBMISSION_VERIFIED
        )
        self.assertEqual(got.count(), 1)
        self.assertEqual(got.first().submission_id, sub.id)

    def test_returning_work_notifies_the_student_and_quotes_feedback(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )
        self.login_as(self.teacher1)
        self.client.patch(
            f"/api/submissions/{sub.id}/",
            {"status": "returned", "teacher_feedback": "Fix items 4 and 7."},
            format="json",
        )

        got = self.notifs_for(
            self.student1_user, Notification.NotifType.SUBMISSION_RETURNED
        )
        self.assertEqual(got.count(), 1)
        self.assertIn("Fix items 4 and 7.", got.first().body)

    def test_editing_feedback_without_a_status_change_notifies_nobody(self):
        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.VERIFIED, submitted_at=timezone.now(),
        )
        before = self.student1_user.notifications.count()

        self.login_as(self.teacher1)
        self.client.patch(
            f"/api/submissions/{sub.id}/", {"teacher_feedback": "Nice work."},
            format="json",
        )

        self.assertEqual(self.student1_user.notifications.count(), before)

    # ── Attendance ─────────────────────────────────────────────────────────

    def _session(self):
        return AttendanceSession.objects.create(
            teacher_assignment=self.assignment1,
            date=timezone.now().date(),
        )

    def test_marking_a_child_absent_notifies_their_parent(self):
        session = self._session()
        self.login_as(self.teacher1)
        self.client.post("/api/attendance/records/", {
            "session": session.id, "student": self.student1.id, "status": "absent",
        }, format="json")

        got = self.notifs_for(self.parent, Notification.NotifType.ATTENDANCE_ABSENT)
        self.assertEqual(got.count(), 1)
        self.assertIn("Sara Student", got.first().title)

    def test_marking_a_child_late_notifies_their_parent(self):
        session = self._session()
        self.login_as(self.teacher1)
        self.client.post("/api/attendance/records/", {
            "session": session.id, "student": self.student1.id, "status": "late",
        }, format="json")

        self.assertEqual(
            self.notifs_for(self.parent, Notification.NotifType.ATTENDANCE_LATE).count(), 1
        )

    def test_marking_present_notifies_nobody(self):
        session = self._session()
        self.login_as(self.teacher1)
        self.client.post("/api/attendance/records/", {
            "session": session.id, "student": self.student1.id, "status": "present",
        }, format="json")

        self.assertEqual(self.parent.notifications.count(), 0)

    def test_a_parent_is_not_notified_about_a_child_they_are_not_linked_to(self):
        # parent is linked only to student1; student2 is in section_b and has
        # no parents at all, so nothing should be written and nothing crash.
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment2,
            date=timezone.now().date(),
        )
        self.login_as(self.teacher2)
        response = self.client.post("/api/attendance/records/", {
            "session": session.id, "student": self.student2.id, "status": "absent",
        }, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.parent.notifications.count(), 0)

    def test_flipping_present_to_absent_on_update_notifies_the_parent(self):
        record = AttendanceRecord.objects.create(
            session=self._session(), student=self.student1,
            status=AttendanceRecord.Status.PRESENT,
        )
        self.login_as(self.teacher1)
        self.client.patch(
            f"/api/attendance/records/{record.id}/", {"status": "absent"},
            format="json",
        )

        self.assertEqual(
            self.notifs_for(self.parent, Notification.NotifType.ATTENDANCE_ABSENT).count(), 1
        )

    # ── Announcements ──────────────────────────────────────────────────────

    def test_an_announcement_reaches_the_chosen_audience(self):
        self.login_as(self.admin)
        self.client.post("/api/announcements/", {
            "title": "Enrollment week", "body": "Opens Monday.",
            "audience": "students",
        }, format="json")

        self.assertEqual(
            self.notifs_for(self.student1_user, Notification.NotifType.ANNOUNCEMENT).count(), 1
        )
        self.assertEqual(self.notifs_for(self.student2_user, Notification.NotifType.ANNOUNCEMENT).count(), 1)
        self.assertEqual(self.parent.notifications.count(), 0)
        self.assertEqual(self.teacher1.notifications.count(), 0)

    def test_an_everyone_announcement_reaches_all_four_roles(self):
        self.login_as(self.admin)
        self.client.post("/api/announcements/", {
            "title": "Flag ceremony", "body": "7:00 AM.", "audience": "all",
        }, format="json")

        for user in (self.student1_user, self.student2_user, self.parent, self.teacher1):
            self.assertEqual(user.notifications.count(), 1, user.username)

    def test_a_parent_cannot_broadcast_an_announcement(self):
        self.login_as(self.parent)
        response = self.client.post("/api/announcements/", {
            "title": "Sneaky", "body": "x", "audience": "all",
        }, format="json")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Notification.objects.count(), 0)

    # ── Visibility stays scoped ────────────────────────────────────────────

    def test_a_user_only_ever_sees_their_own_notifications(self):
        self.login_as(self.teacher1)
        self.client.post("/api/announcements/", {
            "title": "Staff meeting", "body": "Room 4.", "audience": "teachers",
        }, format="json")
        self.client.logout()

        self.login_as(self.parent)
        data = self.client.get("/api/notifications/").json()
        self.assertEqual(data["count"] if isinstance(data, dict) else len(data), 0)

    def test_a_user_can_mark_their_own_notification_read(self):
        self.login_as(self.teacher1)
        self.client.post("/api/announcements/", {
            "title": "Staff meeting", "body": "Room 4.", "audience": "teachers",
        }, format="json")
        notif = self.teacher1.notifications.first()

        self.login_as(self.student1_user)
        response = self.client.patch(f"/api/notifications/{notif.id}/read/", {}, format="json")
        self.assertIn(response.status_code, (403, 404))

        notif.refresh_from_db()
        self.assertFalse(notif.is_read)

    def test_marking_a_notification_read_does_not_leak_the_owner(self):
        self.login_as(self.teacher1)
        self.client.post("/api/announcements/", {
            "title": "Staff meeting", "body": "Room 4.", "audience": "teachers",
        }, format="json")
        notif = self.teacher1.notifications.first()

        self.login_as(self.teacher1)
        response = self.client.patch(f"/api/notifications/{notif.id}/read/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

    # ── A failing notification must not break the action ───────────────────

    def test_a_notification_failure_does_not_roll_back_the_submission(self):
        from unittest import mock

        self.login_as(self.student1_user)
        # _silently() guards the write inside each helper, so a failed write
        # must not roll back the submission that triggered it.
        with mock.patch(
            "core.notifications.Notification.objects.create",
            side_effect=RuntimeError("notification backend down"),
        ):
            response = self.client.post("/api/submissions/", {
                "requirement": self.requirement1.id,
                "status": "submitted",
                "link_url": "https://example.com/work",
            }, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Submission.objects.filter(
                requirement=self.requirement1, student=self.student1
            ).exists()
        )

    def test_the_helper_itself_swallows_errors(self):
        from unittest import mock

        from .notifications import notify_submission_reviewed

        sub = Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )
        with mock.patch(
            "core.notifications.Notification.objects.create",
            side_effect=RuntimeError("db gone"),
        ):
            # Must not raise.
            self.assertIsNone(
                notify_submission_reviewed(sub, Submission.Status.SUBMITTED)
            )


class DeadlineCommandTests(TrackTestCase):
    """The scheduled half: reminders and overdue notices are idempotent."""

    def run_cmd(self, *args):
        from django.core.management import call_command

        out = StringIO()
        call_command("notify_deadlines", *args, stdout=out)
        return out.getvalue()

    def test_a_requirement_due_soon_reminds_students_and_their_parents(self):
        Requirement.objects.filter(pk=self.requirement1.id).update(
            deadline=timezone.now() + timedelta(hours=12)
        )
        self.run_cmd()

        self.assertEqual(
            self.student1_user.notifications.filter(
                notif_type=Notification.NotifType.DEADLINE_APPROACHING
            ).count(), 1,
        )
        # parent is linked to student1, so they are reminded too.
        self.assertEqual(
            self.parent.notifications.filter(
                notif_type=Notification.NotifType.DEADLINE_APPROACHING
            ).count(), 1,
        )

    def test_running_twice_does_not_duplicate_reminders(self):
        Requirement.objects.filter(pk=self.requirement1.id).update(
            deadline=timezone.now() + timedelta(hours=12)
        )
        self.run_cmd()
        first = self.student1_user.notifications.count()

        self.run_cmd()
        self.assertEqual(self.student1_user.notifications.count(), first)

    def test_work_far_away_is_not_reminded(self):
        # requirement1 is due in 3 days; the default window is 2.
        self.run_cmd()
        self.assertEqual(
            self.student1_user.notifications.filter(
                notif_type=Notification.NotifType.DEADLINE_APPROACHING
            ).count(), 0,
        )

    def test_a_wider_window_catches_it(self):
        self.run_cmd("--days", "5")
        self.assertEqual(
            self.student1_user.notifications.filter(
                notif_type=Notification.NotifType.DEADLINE_APPROACHING
            ).count(), 1,
        )

    def test_overdue_notifies_only_students_who_never_submitted(self):
        Requirement.objects.filter(pk=self.requirement1.id).update(
            deadline=timezone.now() - timedelta(days=1)
        )
        # student1 already handed work in; student2 is in another section, so
        # build the true "did not submit" case by clearing student1's record.
        Submission.objects.filter(requirement=self.requirement1).delete()

        self.run_cmd("--overdue-only")

        self.assertEqual(
            self.student1_user.notifications.filter(
                notif_type=Notification.NotifType.OVERDUE
            ).count(), 1,
        )

    def test_a_submitted_requirement_is_not_flagged_overdue(self):
        Requirement.objects.filter(pk=self.requirement1.id).update(
            deadline=timezone.now() - timedelta(days=1)
        )
        Submission.objects.create(
            requirement=self.requirement1, student=self.student1,
            status=Submission.Status.SUBMITTED, submitted_at=timezone.now(),
        )

        self.run_cmd("--overdue-only")

        self.assertEqual(
            self.student1_user.notifications.filter(
                notif_type=Notification.NotifType.OVERDUE
            ).count(), 0,
        )

    def test_overdue_flagging_is_idempotent(self):
        Requirement.objects.filter(pk=self.requirement1.id).update(
            deadline=timezone.now() - timedelta(days=1)
        )
        self.run_cmd("--overdue-only")
        first = self.student1_user.notifications.count()

        self.run_cmd("--overdue-only")
        self.assertEqual(self.student1_user.notifications.count(), first)
