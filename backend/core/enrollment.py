"""
TRACK — Enrollment & Admissions workflow.

This module owns every rule the enrollment endpoints enforce:

  * the allowed application status transitions (a client can never smuggle an
    arbitrary status through a serializer),
  * requirement snapshotting and per-application document materialization,
  * section recommendation and capacity accounting (backend-authoritative,
    concurrency-safe on PostgreSQL via row locks; on SQLite the transaction
    plus the unique constraints still guarantee no duplicates),
  * the Registrar's final confirmation transaction (student identity match or
    safe creation → enrollment row → status transition → audit event), with
    notifications delivered post-commit so a notification failure can never
    roll back a valid confirmation.

Nothing here touches HTTP concerns; views stay thin and call these helpers.
"""

import secrets
import uuid

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    ApplicationDocument,
    ApplicationReviewEvent,
    ApplicationStatus,
    AuditLog,
    Enrollment,
    EnrollmentApplication,
    EnrollmentPeriod,
    EnrollmentRequirement,
    GradeLevel,
    Section,
    StudentProfile,
    User,
)


# ---------------------------------------------------------------------------
# Status machine
# ---------------------------------------------------------------------------

#: Every legal transition. Keys are source statuses; values are the set of
#: statuses the application may move to, with the actor class allowed to make
#: the move ("applicant" = the owning student/parent, "staff" = a user
#: holding the enrollment.manage permission key).
ALLOWED_TRANSITIONS = {
    ApplicationStatus.DRAFT: {
        ApplicationStatus.SUBMITTED: "applicant",
        ApplicationStatus.CANCELLED: "staff",
    },
    ApplicationStatus.SUBMITTED: {
        ApplicationStatus.UNDER_REVIEW: "staff",
        ApplicationStatus.WITHDRAWN: "applicant",
    },
    ApplicationStatus.UNDER_REVIEW: {
        ApplicationStatus.INCOMPLETE: "staff",
        ApplicationStatus.ACCEPTED: "staff",
        ApplicationStatus.WAITLISTED: "staff",
        ApplicationStatus.REJECTED: "staff",
        ApplicationStatus.WITHDRAWN: "applicant",
        ApplicationStatus.CANCELLED: "staff",
    },
    ApplicationStatus.INCOMPLETE: {
        ApplicationStatus.RESUBMITTED: "applicant",
        ApplicationStatus.CANCELLED: "staff",
    },
    ApplicationStatus.RESUBMITTED: {
        ApplicationStatus.UNDER_REVIEW: "staff",
        ApplicationStatus.WITHDRAWN: "applicant",
    },
    ApplicationStatus.ACCEPTED: {
        ApplicationStatus.ENROLLED: "staff",
        ApplicationStatus.WITHDRAWN: "applicant",
        ApplicationStatus.CANCELLED: "staff",
    },
    ApplicationStatus.WAITLISTED: {
        ApplicationStatus.UNDER_REVIEW: "staff",
        ApplicationStatus.REJECTED: "staff",
        ApplicationStatus.WITHDRAWN: "applicant",
        ApplicationStatus.CANCELLED: "staff",
    },
    # Rejected / Enrolled / Withdrawn / Cancelled are terminal.
    ApplicationStatus.REJECTED: {},
    ApplicationStatus.ENROLLED: {},
    ApplicationStatus.WITHDRAWN: {},
    ApplicationStatus.CANCELLED: {},
}

#: Statuses an application may sit in while staff act on documents/sections.
STAFF_REVIEWABLE = (
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.RESUBMITTED,
    ApplicationStatus.INCOMPLETE,
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.WAITLISTED,
)

#: Statuses where required-document checks gate progression.
SUBMITTED_STATES = (
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.INCOMPLETE,
    ApplicationStatus.RESUBMITTED,
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.ENROLLED,
)


