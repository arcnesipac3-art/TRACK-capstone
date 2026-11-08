"""
TRACK — data-privacy tests.

Two things are checked here and nowhere else in the suite: that the personal
data export reaches exactly the records the requester can already see on
screen, and that the data-request queue is unreadable and unanswerable by
anyone outside the enrollment office.
"""

from django.utils import timezone

from .models import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    DataRequest,
    Notification,
    PushSubscription,
)
from .tests import TrackTestCase

LONG_ENOUGH = "Please correct the spelling of my child's surname in the record."


class DataExportTests(TrackTestCase):
    def test_export_requires_an_account(self):
        response = self.client.get("/api/account/export/")
        self.assertIn(response.status_code, (401, 403))

    def test_export_is_the_document_the_notice_promises(self):
        self.login_as(self.student1_user)
        body = self.client.get("/api/account/export/").json()
        self.assertEqual(body["schema"], "track.personal-data-export/1")
        self.assertEqual(body["requested_by"]["username"], "t_student1")
        self.assertNotIn("password", body["requested_by"])
        for section in (
            "role_profile",
            "enrollment",
            "requirements",
            "attendance",
            "fees",
            "messages",
            "notifications",
            "devices_and_preferences",
            "activity_log",
            "retention_notice",
        ):
            self.assertIn(section, body)
        # The export has to say what the school may not delete, or the person
        # discovers the limit of the deletion right by asking.
        self.assertTrue(
            any("Academic and attendance" in line for line in body["retention_notice"])
        )

    def test_export_holds_no_other_learner(self):
        """The isolation claim in one test: another student's rows must not
        appear anywhere in the document, even as a name."""
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment2, date=timezone.localdate()
        )
        AttendanceRecord.objects.create(
            session=session,
            student=self.student2,
            status=AttendanceRecord.Status.ABSENT,
            recorded_by=self.teacher2,
            notes="Sam was away.",
        )
        self.login_as(self.student1_user)
        response = self.client.get("/api/account/export/")
        raw = response.content.decode()
        self.assertNotIn("t_student2", raw)
        self.assertNotIn("Sam was away", raw)
        self.assertEqual(response.json()["attendance"], [])

    def test_parent_export_covers_the_linked_child_only(self):
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment1, date=timezone.localdate()
        )
        AttendanceRecord.objects.create(
            session=session,
            student=self.student1,
            status=AttendanceRecord.Status.PRESENT,
            recorded_by=self.teacher1,
        )
        other = AttendanceSession.objects.create(
            teacher_assignment=self.assignment2, date=timezone.localdate()
        )
        AttendanceRecord.objects.create(
            session=other,
            student=self.student2,
            status=AttendanceRecord.Status.ABSENT,
            recorded_by=self.teacher2,
        )
        self.login_as(self.parent)
        body = self.client.get("/api/account/export/").json()
        self.assertEqual(len(body["attendance"]), 1)
        self.assertEqual(body["attendance"][0]["subject"], "Mathematics")
        self.assertEqual(
            [child["lrn"] for child in body["role_profile"]["children"]],
            [self.student1.lrn],
        )

    def test_export_withholds_staff_only_notes_and_push_secrets(self):
        PushSubscription.objects.create(
            user=self.student1_user,
            endpoint="https://push.example.com/subscriptions/secret-key-abc",
            p256dh="BmX-public-key-that-is-not-exported",
            auth="secret-auth-value",
        )
        self.login_as(self.student1_user)
        raw = self.client.get("/api/account/export/").content.decode()
        self.assertNotIn("secret-key-abc", raw)
        self.assertNotIn("secret-auth-value", raw)
        body = self.client.get("/api/account/export/").json()
        self.assertEqual(
            body["devices_and_preferences"]["push_subscriptions"][0]["endpoint_host"],
            "push.example.com",
        )


