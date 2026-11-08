"""
TRACK — the data-privacy service layer.

Two promises the Privacy Notice makes need code behind them:

  * **Access / portability** — a signed-in person can take a complete
    machine-readable copy of what TRACK holds about them. That is
    `build_export(user)` below.
  * **Correction / objection / erasure** — a request the school must answer in
    writing. That is the `DataRequest` row; the office works it in the queue.

Everything here is scoped from `request.user`, never from an id in the body,
and each section reuses the same reach the person already has on screen: an
export cannot reveal a record the applications screens would hide.

The export deliberately carries labels rather than primary keys. A JSON file
full of `"student": 41` is machine-readable but meaningless to the person who
downloaded it, and it cannot be handed to another institution.
"""

from datetime import datetime
from urllib.parse import urlparse

from django.db.models import Q
from django.utils import timezone

from .enrollment import POLICY_VERSION
from .messaging import parent_child_profile_ids, student_profile_of
from .models import (
    Announcement,
    AttendanceRecord,
    AuditLog,
    ClassSchedule,
    ConversationMember,
    Enrollment,
    EnrollmentApplication,
    FeeAssessment,
    FeePayment,
    Message,
    Notification,
    PushSubscription,
    Submission,
    TeacherAssignment,
    UserMessagingSettings,
)

#: Bump when the shape of the document changes, so a file received years from
#: now can still be read by whatever tooling opens it.
EXPORT_SCHEMA = "track.personal-data-export/1"

#: Section 8 of the Privacy Notice, in the export's own words. A copy of
#: someone's record that does not say what the school may not delete would
#: leave them to discover the limit by asking.
RETENTION_NOTICE = [
    "Enrollment applications and the documents filed with them are kept as the "
    "evidence for a decision that changed a learner's status.",
    "Academic and attendance records are kept for the period the Department of "
    "Education and the National Archives require a school to keep learner "
    "records, so TRACK cannot delete them on request.",
    "Messages and announcements are kept while the conversation remains part of "
    "school communication.",
    "Audit entries are kept so that a past change to a record can still be "
    "attributed.",
    "Push subscriptions are deleted as soon as notifications are turned off, or "
    "when an account is closed.",
]


def _label(user):
    """A person's name as the record states it — used instead of a user id."""
    if user is None:
        return None
    name = " ".join(
        part for part in (user.first_name, user.middle_name, user.last_name) if part
    )
    return name or user.username


def _stamp(value):
    return value.isoformat() if isinstance(value, datetime) else value


def _file_name(field):
    return field.name if field else None


def _humanize(value):
    """Status and action codes are stored as machine tokens; a document meant
    to be read by its subject spells them out."""
    return str(value or "").replace("_", " ")


def _account_block(user):
    return {
        "username": user.username,
        "full_name": _label(user),
        "email": user.email,
        "role": user.get_role_display(),
        "is_active": user.is_active,
        "date_joined": _stamp(user.date_joined),
        "last_login": _stamp(user.last_login),
        # No password field, not even a note about it: a key that reads
        # "password" in a file a learner hands to another school invites the
        # question the note would answer. What is stored is a salted hash.
    }


def _profile_block(user):
    """The school-side identity row that belongs to the role the account has."""
    profile = getattr(user, "student_profile", None)
    if profile is not None:
        return {
            "kind": "student",
            "lrn": profile.lrn,
            "section": str(profile.section) if profile.section_id else None,
            "date_of_birth": str(profile.date_of_birth) if profile.date_of_birth else None,
            "address": profile.address,
            "contact_number": profile.contact_number,
        }
    parent = getattr(user, "parent_profile", None)
    if parent is not None:
        return {
            "kind": "parent",
            "contact_number": parent.contact_number,
            "children": [
                {
                    "name": _label(child.user),
                    "lrn": child.lrn,
                    "section": str(child.section) if child.section_id else None,
                }
                for child in parent.children.all()
            ],
        }
    teacher_rows = TeacherAssignment.objects.filter(teacher=user).select_related(
        "subject", "section"
    )
    if teacher_rows.exists():
        return {
            "kind": user.get_role_display().lower(),
            "assignments": [
                {
                    "subject": row.subject.name,
                    "section": str(row.section),
                    "schedules": [
                        {
                            "day": row2.get_day_of_week_display(),
                            "start": _stamp(row2.start_time),
                            "end": _stamp(row2.end_time),
                            "room": row2.room,
                        }
                        for row2 in ClassSchedule.objects.filter(teacher_assignment=row)
                    ],
                }
                for row in teacher_rows
            ],
        }
    return {"kind": user.get_role_display().lower()}