class EnrollmentWorkflowError(Exception):
    """A rule violation the API answers with HTTP 400."""

    def __init__(self, message, code="invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


class EnrollmentConflictError(Exception):
    """A concurrent state/capacity change the API answers with HTTP 409."""

    def __init__(self, message):
        super().__init__(message)
        self.message = message


def transition_target(actor_kind, current, new):
    """
    Validate one transition for one actor class. Returns nothing; raises
    EnrollmentWorkflowError with an applicant-safe sentence otherwise.
    """
    allowed = ALLOWED_TRANSITIONS.get(current, {})
    if new not in allowed:
        raise EnrollmentWorkflowError(
            f"An application cannot move from '{current}' to '{new}'."
        )
    if allowed[new] != actor_kind:
        raise EnrollmentWorkflowError(
            "You are not authorized to perform this action on the application."
        )


def transition(application, new_status, actor, *, action, note="", internal_note="",
               actor_kind="staff", ip_address=None, extra_fields=None):
    """
    Move `application` to `new_status`, stamping the model and writing an
    immutable ApplicationReviewEvent in the same transaction.
    """
    actor_kind = _resolve_actor_kind(actor, actor_kind)
    transition_target(actor_kind, application.status, new_status)

    old_status = application.status
    application.status = new_status
    fields = ["status", "updated_at"]
    now = timezone.now()

    if new_status == ApplicationStatus.SUBMITTED and not application.submitted_at:
        application.submitted_at = now
        fields.append("submitted_at")
    if new_status == ApplicationStatus.UNDER_REVIEW and not application.reviewed_at:
        application.reviewed_at = now
        application.reviewer = actor
        fields += ["reviewed_at", "reviewer"]
    if new_status in (
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WAITLISTED,
    ):
        application.decided_at = now
        fields.append("decided_at")

    for field, value in (extra_fields or {}).items():
        setattr(application, field, value)
        if field not in fields:
            fields.append(field)

    application.save(update_fields=fields)
    ApplicationReviewEvent.objects.create(
        application=application,
        actor=actor if isinstance(actor, User) else None,
        actor_name=_actor_display_name(actor),
        action=action,
        from_status=old_status,
        to_status=new_status,
        note=note,
        internal_note=internal_note,
    )
    return application


def _actor_display_name(actor):
    """History must stay readable for account-less (guest) applicants, who
    have no User row to derive a name from."""
    if actor is not None and not isinstance(actor, User):
        return "Applicant (guest)"
    return ""


def _resolve_actor_kind(actor, actor_kind):
    if isinstance(actor, User) and not actor.is_admin:
        return "applicant"
    if actor is not None and not isinstance(actor, User):
        # A guest applicant (anonymous actor) is never staff.
        return "applicant"
    return actor_kind


def log_application_event(application, actor, action, *, note="", internal_note=""):
    """Record a non-status event (upload, link, assignment change, ...)."""
    ApplicationReviewEvent.objects.create(
        application=application,
        actor=actor if isinstance(actor, User) else None,
        actor_name=_actor_display_name(actor),
        action=action,
        note=note,
        internal_note=internal_note,
    )


# ---------------------------------------------------------------------------
# Requirement snapshotting & document materialization
# ---------------------------------------------------------------------------

def applicable_requirements(period, grade_level, enrollment_type):
    """Active requirements of `period` that apply to this grade/type, ordered."""
    return [
        requirement
        for requirement in period.document_requirements.filter(is_active=True)
        .order_by("position", "name")
        if requirement.applies_to(grade_level, enrollment_type)
    ]


def build_requirements_snapshot(period, grade_level, enrollment_type):
    """The plain-JSON checklist frozen onto a new application."""
    return [
        {
            "requirement_id": requirement.pk,
            "name": requirement.name,
            "description": requirement.description,
            "is_required": requirement.is_required,
            "requires_verification": requirement.requires_verification,
            "position": requirement.position,
        }
        for requirement in applicable_requirements(period, grade_level, enrollment_type)
    ]


def materialize_documents(application):
    """
    Ensure one ApplicationDocument row exists per snapshotted requirement.
    Existing rows are never touched, so uploads and review state survive.
    """
    existing = set(
        application.documents.values_list("requirement_id", flat=True)
    )
    requirement_ids = [entry["requirement_id"] for entry in application.requirements_snapshot]
    missing = EnrollmentRequirement.objects.filter(pk__in=requirement_ids).exclude(
        pk__in=existing
    )
    documents = []
    for requirement in missing:
        snapshot = next(
            entry for entry in application.requirements_snapshot
            if entry["requirement_id"] == requirement.pk
        )
        documents.append(
            ApplicationDocument(
                application=application,
                requirement=requirement,
                name=snapshot["name"],
                is_required=snapshot["is_required"],
                requires_verification=snapshot["requires_verification"],
                position=snapshot.get("position", 0),
            )
        )
    if documents:
        ApplicationDocument.objects.bulk_create(documents)
    return application.documents.all()


def document_blockers(application):
    """
    Applicant-facing list of required documents that are not yet submitted.
    """
    return [
        document.name
        for document in application.documents.filter(is_required=True).exclude(
            status__in=[
                ApplicationDocument.Status.SUBMITTED,
                ApplicationDocument.Status.VERIFIED,
                ApplicationDocument.Status.WAIVED,
            ]
        )
    ]


def verification_blockers(application):
    """
    Staff-facing gate: required documents that are not in a state acceptable
    for acceptance/confirmation. The precise set of required/verified
    documents is school-configured; this rule is the workflow policy.
    """
    blockers = []
    for document in application.documents.filter(is_required=True):
        if document.status == ApplicationDocument.Status.VERIFIED:
            continue
        if document.status == ApplicationDocument.Status.WAIVED:
            continue
        if not document.requires_verification and document.status in (
            ApplicationDocument.Status.SUBMITTED,
        ):
            continue
        blockers.append(document.name)
    return blockers


# ---------------------------------------------------------------------------
# Section capacity & recommendations
# ---------------------------------------------------------------------------

def occupancy_count(section, school_year=None):
    """Active enrollments occupying slots in `section`."""
    school_year = school_year or section.school_year
    return Enrollment.objects.filter(
        section=section, school_year=school_year, status=Enrollment.Status.ACTIVE
    ).count()


def section_slot_row(section, school_year=None):
    """{section, capacity, assigned, available} — available is None when unlimited."""
    assigned = occupancy_count(section, school_year)
    capacity = section.capacity
    available = None if capacity is None else max(capacity - assigned, 0)
    return {
        "section": section,
        "capacity": capacity,
        "assigned": assigned,
        "available": available,
    }


def section_recommendations(school_year, grade_level):
    """
    Eligible sections for a grade level with real capacity data, most free
    slots first. No invented criteria — only grade level, active status and
    configured capacity drive the ordering.
    """
    sections = Section.objects.filter(
        school_year=school_year, grade_level=grade_level
    ).order_by("name")
    rows = [section_slot_row(section, school_year) for section in sections]
    # Unlimited-capacity sections sort last among equal availability, then by name.
    rows.sort(key=lambda row: (row["available"] is not None, row["available"] if row["available"] is not None else 0, row["section"].name))
    return rows


def assign_section(application, section, actor, ip_address=None):
    """
    Approve a section assignment for an accepted (or reviewable) application,
    rechecking capacity at the moment of assignment. Raises
    EnrollmentConflictError when the section filled in the meantime.
    """
    if application.status not in (
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.WAITLISTED,
        ApplicationStatus.RESUBMITTED,
        ApplicationStatus.SUBMITTED,
    ):
        raise EnrollmentWorkflowError(
            "A section can only be assigned while the application is under review, "
            "accepted or waitlisted."
        )
    if section.school_year_id != application.school_year_id or (
        section.grade_level_id != application.grade_level_id
    ):
        raise EnrollmentWorkflowError(
            "The section must belong to the application's school year and grade level."
        )

    with transaction.atomic():
        # Lock the section row on backends that support it (PostgreSQL) so two
        # staff members cannot both claim the last slot.
        locked = Section.objects.select_for_update().filter(pk=section.pk).first()
        slots = section_slot_row(locked, application.school_year)
        if slots["available"] is not None and slots["available"] <= 0:
            raise EnrollmentConflictError(
                f"{section} is already full ({slots['assigned']}/{slots['capacity']} "
                "active enrollments). Choose another section or leave the "
                "application awaiting assignment."
            )
        if (
            application.assigned_section_id
            and application.assigned_section_id != section.pk
        ):
            log_application_event(
                application,
                actor,
                "section_reassigned",
                internal_note=(
                    f"Section changed from {application.assigned_section} to {section}."
                ),
            )
        application.assigned_section = section
        application.section_approved_by = actor
        application.section_assigned_at = timezone.now()
        application.save(
            update_fields=[
                "assigned_section",
                "section_approved_by",
                "section_assigned_at",
                "updated_at",
            ]
        )
        log_application_event(
            application,
            actor,
            "section_assigned",
            note=f"Section assignment approved: {section}.",
            internal_note=(
                f"Capacity at assignment: {slots['assigned']}/{slots['capacity'] or 'unlimited'}."
            ),
        )
        _audit(
            actor,
            "enrollment.section_assigned",
            application,
            f"Approved section {section} for {application.reference}.",
            ip_address,
        )
    return application


# ---------------------------------------------------------------------------
# Student identity matching
# ---------------------------------------------------------------------------

def find_student_matches(application):
    """
    Plausible existing student identities, with the reason each matched.
    Never merges automatically — an authorized reviewer must link manually.
    """
    matches = []
    seen = set()

    def add(profile, reason):
        if profile and profile.pk not in seen:
            seen.add(profile.pk)
            matches.append({"profile": profile, "reason": reason})

    if application.lrn:
        add(
            StudentProfile.objects.filter(lrn=application.lrn).first(),
            "Exact LRN match",
        )
    if application.student_id:
        add(application.student, "Already linked")

    if application.last_name and application.date_of_birth:
        candidates = StudentProfile.objects.filter(
            user__last_name__iexact=application.last_name,
            date_of_birth=application.date_of_birth,
        )
        if application.first_name:
            candidates = candidates.filter(user__first_name__iexact=application.first_name)
        for profile in candidates.select_related("user")[:10]:
            add(profile, "Name and date of birth match")
    return matches


def match_or_create_student(application, registrar):
    """
    Resolve the permanent student identity inside the confirmation
    transaction. Order of decisions:

      1. An explicitly linked student is reused as-is.
      2. An exact LRN match links the existing identity (reliable identifier).
      3. Otherwise a brand-new student account is created — LRN required.
    Uncertain name/birth-date matches never auto-link: staff must review the
    candidates and link manually before confirming.
    """
    if application.student_id:
        return application.student, "linked"

    if application.lrn:
        lrn_match = StudentProfile.objects.select_for_update().filter(
            lrn=application.lrn
        ).first()
        if lrn_match:
            application.student = lrn_match
            application.save(update_fields=["student", "updated_at"])
            log_application_event(
                application,
                registrar,
                "student_linked",
                note="Matched to an existing student record using the LRN.",
                internal_note=f"Auto-linked on LRN match to StudentProfile {lrn_match.pk}.",
            )
            return lrn_match, "lrn_match"

    if not application.lrn:
        raise EnrollmentWorkflowError(
            "A Learner Reference Number is required before a new student record "
            "can be created. Link an existing student record or add the LRN."
        )

    # New permanent identity. The account username is derived from the
    # non-guessable reference and its password is a random secret nobody is
    # issued — after confirmation the student claims the account once with
    # account_claim_token and chooses their own username/password.
    with transaction.atomic():
        base = application.reference.lower().replace("-", "")
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base}{suffix}"
        user = User.objects.create_user(
            username=username,
            password=f"{uuid.uuid4().hex}{uuid.uuid4().hex}",  # random, never issued
            role=User.Role.STUDENT,
            first_name=application.first_name,
            middle_name=application.middle_name,
            last_name=application.last_name,
        )
        profile = StudentProfile.objects.create(
            user=user,
            lrn=application.lrn,
            date_of_birth=application.date_of_birth,
            address=application.address,
            contact_number=application.contact_number,
        )
    application.student = profile
    application.account_claim_token = secrets.token_hex(16)
    application.save(
        update_fields=["student", "account_claim_token", "updated_at"]
    )
    log_application_event(
        application,
        registrar,
        "student_created",
        note="A new student record was created for this enrollment.",
        internal_note=f"Created User {user.pk} / StudentProfile {profile.pk}.",
    )
    return profile, "created"


