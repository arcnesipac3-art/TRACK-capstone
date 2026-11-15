"""
TRACK — Digital Clearance workflow rules.

Everything that decides whether an action is allowed, and what it does to the
records, lives here rather than in a view, so the API, the tests and (later) any
scheduled reminder reason about the same state machine.

The rules this module exists to enforce:

  * An officer acts on a department queue only while they hold
    ``clearance.verify`` **and** belong to that department — never on another
    department's learners, and never on a period that is not active.
  * A learner only ever reaches their own clearance record; a parent reaches the
    records of children linked to their account. Views build every query through
    ``visible_clearances()`` so the scoping cannot be forgotten per-endpoint.
  * Rejection and correction always carry an explanation the learner can read.
    A blank reason is refused here, not merely discouraged in the form.
  * A department sign-off is never held back by an obligation: obligations are
    the Registrar's problem at the final step, so the Library can approve a
    learner whose Finance item is still open and both facts stay visible.
  * Only ``finalize_clearance()`` writes ``cleared``, and only after every
    required department has settled, every required document has been accepted,
    the learner is in the period's population, and no blocking obligation is
    outstanding.
  * Every one of those acts leaves three traces: an immutable ClearanceEvent on
    the record, a row in AuditLog, and (for anything the learner needs to know
    about) a notification.

Design notes that are easy to get wrong:

  * **Snapshotting.** ``DepartmentClearance.requirement_snapshot`` and the
    per-submission name/position copy the configuration at provisioning time.
    Editing the checklist afterwards never rewrites work already in progress, so
    a live period must not have requirements added or removed from underneath a
    learner — ``assert_configuration_editable()`` refuses that and the caller
    defers the edit to the next period instead. Deactivating is always allowed:
    it only stops the item appearing in *new* snapshots.
  * **Statuses are recomputed, never hand-maintained.** ``derive_overall()``
    reads the department rows, so a reopening downstream moves the learner back
    out of 'ready for final' on its own. ``cleared`` is the exception the
    Registrar owns; ``revoke_clearance()`` is the only way out of it.
  * **Provisioning is idempotent.** Activating a period twice, or adding a
    learner who already has a record, never duplicates rows — the unique
    constraint is the backstop and ``get_or_create`` is the front line.
"""

import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    AuditLog,
    ClearanceEvent,
    ClearanceObligation,
    ClearancePeriod,
    ClearanceRequirement,
    ClearanceStatus,
    ClearanceSubmission,
    DepartmentClearance,
    DepartmentStatus,
    StudentClearance,
    StudentProfile,
    User,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ClearanceWorkflowError(Exception):
    """An action the workflow refuses because of the record's state."""


class ClearanceConfigurationError(Exception):
    """A setup change that would rewrite evidence already given to learners."""


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------

def visible_clearances(user):
    """
    The clearance records this user is entitled to open at all.

    * An administrator holding ``clearance.view`` sees every record — that key is
      what makes a queue and a monitoring screen possible.
    * A learner sees only their own.
    * A parent sees only the records of children linked to their account.
    * Anyone else sees nothing, so an unlinked account cannot enumerate
      clearance records by guessing ids.
    """
    if user is None or not user.is_authenticated:
        return StudentClearance.objects.none()
    if user.is_admin and user.has_perm_key("clearance.view"):
        return StudentClearance.objects.all()
    if user.is_student:
        return StudentClearance.objects.filter(student__user=user)
    if user.is_parent:
        return StudentClearance.objects.filter(student__parents__user=user).distinct()
    return StudentClearance.objects.none()


def may_verify(user, period_department):
    """Officer authority over one department's queue (see PeriodDepartment)."""
    return bool(period_department) and period_department.may_verify(user)


def require_verify(user, department_clearance):
    """Raise unless `user` may act on this department's item right now."""
    period_department = department_clearance.period_department
    if not (user and user.is_authenticated and user.is_admin):
        raise ClearanceWorkflowError(
            "Only department officers can act on a clearance queue."
        )
    if not user.has_perm_key("clearance.verify"):
        raise ClearanceWorkflowError(
            "You do not have the 'clearance.verify' permission."
        )
    if not period_department.is_active:
        raise ClearanceWorkflowError(
            "This department is no longer part of the clearance period."
        )
    if not period_department.period.accepts_actions:
        raise ClearanceWorkflowError(
            "This clearance period is not active, so its queue is closed."
        )
    if not period_department.may_verify(user):
        raise ClearanceWorkflowError(
            f"You are not assigned to {period_department.department.name}."
        )
    return period_department


def require_setup(user):
    """Administrator authority over clearance configuration."""
    if not (user and user.is_authenticated and user.is_admin):
        raise ClearanceWorkflowError("Only administrators configure clearance.")
    if not user.has_perm_key("clearance.manage"):
        raise ClearanceWorkflowError(
            "You do not have the 'clearance.manage' permission."
        )


def require_finalizer(user):
    """Registrar authority — the only key that can clear a learner."""
    if not (user and user.is_authenticated and user.is_admin):
        raise ClearanceWorkflowError(
            "Only the Registrar can give final clearance approval."
        )
    if not user.has_perm_key("clearance.finalize"):
        raise ClearanceWorkflowError(
            "You do not have the 'clearance.finalize' permission. A department "
            "officer's approval is not final clearance."
        )


# ---------------------------------------------------------------------------
# Population
# ---------------------------------------------------------------------------