def _enrollment_block(profile_ids, user_id):
    """Applications, documents, review history and the resulting enrollments
    that point at this person — as the applicant's own screens show them."""
    scope = Q(applicant_id=user_id)
    if profile_ids:
        scope |= Q(student_id__in=profile_ids)
    applications = (
        EnrollmentApplication.objects.filter(scope)
        .prefetch_related("documents", "events")
        .order_by("-created_at")
    )
    enrollments = (
        Enrollment.objects.filter(student_id__in=profile_ids).order_by("-created_at")
        if profile_ids
        else Enrollment.objects.none()
    )
    return {
        "applications": [
            {
                "reference": application.reference,
                "status": application.get_status_display(),
                "grade_level": str(application.grade_level) if application.grade_level_id else None,
                "school_year": application.school_year.label if application.school_year_id else None,
                "enrollment_type": application.get_enrollment_type_display(),
                "learner_name": _label(application.student.user)
                if application.student_id
                else " ".join(
                    part for part in (application.first_name, application.last_name) if part
                ),
                "submitted_at": _stamp(application.submitted_at),
                "decided_at": _stamp(application.decided_at),
                # The consent record is the applicant's own: it says which
                # notice they agreed to, and when.
                "consent_given_at": _stamp(application.consent_given_at),
                "consent_policy_version": application.consent_policy_version,
                "documents": [
                    {
                        "name": document.name,
                        "file_name": document.original_filename,
                        "stored_as": _file_name(document.file),
                        "status": document.get_status_display(),
                        "submitted_at": _stamp(document.submitted_at),
                        "verified_at": _stamp(document.verified_at),
                        "review_note": document.review_note,
                    }
                    for document in application.documents.all()
                ],
                "history": [
                    {
                        "action": _humanize(event.action),
                        "from_status": _humanize(event.from_status),
                        "to_status": _humanize(event.to_status),
                        "note": event.note,
                        "at": _stamp(event.created_at),
                        # internal_note is staff-only on every screen, so it is
                        # not part of what the person can see about themselves.
                    }
                    for event in application.events.all()
                ],
            }
            for application in applications
        ],
        "enrollments": [
            {
                "school_year": str(enrollment.school_year),
                "grade_level": str(enrollment.grade_level) if enrollment.grade_level_id else None,
                "section": enrollment.section_name or str(enrollment.section or ""),
                "status": enrollment.get_status_display(),
                "confirmed_at": _stamp(enrollment.confirmed_at),
            }
            for enrollment in enrollments
        ],
    }


def _requirements_block(profile_ids):
    """Filings against the requirements set for the classes in scope."""
    if not profile_ids:
        return []
    submissions = (
        Submission.objects.filter(student_id__in=profile_ids)
        .select_related("requirement")
        .order_by("-created_at")
    )
    return [
        {
            "title": submission.requirement.title,
            "type": submission.requirement.get_requirement_type_display(),
            "deadline": str(submission.requirement.deadline)
            if submission.requirement.deadline
            else None,
            "status": submission.get_status_display(),
            "submitted_at": _stamp(submission.submitted_at),
            "file_name": _file_name(submission.file_upload),
            "link_url": submission.link_url,
            "teacher_feedback": submission.teacher_feedback,
            "verified_at": _stamp(submission.verified_at),
        }
        for submission in submissions
    ]


def _attendance_block(profile_ids):
    if not profile_ids:
        return []
    records = (
        AttendanceRecord.objects.filter(student_id__in=profile_ids)
        .select_related("session", "recorded_by", "modified_by")
        .order_by("-session__date")
    )
    return [
        {
            "date": str(record.session.date),
            "subject": record.session.teacher_assignment.subject.name,
            "status": record.get_status_display(),
            "notes": record.notes,
            "recorded_by": _label(record.recorded_by),
            "recorded_at": _stamp(record.recorded_at),
            "modified_at": _stamp(record.modified_at),
        }
        for record in records
    ]