# ---------------------------------------------------------------------------
# Final confirmation
# ---------------------------------------------------------------------------

def confirm_enrollment(application, registrar, ip_address=None):
    """
    The Registrar's atomic final confirmation. Re-validates everything at the
    moment of confirmation (never trusts earlier checks or frontend input):

      1. the application belongs to a period that still exists and is not
         draft-only,
      2. the application is in an allowed state (accepted),
      3. every required document satisfies the configured verification policy,
      4. the requested grade level is valid for the period,
      5. a staff-approved section assignment exists,
      6. that section still has capacity (rechecked under a row lock),
      7. no other active enrollment exists for the student and school year,
      8. the student identity is matched or safely created.

    Returns (enrollment, created). Repeat calls for an already-confirmed
    application return the existing enrollment without duplicating rows or
    notifications (idempotent).
    """
    with transaction.atomic():
        locked = (
            EnrollmentApplication.objects.select_for_update()
            .select_related("period", "school_year", "grade_level", "assigned_section")
            .filter(pk=application.pk)
            .first()
        )
        if locked is None:
            raise EnrollmentWorkflowError("Application not found.")

        # Idempotency: a retried confirmation returns the existing enrollment.
        existing = Enrollment.objects.filter(application=locked).first()
        if existing:
            return existing, False

        if locked.status != ApplicationStatus.ACCEPTED:
            raise EnrollmentWorkflowError(
                "Only an accepted application can be confirmed for enrollment."
            )
        if locked.period_id is None:
            raise EnrollmentWorkflowError(
                "The application does not belong to a valid enrollment period."
            )
        if not locked.period.accepts_grade_level(locked.grade_level_id):
            raise EnrollmentWorkflowError(
                "The requested grade level is not valid for this enrollment period."
            )
        if not locked.assigned_section_id:
            raise EnrollmentWorkflowError(
                "A staff-approved section assignment is required before confirmation."
            )

        blockers = verification_blockers(locked)
        if blockers:
            raise EnrollmentWorkflowError(
                "Required documents are not yet verified: " + ", ".join(blockers) + "."
            )

        # Capacity recheck under a row lock (no-op lock on SQLite, real on Postgres).
        section = (
            Section.objects.select_for_update()
            .select_related("grade_level", "school_year")
            .get(pk=locked.assigned_section_id)
        )
        slots = section_slot_row(section, locked.school_year)
        if slots["available"] is not None and slots["available"] <= 0:
            raise EnrollmentConflictError(
                f"{section} filled before confirmation "
                f"({slots['assigned']}/{slots['capacity']} active enrollments). "
                "Choose another section or leave the application awaiting assignment."
            )

        student, identity_action = match_or_create_student(locked, registrar)

        conflict = (
            Enrollment.objects.select_for_update()
            .filter(
                student=student,
                school_year=locked.school_year,
                status=Enrollment.Status.ACTIVE,
            )
            .first()
        )
        if conflict:
            raise EnrollmentConflictError(
                "This student already has an active enrollment for this school year."
            )

        enrollment = Enrollment.objects.create(
            student=student,
            school_year=locked.school_year,
            grade_level=locked.grade_level,
            section=section,
            section_name=section.name,
            application=locked,
            status=Enrollment.Status.ACTIVE,
            confirmed_by=registrar,
            confirmed_at=timezone.now(),
        )

        # Keep the roster source (StudentProfile.section) pointing at the new
        # section so attendance sees the right class; history lives in the
        # Enrollment rows.
        student.section = section
        student.save(update_fields=["section"])

        transition(
            locked,
            ApplicationStatus.ENROLLED,
            registrar,
            action="enrolled",
            note=f"Enrollment confirmed for {locked.school_year}: {section}.",
            internal_note=f"Created Enrollment {enrollment.pk} ({identity_action}).",
        )

        AuditLog.objects.create(
            actor=registrar,
            action="enrollment.confirmed",
            target_model="Enrollment",
            target_id=str(enrollment.pk),
            description=(
                f"Confirmed enrollment {enrollment.pk} for {locked.reference} "
                f"({student.user.get_full_name()}) in {section}."
            ),
            ip_address=ip_address,
        )

        # Notifications must never undo a committed confirmation: they are
        # queued post-commit and the helpers swallow their own failures.
        transaction.on_commit(lambda: _notify_enrolled(locked, enrollment))

    return enrollment, True


