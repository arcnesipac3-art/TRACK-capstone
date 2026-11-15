"""
TRACK — Digital Clearance serializers.

Three families, because three audiences read the same rows:

  * configuration — what an administrator sets up. `status` on a period is
    deliberately absent from the writable fields: a period is activated,
    deactivated and archived through the workflow endpoints, never by a PATCH
    that could also skip provisioning.
  * officer — the department queue. Carries the learner's identity and the
    staff-only `internal_note` history.
  * learner — the student/parent portal. Same record, minus anything that is not
    theirs: no internal notes, no officer names beyond the one who signed their
    own item, no other learner.

Computed figures (progress, counts) are derived from the rows on every read
rather than stored, so a screen can never show a number the workflow would
disagree with.
"""

from rest_framework import serializers

from .models import (
    ClearanceEvent,
    ClearanceObligation,
    ClearancePeriod,
    ClearanceRequirement,
    ClearanceStatus,
    ClearanceStudentCategory,
    ClearanceSubmission,
    DepartmentClearance,
    DepartmentStatus,
    ObligationType,
    PeriodDepartment,
    StudentClearance,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class ClearancePeriodSerializer(serializers.ModelSerializer):
    """One clearance period, as its owner configures it."""

    type_label = serializers.CharField(read_only=True)
    semester_label = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    department_count = serializers.SerializerMethodField()
    learner_count = serializers.SerializerMethodField()
    cleared_count = serializers.SerializerMethodField()
    grade_level_ids = serializers.PrimaryKeyRelatedField(
        source="grade_levels", many=True, required=False, read_only=True
    )
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClearancePeriod
        fields = [
            "id", "name", "school_year", "school_year_label", "semester",
            "semester_label", "clearance_type", "type_label", "custom_type_label",
            "status", "status_label", "opens_at", "closes_at", "instructions",
            "grade_levels", "grade_level_ids", "categories",
            "department_count", "learner_count", "cleared_count",
            "created_by_name", "activated_at", "created_at", "updated_at",
        ]
        # `status` is read-only here on purpose — see the module docstring. The
        # lifecycle endpoints in core/clearance_views.py are the only writers.
        read_only_fields = [
            "id", "status", "activated_at", "created_at", "updated_at",
        ]

    def get_semester_label(self, period):
        if not period.semester:
            return "Whole school year"
        return period.get_semester_display()

    def get_department_count(self, period):
        return period.departments.filter(is_active=True).count()

    def get_learner_count(self, period):
        return period.clearances.count()

    def get_cleared_count(self, period):
        return period.clearances.filter(
            overall_status=ClearanceStatus.CLEARED
        ).count()

    def get_created_by_name(self, period):
        if not period.created_by:
            return ""
        return period.created_by.get_full_name() or period.created_by.username

    def validate(self, attrs):
        opens = attrs.get("opens_at", getattr(self.instance, "opens_at", None))
        closes = attrs.get("closes_at", getattr(self.instance, "closes_at", None))
        if opens and closes and opens >= closes:
            raise serializers.ValidationError(
                {"closes_at": "The closing date must be after the opening date."}
            )
        clearance_type = attrs.get(
            "clearance_type", getattr(self.instance, "clearance_type", "")
        )
        custom = attrs.get(
            "custom_type_label", getattr(self.instance, "custom_type_label", "")
        )
        if clearance_type == "custom" and not (custom or "").strip():
            raise serializers.ValidationError(
                {"custom_type_label": "Name the custom clearance period."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["created_by"] = getattr(request, "user", None)
        return super().create(validated_data)


class PeriodDepartmentSerializer(serializers.ModelSerializer):
    """One existing department taking part in one period."""

    department_name = serializers.CharField(source="department.name", read_only=True)
    department_code = serializers.CharField(source="department.code", read_only=True)
    personnel = serializers.SerializerMethodField()
    responsible_person_name = serializers.SerializerMethodField()
    requirement_count = serializers.SerializerMethodField()
    learner_count = serializers.SerializerMethodField()
    period_status = serializers.CharField(
        source="period.status", read_only=True
    )

    class Meta:
        model = PeriodDepartment
        fields = [
            "id", "period", "period_status", "department", "department_name",
            "department_code", "responsible_person", "responsible_person_name",
            "personnel", "instructions", "deadline", "is_required", "is_active",
            "position", "requirement_count", "learner_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "period", "created_at", "updated_at"]

    def get_personnel(self, obj):
        """The officers whose queue this is — the existing department members."""
        return [
            {
                "id": user.pk,
                "name": user.get_full_name() or user.username,
                "username": user.username,
            }
            for user in obj.department.administrators.filter(
                is_active=True
            ).order_by("last_name", "first_name")
        ]

    def get_responsible_person_name(self, obj):
        if not obj.responsible_person:
            return ""
        return obj.responsible_person.get_full_name() or obj.responsible_person.username

    def get_requirement_count(self, obj):
        return obj.requirements.filter(is_active=True).count()

    def get_learner_count(self, obj):
        return obj.items.count()

    def validate_department(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "That department is deactivated. Reactivate it in Departments & "
                "Roles before adding it to a clearance period."
            )
        return value

    def validate(self, attrs):
        # `period` is read-only here (the URL owns it), so on create the serialiser
        # is told which period through its context — otherwise the duplicate check
        # below never runs and the unique constraint answers with a 500.
        period = (
            self.instance.period
            if self.instance
            else attrs.get("period") or self.context.get("period")
        )
        department = attrs.get("department", getattr(self.instance, "department", None))
        if period and department and period.departments.filter(
            department=department
        ).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError(
                {"department": "That department is already part of this period."}
            )
        return attrs


class ClearanceRequirementSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(
        source="period_department.department.name", read_only=True
    )
    period = serializers.IntegerField(
        source="period_department.period_id", read_only=True
    )

    class Meta:
        model = ClearanceRequirement
        fields = [
            "id", "period_department", "period", "department_name", "name",
            "description", "is_required", "needs_review", "allows_upload",
            "is_active", "position", "created_at", "updated_at",
        ]
        # The department comes from the URL it was created under and stays there:
        # re-parenting a requirement would silently move every learner's slot
        # under another office's checklist.
        read_only_fields = ["id", "period_department", "created_at", "updated_at"]


class ClearanceStudentCategorySerializer(serializers.ModelSerializer):
    """A learner label the school uses to decide who a period covers."""

    learner_count = serializers.SerializerMethodField()
    learner_ids = serializers.PrimaryKeyRelatedField(
        source="learners", many=True, required=False, read_only=True
    )

    class Meta:
        model = ClearanceStudentCategory
        fields = [
            "id", "name", "code", "description", "is_active", "position",
            "learner_count", "learners", "learner_ids", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_learner_count(self, obj):
        return obj.learners.count()


class ObligationTypeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = ObligationType
        fields = [
            "id", "department", "department_name", "name", "description",
            "is_blocking", "is_active", "position", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ---------------------------------------------------------------------------
# Officer side
# ---------------------------------------------------------------------------

class ClearanceEventSerializer(serializers.ModelSerializer):
    """Full history — staff only, internal notes included."""

    class Meta:
        model = ClearanceEvent
        fields = [
            "id", "action", "from_status", "to_status", "note", "internal_note",
            "actor_name", "department_clearance", "created_at",
        ]


class ClearanceActivitySerializer(serializers.ModelSerializer):
    """
    The school-wide activity feed: which learner moved, where, and who did it.

    This is the lean sibling of ``ClearanceEventSerializer``. The feed sits in
    the context column where an officer may have a learner standing beside
    them, so it carries the learner's name and nothing an office wrote for
    itself — ``internal_note`` stays in the per-record history, which asks for
    its own permission.
    """

    learner = serializers.CharField(
        source="student_clearance.student.user.get_full_name", read_only=True
    )
    department = serializers.SerializerMethodField()

    class Meta:
        model = ClearanceEvent
        fields = [
            "id", "action", "from_status", "to_status", "note", "actor_name",
            "learner", "department", "created_at",
        ]

    def get_department(self, obj):
        item = obj.department_clearance
        return item.department.name if item else None


class ClearanceObligationSerializer(serializers.ModelSerializer):
    department = serializers.CharField(
        source="department_clearance.department.name", read_only=True
    )
    department_clearance = serializers.PrimaryKeyRelatedField(read_only=True)
    learner = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(read_only=True)
    resolved_by_name = serializers.SerializerMethodField()
    waived_by_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ClearanceObligation
        fields = [
            "id", "department_clearance", "department", "learner",
            "obligation_type", "title", "detail", "amount", "is_blocking",
            "status", "status_label", "created_by_name", "created_at",
            "resolved_by_name", "resolved_at", "resolution_note",
            "waived_by_name", "waived_at", "waiver_reason",
        ]
        # Only creation accepts a title/amount; closing one is an action with its
        # own endpoint so the reason and the officer are always recorded.
        read_only_fields = [
            "id", "status", "created_by_name", "created_at", "resolved_by_name",
            "resolved_at", "resolution_note", "waived_by_name", "waived_at",
            "waiver_reason",
        ]

    def get_learner(self, obj):
        user = obj.department_clearance.student_clearance.student.user
        return user.get_full_name() or user.username

    def get_resolved_by_name(self, obj):
        if not obj.resolved_by:
            return ""
        return obj.resolved_by.get_full_name() or obj.resolved_by.username

    def get_waived_by_name(self, obj):
        if not obj.waived_by:
            return ""
        return obj.waived_by.get_full_name() or obj.waived_by.username


class ClearanceSubmissionSerializer(serializers.ModelSerializer):
    """A requirement's document, as an officer sees it."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = ClearanceSubmission
        fields = [
            "id", "name", "is_required", "position", "status", "status_label",
            "revision", "original_filename", "has_file", "submitted_at",
            "reviewed_at", "reviewed_by_name", "review_note",
        ]

    def get_has_file(self, obj):
        return bool(obj.file)

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return ""
        return obj.reviewed_by.get_full_name() or obj.reviewed_by.username


class DepartmentClearanceListSerializer(serializers.ModelSerializer):
    """One row of a department's verification queue."""

    learner = serializers.SerializerMethodField()
    lrn = serializers.CharField(source="student_clearance.student.lrn", read_only=True)
    section = serializers.CharField(
        source="student_clearance.section_name", read_only=True
    )
    grade_level = serializers.SerializerMethodField()
    department_name = serializers.CharField(source="department.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    overall_status = serializers.CharField(
        source="student_clearance.overall_status", read_only=True
    )
    deadline = serializers.DateTimeField(
        source="period_department.deadline", read_only=True
    )
    outstanding_obligations = serializers.SerializerMethodField()
    awaiting_document = serializers.SerializerMethodField()

    class Meta:
        model = DepartmentClearance
        fields = [
            "id", "department", "department_name", "learner", "lrn", "section",
            "grade_level", "status", "status_label", "overall_status", "deadline",
            "decision_note", "decided_by_name", "decided_at",
            "outstanding_obligations", "awaiting_document", "updated_at",
        ]

    def get_grade_level(self, obj):
        return str(obj.student_clearance.grade_level or "")

    def get_learner(self, obj):
        user = obj.student_clearance.student.user
        return user.get_full_name() or user.username

    def get_outstanding_obligations(self, obj):
        return obj.obligations.filter(
            status=ClearanceObligation.Status.OPEN
        ).count()

    def get_awaiting_document(self, obj):
        return obj.submissions.filter(
            is_required=True,
            requirement__needs_review=True,
            status=ClearanceSubmission.Status.SUBMITTED,
        ).exists()


class DepartmentClearanceDetailSerializer(DepartmentClearanceListSerializer):
    """The officer's full view of one learner at one department."""

    period = serializers.IntegerField(
        source="student_clearance.period_id", read_only=True
    )
    period_name = serializers.CharField(
        source="student_clearance.period.name", read_only=True
    )
    instructions = serializers.CharField(
        source="period_department.instructions", read_only=True
    )
    is_required = serializers.BooleanField(
        source="period_department.is_required", read_only=True
    )
    submissions = ClearanceSubmissionSerializer(many=True, read_only=True)
    obligations = ClearanceObligationSerializer(many=True, read_only=True)
    events = ClearanceEventSerializer(many=True, read_only=True)

    class Meta(DepartmentClearanceListSerializer.Meta):
        fields = DepartmentClearanceListSerializer.Meta.fields + [
            "period", "period_name", "instructions", "is_required",
            "requirement_snapshot", "reviewed_count", "submissions",
            "obligations", "events",
        ]


class StudentClearanceListSerializer(serializers.ModelSerializer):
    """One row of the monitoring table."""

    learner = serializers.SerializerMethodField()
    lrn = serializers.CharField(source="student.lrn", read_only=True)
    grade_level = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_overall_status_display", read_only=True)
    period_name = serializers.CharField(source="period.name", read_only=True)
    progress = serializers.SerializerMethodField()
    settled = serializers.SerializerMethodField()
    outstanding_obligations = serializers.SerializerMethodField()

    class Meta:
        model = StudentClearance
        fields = [
            "id", "period", "period_name", "learner", "lrn", "grade_level",
            "section_name", "overall_status", "status_label", "progress",
            "settled", "outstanding_obligations", "reference", "cleared_at",
            "updated_at",
        ]

    def get_grade_level(self, obj):
        # The snapshot is nullable (a learner with neither an enrollment nor a
        # section when the period ran), and a monitoring row without the key is
        # worse than one that says nothing.
        return str(obj.grade_level or "")

    def get_progress(self, obj):
        value = getattr(obj, "_progress", None)
        return _progress_of(obj) if value is None else value

    def get_learner(self, obj):
        user = obj.student.user
        return user.get_full_name() or user.username

    def get_settled(self, obj):
        required = obj.departments.filter(period_department__is_required=True)
        return required.count() == required.filter(
            status__in=[DepartmentStatus.APPROVED, DepartmentStatus.NOT_APPLICABLE]
        ).count()

    def get_outstanding_obligations(self, obj):
        return ClearanceObligation.objects.filter(
            department_clearance__student_clearance=obj,
            status=ClearanceObligation.Status.OPEN,
        ).count()


def _progress_of(record):
    """The one-call-per-row version, used when a view did not pre-compute."""
    from .clearance import progress_percent

    return progress_percent(record)


class StudentClearanceDetailSerializer(StudentClearanceListSerializer):
    """Staff view of one learner's whole clearance."""

    departments = serializers.SerializerMethodField()
    obligations = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    blockers = serializers.SerializerMethodField()
    can_finalize = serializers.SerializerMethodField()
    cleared_by_name = serializers.SerializerMethodField()
    has_certificate = serializers.SerializerMethodField()

    class Meta(StudentClearanceListSerializer.Meta):
        fields = StudentClearanceListSerializer.Meta.fields + [
            "cleared_by_name", "final_note", "created_at", "departments",
            "obligations", "events", "blockers", "can_finalize",
            "has_certificate",
        ]

    def get_has_certificate(self, obj):
        return bool(obj.reference and obj.overall_status == ClearanceStatus.CLEARED)

    def get_cleared_by_name(self, obj):
        if not obj.cleared_by:
            return ""
        return obj.cleared_by.get_full_name() or obj.cleared_by.username

    def get_departments(self, obj):
        items = obj.departments.select_related(
            "department", "period_department", "decided_by"
        )
        return DepartmentClearanceListSerializer(
            items, many=True, context=self.context
        ).data

    def get_obligations(self, obj):
        return ClearanceObligationSerializer(
            ClearanceObligation.objects.filter(
                department_clearance__student_clearance=obj
            ).select_related(
                "department_clearance__department",
                "department_clearance__student_clearance__student__user",
            ),
            many=True,
        ).data

    def get_events(self, obj):
        return ClearanceEventSerializer(
            obj.events.select_related("actor")[:200], many=True
        ).data

    def get_blockers(self, obj):
        from .clearance import final_approval_blockers

        return final_approval_blockers(obj)

    def get_can_finalize(self, obj):
        """Whether this requester could clear the learner right now — the page
        offers the button, the workflow still decides when it is clicked."""
        from .clearance import final_approval_blockers

        user = self.context["request"].user
        if not (user.is_admin and user.has_perm_key("clearance.finalize")):
            return False
        return not final_approval_blockers(obj)


# ---------------------------------------------------------------------------
# Learner / parent side
# ---------------------------------------------------------------------------

class LearnerSubmissionSerializer(serializers.ModelSerializer):
    """The learner's own view of one document slot."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    has_file = serializers.SerializerMethodField()
    needs_review = serializers.BooleanField(
        source="requirement.needs_review", read_only=True
    )
    allows_upload = serializers.BooleanField(
        source="requirement.allows_upload", read_only=True
    )
    description = serializers.CharField(source="requirement.description", read_only=True)

    class Meta:
        model = ClearanceSubmission
        fields = [
            "id", "name", "description", "is_required", "needs_review",
            "allows_upload", "status", "status_label", "revision",
            "original_filename", "has_file", "submitted_at", "review_note",
        ]

    def get_has_file(self, obj):
        return bool(obj.file)


class LearnerDepartmentSerializer(serializers.ModelSerializer):
    """One department's card on the learner's clearance page."""

    name = serializers.CharField(source="department.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    instructions = serializers.CharField(
        source="period_department.instructions", read_only=True
    )
    is_required = serializers.BooleanField(
        source="period_department.is_required", read_only=True
    )
    deadline = serializers.DateTimeField(
        source="period_department.deadline", read_only=True
    )
    responsible_person_name = serializers.SerializerMethodField()
    submissions = LearnerSubmissionSerializer(many=True, read_only=True)
    obligations = serializers.SerializerMethodField()

    class Meta:
        model = DepartmentClearance
        fields = [
            "id", "name", "status", "status_label", "instructions", "is_required",
            "deadline", "responsible_person_name", "decision_note", "decided_at",
            "submissions", "obligations",
        ]

    def get_responsible_person_name(self, obj):
        person = obj.period_department.responsible_person
        if not person:
            return ""
        return person.get_full_name() or person.username

    def get_obligations(self, obj):
        # The learner sees what is outstanding and its amount — never who
        # decided to waive it or what they wrote internally.
        return [
            {
                "id": obligation.pk,
                "title": obligation.title,
                "detail": obligation.detail,
                "amount": str(obligation.amount) if obligation.amount is not None else None,
                "status": obligation.status,
                "status_label": obligation.get_status_display(),
                "is_blocking": obligation.is_blocking,
            }
            for obligation in obj.obligations.all()
        ]


class LearnerClearanceSerializer(serializers.ModelSerializer):
    """A learner's (or a guardian's) view of one clearance period."""

    period_name = serializers.CharField(source="period.name", read_only=True)
    period_status = serializers.CharField(source="period.status", read_only=True)
    type_label = serializers.CharField(source="period.type_label", read_only=True)
    school_year_label = serializers.CharField(
        source="period.school_year.label", read_only=True
    )
    semester_label = serializers.SerializerMethodField()
    instructions = serializers.CharField(source="period.instructions", read_only=True)
    opens_at = serializers.DateTimeField(source="period.opens_at", read_only=True)
    closes_at = serializers.DateTimeField(source="period.closes_at", read_only=True)
    learner = serializers.SerializerMethodField()
    lrn = serializers.CharField(source="student.lrn", read_only=True)
    grade_level = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_overall_status_display", read_only=True)
    progress = serializers.SerializerMethodField()
    departments = serializers.SerializerMethodField()
    pending_count = serializers.SerializerMethodField()
    can_download_certificate = serializers.BooleanField(read_only=True)
    viewed_as = serializers.SerializerMethodField()

    class Meta:
        model = StudentClearance
        fields = [
            "id", "period", "period_name", "period_status", "type_label",
            "school_year_label", "semester_label", "instructions", "opens_at",
            "closes_at", "learner", "lrn", "grade_level", "section_name",
            "overall_status", "status_label", "progress", "pending_count",
            "departments", "reference", "cleared_at", "final_note",
            "can_download_certificate", "viewed_as",
        ]

    def get_semester_label(self, obj):
        if not obj.period.semester:
            return "Whole school year"
        return obj.period.get_semester_display()

    def get_learner(self, obj):
        user = obj.student.user
        return user.get_full_name() or user.username

    def get_grade_level(self, obj):
        return str(obj.grade_level or "")

    def get_progress(self, obj):
        value = getattr(obj, "_progress", None)
        return _progress_of(obj) if value is None else value

    def get_departments(self, obj):
        items = obj.departments.select_related(
            "department", "period_department", "period_department__responsible_person"
        ).prefetch_related("submissions__requirement", "obligations")
        return LearnerDepartmentSerializer(items, many=True).data

    def get_pending_count(self, obj):
        return obj.departments.exclude(
            status__in=[
                DepartmentStatus.APPROVED, DepartmentStatus.NOT_APPLICABLE
            ]
        ).count()

    def get_viewed_as(self, obj):
        """Whether this is the learner's own record or a guardian's read of a
        child's — the page says so rather than implying the reader is the learner."""
        user = self.context["request"].user
        return "self" if obj.student.user_id == user.pk else "guardian"


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

class DepartmentDecisionSerializer(serializers.Serializer):
    """An officer's decision on one learner. The note is the learner's message."""

    STATUS_CHOICES = [
        (DepartmentStatus.APPROVED, DepartmentStatus.APPROVED),
        (DepartmentStatus.REJECTED, DepartmentStatus.REJECTED),
        (DepartmentStatus.NEEDS_CORRECTION, DepartmentStatus.NEEDS_CORRECTION),
        (DepartmentStatus.NOT_APPLICABLE, DepartmentStatus.NOT_APPLICABLE),
        (DepartmentStatus.UNDER_REVIEW, DepartmentStatus.UNDER_REVIEW),
    ]

    status = serializers.ChoiceField(choices=STATUS_CHOICES)
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, trim_whitespace=True
    )
    internal_note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, trim_whitespace=True
    )

    def validate_status(self, value):
        # `submitted` and `not_started` are the workflow's, not an officer's.
        if value == DepartmentStatus.SUBMITTED:
            raise serializers.ValidationError(
                "A learner's submission sets that status, not an officer."
            )
        return value


class ReopenSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=2000, trim_whitespace=True)


class SubmissionReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=[("accept", "accept"), ("return", "return")])
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, trim_whitespace=True
    )


class ObligationCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=150)
    detail = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, trim_whitespace=True
    )
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0
    )
    is_blocking = serializers.BooleanField(required=False, default=True)
    obligation_type = serializers.PrimaryKeyRelatedField(
        queryset=ObligationType.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )


class ObligationActionSerializer(serializers.Serializer):
    """Resolve, waive or reopen — each one needs its reason."""

    action = serializers.ChoiceField(
        choices=[
            ("resolve", "resolve"),
            ("waive", "waive"),
            ("reopen", "reopen"),
            ("update", "update"),
        ]
    )
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, trim_whitespace=True,
        help_text="How it was settled / why it was waived / why it is reopened.",
    )
    title = serializers.CharField(required=False, allow_blank=True, max_length=150)
    detail = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0
    )
    is_blocking = serializers.BooleanField(required=False)


class FinalizeSerializer(serializers.Serializer):
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, trim_whitespace=True
    )


class LearnerActionSerializer(serializers.Serializer):
    """Staff adding one learner to a running period."""

    student = serializers.IntegerField()