def _fees_block(profile_ids):
    if not profile_ids:
        return {"assessments": [], "payments": []}
    return {
        "assessments": [
            {
                "category": assessment.category.name,
                "school_year": str(assessment.school_year),
                "amount": str(assessment.amount),
                "due_date": str(assessment.due_date) if assessment.due_date else None,
                "status": assessment.get_status_display(),
                "description": assessment.description,
            }
            for assessment in FeeAssessment.objects.filter(
                student_id__in=profile_ids
            ).select_related("category", "school_year")
        ],
        "payments": [
            {
                "category": payment.assessment.category.name,
                "amount": str(payment.amount),
                "payment_date": str(payment.payment_date),
                "method": payment.get_payment_method_display(),
                "reference_number": payment.reference_number,
                "receipt_number": payment.receipt_number,
                "status": payment.get_status_display(),
                "notes": payment.notes,
                "voided_at": _stamp(payment.voided_at),
                "void_reason": payment.void_reason,
            }
            for payment in FeePayment.objects.filter(
                student_id__in=profile_ids
            ).select_related("assessment", "assessment__category")
        ],
    }


def _messages_block(user):
    """Every thread the person belongs to, with their own membership markers
    and the messages inside. Membership is the whole test: a conversation the
    person can read is one they can export."""
    memberships = (
        ConversationMember.objects.filter(user=user)
        .select_related("conversation", "last_read_message", "last_delivered_message")
        .order_by("conversation_id")
    )
    threads = []
    for member in memberships:
        conversation = member.conversation
        threads.append(
            {
                "conversation": conversation.title,
                "kind": conversation.get_kind_display(),
                "joined_at": _stamp(member.joined_at),
                "role": member.get_role_display(),
                "messages": [
                    {
                        "sender": _label(message.sender),
                        "body": message.body,
                        "at": _stamp(message.created_at),
                    }
                    for message in Message.objects.filter(
                        conversation=conversation
                    ).select_related("sender")
                ],
            }
        )
    announcements = [
        {
            "title": announcement.title,
            "body": announcement.body,
            "posted_at": _stamp(announcement.published_at or announcement.created_at),
            "audience": announcement.get_audience_display(),
        }
        for announcement in Announcement.objects.filter(author=user).order_by(
            "-created_at"
        )
    ]
    return {"conversations": threads, "announcements_posted": announcements}


def _notifications_block(user):
    return [
        {
            "type": notification.get_notif_type_display(),
            "title": notification.title,
            "body": notification.body,
            "is_read": notification.is_read,
            "created_at": _stamp(notification.created_at),
        }
        for notification in Notification.objects.filter(recipient=user).order_by(
            "-created_at"
        )
    ]


def _devices_block(user):
    settings_row = UserMessagingSettings.objects.filter(user=user).first()
    return {
        "in_app_notifications": settings_row.notify_in_app if settings_row else None,
        "push_notifications": settings_row.notify_push if settings_row else None,
        # The registration keys are what lets a server push to a browser, so
        # they are listed by endpoint host only. The record of the subscription
        # is the person's data; the secret that authorises it is not needed to
        # read the record.
        "push_subscriptions": [
            {
                "endpoint_host": _endpoint_host(subscription.endpoint),
                "created_at": _stamp(subscription.created_at),
                "consecutive_failures": subscription.failures,
            }
            for subscription in PushSubscription.objects.filter(user=user)
        ],
    }


def _endpoint_host(endpoint):
    return urlparse(endpoint or "").netloc or None


def _activity_block(user):
    """The audit rows this account produced — including the address recorded
    with each, which is the person's own data, not the school's."""
    return [
        {
            "action": entry.action,
            "target_model": entry.target_model,
            "target_id": entry.target_id,
            "description": entry.description,
            "ip_address": entry.ip_address,
            "at": _stamp(entry.timestamp),
        }
        for entry in AuditLog.objects.filter(actor=user).order_by("-timestamp")
    ]


def build_export(user):
    """
    The complete personal-data document for one account.

    A parent's copy includes their children's records: the guardian is the
    lawful contact for a minor's data and the parent screens already show
    exactly this scope. A student's copy shows nothing about classmates.
    """
    profile = student_profile_of(user)
    profile_ids = [profile.pk] if profile else list(parent_child_profile_ids(user))
    return {
        "schema": EXPORT_SCHEMA,
        "generated_at": _stamp(timezone.now()),
        "policy_version": POLICY_VERSION,
        "requested_by": _account_block(user),
        "role_profile": _profile_block(user),
        "enrollment": _enrollment_block(profile_ids, user.pk),
        "requirements": _requirements_block(profile_ids),
        "attendance": _attendance_block(profile_ids),
        "fees": _fees_block(profile_ids),
        "messages": _messages_block(user),
        "notifications": _notifications_block(user),
        "devices_and_preferences": _devices_block(user),
        "activity_log": _activity_block(user),
        "retention_notice": RETENTION_NOTICE,
    }
