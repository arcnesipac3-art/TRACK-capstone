"""
TRACK — in-app notification fan-out.

Notifications are written at the moment the triggering action happens rather
than by a background scheduler, so what a user sees always matches the record
that caused it.

Every helper here is deliberately silent about failure. A notification that
cannot be written must never roll back the submission, attendance mark or
announcement that triggered it — the record is what matters, the notification
is a courtesy. Failures are logged and swallowed.
"""

import logging

from .models import (
    Announcement,
    AttendanceRecord,
    Notification,
    ParentProfile,
    Requirement,
    StudentProfile,
    Submission,
)

logger = logging.getLogger(__name__)


def _silently(func, *args, **kwargs):
    """Run a notification write, logging (never raising) on failure."""
    try:
        return func(*args, **kwargs)
    except Exception:  # noqa: BLE001 - a notification must not break the action
        logger.exception("TRACK: notification write failed")
        return None


def _students_in_section(section):
    if section is None:
        return StudentProfile.objects.none()
    return StudentProfile.objects.filter(section=section).select_related("user")


def _parents_of(profile):
    """Every parent user linked to this student."""
    return ParentProfile.objects.filter(children=profile).values_list(
        "user_id", flat=True
    )


# ---------------------------------------------------------------------------
# Requirement published
# ---------------------------------------------------------------------------

def notify_new_requirement(requirement: Requirement):
    """
    Tell every student in the target section that work was posted.

    Parents are not notified here: the parent dashboard already lists the same
    requirements live, so a second copy would be noise rather than information.
    """
    def _write():
        section = requirement.teacher_assignment.section
        teacher = requirement.teacher_assignment.teacher
        recipients = _students_in_section(section).values_list("user_id", flat=True)
        subject = requirement.teacher_assignment.subject.name
        Notification.objects.bulk_create([
            Notification(
                recipient_id=user_id,
                notif_type=Notification.NotifType.REQUIREMENT_NEW,
                title=f"New {requirement.get_requirement_type_display().lower()}: {requirement.title}",
                body=(
                    f"{teacher.get_full_name() or teacher.username} posted "
                    f"“{requirement.title}” for {subject}. "
                    f"Due {requirement.deadline:%B %d, %Y at %H:%M}."
                ),
                requirement=requirement,
            )
            for user_id in recipients
        ])

    return _silently(_write)


# ---------------------------------------------------------------------------
# Submission reviewed by a teacher
# ---------------------------------------------------------------------------

def notify_submission_reviewed(submission: Submission, old_status: str):
    """
    Tell the student their work was verified or returned.

    Only called on a real transition, so a teacher editing feedback without
    changing the status produces nothing.
    """
    if submission.status == old_status:
        return None
    if submission.status not in (
        Submission.Status.VERIFIED,
        Submission.Status.RETURNED,
    ):
        return None

    def _write():
        student = submission.student
        requirement = submission.requirement
        teacher = requirement.teacher_assignment.teacher
        subject = requirement.teacher_assignment.subject.name

        if submission.status == Submission.Status.VERIFIED:
            notif_type = Notification.NotifType.SUBMISSION_VERIFIED
            title = f"Verified: {requirement.title}"
            body = (
                f"{teacher.get_full_name() or teacher.username} verified your "
                f"work for {subject}."
            )
        else:
            notif_type = Notification.NotifType.SUBMISSION_RETURNED
            title = f"Revision needed: {requirement.title}"
            feedback = (submission.teacher_feedback or "").strip()
            body = (
                f"{teacher.get_full_name() or teacher.username} returned your "
                f"work for {subject} for revision."
            )
            if feedback:
                body += f" Feedback: {feedback}"

        Notification.objects.create(
            recipient=student.user,
            notif_type=notif_type,
            title=title,
            body=body,
            requirement=requirement,
            submission=submission,
        )

    return _silently(_write)


# ---------------------------------------------------------------------------
# Work handed in
# ---------------------------------------------------------------------------

def notify_submission_received(submission: Submission):
    """Tell the teacher that a student handed work in and awaits a check."""
    def _write():
        teacher = submission.requirement.teacher_assignment.teacher
        if not teacher or not teacher.is_active:
            return
        Notification.objects.create(
            recipient=teacher,
            notif_type=Notification.NotifType.REQUIREMENT_NEW,
            title=f"Submission awaiting check: {submission.requirement.title}",
            body=(
                f"{submission.student.user.get_full_name()} submitted work for "
                f"{submission.requirement.teacher_assignment.subject.name}."
            ),
            requirement=submission.requirement,
            submission=submission,
        )

    return _silently(_write)


# ---------------------------------------------------------------------------
# Attendance marked
# ---------------------------------------------------------------------------