def _notify_enrolled(application, enrollment):
    from .notifications import notify_enrollment_confirmed

    notify_enrollment_confirmed(application, enrollment)


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------

def _audit(actor, action, application, description, ip_address=None):
    AuditLog.objects.create(
        actor=actor if isinstance(actor, User) else None,
        action=action,
        target_model="EnrollmentApplication",
        target_id=str(application.pk),
        description=description,
        ip_address=ip_address,
    )


def dashboard_stats(school_year=None):
    """Real registrar-dashboard figures (no fabricated zeros on failure)."""
    applications = EnrollmentApplication.objects.all()
    if school_year is not None:
        applications = applications.filter(school_year=school_year)
    status_counts = {
        row["status"]: row["total"]
        for row in applications.values("status").annotate(total=Count("id"))
    }
    grade_rows = (
        applications.values("grade_level_id", "grade_level__name")
        .annotate(total=Count("id"))
        .order_by("grade_level__order")
    )
    documents = ApplicationDocument.objects.filter(
        status=ApplicationDocument.Status.SUBMITTED
    )
    enrollments = Enrollment.objects.filter(status=Enrollment.Status.ACTIVE)
    if school_year is not None:
        documents = documents.filter(application__school_year=school_year)
        enrollments = enrollments.filter(school_year=school_year)
    return {
        "total_applications": applications.count(),
        "submitted": status_counts.get(ApplicationStatus.SUBMITTED, 0),
        "under_review": status_counts.get(ApplicationStatus.UNDER_REVIEW, 0),
        "resubmitted": status_counts.get(ApplicationStatus.RESUBMITTED, 0),
        "awaiting_corrections": status_counts.get(ApplicationStatus.INCOMPLETE, 0),
        "accepted": status_counts.get(ApplicationStatus.ACCEPTED, 0),
        "waitlisted": status_counts.get(ApplicationStatus.WAITLISTED, 0),
        "rejected": status_counts.get(ApplicationStatus.REJECTED, 0),
        "enrolled": status_counts.get(ApplicationStatus.ENROLLED, 0),
        "drafts": status_counts.get(ApplicationStatus.DRAFT, 0),
        "pending_documents": documents.count(),
        "confirmed_enrollments": enrollments.count(),
        "by_grade": [
            {"grade_level_id": row["grade_level_id"],
             "grade_level": row["grade_level__name"],
             "total": row["total"]}
            for row in grade_rows
        ],
    }


