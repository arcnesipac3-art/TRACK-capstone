"""
TRACK — development seed data (DEMO ONLY)

Creates a small but realistic dataset so the Phase 3 dashboards can be
verified against real database records instead of fake front-end numbers.

Run from the backend folder:
    python seed_demo.py

Idempotent: running it twice will not duplicate records.
Demo accounts (development only — delete or change before going live):
    teacher1 / track2026      teacher2 / track2026
    student1 / track2026      student2 / track2026      student3 / track2026
    parent1  / track2026   (linked to student1 and student2)
"""

import os
from datetime import timedelta

import django
from django.utils import timezone

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from core.models import (  # noqa: E402
    Announcement,
    AttendanceRecord,
    AttendanceSession,
    GradeLevel,
    Notification,
    ParentProfile,
    Requirement,
    SchoolYear,
    Section,
    StudentProfile,
    Subject,
    Submission,
    TeacherAssignment,
    User,
)

PASSWORD = "track2026"
now = timezone.now()
today = now.date()


def get_or_create_user(username, role, first, last, email):
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            "role": role,
            "first_name": first,
            "last_name": last,
            "email": email,
        },
    )
    if created:
        user.set_password(PASSWORD)
        user.save()
        print(f"  + user {username} ({role})")
    return user


def main():
    print("Seeding TRACK demo data...")

    # ── School structure ────────────────────────────────────────────────
    school_year, _ = SchoolYear.objects.get_or_create(
        label="2026-2027",
        defaults={
            "start_date": today - timedelta(days=120),
            "end_date": today + timedelta(days=250),
            "is_active": True,
        },
    )
    if not school_year.is_active:
        school_year.is_active = True
        school_year.save()

    grade7, _ = GradeLevel.objects.get_or_create(name="Grade 7", defaults={"order": 7})
    grade8, _ = GradeLevel.objects.get_or_create(name="Grade 8", defaults={"order": 8})

    teacher1 = get_or_create_user(
        "teacher1", User.Role.TEACHER, "Teresa", "Reyes", "teacher1@knhs.edu.ph"
    )
    teacher2 = get_or_create_user(
        "teacher2", User.Role.TEACHER, "Marco", "Dizon", "teacher2@knhs.edu.ph"
    )

    section_a, _ = Section.objects.get_or_create(
        school_year=school_year, grade_level=grade7, name="Sampaguita",
        defaults={"adviser": teacher1},
    )
    section_b, _ = Section.objects.get_or_create(
        school_year=school_year, grade_level=grade8, name="Gumamela",
        defaults={"adviser": teacher2},
    )

    math, _ = Subject.objects.get_or_create(
        name="Mathematics", grade_level=grade7, school_year=school_year,
        defaults={"code": "MATH7"},
    )
    english, _ = Subject.objects.get_or_create(
        name="English", grade_level=grade7, school_year=school_year,
        defaults={"code": "ENG7"},
    )
    science, _ = Subject.objects.get_or_create(
        name="Science", grade_level=grade8, school_year=school_year,
        defaults={"code": "SCI8"},
    )

    a1, _ = TeacherAssignment.objects.get_or_create(
        teacher=teacher1, subject=math, section=section_a
    )
    a2, _ = TeacherAssignment.objects.get_or_create(
        teacher=teacher1, subject=english, section=section_a
    )
    a3, _ = TeacherAssignment.objects.get_or_create(
        teacher=teacher2, subject=science, section=section_b
    )

    # ── Students ────────────────────────────────────────────────────────
    students = []
    student_specs = [
        ("student1", "Sofia", "Cruz", section_a, "123456789001"),
        ("student2", "Joel", "Santos", section_a, "123456789002"),
        ("student3", "Angel", "Lopez", section_a, "123456789003"),
        ("student4", "Miguel", "Torres", section_b, "123456789004"),
        ("student5", "Bea", "Garcia", section_b, "123456789005"),
    ]
    for username, first, last, section, lrn in student_specs:
        user = get_or_create_user(
            username, User.Role.STUDENT, first, last, f"{username}@knhs.edu.ph"
        )
        profile, _ = StudentProfile.objects.get_or_create(
            user=user, defaults={"section": section, "lrn": lrn}
        )
        if profile.section is None:
            profile.section = section
            profile.save()
        students.append(profile)

    # ── Parent linked to a child in each section (tests child selector) ─
    parent_user = get_or_create_user(
        "parent1", User.Role.PARENT, "Rosa", "Cruz", "parent1@example.com"
    )
    parent_profile, _ = ParentProfile.objects.get_or_create(user=parent_user)
    parent_profile.children.set([students[0], students[3]])

    # ── Requirements ────────────────────────────────────────────────────
    def make_requirement(assignment, title, rtype, days_offset, description=""):
        req, created = Requirement.objects.get_or_create(
            teacher_assignment=assignment,
            title=title,
            defaults={
                "requirement_type": rtype,
                "deadline": now + timedelta(days=days_offset),
                "description": description,
                "allow_link_submission": True,
            },
        )
        return req

    requirements = [
        make_requirement(a1, "Fraction Operations Worksheet", "assignment", -6,
                         "Answer items 1–20. Show complete solutions."),
        make_requirement(a1, "Ratio and Proportion Quiz", "quiz", -1,
                         "20-item quiz on ratio and proportion."),
        make_requirement(a1, "Pie Chart Project", "project", 4,
                         "Create a pie chart from household data."),
        make_requirement(a1, "Linear Equations Practice", "activity", 11,
                         "Practice set on one-step linear equations."),
        make_requirement(a2, "Personal Essay Draft", "performance", 3,
                         "500-word personal narrative essay."),
        make_requirement(a2, "Vocabulary Quiz 1", "quiz", -4,
                         "Week 3 vocabulary words."),
        make_requirement(a3, "Ecosystems Report", "project", 6,
                         "Group report on local ecosystems."),
        make_requirement(a3, "Cells Worksheet", "assignment", -2,
                         "Label the parts of an animal cell."),
        make_requirement(a3, "Lab Safety Quiz", "quiz", 9,
                         "Lab safety rules and equipment handling."),
    ]

    # ── Submissions ─────────────────────────────────────────────────────
    def submit(req, profile, status, days_ago=1):
        sub, created = Submission.objects.get_or_create(
            requirement=req, student=profile,
            defaults={
                "status": status,
                "submitted_at": now - timedelta(days=days_ago),
                "link_url": "https://example.com/my-work" if status != "not_submitted" else "",
                "teacher_feedback": (
                    "Well done — complete and accurate."
                    if status == "verified"
                    else "Please revise items 4 and 7, then resubmit."
                    if status == "returned"
                    else ""
                ),
            },
        )
        if created and status == "verified":
            sub.verified_at = now - timedelta(days=max(days_ago - 1, 0))
            sub.save(update_fields=["verified_at"])
        return sub

    # student1 (linked child, section A)
    submit(requirements[0], students[0], "verified", 5)
    submit(requirements[1], students[0], "submitted", 1)
    submit(requirements[5], students[0], "returned", 3)
    # student2, student3
    submit(requirements[0], students[1], "verified", 5)
    submit(requirements[1], students[1], "submitted", 1)
    submit(requirements[0], students[2], "submitted", 4)
    # student4 (linked child, section B), student5
    submit(requirements[6], students[3], "verified", 2)
    submit(requirements[7], students[3], "submitted", 1)
    submit(requirements[7], students[4], "returned", 1)

    # ── Attendance (last 5 school days) ─────────────────────────────────
    session_statuses = [
        ["present", "present", "late", "present", "present"],
        ["present", "absent", "present", "present", "late"],
        ["present", "present", "present", "excused", "present"],
        ["late", "present", "present", "present", "present"],
        ["present", "present", "absent", "present", "present"],
    ]
    session_count = 0
    for assignment, section in ((a1, section_a), (a2, section_a), (a3, section_b)):
        section_students = [s for s in students if s.section_id == section.id]
        offset = 0
        for _ in range(5):
            day = today - timedelta(days=offset)
            offset += 1
            if day.weekday() >= 5:  # skip weekends
                continue
            session, created = AttendanceSession.objects.get_or_create(
                teacher_assignment=assignment, date=day,
                defaults={"created_by": assignment.teacher},
            )
            if created:
                session_count += 1
            for idx, student in enumerate(section_students):
                status = session_statuses[session_count % len(session_statuses)][
                    idx % 5
                ]
                AttendanceRecord.objects.get_or_create(
                    session=session, student=student,
                    defaults={"status": status, "recorded_by": assignment.teacher},
                )

    # ── Announcements ───────────────────────────────────────────────────
    Announcement.objects.get_or_create(
        title="Buwan ng Wika Celebration",
        defaults={
            "body": "Filipino week activities start next Monday. "
                    "Students are encouraged to wear traditional attire on Friday.",
            "audience": Announcement.Audience.ALL,
            "is_pinned": True,
            "author": teacher1,
        },
    )
    Announcement.objects.get_or_create(
        title="Parent-Teacher Conference Schedule",
        defaults={
            "body": "The parent-teacher conference for Grade 7 will be held "
                    "on the last week of the month. Please coordinate with your "
                    "child's adviser for a slot.",
            "audience": Announcement.Audience.PARENTS,
            "author": teacher1,
        },
    )

    # ── Notifications ───────────────────────────────────────────────────
    Notification.objects.get_or_create(
        recipient=parent_user,
        notif_type=Notification.NotifType.ANNOUNCEMENT,
        title="New announcement posted",
        defaults={"body": "Parent-Teacher Conference Schedule was published."},
    )
    Notification.objects.get_or_create(
        recipient=students[0].user,
        notif_type=Notification.NotifType.SUBMISSION_RETURNED,
        title="Vocabulary Quiz 1 returned",
        defaults={"body": "Your teacher returned your submission for revision."},
    )
    Notification.objects.get_or_create(
        recipient=teacher1,
        notif_type=Notification.NotifType.DEADLINE_APPROACHING,
        title="Submissions awaiting verification",
        defaults={"body": "You have work waiting to be checked."},
    )

    print("Done.")
    print(f"  School year : {school_year.label}")
    print(f"  Requirements: {Requirement.objects.count()}")
    print(f"  Submissions : {Submission.objects.count()}")
    print(f"  Sessions    : {AttendanceSession.objects.count()}")
    print(f"  Records     : {AttendanceRecord.objects.count()}")
    print(f"  Users       : {User.objects.count()}")
    print(f"Demo password for every account above: {PASSWORD}")


if __name__ == "__main__":
    main()