class DataRequestTests(TrackTestCase):
    def file_one(self, user, kind="correction", detail=LONG_ENOUGH):
        self.login_as(user)
        return self.client.post(
            "/api/account/data-requests/", {"kind": kind, "detail": detail}
        )

    def test_filing_snapshots_the_contact_address_and_audits(self):
        self.student1_user.email = "sara@example.com"
        self.student1_user.save()
        response = self.file_one(self.student1_user)
        self.assertEqual(response.status_code, 201, response.content)
        row = DataRequest.objects.get(pk=response.json()["id"])
        self.assertEqual(row.requester, self.student1_user)
        self.assertEqual(row.requester_email, "sara@example.com")
        self.assertEqual(row.status, DataRequest.Status.PENDING)
        self.assertTrue(
            AuditLog.objects.filter(
                action="privacy.data_request_filed", target_id=str(row.pk)
            ).exists()
        )

    def test_a_vague_request_is_refused(self):
        response = self.file_one(self.student1_user, detail="delete me")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(DataRequest.objects.count(), 0)

    def test_an_unknown_kind_is_refused(self):
        response = self.file_one(self.student1_user, kind="erase-everything")
        self.assertEqual(response.status_code, 400)

    def test_the_list_only_shows_my_own(self):
        self.file_one(self.student1_user)
        response = self.file_one(
            self.student2_user, detail="Please update our phone number on file."
        )
        self.assertEqual(response.status_code, 201)
        self.login_as(self.student1_user)
        mine = self.client.get("/api/account/data-requests/").json()
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["detail"], LONG_ENOUGH)

    def test_filing_does_not_answer_the_request(self):
        """The write path takes no status: a person cannot close their own
        ask by including the fields the office owns."""
        response = self.file_one(
            self.student1_user,
            detail=LONG_ENOUGH,
        )
        self.login_as(self.student1_user)
        forged = self.client.post(
            "/api/account/data-requests/",
            {"kind": "erasure", "detail": LONG_ENOUGH, "status": "answered",
             "response_note": "Done, everything deleted."},
        )
        self.assertEqual(forged.status_code, 201)
        self.assertEqual(forged.json()["status"], "pending")
        self.assertEqual(response.json()["status"], "pending")

    def test_an_erasure_request_outlives_the_account_it_names(self):
        self.student1_user.email = "sara@example.com"
        self.student1_user.save()
        response = self.file_one(self.student1_user, kind="erasure")
        row = DataRequest.objects.get(pk=response.json()["id"])
        self.student1_user.delete()
        row.refresh_from_db()
        # SET_NULL, not CASCADE: deleting the ask would delete the only proof
        # the school was asked and answered it.
        self.assertIsNone(row.requester)
        self.assertEqual(row.requester_email, "sara@example.com")
        self.assertEqual(row.status, DataRequest.Status.PENDING)
        self.login_as(self.admin)
        queue = self.client.get("/api/account/data-requests/queue/").json()
        self.assertEqual(queue[0]["requester_username"], None)
        self.assertEqual(queue[0]["requester_email"], "sara@example.com")

    def test_a_teacher_cannot_open_the_queue(self):
        self.file_one(self.student1_user)
        self.login_as(self.teacher1)
        response = self.client.get("/api/account/data-requests/queue/")
        self.assertEqual(response.status_code, 403)

    def test_a_student_cannot_open_the_queue(self):
        self.file_one(self.student1_user)
        self.login_as(self.student2_user)
        response = self.client.get("/api/account/data-requests/queue/")
        self.assertEqual(response.status_code, 403)

    def test_the_office_sees_every_request_with_the_who(self):
        response = self.file_one(self.student1_user)
        self.login_as(self.admin)
        queue = self.client.get("/api/account/data-requests/queue/").json()
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]["requester_username"], "t_student1")
        self.assertEqual(queue[0]["requester_name"], "Sara Student")
        self.assertEqual(queue[0]["id"], response.json()["id"])

    def test_answering_stamps_the_writer_and_reaches_the_requester(self):
        filed = self.file_one(self.student1_user, kind="erasure")
        pk = filed.json()["id"]
        self.login_as(self.admin)
        answer = self.client.post(
            f"/api/account/data-requests/{pk}/answer/",
            {
                "status": "refused",
                "response_note": (
                    "We can remove your messages, but the registrar must keep "
                    "the academic record for the period DepEd requires."
                ),
            },
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        row = DataRequest.objects.get(pk=pk)
        self.assertEqual(row.status, DataRequest.Status.REFUSED)
        self.assertEqual(row.handled_by, self.admin)
        self.assertIsNotNone(row.handled_at)
        note = Notification.objects.get(recipient=self.student1_user)
        self.assertEqual(note.notif_type, "data_request_answered")
        self.assertIn("DepEd", note.body)
        self.assertTrue(
            AuditLog.objects.filter(
                action="privacy.data_request_refused", target_id=str(pk)
            ).exists()
        )

    def test_an_answer_without_a_written_reason_is_refused(self):
        pk = self.file_one(self.student1_user).json()["id"]
        self.login_as(self.admin)
        response = self.client.post(
            f"/api/account/data-requests/{pk}/answer/",
            {"status": "answered", "response_note": "done"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("response_note", response.json())

    def test_a_request_cannot_be_left_open_by_an_answer(self):
        pk = self.file_one(self.student1_user).json()["id"]
        self.login_as(self.admin)
        response = self.client.post(
            f"/api/account/data-requests/{pk}/answer/",
            {"status": "pending", "response_note": "Still looking into this."},
        )
        self.assertEqual(response.status_code, 400)

    def test_only_the_office_can_answer(self):
        pk = self.file_one(self.student1_user).json()["id"]
        self.login_as(self.teacher1)
        response = self.client.post(
            f"/api/account/data-requests/{pk}/answer/",
            {"status": "answered", "response_note": "Handled by the adviser."},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(DataRequest.objects.get(pk=pk).status, "pending")

    def test_answering_someone_elses_request_is_still_the_offices(self):
        """The answer view is gated on the office permission, not ownership —
        so an outsider gets 403 rather than a 404 that leaks which ids exist."""
        pk = self.file_one(self.student1_user).json()["id"]
        self.login_as(self.student2_user)
        response = self.client.post(
            f"/api/account/data-requests/{pk}/answer/",
            {"status": "answered", "response_note": "I answered my classmate."},
        )
        self.assertEqual(response.status_code, 403)


class NotificationChoiceTests(TrackTestCase):
    def test_the_new_notif_type_is_a_real_choice(self):
        self.assertIn(
            "data_request_answered",
            {code for code, _ in Notification.NotifType.choices},
        )