def school_year_report(school_year):
    """Status/grade/type breakdown plus section occupancy for one school year."""
    applications = EnrollmentApplication.objects.filter(school_year=school_year)
    enrollments = Enrollment.objects.filter(
        school_year=school_year, status=Enrollment.Status.ACTIVE
    )
    sections = Section.objects.filter(school_year=school_year).select_related(
        "grade_level"
    )
    return {
        "school_year": school_year,
        "by_status": [
            {"status": row["status"], "total": row["total"]}
            for row in applications.values("status").annotate(total=Count("id"))
        ],
        "by_grade": [
            {"grade_level_id": row["grade_level_id"],
             "grade_level": row["grade_level__name"],
             "total": row["total"]}
            for row in applications.values("grade_level_id", "grade_level__name")
            .annotate(total=Count("id"))
            .order_by("grade_level__order")
        ],
        "by_type": [
            {"enrollment_type": row["enrollment_type"], "total": row["total"]}
            for row in applications.values("enrollment_type").annotate(total=Count("id"))
        ],
        "sections": [
            {
                "section_id": section.pk,
                "section": str(section),
                "grade_level": section.grade_level.name,
                "capacity": section.capacity,
                "assigned": occupancy_count(section, school_year),
            }
            for section in sections
        ],
        "confirmed_enrollments": enrollments.count(),
    }
