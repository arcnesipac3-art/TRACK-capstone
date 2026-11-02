"""
TRACK — Attendance scalability backend tests.

Run from the backend folder:
    python manage.py test core.tests_attendance

Covers: the server-side session and record list queries the redesigned
attendance screens depend on (filters, derived `missed`, whitelisted sorting,
search, pagination, the flat `?brief=1` row versus the unchanged nested one),
transactional bulk roster saving (upsert, idempotent retry, all-or-nothing
rejection, teacher/admin/student authorization, status and parent alerts), and
the indexes the history filters need.
"""

from datetime import timedelta

from django.db import connection, IntegrityError
from django.utils import timezone

from .models import (
    AttendanceRecord,
    AttendanceSession,
    Notification,
    StudentProfile,
    User,
)
from .tests import TrackTestCase


class AttendanceSessionListQueryTests(TrackTestCase):
    """`GET /api/attendance/sessions/` narrowed, sorted and paged by the server."""

    def setUp(self):
        # section_a holds one shared student; most cases want a second body in
        # the same class so rosters and "enrolled" counts are not trivially one.
        self.student1b = StudentProfile.objects.create(
            user=User.objects.create_user(
                username="t_student1b",
                password="pass-Stud123",
                role=User.Role.STUDENT,
                first_name="Nina",
                last_name="Nodal",
            ),
            section=self.section_a,
            lrn="100000000009",
        )
        self.today = timezone.localdate()

    def session_on(self, offset_days, assignment=None, **kwargs):
        return AttendanceSession.objects.create(
            teacher_assignment=assignment or self.assignment1,
            date=self.today + timedelta(days=offset_days),
            **kwargs,
        )

    def mark(self, session, student, status="present", by=None):
        return AttendanceRecord.objects.create(
            session=session,
            student=student,
            status=status,
            recorded_by=by or self.teacher1,
        )

    def rows(self, query=""):
        self.login_as(self.teacher1)
        response = self.client.get(f"/api/attendance/sessions/?brief=1{query}")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    # -- shape ------------------------------------------------------------

    def test_default_shape_still_nests_the_roster(self):
        session = self.session_on(0)
        self.mark(session, self.student1)
        self.login_as(self.teacher1)
        row = self.client.get("/api/attendance/sessions/").json()["results"][0]
        self.assertEqual(row["records"][0]["student"], self.student1.id)
        self.assertEqual(row["records"][0]["student_name"], "Sara Student")
        self.assertNotIn("record_count", row)

    def test_brief_flag_returns_flat_row_with_annotated_counts(self):
        session = self.session_on(0)
        self.mark(session, self.student1, "absent")
        self.mark(session, self.student1b, "late")
        # The stored status is whatever update_status last derived; writing a
        # record does not touch it, which is why the bulk save calls it once.
        session.update_status()
        data = self.rows()
        self.assertEqual(len(data["results"]), 1)
        row = data["results"][0]
        self.assertNotIn("records", row)
        self.assertEqual(
            [row["record_count"], row["absent_count"], row["late_count"]], [2, 1, 1]
        )
        self.assertEqual(row["enrolled"], 2)
        self.assertEqual(row["subject_name"], "Mathematics")
        self.assertEqual(row["section_id"], self.section_a.id)
        self.assertEqual(row["status_display"], "Completed")
        self.assertIsNone(row["start_time"])

    def test_brief_flag_accepts_the_word_true(self):
        self.session_on(0)
        self.login_as(self.teacher1)
        row = self.client.get(
            "/api/attendance/sessions/?brief=true"
        ).json()["results"][0]
        self.assertNotIn("records", row)

    # -- filters ----------------------------------------------------------

    def test_exact_date_and_window_filters(self):
        yesterday = self.session_on(-1)
        same_day = self.session_on(0)
        self.assertEqual(
            [
                r["id"]
                for r in self.rows(f"&date={yesterday.date:%Y-%m-%d}")["results"]
            ],
            [yesterday.id],
        )
        self.assertEqual(
            [r["id"] for r in self.rows(f"&date={same_day.date:%Y-%m-%d}")["results"]],
            [same_day.id],
        )
        window = self.rows(
            f"&date_after={self.today - timedelta(days=1):%Y-%m-%d}"
            f"&date_before={self.today:%Y-%m-%d}"
        )["results"]
        self.assertEqual([r["id"] for r in window], [same_day.id, yesterday.id])

    def test_class_subject_and_school_year_filters(self):
        self.session_on(0, assignment=self.assignment2)
        mine = self.session_on(0)
        self.assertEqual(
            [r["id"] for r in self.rows(f"&teacher_assignment={self.assignment1.id}")["results"]],
            [mine.id],
        )
        self.assertEqual(
            [r["id"] for r in self.rows(f"&teacher_assignment={self.assignment2.id}")["results"]],
            [],
        )
        self.assertEqual(
            [r["id"] for r in self.rows(f"&section={self.section_a.id}")["results"]],
            [mine.id],
        )
        self.assertEqual(
            [r["id"] for r in self.rows(f"&section={self.section_b.id}")["results"]],
            [],
        )
        self.assertEqual(
            len(self.rows(f"&subject={self.subject.id}")["results"]), 1
        )
        self.assertEqual(
            len(self.rows(f"&school_year={self.school_year.id}")["results"]), 1
        )
        self.assertEqual(
            len(self.rows("&school_year=999999")["results"]), 0
        )

    def test_a_junk_id_narrows_to_nothing_instead_of_failing(self):
        self.session_on(0)
        self.assertEqual(self.rows("&section=not-an-id")["results"], [])
        self.assertEqual(self.rows("&date=not-a-date")["count"], 1)

    def test_status_filter_and_the_derived_missed_value(self):
        # `missed` is not a stored status: it is a past day the teacher never
        # finished, so the list filter and the card label must agree on that.
        done = self.session_on(-2)
        done.status = AttendanceSession.Status.COMPLETED
        done.save(update_fields=["status"])
        self.session_on(-1)
        self.session_on(1)

        self.assertEqual(
            [r["id"] for r in self.rows("&status=completed")["results"]], [done.id]
        )
        missed = [r["id"] for r in self.rows("&status=missed")["results"]]
        self.assertEqual(len(missed), 1)
        self.assertNotIn(done.id, missed)
        outstanding = [r["id"] for r in self.rows("&status=outstanding")["results"]]
        self.assertNotIn(done.id, outstanding)
        self.assertEqual(len(outstanding), 2)

    def test_search_covers_class_section_and_students(self):
        from datetime import time

        from .models import ClassSchedule

        session = self.session_on(0)
        marked = self.session_on(-1)
        self.mark(marked, self.student1b)
        schedule = ClassSchedule.objects.create(
            teacher_assignment=self.assignment1,
            day_of_week=ClassSchedule.DayOfWeek.MONDAY,
            start_time=time(8, 0),
            end_time=time(9, 0),
            room="Room 3",
        )
        self.session_on(2, schedule=schedule)

        self.assertEqual(
            len(self.rows("&search=math")["results"]), 3, "subject name"
        )
        self.assertEqual(
            len(self.rows("&search=sampaguita")["results"]), 3, "section name"
        )
        self.assertEqual(
            len(self.rows("&search=grade")["results"]), 3, "grade level name"
        )
        # A learner's name narrows to the classes they belong to, and to the
        # sessions where they were actually marked — both are "find my class by
        # the child", so an enrolled name matches every session of that class.
        self.assertEqual(len(self.rows("&search=nina")["results"]), 3)
        self.assertEqual(len(self.rows("&search=sara")["results"]), 3)
        # "Sam" sits in another teacher's class, and his section name is
        # Gumamela — neither reaches the classes listed here.
        self.assertEqual(self.rows("&search=sam%20student2")["results"], [])
        self.assertEqual(self.rows("&search=gumamela")["results"], [])
        # The room a class meets in is not one of the searchable columns.
        self.assertEqual(len(self.rows("&search=room")["results"]), 0)

    def test_search_finds_a_mark_that_is_no_longer_enrolled(self):
        # A transfer keeps the old mark: Omar sits in another class now, but the
        # session is still "the day Omar was absent", so the marked-rows branch
        # of the search has to reach it.
        session = self.session_on(-3)
        mover = StudentProfile.objects.create(
            user=User.objects.create_user(
                username="t_mover",
                password="pass-Stud123",
                role=User.Role.STUDENT,
                first_name="Omar",
                last_name="Ocampo",
            ),
            section=self.section_b,
            lrn="100000000011",
        )
        AttendanceRecord.objects.create(
            session=session, student=mover, status="absent", recorded_by=self.teacher1
        )
        self.assertEqual(
            [r["id"] for r in self.rows("&search=omar")["results"]], [session.id]
        )

    def test_search_matches_session_notes(self):
        self.session_on(0, notes="guest teacher sat in")
        self.session_on(-1)
        self.assertEqual(
            len(self.rows("&search=guest")["results"]), 1
        )

    # -- sorting ----------------------------------------------------------

    def test_ordering_newest_then_oldest(self):
        old = self.session_on(-5)
        new = self.session_on(2)
        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=-date")["results"]], [new.id, old.id]
        )
        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=date")["results"]], [old.id, new.id]
        )

    def test_an_unknown_ordering_falls_back_to_newest(self):
        old = self.session_on(-5)
        new = self.session_on(2)
        rows = self.rows("&ordering=date;DROP+table")["results"]
        self.assertEqual([r["id"] for r in rows], [new.id, old.id])

    def test_ordering_by_marked_count(self):
        quiet = self.session_on(0)
        busy = self.session_on(-1)
        self.mark(busy, self.student1)
        self.mark(busy, self.student1b)
        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=-marked")["results"]],
            [busy.id, quiet.id],
        )

    def test_ordering_by_class_and_subject(self):
        from .models import Subject, TeacherAssignment

        science = Subject.objects.create(
            name="Science", grade_level=self.grade7, school_year=self.school_year
        )
        second = TeacherAssignment.objects.create(
            teacher=self.teacher1, subject=science, section=self.section_b
        )
        math_row = self.session_on(0)  # Mathematics / Sampaguita
        science_row = self.session_on(0, assignment=second)  # Science / Gumamela

        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=subject")["results"]],
            [math_row.id, science_row.id],
        )
        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=-subject")["results"]],
            [science_row.id, math_row.id],
        )
        # Same grade level, so the section name is the tie: Gumamela, Sampaguita.
        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=class")["results"]],
            [science_row.id, math_row.id],
        )
        self.assertEqual(
            [r["id"] for r in self.rows("&ordering=-class")["results"]],
            [math_row.id, science_row.id],
        )

    # -- pagination -------------------------------------------------------

    def test_pages_walk_the_whole_list_and_count_is_the_filtered_total(self):
        for offset in range(25):
            self.session_on(-offset)
        first = self.rows("&page=1&page_size=10")
        self.assertEqual(first["count"], 25)
        self.assertEqual(len(first["results"]), 10)
        self.assertNotEqual(first["results"][0]["id"], self.rows("&page=2&page_size=10")["results"][0]["id"])
        last = self.rows("&page=3&page_size=10")
        self.assertEqual(len(last["results"]), 5)
        self.assertIsNone(last["next"])

    def test_requested_page_size_is_capped(self):
        for offset in range(3):
            self.session_on(-offset)
        self.assertEqual(len(self.rows("&page_size=5000")["results"]), 3)
        capped = self.rows("&page_size=5000")
        self.assertEqual(capped["count"], 3)

    def test_filters_narrow_the_page_not_just_the_current_page(self):
        for offset in range(12):
            self.session_on(-offset)
        for offset in range(12):
            self.session_on(offset, assignment=self.assignment2)
        data = self.rows(f"&section={self.section_a.id}&page_size=5&page=2")
        self.assertEqual(data["count"], 12)
        self.assertEqual(len(data["results"]), 5)
        self.assertTrue(
            all(r["section_id"] == self.section_a.id for r in data["results"])
        )

    def test_the_history_list_stays_the_teachers_own_classes(self):
        foreign = self.session_on(0, assignment=self.assignment2)
        ids = [r["id"] for r in self.rows()["results"]]
        self.assertNotIn(foreign.id, ids)
        self.assertEqual(
            self.rows(f"&teacher_assignment={self.assignment2.id}")["results"], []
        )

    def test_administrator_sees_every_class(self):
        self.session_on(0, assignment=self.assignment2)
        self.session_on(0)
        self.login_as(self.admin)
        data = self.client.get("/api/attendance/sessions/?brief=1").json()
        self.assertEqual(data["count"], 2)