def target_students(period):
    """
    The learners this period covers, read from records the school already keeps.

    A learner belongs to a school year through their active enrollment or, for
    records that predate enrollment confirmation, through their section. Either
    route counts — the alternative is silently dropping a learner out of a
    clearance they are supposed to complete. Grade level follows the same order:
    the year's enrollment is more current than the section row.
    """
    year = period.school_year
    students = StudentProfile.objects.filter(user__is_active=True).filter(
        Q(enrollments__school_year=year, enrollments__status="active")
        | Q(section__school_year=year)
    ).distinct()

    grades = list(period.grade_levels.values_list("pk", flat=True))
    if grades:
        students = students.filter(
            Q(enrollments__school_year=year, enrollments__grade_level_id__in=grades)
            | Q(section__school_year=year, section__grade_level_id__in=grades)
        ).distinct()

    categories = list(period.categories.values_list("pk", flat=True))
    if categories:
        students = students.filter(clearance_categories__id__in=categories).distinct()

    return students


def grade_level_of(student):
    """The grade level that describes this learner for the current year."""
    enrollment = student.enrollments.filter(status="active").first()
    if enrollment:
        return enrollment.grade_level
    return student.section.grade_level if student.section_id else None


def section_name_of(student):
    enrollment = student.enrollments.filter(status="active").first()
    if enrollment:
        return enrollment.section_name or (
            enrollment.section.name if enrollment.section_id else ""
        )
    return student.section.name if student.section_id else ""


# ---------------------------------------------------------------------------
# Provisioning
# ---------------------------------------------------------------------------

def requirements_snapshot(period_department):
    """The department's checklist as it stands right now, frozen into a list."""
    return [
        {
            "id": requirement.pk,
            "name": requirement.name,
            "is_required": requirement.is_required,
            "needs_review": requirement.needs_review,
            "allows_upload": requirement.allows_upload,
            "position": requirement.position,
        }
        for requirement in period_department.requirements.filter(is_active=True)
        if requirement.allows_upload or requirement.needs_review or requirement.is_required
    ]


def _open_departments(period):
    return list(period.departments.filter(is_active=True, department__is_active=True))


def provision_period(period, actor=None, ip_address=None):
    """
    Create the clearance record and department queues for every learner the
    period covers. Safe to run repeatedly.

    Returns the counts actually created, which is what the activation response
    reports to the administrator.
    """
    created_records = 0
    created_items = 0
    departments = _open_departments(period)
    newcomers = []

    with transaction.atomic():
        for student in target_students(period).select_related("section", "user"):
            record, created = StudentClearance.objects.get_or_create(
                period=period,
                student=student,
                defaults={
                    "grade_level": grade_level_of(student),
                    "section_name": section_name_of(student),
                },
            )
            if created:
                created_records += 1
                created_items += _provision_departments(record, departments)
                log_event(
                    record,
                    None,
                    actor,
                    "provisioned",
                    to_status=record.overall_status,
                    note="Your clearance for this period has been opened.",
                    internal_note=(
                        f"Provisioned with {len(departments)} department(s)."
                    ),
                )
                newcomers.append(record)
        # A learner added to the population after activation (a new enrollment,
        # or a category assignment) is picked up by re-running this.
        for record in period.clearances.all():
            existing = set(
                record.departments.values_list("period_department_id", flat=True)
            )
            for period_department in departments:
                if period_department.pk in existing:
                    continue
                _create_item(record, period_department)
                created_items += 1

    if created_records and actor is not None:
        audit(
            actor,
            "clearance.provision",
            period,
            f"Provisioned {created_records} clearance record(s) for '{period.name}'.",
            ip_address=ip_address,
        )
    # One bell item per learner who actually joined, written after the rows
    # exist. Provisioning runs again whenever a category or a department changes,
    # so 'who is new' is decided here, where the record was created, rather than
    # inferred afterwards.
    for record in newcomers:
        transaction.on_commit(lambda record=record: _notify_assigned(record))
    return {"records": created_records, "department_items": created_items}


def provision_student(period, student, actor=None, ip_address=None):
    """One learner into a running period — the same rows provisioning creates."""
    if period.status != ClearancePeriod.Status.ACTIVE:
        raise ClearanceWorkflowError(
            "Only an active clearance period takes new learners."
        )
    if not target_students(period).filter(pk=student.pk).exists():
        raise ClearanceWorkflowError(
            "This learner is outside the grade levels and categories this "
            "period covers."
        )
    with transaction.atomic():
        record, created = StudentClearance.objects.get_or_create(
            period=period,
            student=student,
            defaults={
                "grade_level": grade_level_of(student),
                "section_name": section_name_of(student),
            },
        )
        if created:
            _provision_departments(record, _open_departments(period))
            log_event(
                record, None, actor, "provisioned",
                to_status=record.overall_status,
                note="Your clearance for this period has been opened.",
            )
            transaction.on_commit(lambda: _notify_assigned(record))
        else:
            existing = set(
                record.departments.values_list("period_department_id", flat=True)
            )
            for period_department in _open_departments(period):
                if period_department.pk not in existing:
                    _create_item(record, period_department)
    if created and actor is not None:
        audit(
            actor, "clearance.record_created", record,
            f"Opened clearance for {record.student} in '{period.name}'.",
            ip_address=ip_address,
        )
    return record


def _provision_departments(record, departments):
    count = 0
    for period_department in departments:
        _create_item(record, period_department)
        count += 1
    return count


def _create_item(record, period_department):
    item, _ = DepartmentClearance.objects.get_or_create(
        student_clearance=record,
        period_department=period_department,
        defaults={
            "department": period_department.department,
            "requirement_snapshot": requirements_snapshot(period_department),
            "status": _initial_status(period_department),
        },
    )
    _materialize_slots(item)
    return item