def notify_attendance_marked(record: AttendanceRecord):
    """
    Tell linked parents when their child is marked absent or late.

    Parents of the student only — this is the one place the parent scope is
    resolved by relationship rather than by an explicit query parameter.
    """
    if record.status not in (
        AttendanceRecord.Status.ABSENT,
        AttendanceRecord.Status.LATE,
    ):
        return None

    def _write():
        session = record.session
        assignment = session.teacher_assignment
        subject = assignment.subject.name
        child_name = record.student.user.get_full_name()

        if record.status == AttendanceRecord.Status.ABSENT:
            notif_type = Notification.NotifType.ATTENDANCE_ABSENT
            title = f"{child_name} was marked absent"
            body = (
                f"{child_name} was marked absent in {subject} on "
                f"{session.date:%B %d, %Y}."
            )
        else:
            notif_type = Notification.NotifType.ATTENDANCE_LATE
            title = f"{child_name} was marked late"
            body = (
                f"{child_name} was marked late in {subject} on "
                f"{session.date:%B %d, %Y}."
            )

        parent_ids = list(_parents_of(record.student))
        Notification.objects.bulk_create([
            Notification(
                recipient_id=parent_id,
                notif_type=notif_type,
                title=title,
                body=body,
                attendance_record=record,
            )
            for parent_id in parent_ids
        ])

    return _silently(_write)


# ---------------------------------------------------------------------------
# Announcement published
# ---------------------------------------------------------------------------

def notify_announcement(announcement: Announcement):
    """Notify everyone in the announcement's audience."""
    def _write():
        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = User.objects.filter(is_active=True)

        if announcement.audience == Announcement.Audience.STUDENTS:
            users = users.filter(role=User.Role.STUDENT)
        elif announcement.audience == Announcement.Audience.PARENTS:
            users = users.filter(role=User.Role.PARENT)
        elif announcement.audience == Announcement.Audience.TEACHERS:
            users = users.filter(role=User.Role.TEACHER)

        # A section-targeted announcement narrows to that section's people.
        if announcement.section_id:
            section = announcement.section
            student_ids = list(
                _students_in_section(section).values_list("user_id", flat=True)
            )
            parent_ids = list(
                ParentProfile.objects.filter(
                    children__section=section
                ).values_list("user_id", flat=True)
            )
            teacher_ids = list(
                section.assignments.values_list("teacher_id", flat=True)
            )
            allowed = set(student_ids) | set(parent_ids) | set(teacher_ids)
            if announcement.audience == Announcement.Audience.STUDENTS:
                allowed &= set(student_ids)
            elif announcement.audience == Announcement.Audience.PARENTS:
                allowed &= set(parent_ids)
            elif announcement.audience == Announcement.Audience.TEACHERS:
                allowed &= set(teacher_ids)
            users = users.filter(pk__in=allowed)

        recipients = list(users.values_list("id", flat=True))
        Notification.objects.bulk_create([
            Notification(
                recipient_id=recipient_id,
                notif_type=Notification.NotifType.ANNOUNCEMENT,
                title=announcement.title,
                body=announcement.body,
            )
            for recipient_id in recipients
        ])
        return len(recipients)

    return _silently(_write)


# ---------------------------------------------------------------------------
# Deadline reminders (scheduled — see the `notify_deadlines` command)
# ---------------------------------------------------------------------------

def send_deadline_reminders(within_days: int = 2):
    """
    One reminder per (student, requirement) for work due within N days.

    Idempotent: re-running the command on the same data writes nothing new,
    because the pair is used as the dedupe key. Returns the count written.
    """
    from django.utils import timezone

    now = timezone.now()
    horizon = now + timezone.timedelta(days=within_days)

    due_soon = Requirement.objects.filter(
        deadline__gte=now, deadline__lte=horizon
    ).select_related("teacher_assignment__subject", "teacher_assignment__teacher")

    created = 0
    for requirement in due_soon:
        section = requirement.teacher_assignment.section
        students = _students_in_section(section)
        for profile in students:
            recipients = [profile.user_id, *_parents_of(profile)]
            for recipient_id in recipients:
                _, was_created = Notification.objects.get_or_create(
                    recipient_id=recipient_id,
                    notif_type=Notification.NotifType.DEADLINE_APPROACHING,
                    requirement=requirement,
                    submission=None,
                    defaults={
                        "title": f"Due soon: {requirement.title}",
                        "body": (
                            f"“{requirement.title}” for "
                            f"{requirement.teacher_assignment.subject.name} is due "
                            f"{requirement.deadline:%B %d, %Y at %H:%M}."
                        ),
                    },
                )
                if was_created:
                    created += 1
    return created


def mark_overdue_requirements():
    """
    Flag work whose deadline has passed and that the student never submitted.

    Idempotent on the same (student, requirement) pair. Returns the count
    written.
    """
    from django.utils import timezone

    now = timezone.now()
    overdue = Requirement.objects.filter(deadline__lt=now).select_related(
        "teacher_assignment__subject"
    )

    created = 0
    for requirement in overdue:
        section = requirement.teacher_assignment.section
        submitted_ids = set(
            Submission.objects.filter(requirement=requirement).values_list(
                "student_id", flat=True
            )
        )
        for profile in _students_in_section(section):
            if profile.id in submitted_ids:
                continue
            recipients = [profile.user_id, *_parents_of(profile)]
            for recipient_id in recipients:
                _, was_created = Notification.objects.get_or_create(
                    recipient_id=recipient_id,
                    notif_type=Notification.NotifType.OVERDUE,
                    requirement=requirement,
                    submission=None,
                    defaults={
                        "title": f"Overdue: {requirement.title}",
                        "body": (
                            f"“{requirement.title}” for "
                            f"{requirement.teacher_assignment.subject.name} was due "
                            f"{requirement.deadline:%B %d, %Y at %H:%M} and has not "
                            f"been submitted."
                        ),
                    },
                )
                if was_created:
                    created += 1
    return created