class AttendanceRecordListQueryTests(TrackTestCase):
    """`GET /api/attendance/records/` narrowed and sorted by the server."""

    def setUp(self):
        self.today = timezone.localdate()
        self.student1b = StudentProfile.objects.create(
            user=User.objects.create_user(
                username="t_student1c",
                password="pass-Stud123",
                role=User.Role.STUDENT,
                first_name="Nina",
                last_name="Nodal",
            ),
            section=self.section_a,
            lrn="100000000009",
        )

    def mark_on(self, offset_days, student=None, status="present", assignment=None):
        session = AttendanceSession.objects.create(
            teacher_assignment=assignment or self.assignment1,
            date=self.today + timedelta(days=offset_days),
        )
        record = AttendanceRecord.objects.create(
            session=session,
            student=student or self.student1,
            status=status,
            recorded_by=self.teacher1,
        )
        return record

    def rows(self, query="", as_user=None):
        self.login_as(as_user or self.teacher1)
        response = self.client.get(f"/api/attendance/records/{query}")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_filter_by_session(self):
        mine = self.mark_on(0)
        self.mark_on(-1)
        data = self.rows(f"?session={mine.session_id}")
        self.assertEqual([r["id"] for r in data["results"]], [mine.id])

    def test_filter_by_record_status(self):
        absent = self.mark_on(0, status="absent")
        self.mark_on(-1, student=self.student1b, status="present")
        data = self.rows("?status=absent")
        self.assertEqual([r["id"] for r in data["results"]], [absent.id])

    def test_date_window_applies_through_the_row_session(self):
        old = self.mark_on(-10)
        recent = self.mark_on(-1)
        data = self.rows(f"?date_after={self.today - timedelta(days=2):%Y-%m-%d}")
        self.assertEqual([r["id"] for r in data["results"]], [recent.id])
        wide = self.rows(f"?date_before={self.today - timedelta(days=5):%Y-%m-%d}")
        self.assertEqual([r["id"] for r in wide["results"]], [old.id])

    def test_status_of_the_session_and_of_the_mark_are_different_filters(self):
        # `status=` means the mark when the row is a record; a completed
        # session is asked for with the session-level values instead.
        self.mark_on(0, status="late")
        self.assertEqual(len(self.rows("?status=late")["results"]), 1)
        self.assertEqual(len(self.rows("?status=completed")["results"]), 0)

    def test_search_matches_name_lrn_and_class(self):
        self.mark_on(0, student=self.student1b)
        self.mark_on(-1, student=self.student1)
        self.assertEqual(len(self.rows("?search=nina")["results"]), 1)
        self.assertEqual(len(self.rows("?search=100000000001")["results"]), 1)
        self.assertEqual(len(self.rows("?search=sampaguita")["results"]), 2)
        self.assertEqual(len(self.rows("?search=mathematics")["results"]), 2)

    def test_sorting_by_student_and_by_status(self):
        sara = self.mark_on(0, student=self.student1, status="absent")
        nina = self.mark_on(-1, student=self.student1b, status="present")
        # Full names: "Nina Nodal" sorts before "Sara Student".
        self.assertEqual(
            [r["id"] for r in self.rows("?ordering=student")["results"]],
            [nina.id, sara.id],
        )
        # "present" after "absent" descending, so the two rows swap.
        self.assertEqual(
            [r["id"] for r in self.rows("?ordering=-status")["results"]],
            [nina.id, sara.id],
        )
        self.assertEqual(
            [r["id"] for r in self.rows("?ordering=-student")["results"]],
            [sara.id, nina.id],
        )

    def test_default_order_is_newest_day_first(self):
        old = self.mark_on(-4)
        new = self.mark_on(-1)
        self.assertEqual(
            [r["id"] for r in self.rows("?")["results"]], [new.id, old.id]
        )

    def test_pages_and_count_survive_the_filters(self):
        for offset in range(25):
            self.mark_on(-offset)
        data = self.rows("?page=2&page_size=10")
        self.assertEqual(data["count"], 25)
        self.assertEqual(len(data["results"]), 10)

    def test_a_student_still_only_sees_their_own_rows_with_filters(self):
        self.mark_on(0)
        self.mark_on(-1, student=self.student1b)
        data = self.rows("?search=", as_user=self.student1_user)
        self.assertEqual([r["student"] for r in data["results"]], [self.student1.id])

    def test_a_parent_still_only_sees_linked_children(self):
        child = self.mark_on(-1)
        self.mark_on(0, student=self.student1b)
        self.assertEqual(self.rows("?search=nina", as_user=self.parent)["results"], [])
        own = self.rows("", as_user=self.parent)
        self.assertEqual([r["id"] for r in own["results"]], [child.id])

    def test_another_teachers_rows_are_not_reachable_with_a_filter(self):
        foreign = self.mark_on(0, student=self.student2, assignment=self.assignment2)
        self.mark_on(0)
        data = self.rows(f"?session={foreign.session_id}")
        self.assertEqual(data["results"], [])