def _initial_status(period_department):
    """
    What the queue shows before the learner does anything.

    A department with nothing to hand in starts 'not started' — the officer
    simply signs. One that asks for documents starts 'pending submission' so the
    learner sees the outstanding item without opening anything.
    """
    has_document = any(
        entry["is_required"] and entry["allows_upload"]
        for entry in requirements_snapshot(period_department)
    )
    return (
        DepartmentStatus.PENDING_SUBMISSION
        if has_document
        else DepartmentStatus.NOT_STARTED
    )


def _materialize_slots(item):
    """One submission row per snapshot entry, so the checklist is queryable."""
    existing = set(item.submissions.values_list("requirement_id", flat=True))
    for entry in item.requirement_snapshot or []:
        requirement_id = entry["id"]
        if requirement_id in existing:
            continue
        requirement = ClearanceRequirement.objects.filter(pk=requirement_id).first()
        if requirement is None:
            continue
        ClearanceSubmission.objects.create(
            department_clearance=item,
            requirement=requirement,
            name=entry["name"],
            is_required=entry["is_required"],
            position=entry["position"],
        )
        existing.add(requirement_id)


# ---------------------------------------------------------------------------
# Configuration guard
# ---------------------------------------------------------------------------

def assert_configuration_editable(period_department):
    """
    Refuse a checklist change once the department has real work.

    The snapshot is what the learner was told; editing or deleting a requirement
    now would either leave a learner holding a document nobody asked for or let
    an officer claim they asked for something they added afterwards.
    """
    if DepartmentClearance.objects.filter(period_department=period_department).exists():
        raise ClearanceConfigurationError(
            "Learners are already working through this department's checklist, "
            "so its requirements are fixed for this period. Add a further "
            "obligation against the affected learners instead, or configure the "
            "next period."
        )


def assert_department_removable(period_department):
    if period_department.items.exists():
        raise ClearanceConfigurationError(
            "This department already holds clearance decisions. Deactivate it "
            "for the period instead of removing it, so the record keeps its "
            "history."
        )


# ---------------------------------------------------------------------------
# Events & audit
# ---------------------------------------------------------------------------

def log_event(record, item, actor, action, *, from_status="", to_status="",
              note="", internal_note=""):
    return ClearanceEvent.objects.create(
        student_clearance=record,
        department_clearance=item,
        actor=actor if isinstance(actor, User) else None,
        action=action,
        from_status=from_status or "",
        to_status=to_status or "",
        note=note,
        internal_note=internal_note,
    )


def audit(actor, action, target, description, ip_address=None):
    # A model *class* is passed for actions with no single row behind them, such
    # as a report export. `type(SomeModel).__name__` would name the metaclass and
    # `SomeModel.pk` would store a property object, so the entry has to be read
    # for what it is before it is flattened.
    is_model_class = isinstance(target, type)
    AuditLog.objects.create(
        actor=actor if isinstance(actor, User) else None,
        action=action,
        target_model=target.__name__ if is_model_class else type(target).__name__,
        target_id="" if is_model_class else str(target.pk),
        description=description,
        ip_address=ip_address,
    )


# ---------------------------------------------------------------------------
# Overall status
# ---------------------------------------------------------------------------

def derive_overall(record, *, persist=True):
    """
    Recompute the learner's overall standing from their department rows.

    Order of precedence, which is also what the monitoring screens say:
    a refused department means *not cleared*; every required department settled
    with no outstanding blockers means *ready for final*; anything else means
    the learner is still working or the officers still hold it.
    """
    if record.overall_status == ClearanceStatus.CLEARED:
        return ClearanceStatus.CLEARED

    items = list(record.departments.select_related("period_department", "department"))
    if not items:
        status = ClearanceStatus.IN_PROGRESS
    elif any(item.status == DepartmentStatus.REJECTED for item in items):
        status = ClearanceStatus.NOT_CLEARED
    elif all(item.is_settled for item in items if item.period_department.is_required):
        # A blocking obligation keeps the learner out of 'ready for final' for the
        # same reason it keeps the Registrar from signing: the two screens must
        # not disagree about whether the file is finished.
        status = (
            ClearanceStatus.PENDING_DEPARTMENT
            if outstanding_blockers(record)
            else ClearanceStatus.READY_FOR_FINAL
        )
    elif any(
        item.status in (DepartmentStatus.SUBMITTED, DepartmentStatus.UNDER_REVIEW)
        for item in items
    ):
        status = ClearanceStatus.PENDING_DEPARTMENT
    else:
        status = ClearanceStatus.IN_PROGRESS

    if persist and status != record.overall_status:
        StudentClearance.objects.filter(pk=record.pk).update(overall_status=status)
        record.overall_status = status
    return status


def outstanding_blockers(record):
    """Obligations still outstanding that the school marked as blocking."""
    return list(
        ClearanceObligation.objects.filter(
            department_clearance__student_clearance=record,
            status=ClearanceObligation.Status.OPEN,
            is_blocking=True,
        ).select_related("department_clearance__department")
    )


def unaccepted_documents(record):
    """Required documents the learner has handed in but no officer has accepted."""
    return list(
        ClearanceSubmission.objects.filter(
            department_clearance__student_clearance=record,
            is_required=True,
            requirement__needs_review=True,
            requirement__is_active=True,
            status__in=[
                ClearanceSubmission.Status.SUBMITTED,
                ClearanceSubmission.Status.RETURNED,
            ],
        ).select_related("department_clearance__department")
    )


def is_in_population(record):
    """
    Whether the learner still belongs to the period they are being cleared for.

    Checked again at the final step rather than assumed from the existence of the
    row: a learner withdrawn or moved out of the covered grade levels after
    provisioning must not be certified by reflex.
    """
    return target_students(record.period).filter(pk=record.student_id).exists()


# ---------------------------------------------------------------------------
# Department decisions
# ---------------------------------------------------------------------------

# Which moves an officer may make, and what each one needs from them.
_DECISION_RULES = {
    DepartmentStatus.APPROVED: {
        "from": (
            DepartmentStatus.NOT_STARTED,
            DepartmentStatus.PENDING_SUBMISSION,
            DepartmentStatus.SUBMITTED,
            DepartmentStatus.UNDER_REVIEW,
            DepartmentStatus.NEEDS_CORRECTION,
            DepartmentStatus.REJECTED,
        ),
        "note": "optional",
    },
    DepartmentStatus.REJECTED: {
        "from": (
            DepartmentStatus.NOT_STARTED,
            DepartmentStatus.PENDING_SUBMISSION,
            DepartmentStatus.SUBMITTED,
            DepartmentStatus.UNDER_REVIEW,
            DepartmentStatus.NEEDS_CORRECTION,
            DepartmentStatus.APPROVED,
        ),
        # A refusal the learner cannot read is not a refusal.
        "note": "required",
    },
    DepartmentStatus.NEEDS_CORRECTION: {
        "from": (
            DepartmentStatus.NOT_STARTED,
            DepartmentStatus.PENDING_SUBMISSION,
            DepartmentStatus.SUBMITTED,
            DepartmentStatus.UNDER_REVIEW,
            DepartmentStatus.APPROVED,
            DepartmentStatus.REJECTED,
        ),
        "note": "required",
    },
    DepartmentStatus.NOT_APPLICABLE: {
        "from": (
            DepartmentStatus.NOT_STARTED,
            DepartmentStatus.PENDING_SUBMISSION,
            DepartmentStatus.SUBMITTED,
            DepartmentStatus.UNDER_REVIEW,
            DepartmentStatus.NEEDS_CORRECTION,
        ),
        "note": "required",
    },
    DepartmentStatus.UNDER_REVIEW: {
        "from": (DepartmentStatus.SUBMITTED, DepartmentStatus.PENDING_SUBMISSION),
        "note": "optional",
    },
}


def record_decision(item, new_status, actor, *, note="", internal_note="",
                    ip_address=None):
    """
    Apply an officer's decision to one department's sign-off.

    The transition table is what keeps a settled record from drifting: approving
    an already-approved learner is refused, and the one-way doors (not
    applicable) require deliberate reopening rather than a second click.
    """
    period_department = require_verify(actor, item)
    rule = _DECISION_RULES.get(new_status)
    if rule is None:
        raise ClearanceWorkflowError(
            "That status is set by the workflow, not by an officer."
        )
    if item.status == new_status:
        raise ClearanceWorkflowError(
            f"This department is already marked “{item.get_status_display()}”."
        )
    if item.status not in rule["from"]:
        raise ClearanceWorkflowError(
            f"A department marked “{item.get_status_display()}” cannot move "
            f"straight to “{dict(DepartmentStatus.choices)[new_status]}”. "
            "Reopen it first."
        )
    note = (note or "").strip()
    if rule["note"] == "required" and not note:
        raise ClearanceWorkflowError(
            "This decision needs an explanation the learner can read."
        )
    if new_status == DepartmentStatus.APPROVED:
        pending = item.submissions.filter(
            is_required=True,
            requirement__needs_review=True,
            status__in=[
                ClearanceSubmission.Status.NOT_SUBMITTED,
                ClearanceSubmission.Status.SUBMITTED,
                ClearanceSubmission.Status.RETURNED,
            ],
        )
        if pending.exists():
            names = ", ".join(pending[:5].values_list("name", flat=True))
            raise ClearanceWorkflowError(
                f"Accept or return the required document(s) first: {names}."
            )

    old_status = item.status
    with transaction.atomic():
        item.status = new_status
        item.decision_note = note
        item.decided_by = actor if isinstance(actor, User) else None
        item.decided_by_name = (
            actor.get_full_name() or actor.username
            if isinstance(actor, User) else ""
        )
        item.decided_at = timezone.now()
        item.save()

        record = item.student_clearance
        derive_overall(record)
        log_event(
            record, item, actor, f"department_{new_status}",
            from_status=old_status, to_status=new_status,
            note=note, internal_note=internal_note,
        )
        audit(
            actor,
            f"clearance.department.{new_status}",
            record,
            f"{period_department.department.name}: {record.student} → "
            f"{dict(DepartmentStatus.choices)[new_status]}."
            + (f" Note: {note}" if note else ""),
            ip_address=ip_address,
        )
    transaction.on_commit(lambda: _notify_decision(item, old_status))
    return item


def reopen_department(item, actor, *, note="", ip_address=None):
    """Take a settled sign-off back into review (approval, refusal or N/A)."""
    period_department = require_verify(actor, item)
    if not item.is_final:
        raise ClearanceWorkflowError("This department has nothing to reopen.")
    note = (note or "").strip()
    if not note:
        raise ClearanceWorkflowError("Say why the decision is being reopened.")
    old_status = item.status
    with transaction.atomic():
        item.status = DepartmentStatus.UNDER_REVIEW
        item.decision_note = note
        item.decided_by = actor
        item.decided_by_name = actor.get_full_name() or actor.username
        item.decided_at = timezone.now()
        item.save()
        record = item.student_clearance
        derive_overall(record)
        log_event(
            record, item, actor, "department_reopened",
            from_status=old_status, to_status=item.status, note=note,
        )
        audit(
            actor, "clearance.department.reopened", record,
            f"{period_department.department.name}: reopened {record.student}'s "
            f"sign-off (was {dict(DepartmentStatus.choices)[old_status]}). {note}",
            ip_address=ip_address,
        )
    transaction.on_commit(lambda: _notify_decision(item, old_status))
    return item