class AttendanceBulkSaveTests(TrackTestCase):
    """`POST /api/attendance/sessions/<pk>/records/` — one roster, one request."""

    def setUp(self):
        self.today = timezone.localdate()
        self.student1b = StudentProfile.objects.create(
            user=User.objects.create_user(
                username="t_student1d",
                password="pass-Stud123",
                role=User.Role.STUDENT,
                first_name="Nina",
                last_name="Nodal",
            ),
            section=self.section_a,
            lrn="100000000009",
        )
        self.session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment1,
            date=self.today,
            created_by=self.teacher1,
        )

    def save_roster(self, records, as_user=None, pk=None):
        self.login_as(as_user or self.teacher1)
        return self.client.post(
            f"/api/attendance/sessions/{pk or self.session.id}/records/",
            {"records": records},
            format="json",
        )

    def full_roster(self, status="present"):
        return [
            {"student": self.student1.id, "status": status},
            {"student": self.student1b.id, "status": status},
        ]

    def test_marks_the_whole_roster_and_completes_the_session(self):
        response = self.save_roster(self.full_roster())
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["created"], 2)
        self.assertEqual(body["updated"], 0)
        self.assertEqual(body["session"]["record_count"], 2)
        self.assertEqual(body["session"]["present_count"], 2)
        self.assertEqual(body["session"]["enrolled"], 2)
        fresh = AttendanceSession.objects.get(pk=self.session.id)
        self.assertEqual(fresh.status, AttendanceSession.Status.COMPLETED)
        self.assertEqual(fresh.records.count(), 2)

    def test_sending_the_same_payload_twice_does_not_duplicate(self):
        self.save_roster(self.full_roster())
        second = self.save_roster(self.full_roster())
        self.assertEqual(second.status_code, 200)
        body = second.json()
        self.assertEqual(
            [body["created"], body["updated"], body["unchanged"]], [0, 0, 2]
        )
        self.assertEqual(AttendanceRecord.objects.filter(session=self.session).count(), 2)

    def test_a_changed_mark_is_updated_not_added(self):
        self.save_roster(self.full_roster())
        response = self.save_roster(
            [
                {"student": self.student1.id, "status": "absent", "notes": "sick"},
                {"student": self.student1b.id, "status": "present"},
            ]
        )
        body = response.json()
        self.assertEqual([body["created"], body["updated"], body["unchanged"]], [0, 1, 1])
        record = AttendanceRecord.objects.get(
            session=self.session, student=self.student1
        )
        self.assertEqual((record.status, record.notes), ("absent", "sick"))
        self.assertEqual(record.modified_by, self.teacher1)
        self.assertEqual(AttendanceRecord.objects.filter(session=self.session).count(), 2)

    def test_a_partial_roster_leaves_the_session_in_progress(self):
        response = self.save_roster([{"student": self.student1.id, "status": "late"}])
        self.assertEqual(response.json()["session"]["status"], "in_progress")
        self.assertEqual(response.json()["session"]["late_count"], 1)

    def test_an_invalid_status_rejects_the_whole_batch(self):
        response = self.save_roster(
            [
                {"student": self.student1.id, "status": "present"},
                {"student": self.student1b.id, "status": "here_but_gone"},
            ]
        )
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["rejected"][0]["index"], 1)
        self.assertEqual(AttendanceRecord.objects.count(), 0)
        self.assertEqual(
            AttendanceSession.objects.get(pk=self.session.id).status,
            AttendanceSession.Status.NOT_STARTED,
        )

    def test_a_student_outside_the_class_rejects_the_whole_batch(self):
        response = self.save_roster(
            [
                {"student": self.student1.id, "status": "present"},
                {"student": self.student2.id, "status": "present"},
            ]
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not enrolled", response.json()["rejected"][0]["error"])
        self.assertEqual(AttendanceRecord.objects.count(), 0)

    def test_entries_missing_a_student_or_a_mark_are_listed(self):
        response = self.save_roster([{"status": "present"}, {"student": self.student1.id}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(response.json()["rejected"]), 2)

    def test_an_empty_or_malformed_payload_is_refused(self):
        self.assertEqual(self.save_roster([]).status_code, 400)
        self.login_as(self.teacher1)
        wrong_shape = self.client.post(
            f"/api/attendance/sessions/{self.session.id}/records/",
            {"records": {"student": self.student1.id}},
            format="json",
        )
        self.assertEqual(wrong_shape.status_code, 400)

    def test_another_teacher_cannot_write_into_the_session(self):
        response = self.save_roster(self.full_roster(), as_user=self.teacher2)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(AttendanceRecord.objects.count(), 0)

    def test_a_missing_session_is_a_404_not_a_500(self):
        response = self.save_roster(self.full_roster(), pk=999999)
        self.assertEqual(response.status_code, 404)

    def test_a_student_cannot_write_attendance(self):
        response = self.save_roster(
            [{"student": self.student1.id, "status": "present"}],
            as_user=self.student1_user,
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(AttendanceRecord.objects.count(), 0)

    def test_an_administrator_can_write_for_any_class(self):
        response = self.save_roster(self.full_roster(), as_user=self.admin)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["created"], 2)

    def test_absent_and_late_marks_alert_the_linked_parent(self):
        self.save_roster(
            [
                {"student": self.student1.id, "status": "absent"},
                {"student": self.student1b.id, "status": "late"},
            ]
        )
        # Only Sara has a linked parent, so only her alert is written — and it
        # goes to the parent, not to the teacher who saved the roster.
        alerts = Notification.objects.filter(
            notif_type=Notification.NotifType.ATTENDANCE_ABSENT
        )
        self.assertEqual(alerts.count(), 1)
        self.assertEqual(alerts.first().recipient, self.parent)
        self.assertIn("Sara Student", alerts.first().title)
        self.assertEqual(
            Notification.objects.filter(
                notif_type=Notification.NotifType.ATTENDANCE_LATE
            ).count(),
            0,
        )

    def test_a_corrected_mark_notifies_again(self):
        # The sheet re-sends the roster, so a mark moved to absent after the
        # first save must still reach the parent.
        self.save_roster(self.full_roster())
        self.assertEqual(Notification.objects.count(), 0)
        self.save_roster(
            [
                {"student": self.student1.id, "status": "absent"},
                {"student": self.student1b.id, "status": "present"},
            ]
        )
        self.assertEqual(
            Notification.objects.filter(
                notif_type=Notification.NotifType.ATTENDANCE_ABSENT
            ).count(),
            1,
        )

    def test_a_present_mark_notifies_nobody(self):
        self.save_roster(self.full_roster())
        self.assertEqual(Notification.objects.count(), 0)

    def test_bare_list_payload_is_accepted_too(self):
        self.login_as(self.teacher1)
        response = self.client.post(
            f"/api/attendance/sessions/{self.session.id}/records/",
            [{"student": self.student1.id, "status": "excused", "notes": "event"}],
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["session"]["excused_count"], 1)

    def test_notes_longer_than_the_field_are_clipped_not_rejected(self):
        response = self.save_roster(
            [{"student": self.student1.id, "status": "late", "notes": "x" * 400}]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(AttendanceRecord.objects.get(session=self.session).notes), 200)


class AttendanceIndexTests(TrackTestCase):
    """The history filters must have something to walk on."""

    def index_names(self, table):
        with connection.cursor() as cursor:
            cursor.execute(f'PRAGMA index_list("{table}")')
            return {row[1] for row in cursor.fetchall()}

    def test_session_and_record_indexes_are_present(self):
        if connection.vendor != "sqlite":
            self.skipTest("introspection here is SQLite-specific")
        session_indexes = self.index_names("core_attendancesession")
        self.assertIn("att_sess_asg_date_idx", session_indexes)
        self.assertIn("att_sess_date_idx", session_indexes)
        self.assertIn("att_rec_sess_status_idx", self.index_names("core_attendancerecord"))

    def test_the_unique_pair_still_holds_after_the_index_migration(self):
        session = AttendanceSession.objects.create(
            teacher_assignment=self.assignment1, date=timezone.localdate()
        )
        AttendanceRecord.objects.create(
            session=session, student=self.student1, status="present"
        )
        with self.assertRaises(IntegrityError):
            AttendanceRecord.objects.create(
                session=session, student=self.student1, status="absent"
            )