def claim_for_review(item, actor):
    """
    Record that an officer opened a learner's file, and move 'submitted' work
    into 'under review' so two officers do not both believe they are first.

    An office that has nothing in front of it — no handed-in document, a sign-off
    already settled — is left exactly as it is: opening the page is not a
    decision.
    """
    require_verify(actor, item)
    openable = item.status in (
        DepartmentStatus.PENDING_SUBMISSION,
        DepartmentStatus.SUBMITTED,
        DepartmentStatus.UNDER_REVIEW,
        DepartmentStatus.NEEDS_CORRECTION,
    )
    if not openable:
        return item
    waiting = item.submissions.filter(
        status=ClearanceSubmission.Status.SUBMITTED
    ).exists()
    if not waiting and item.status != DepartmentStatus.SUBMITTED:
        return item
    old_status = item.status
    item.status = DepartmentStatus.UNDER_REVIEW
    item.reviewed_count = (item.reviewed_count or 0) + 1
    item.save(update_fields=["status", "reviewed_count", "updated_at"])
    if old_status != item.status:
        derive_overall(item.student_clearance)
    log_event(
        item.student_clearance, item, actor, "department_under_review",
        from_status=old_status, to_status=item.status,
        note="An officer is looking at your submission.",
    )
    return item


# ---------------------------------------------------------------------------
# Document review
# ---------------------------------------------------------------------------

def review_submission(submission, decision, actor, *, note="", ip_address=None):
    """Accept or return one document; the department's own status follows."""
    item = submission.department_clearance
    require_verify(actor, item)
    if decision not in ("accept", "return"):
        raise ClearanceWorkflowError("A document is either accepted or returned.")
    note = (note or "").strip()
    if decision == "return" and not note:
        raise ClearanceWorkflowError("Say what is wrong with the document.")
    if not submission.file:
        raise ClearanceWorkflowError("There is no file on this item to review.")

    old_status = submission.status
    department_was = item.status
    with transaction.atomic():
        submission.status = (
            ClearanceSubmission.Status.ACCEPTED
            if decision == "accept"
            else ClearanceSubmission.Status.RETURNED
        )
        submission.review_note = note
        submission.reviewed_by = actor
        submission.reviewed_at = timezone.now()
        submission.save()

        record = item.student_clearance
        audit(
            actor,
            f"clearance.document.{submission.status}",
            record,
            f"{item.department.name}: {submission.name} for {record.student} → "
            f"{submission.get_status_display()}.",
            ip_address=ip_address,
        )
        if decision == "return" and item.status not in (
            DepartmentStatus.NEEDS_CORRECTION, DepartmentStatus.APPROVED,
        ):
            # Returning a document without telling the learner their department
            # item is blocked would leave them watching a status that never moves.
            from_status = item.status
            item.status = DepartmentStatus.NEEDS_CORRECTION
            item.decision_note = note
            item.decided_by = actor
            item.decided_by_name = actor.get_full_name() or actor.username
            item.decided_at = timezone.now()
            item.save()
            derive_overall(record)
            log_event(
                record, item, actor, "department_needs_correction",
                from_status=from_status, to_status=item.status, note=note,
            )
        log_event(
            record, item, actor, f"document_{submission.status}",
            from_status=old_status, to_status=submission.status,
            note=f"{submission.name}: {note}" if note else submission.name,
        )
    if submission.status == ClearanceSubmission.Status.RETURNED:
        transaction.on_commit(lambda: _notify_decision(item, department_was))
    return submission


# ---------------------------------------------------------------------------
# Obligations
# ---------------------------------------------------------------------------

def create_obligation(item, *, title, detail="", amount=None, is_blocking=True,
                      obligation_type=None, actor=None, ip_address=None):
    """
    Raise a debt against one learner at one department.

    Always a person's decision: nothing here reads a fee ledger or a book
    register and decides the learner owes something.
    """
    require_verify(actor, item)
    title = (title or "").strip()
    if not title:
        raise ClearanceWorkflowError("Describe what the learner owes.")
    if amount is not None and amount < 0:
        raise ClearanceWorkflowError("An obligation cannot be a negative amount.")
    with transaction.atomic():
        obligation = ClearanceObligation.objects.create(
            department_clearance=item,
            obligation_type=obligation_type,
            title=title[:150],
            detail=detail,
            amount=amount,
            is_blocking=is_blocking,
            created_by=actor,
            created_by_name=actor.get_full_name() or actor.username,
        )
        record = item.student_clearance
        if item.status == DepartmentStatus.NOT_STARTED:
            from_status = item.status
            item.status = DepartmentStatus.PENDING_SUBMISSION
            item.save(update_fields=["status", "updated_at"])
            log_event(
                record, item, actor, "department_pending_submission",
                from_status=from_status, to_status=item.status,
            )
        # The debt is part of the learner's standing from the moment it is
        # recorded: a file that was 'ready for final' is not any more.
        derive_overall(record)
        log_event(
            record, item, actor, "obligation_created",
            note=f"{title} is outstanding with {item.department.name}.",
            internal_note=detail,
        )
        audit(
            actor, "clearance.obligation.created", record,
            f"{item.department.name}: recorded “{title}” for {record.student}"
            + (f" (₱{amount})" if amount is not None else "")
            + ("" if is_blocking else " [non-blocking]"),
            ip_address=ip_address,
        )
    transaction.on_commit(lambda: _notify_obligation(obligation))
    return obligation


def update_obligation(obligation, *, actor=None, ip_address=None, **fields):
    """Edit what an officer recorded, keeping the correction in the history."""
    item = obligation.department_clearance
    require_verify(actor, item)
    allowed = ("title", "detail", "amount", "is_blocking")
    changed = {}
    for name in allowed:
        if name in fields and fields[name] is not None:
            new_value = fields[name]
            if name == "title":
                new_value = str(new_value).strip()[:150]
                if not new_value:
                    raise ClearanceWorkflowError("Describe what the learner owes.")
            if name == "amount" and new_value is not None and new_value < 0:
                raise ClearanceWorkflowError("An obligation cannot be a negative amount.")
            if getattr(obligation, name) != new_value:
                changed[name] = new_value
    if not changed:
        return obligation
    with transaction.atomic():
        for name, value in changed.items():
            setattr(obligation, name, value)
        obligation.save()
        record = item.student_clearance
        # Re-editing can move `is_blocking`, which is part of the standing.
        derive_overall(record)
        log_event(
            record, item, actor, "obligation_updated",
            note=f"Updated “{obligation.title}” at {item.department.name}.",
            internal_note="; ".join(f"{k}: {v}" for k, v in changed.items()),
        )
        audit(
            actor, "clearance.obligation.updated", record,
            f"{item.department.name}: updated “{obligation.title}” for "
            f"{record.student}.",
            ip_address=ip_address,
        )
    return obligation


def resolve_obligation(obligation, actor, *, note="", ip_address=None):
    """The learner settled it. The note says how."""
    item = obligation.department_clearance
    require_verify(actor, item)
    if obligation.status != ClearanceObligation.Status.OPEN:
        raise ClearanceWorkflowError("This obligation is already closed.")
    note = (note or "").strip()
    if not note:
        raise ClearanceWorkflowError("Record how the obligation was settled.")
    old_status = obligation.status
    with transaction.atomic():
        obligation.status = ClearanceObligation.Status.RESOLVED
        obligation.resolution_note = note
        obligation.resolved_by = actor
        obligation.resolved_at = timezone.now()
        obligation.save()
        record = item.student_clearance
        derive_overall(record)
        log_event(
            record, item, actor, "obligation_resolved",
            from_status=old_status, to_status=obligation.status,
            note=f"“{obligation.title}” is settled at {item.department.name}.",
            internal_note=note,
        )
        audit(
            actor, "clearance.obligation.resolved", record,
            f"{item.department.name}: “{obligation.title}” resolved for "
            f"{record.student}. {note}",
            ip_address=ip_address,
        )
    return obligation


def waive_obligation(obligation, actor, *, reason="", ip_address=None):
    """
    The school lets it go.

    The reason and the officer are permanent parts of the row — a waiver with no
    author is the audit failure this feature exists to prevent.
    """
    item = obligation.department_clearance
    require_verify(actor, item)
    if obligation.status != ClearanceObligation.Status.OPEN:
        raise ClearanceWorkflowError("Only an outstanding obligation can be waived.")
    reason = (reason or "").strip()
    if not reason:
        raise ClearanceWorkflowError("A waiver needs the reason for waiving it.")
    old_status = obligation.status
    with transaction.atomic():
        obligation.status = ClearanceObligation.Status.WAIVED
        obligation.waiver_reason = reason
        obligation.waived_by = actor
        obligation.waived_at = timezone.now()
        obligation.save()
        record = item.student_clearance
        derive_overall(record)
        log_event(
            record, item, actor, "obligation_waived",
            from_status=old_status, to_status=obligation.status,
            note=f"“{obligation.title}” was waived by {item.department.name}.",
            internal_note=reason,
        )
        audit(
            actor, "clearance.obligation.waived", record,
            f"{item.department.name}: “{obligation.title}” waived for "
            f"{record.student} by {actor.get_full_name() or actor.username}. "
            f"Reason: {reason}",
            ip_address=ip_address,
        )
    return obligation


def reopen_obligation(obligation, actor, *, note="", ip_address=None):
    """Bring a resolved or waived obligation back outstanding."""
    item = obligation.department_clearance
    require_verify(actor, item)
    if obligation.status == ClearanceObligation.Status.OPEN:
        raise ClearanceWorkflowError("This obligation is already outstanding.")
    note = (note or "").strip()
    if not note:
        raise ClearanceWorkflowError("Say why the obligation is reopened.")
    old_status = obligation.status
    with transaction.atomic():
        obligation.status = ClearanceObligation.Status.OPEN
        obligation.resolved_by = None
        obligation.resolved_at = None
        obligation.waived_by = None
        obligation.waived_at = None
        obligation.resolution_note = ""
        obligation.waiver_reason = ""
        obligation.save()
        record = item.student_clearance
        derive_overall(record)
        log_event(
            record, item, actor, "obligation_reopened",
            from_status=old_status, to_status=obligation.status,
            note=f"“{obligation.title}” is outstanding again.",
            internal_note=note,
        )
        audit(
            actor, "clearance.obligation.reopened", record,
            f"{item.department.name}: “{obligation.title}” reopened for "
            f"{record.student}. {note}",
            ip_address=ip_address,
        )
    transaction.on_commit(lambda: _notify_obligation(obligation))
    return obligation


# ---------------------------------------------------------------------------
# Final approval
# ---------------------------------------------------------------------------

def final_approval_blockers(record):
    """
    Every reason the Registrar cannot certify this learner yet, as plain sentences.

    Computed, never cached: the checks run again inside ``finalize_clearance()``
    in the same transaction that writes the decision, so a queue that moved while
    the review page sat open is caught rather than approved over.
    """
    blockers = []

    if record.overall_status == ClearanceStatus.CLEARED:
        blockers.append("This learner is already cleared.")

    if not record.period.accepts_actions:
        blockers.append("The clearance period is not active.")

    if not is_in_population(record):
        blockers.append(
            "This learner is no longer part of the population this period covers."
        )

    items = list(record.departments.select_related("period_department", "department"))
    if not items:
        blockers.append("No clearance departments are configured for this period.")

    for item in items:
        if not item.period_department.is_required:
            continue
        if item.status == DepartmentStatus.APPROVED:
            continue
        if item.status == DepartmentStatus.NOT_APPLICABLE:
            continue
        if item.status == DepartmentStatus.REJECTED:
            blockers.append(
                f"{item.department.name} refused this learner: "
                f"{item.decision_note or 'no reason recorded'}"
            )
        else:
            blockers.append(
                f"{item.department.name} has not signed off yet "
                f"({item.get_status_display().lower()})."
            )

    for submission in unaccepted_documents(record):
        blockers.append(
            f"{submission.name} at {submission.department_clearance.department.name} "
            "still needs verification."
        )

    for obligation in outstanding_blockers(record):
        amount = f" of ₱{obligation.amount}" if obligation.amount is not None else ""
        blockers.append(
            f"Outstanding obligation at {obligation.department_clearance.department.name}"
            f"{amount}: {obligation.title}"
        )

    return blockers


def finalize_clearance(record, actor, *, note="", ip_address=None):
    """
    The Registrar's decision: mark the learner cleared, number the certificate.

    All checks re-run here before the write, the reference is drawn from
    ``secrets`` so two clerks cannot collide on one number, and an existing
    reference is reused rather than reissued — a certificate already printed for
    this learner must stay valid.
    """
    require_finalizer(actor)
    with transaction.atomic():
        locked = StudentClearance.objects.select_for_update().get(pk=record.pk)
        blockers = final_approval_blockers(locked)
        # 'already cleared' is the one blocker that is not a refusal.
        if any("already cleared" in b for b in blockers):
            return locked
        if blockers:
            raise ClearanceWorkflowError(" ".join(blockers))

        reference = _new_reference(locked.period)
        now = timezone.now()
        locked.reference = reference
        locked.cleared_at = now
        locked.cleared_by = actor
        locked.overall_status = ClearanceStatus.CLEARED
        locked.final_note = (note or "").strip()
        locked.save()

        log_event(
            locked, None, actor, "cleared", to_status=ClearanceStatus.CLEARED,
            note="Your clearance is complete. Download your certificate.",
            internal_note=locked.final_note,
        )
        audit(
            actor, "clearance.finalized", locked,
            f"Cleared {locked.student} for '{locked.period.name}' "
            f"(reference {reference}).",
            ip_address=ip_address,
        )
    transaction.on_commit(lambda: _notify_cleared(locked))
    return locked


def revoke_clearance(record, actor, *, reason="", ip_address=None):
    """
    Withdraw a certificate — a school's way of saying the decision was wrong.

    The reference is kept so anyone checking an already-printed certificate can
    still resolve it to this learner. 'Not cleared' is stated rather than
    re-derived, for the same reason 'cleared' is: every department may still
    read approved while the Registrar's signature stands withdrawn.
    """
    require_finalizer(actor)
    if record.overall_status != ClearanceStatus.CLEARED:
        raise ClearanceWorkflowError("This learner is not cleared.")
    reason = (reason or "").strip()
    if not reason:
        raise ClearanceWorkflowError("Record why the clearance is withdrawn.")
    with transaction.atomic():
        locked = StudentClearance.objects.select_for_update().get(pk=record.pk)
        locked.overall_status = ClearanceStatus.NOT_CLEARED
        locked.cleared_at = None
        locked.cleared_by = None
        locked.final_note = reason
        locked.save()
        log_event(
            locked, None, actor, "clearance_revoked",
            from_status=ClearanceStatus.CLEARED,
            to_status=ClearanceStatus.NOT_CLEARED,
            note="Your clearance has been withdrawn. Contact the Registrar.",
            internal_note=reason,
        )
        audit(
            actor, "clearance.revoked", locked,
            f"Withdrew clearance of {locked.student} for '{locked.period.name}' "
            f"({locked.reference}). Reason: {reason}",
            ip_address=ip_address,
        )
    return locked


def _new_reference(period):
    """
    CNH-<period id>-<10 hex>: unique, and not a row counter a learner can walk.
    """
    for _attempt in range(5):
        candidate = f"CNH-{period.pk}-{secrets.token_hex(5).upper()}"
        if not StudentClearance.objects.filter(reference=candidate).exists():
            return candidate
    raise ClearanceWorkflowError(
        "Could not allocate a clearance reference. Try again."
    )


# ---------------------------------------------------------------------------
# Monitoring figures
# ---------------------------------------------------------------------------

def progress_percent(record):
    """How far along this learner is, 0-100, for the progress bars."""
    items = list(record.departments.select_related("period_department"))
    if record.overall_status == ClearanceStatus.CLEARED:
        return 100
    # A period staffed only by optional departments is still a period the learner
    # has to work through, so the bar follows the same 'required, else everything'
    # rule the reports use.
    required = [i for i in items if i.period_department.is_required] or items
    if not required:
        return 0
    settled = sum(1 for i in required if i.is_settled)
    # A learner who is ready for the Registrar's signature is not yet done: the
    # final step is worth the last share of the bar.
    base = round(settled / len(required) * 90)
    return min(99, base)


def period_dashboard(period):
    """
    Real monitoring figures for one period, in the few queries the screen needs.

    Department rows are grouped once rather than counted per department because
    the same figure drives both the department table and the completion donut.
    """
    records = StudentClearance.objects.filter(period=period)
    status_counts = {
        row["overall_status"]: row["total"]
        for row in records.values("overall_status").annotate(total=Count("id"))
    }
    total = records.count()
    cleared = status_counts.get(ClearanceStatus.CLEARED, 0)
    ready = status_counts.get(ClearanceStatus.READY_FOR_FINAL, 0)
    rejected = status_counts.get(ClearanceStatus.NOT_CLEARED, 0)
    in_progress = sum(
        status_counts.get(status, 0)
        for status in (
            ClearanceStatus.IN_PROGRESS, ClearanceStatus.PENDING_DEPARTMENT
        )
    )

    # One grouped query for every office rather than six each: the same figures
    # drive the department table and the completion donut, and a period with
    # eight offices should not cost fifty queries to read out.
    counted = {
        row["period_department_id"]: row
        for row in DepartmentClearance.objects.filter(
            period_department__period=period
        ).values("period_department_id").annotate(
            total=Count("id"),
            approved=Count("id", filter=Q(status=DepartmentStatus.APPROVED)),
            not_applicable=Count(
                "id", filter=Q(status=DepartmentStatus.NOT_APPLICABLE)),
            needs_correction=Count(
                "id", filter=Q(status=DepartmentStatus.NEEDS_CORRECTION)),
            rejected=Count("id", filter=Q(status=DepartmentStatus.REJECTED)),
        )
    }
    department_rows = []
    for period_department in period.departments.select_related("department"):
        row = counted.get(period_department.pk, {})
        total_items = row.get("total", 0)
        approved = row.get("approved", 0)
        not_applicable = row.get("not_applicable", 0)
        needs_correction = row.get("needs_correction", 0)
        rejected = row.get("rejected", 0)
        signed_off = approved + not_applicable
        department_rows.append({
            "id": period_department.pk,
            "department": str(period_department.department),
            "is_required": period_department.is_required,
            "total": total_items,
            "approved": approved,
            "not_applicable": not_applicable,
            # Whatever is neither settled, refused nor waiting on the learner.
            "pending": total_items - signed_off - needs_correction - rejected,
            "needs_correction": needs_correction,
            "rejected": rejected,
            "percent": round(signed_off / total_items * 100) if total_items else 0,
        })

    obligations = ClearanceObligation.objects.filter(
        department_clearance__student_clearance__period=period
    )
    open_obligations = obligations.filter(
        status=ClearanceObligation.Status.OPEN).count()
    waived = obligations.filter(
        status=ClearanceObligation.Status.WAIVED).count()

    return {
        "total": total,
        "cleared": cleared,
        "ready_for_final": ready,
        "in_progress": in_progress,
        "not_cleared": rejected,
        "completion_percent": round(cleared / total * 100) if total else 0,
        "by_status": status_counts,
        "departments": department_rows,
        "open_obligations": open_obligations,
        "waived_obligations": waived,
    }


def deadline_watch(period, *, within_days=7):
    """
    Learners with work still open as the closing date approaches.

    Only a period that has not yet closed can have anyone nearing a deadline, so
    an expired period is reported as empty rather than as a list of people the
    school can no longer help.    """
    now = timezone.now()
    if period.closes_at <= now or period.status != ClearancePeriod.Status.ACTIVE:
        return []
    horizon = min(period.closes_at, now + timedelta(days=within_days))
    # The statuses where an office still holds the learner — the same list the
    # rows below read back, so a learner is never listed for a sign-off that has
    # already been given.
    still_open = [
        DepartmentStatus.NOT_STARTED,
        DepartmentStatus.PENDING_SUBMISSION,
        DepartmentStatus.SUBMITTED,
        DepartmentStatus.UNDER_REVIEW,
        DepartmentStatus.NEEDS_CORRECTION,
    ]
    open_records = (
        StudentClearance.objects.filter(
            period=period,
            overall_status__in=[
                ClearanceStatus.IN_PROGRESS,
                ClearanceStatus.PENDING_DEPARTMENT,
            ],
            departments__status__in=still_open,
        )
        .filter(
            Q(departments__period_department__deadline__isnull=True)
            | Q(departments__period_department__deadline__lte=horizon)
        )
        .distinct()
        .order_by("student__user__last_name")[:200]
        .select_related("student__user")
        .prefetch_related("departments__period_department")
    )
    rows = []
    for record in open_records:
        # The countdown a watcher acts on is this learner's own nearest open
        # deadline, not the period's closing date: they are on the list because
        # one particular office is due, and an office with no deadline of its
        # own falls back to the period closing.
        outstanding = [
            item.period_department.deadline or period.closes_at
            for item in record.departments.all()
            if item.status in still_open
        ]
        remaining = min(outstanding) - now
        rows.append({
            "id": record.pk,
            "learner": record.student.user.get_full_name(),
            "section": record.section_name,
            "grade_level": str(record.grade_level or ""),
            "status": record.overall_status,
            # Part of a day left still counts as a day to act in — truncating
            # would tell the office tomorrow is already too late.
            "days_left": max(0, remaining.days + (1 if remaining.seconds else 0)),
        })
    return rows


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
#
# Written after commit, through the shared helpers in core/notifications.py, so
# a bell or email failure can never unwind a decision an officer already made.

def _notify_assigned(record):
    from .notifications import notify_clearance_assigned

    notify_clearance_assigned(record)


def _notify_decision(item, previous_status):
    from .notifications import notify_clearance_decision

    notify_clearance_decision(item, previous_status)


def _notify_obligation(obligation):
    from .notifications import notify_clearance_obligation

    notify_clearance_obligation(obligation)


def _notify_cleared(record):
    from .notifications import notify_clearance_cleared

    notify_clearance_cleared(record)
