"""
TRACK — Enrollment & Admissions serializers.

Applicant-facing serializers never leak staff-only data (internal notes,
reviewer identity, other applicants). Staff serializers add the full picture.
Workflow state changes never ride in through serializer fields — every status
move goes through core/enrollment.py's state machine in the views.
"""

from django.urls import reverse
from rest_framework import serializers

from .models import (
    ApplicationDocument,
    ApplicationReviewEvent,
    ApplicationStatus,
    Enrollment,
    EnrollmentApplication,
    EnrollmentPeriod,
    EnrollmentRequirement,
    EnrollmentType,
    GradeLevel,
)


# ---------------------------------------------------------------------------
# Enrollment periods
# ---------------------------------------------------------------------------

class EnrollmentPeriodSerializer(serializers.ModelSerializer):
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    grade_level_ids = serializers.PrimaryKeyRelatedField(
        source="grade_levels", many=True, queryset=GradeLevel.objects.all(),
        required=False,
    )
    is_accepting_applications = serializers.BooleanField(read_only=True)
    application_count = serializers.IntegerField(read_only=True, default=0)
    requirement_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EnrollmentPeriod
        fields = [
            "id", "school_year", "school_year_label", "name", "status",
            "opens_at", "closes_at", "grade_level_ids", "allowed_enrollment_types",
            "allow_waitlist", "is_accepting_applications", "application_count",
            "requirement_count", "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        opens_at = attrs.get("opens_at", getattr(self.instance, "opens_at", None))
        closes_at = attrs.get("closes_at", getattr(self.instance, "closes_at", None))
        if opens_at and closes_at and opens_at >= closes_at:
            raise serializers.ValidationError(
                {"closes_at": "The closing date must be after the opening date."}
            )
        types = attrs.get(
            "allowed_enrollment_types",
            getattr(self.instance, "allowed_enrollment_types", None),
        )
        if types:
            valid = set(EnrollmentType.values)
            unknown = [t for t in types if t not in valid]
            if unknown:
                raise serializers.ValidationError(
                    {"allowed_enrollment_types": (
                        f"Unknown enrollment type(s): {', '.join(unknown)}."
                    )}
                )
        instance = self.instance
        if instance is not None:
            school_year = attrs.get("school_year", instance.school_year)
            # Historical safety: once any application exists the school year
            # (and therefore the whole record's meaning) is frozen.
            if (
                school_year.pk != instance.school_year_id
                and instance.applications.exists()
            ):
                raise serializers.ValidationError(
                    {"school_year": (
                        "This period already has applications; the school year "
                        "cannot be changed."
                    )}
                )
        return attrs


# ---------------------------------------------------------------------------
# Document requirement configuration
# ---------------------------------------------------------------------------

class EnrollmentRequirementSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(
        source="grade_level.name", read_only=True, default=None
    )
    period_label = serializers.SerializerMethodField()
    has_documents = serializers.SerializerMethodField()

    class Meta:
        model = EnrollmentRequirement
        fields = [
            "id", "period", "period_label", "grade_level", "grade_level_name",
            "enrollment_type", "name", "description", "is_required",
            "requires_verification", "is_active", "position", "has_documents",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_period_label(self, obj):
        return str(obj.period) if obj.period_id else None

    def get_has_documents(self, obj):
        # True once any application already submitted evidence against this
        # requirement — deleting would be blocked (PROTECT); deactivate instead.
        return obj.documents.exists()

    def validate_name(self, value):
        if not (value or "").strip():
            raise serializers.ValidationError("Enter a document name.")
        return value.strip()


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class ApplicationDocumentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ApplicationDocument
        fields = [
            "id", "requirement", "name", "is_required", "requires_verification",
            "status", "status_display", "file", "original_filename",
            "submitted_at", "verified_at", "review_note", "download_url",
            "position",
        ]
        read_only_fields = [
            "requirement", "name", "is_required", "requires_verification",
            "status", "submitted_at", "verified_at", "position",
            "file", "original_filename", "review_note",
        ]

    def get_download_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        path = reverse(
            "application_document_download",
            kwargs={"pk": obj.application_id, "document_pk": obj.pk},
        )
        if request:
            return request.build_absolute_uri(path)
        return path


class ApplicationDocumentStaffSerializer(ApplicationDocumentSerializer):
    verified_by_name = serializers.SerializerMethodField()

    class Meta(ApplicationDocumentSerializer.Meta):
        fields = ApplicationDocumentSerializer.Meta.fields + [
            "verified_by_name", "review_note", "updated_at",
        ]

    def get_verified_by_name(self, obj):
        if not obj.verified_by:
            return None
        return obj.verified_by.get_full_name() or obj.verified_by.username


# ---------------------------------------------------------------------------
# Review history
# ---------------------------------------------------------------------------

class ApplicationReviewEventSerializer(serializers.ModelSerializer):
    """Applicant-facing: `internal_note` is never serialized here."""

    class Meta:
        model = ApplicationReviewEvent
        fields = ["id", "action", "actor_name", "from_status", "to_status", "note", "created_at"]


class ApplicationReviewEventStaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationReviewEvent
        fields = [
            "id", "action", "actor", "actor_name", "from_status", "to_status",
            "note", "internal_note", "created_at",
        ]


# ---------------------------------------------------------------------------
# Confirmed enrollments
# ---------------------------------------------------------------------------

class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_lrn = serializers.CharField(source="student.lrn", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    section_display = serializers.CharField(source="section_name", read_only=True)
    confirmed_by_name = serializers.SerializerMethodField()
    application_reference = serializers.CharField(
        source="application.reference", read_only=True, default=None
    )

    class Meta:
        model = Enrollment
        fields = [
            "id", "student", "student_name", "student_lrn", "school_year",
            "school_year_label", "grade_level", "grade_level_name", "section",
            "section_display", "status", "application", "application_reference",
            "confirmed_by", "confirmed_by_name", "confirmed_at",
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name() or obj.student.user.username

    def get_confirmed_by_name(self, obj):
        if not obj.confirmed_by:
            return None
        return obj.confirmed_by.get_full_name() or obj.confirmed_by.username


# ---------------------------------------------------------------------------
# Applications — applicant side
# ---------------------------------------------------------------------------

class EnrollmentApplicationListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    assigned_section_name = serializers.CharField(
        source="assigned_section.name", read_only=True, default=None
    )
    missing_documents = serializers.SerializerMethodField()

    class Meta:
        model = EnrollmentApplication
        fields = [
            "id", "reference", "status", "status_display", "enrollment_type",
            "grade_level", "grade_level_name", "school_year", "school_year_label",
            "strand", "assigned_section_name", "missing_documents",
            "submitted_at", "decided_at", "created_at", "updated_at",
        ]

    def get_missing_documents(self, obj):
        from .enrollment import document_blockers
        return document_blockers(obj)


class EnrollmentApplicationDetailSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    period_label = serializers.SerializerMethodField()
    assigned_section_name = serializers.CharField(
        source="assigned_section.name", read_only=True, default=None
    )
    documents = ApplicationDocumentSerializer(many=True, read_only=True)
    events = ApplicationReviewEventSerializer(many=True, read_only=True)
    missing_documents = serializers.SerializerMethodField()
    available_actions = serializers.SerializerMethodField()
    linked_student_name = serializers.SerializerMethodField()
    student_profile_id = serializers.IntegerField(
        source="student_id", read_only=True, default=None
    )
    # Public-applicant credentials. Both are owner-only (this serializer is
    # never used for staff or other applicants) and are the whole reason an
    # account-less applicant can return to their application and, once
    # enrolled, set up their account.
    guest_token = serializers.CharField(read_only=True)
    claim_token = serializers.CharField(
        source="account_claim_token", read_only=True, default=None
    )
    account_claim_available = serializers.SerializerMethodField()

    class Meta:
        model = EnrollmentApplication
        fields = [
            "id", "reference", "status", "status_display", "period", "period_label",
            "school_year", "school_year_label", "enrollment_type", "grade_level",
            "grade_level_name", "strand", "previous_school", "previous_school_address",
            "lrn", "first_name", "middle_name", "last_name", "date_of_birth", "sex",
            "address", "contact_number",
            "guardian_name", "guardian_relationship", "guardian_contact", "guardian_email",
            "documents", "events", "missing_documents", "available_actions",
            "assigned_section_name", "decision_reason",
            "student_profile_id", "linked_student_name",
            "submitted_at", "reviewed_at", "decided_at",
            "requirements_snapshot", "created_at", "updated_at",
            "guest_token", "claim_token", "account_claim_available",
        ]

    def get_period_label(self, obj):
        return str(obj.period) if obj.period_id else None

    def get_missing_documents(self, obj):
        from .enrollment import document_blockers
        return document_blockers(obj)

    def get_available_actions(self, obj):
        """Applicant-actor moves currently legal under the state machine."""
        from .enrollment import ALLOWED_TRANSITIONS
        return [
            target
            for target, actor in ALLOWED_TRANSITIONS.get(obj.status, {}).items()
            if actor == "applicant"
        ]

    def get_linked_student_name(self, obj):
        if not obj.student_id:
            return None
        return obj.student.user.get_full_name() or obj.student.user.username

    def get_account_claim_available(self, obj):
        """True when a one-time account setup is waiting for the enrolled
        student (set at confirmation, consumed on claim)."""
        return bool(
            obj.account_claim_token
            and obj.status == ApplicationStatus.ENROLLED
            and obj.account_claimed_at is None
        )


# ---------------------------------------------------------------------------
# Applications — create (draft) & update
# ---------------------------------------------------------------------------

class EnrollmentApplicationCreateSerializer(serializers.ModelSerializer):
    """Starts a draft: freezes the requirement checklist and pre-fills every
    field that can be safely reused from existing profiles."""

    student = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = EnrollmentApplication
        fields = [
            "period", "enrollment_type", "grade_level", "strand",
            "previous_school", "previous_school_address", "student",
        ]

    def validate(self, attrs):
        period: EnrollmentPeriod = attrs["period"]
        if not period.is_accepting_applications:
            raise serializers.ValidationError(
                "This enrollment period is not accepting applications right now."
            )
        grade_level = attrs["grade_level"]
        if not period.accepts_grade_level(grade_level):
            raise serializers.ValidationError(
                {"grade_level": "This grade level is not accepted in the selected period."}
            )
        if not period.accepts_type(attrs["enrollment_type"]):
            raise serializers.ValidationError(
                {"enrollment_type": "This enrollment type is not accepted in the selected period."}
            )

        user = self.context["request"].user
        is_guest = not user.is_authenticated
        if not is_guest and EnrollmentApplication.objects.filter(
            applicant=user, school_year=period.school_year
        ).exclude(
            status__in=[
                ApplicationStatus.REJECTED,
                ApplicationStatus.ENROLLED,
                ApplicationStatus.WITHDRAWN,
                ApplicationStatus.CANCELLED,
            ]
        ).exists():
            raise serializers.ValidationError(
                "You already have an active application for this school year."
            )

        # Optional existing-student link (returning student / guardian of a
        # linked child). Ownership is verified server-side — never trusted
        # from the payload alone. Public (account-less) applicants cannot
        # link a student record: there is no account to own the link, and
        # staff can link manually during review.
        profile = None
        student_id = attrs.pop("student", None)
        if student_id:
            if is_guest:
                raise serializers.ValidationError(
                    {"student": (
                        "Sign in to apply for a linked student record. As a "
                        "public applicant, your student record is matched by "
                        "the Registrar during review."
                    )}
                )
            from .models import StudentProfile
            try:
                profile = StudentProfile.objects.select_related("user").get(pk=student_id)
            except StudentProfile.DoesNotExist:
                raise serializers.ValidationError({"student": "Student record not found."})
            if user.is_parent:
                children = user.parent_profile.children.all() if hasattr(user, "parent_profile") else []
                if profile.pk not in {c.pk for c in children}:
                    raise serializers.ValidationError(
                        {"student": "You can only apply for your linked children."}
                    )
            elif user.is_student:
                if not hasattr(user, "student_profile") or user.student_profile.pk != profile.pk:
                    raise serializers.ValidationError(
                        {"student": "You can only apply for yourself."}
                    )
            else:
                raise serializers.ValidationError(
                    {"student": "Only parents/guardians may apply for another student."}
                )
        attrs["_profile"] = profile
        return attrs

    def create(self, validated_data):
        profile = validated_data.pop("_profile", None)
        user = self.context["request"].user
        is_guest = not user.is_authenticated
        period: EnrollmentPeriod = validated_data["period"]

        application = EnrollmentApplication(
            # A public applicant has no account: the row itself (and its
            # guest token) is the identity until enrollment is confirmed.
            applicant=None if is_guest else user,
            applicant_name=(
                "" if is_guest else (user.get_full_name() or user.username)
            ),
            school_year=period.school_year,
            **validated_data,
        )
        if profile is not None:
            application.student = profile
        elif not is_guest and user.is_student and hasattr(user, "student_profile"):
            application.student = user.student_profile
            profile = user.student_profile

        # Reuse existing identity data — applicants should never retype what
        # the school already holds.
        if profile is not None:
            application.lrn = application.lrn or profile.lrn
            application.first_name = application.first_name or profile.user.first_name
            application.middle_name = (
                application.middle_name or profile.user.middle_name
            )
            application.last_name = application.last_name or profile.user.last_name
            application.date_of_birth = application.date_of_birth or profile.date_of_birth
            application.address = application.address or profile.address
            application.contact_number = (
                application.contact_number or profile.contact_number
            )
        elif not is_guest:
            application.first_name = application.first_name or user.first_name
            application.middle_name = application.middle_name or user.middle_name
            application.last_name = application.last_name or user.last_name

        # Guardian block: a student applicant inherits the linked parent's
        # details; a parent applicant records themselves. A public applicant
        # fills the guardian block in the wizard instead.
        if not is_guest and user.is_parent and hasattr(user, "parent_profile"):
            parent = user.parent_profile
            application.guardian_name = application.guardian_name or user.get_full_name()
            application.guardian_relationship = (
                application.guardian_relationship or "Parent"
            )
            application.guardian_contact = (
                application.guardian_contact or parent.contact_number
            )
            application.guardian_email = application.guardian_email or user.email
        elif profile is not None and profile.parents.exists():
            guardian = profile.parents.first()
            application.guardian_name = application.guardian_name or (
                guardian.user.get_full_name()
            )
            application.guardian_contact = (
                application.guardian_contact or guardian.contact_number
            )
            application.guardian_email = application.guardian_email or guardian.user.email

        application.save()

        # Freeze the effective checklist for this application, then create one
        # document slot per requirement so the upload step works immediately.
        from .enrollment import build_requirements_snapshot, materialize_documents
        application.requirements_snapshot = build_requirements_snapshot(
            period, application.grade_level, application.enrollment_type
        )
        application.save(update_fields=["requirements_snapshot", "updated_at"])
        materialize_documents(application)
        return application


class EnrollmentApplicationUpdateSerializer(serializers.ModelSerializer):
    """Applicant edits while the application is Draft or Corrections-Required."""

    class Meta:
        model = EnrollmentApplication
        fields = [
            "enrollment_type", "grade_level", "strand",
            "previous_school", "previous_school_address",
            "lrn", "first_name", "middle_name", "last_name", "date_of_birth",
            "sex", "address", "contact_number",
            "guardian_name", "guardian_relationship", "guardian_contact",
            "guardian_email",
        ]

    def validate(self, attrs):
        instance = self.instance
        if not instance.is_editable_by_applicant:
            raise serializers.ValidationError(
                "This application can no longer be edited. Wait for the "
                "Registrar's decision or the corrections request."
            )
        period = instance.period
        grade_level = attrs.get("grade_level", instance.grade_level)
        enrollment_type = attrs.get("enrollment_type", instance.enrollment_type)
        if not period.accepts_grade_level(grade_level):
            raise serializers.ValidationError(
                {"grade_level": "This grade level is not accepted in the selected period."}
            )
        if not period.accepts_type(enrollment_type):
            raise serializers.ValidationError(
                {"enrollment_type": "This enrollment type is not accepted in the selected period."}
            )

        # Public applicants have no account, so the per-account uniqueness
        # constraint cannot catch a double application. The LRN is the
        # school's canonical student identifier — reject a second open
        # application carrying the same one for this school year.
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if user is not None and not user.is_authenticated:
            new_lrn = attrs.get("lrn", instance.lrn)
            if new_lrn:
                duplicate = EnrollmentApplication.objects.filter(
                    lrn=new_lrn, school_year=instance.school_year
                ).exclude(pk=instance.pk).exclude(
                    status__in=[
                        ApplicationStatus.REJECTED,
                        ApplicationStatus.ENROLLED,
                        ApplicationStatus.WITHDRAWN,
                        ApplicationStatus.CANCELLED,
                    ]
                ).exists()
                if duplicate:
                    raise serializers.ValidationError(
                        {"lrn": (
                            "An application with this Learner Reference Number "
                            "is already open for this school year."
                        )}
                    )
        return attrs

    def update(self, instance, validated_data):
        grade_changed = (
            "grade_level" in validated_data
            and validated_data["grade_level"].pk != instance.grade_level_id
        )
        type_changed = (
            "enrollment_type" in validated_data
            and validated_data["enrollment_type"] != instance.enrollment_type
        )
        for field, value in validated_data.items():
            setattr(instance, field, value)

        # A draft's checklist follows the requested grade/type; once staff are
        # reviewing (corrections requested) the frozen checklist stays put.
        if instance.status == ApplicationStatus.DRAFT and (grade_changed or type_changed):
            from .enrollment import build_requirements_snapshot, materialize_documents
            instance.requirements_snapshot = build_requirements_snapshot(
                instance.period, instance.grade_level, instance.enrollment_type
            )
            instance.save()
            materialize_documents(instance)
        else:
            instance.save()
        return instance


# ---------------------------------------------------------------------------
# Applications — staff side
# ---------------------------------------------------------------------------

class EnrollmentApplicationStaffListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    assigned_section_name = serializers.CharField(
        source="assigned_section.name", read_only=True, default=None
    )
    outstanding_documents = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EnrollmentApplication
        fields = [
            "id", "reference", "full_name", "applicant_name", "lrn",
            "status", "status_display", "enrollment_type",
            "grade_level", "grade_level_name", "school_year", "school_year_label",
            "strand", "assigned_section_name", "outstanding_documents",
            "student", "submitted_at", "created_at", "updated_at", "decided_at",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()


class StudentMatchSerializer(serializers.Serializer):
    """A plausible existing identity for an application, with the match reason."""
    student_id = serializers.IntegerField(source="profile.pk", read_only=True)
    lrn = serializers.CharField(source="profile.lrn", read_only=True)
    name = serializers.SerializerMethodField()
    section = serializers.SerializerMethodField()
    date_of_birth = serializers.DateField(source="profile.date_of_birth", read_only=True)
    reason = serializers.CharField(read_only=True)

    def get_name(self, obj):
        profile = obj["profile"]
        return profile.user.get_full_name() or profile.user.username

    def get_section(self, obj):
        profile = obj["profile"]
        return str(profile.section) if profile.section_id else None


class EnrollmentApplicationStaffDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    period_label = serializers.SerializerMethodField()
    applicant_username = serializers.CharField(
        source="applicant.username", read_only=True, default=None
    )
    assigned_section_name = serializers.CharField(
        source="assigned_section.name", read_only=True, default=None
    )
    section_approved_by_name = serializers.SerializerMethodField()
    reviewer_name = serializers.SerializerMethodField()
    documents = ApplicationDocumentStaffSerializer(many=True, read_only=True)
    events = ApplicationReviewEventStaffSerializer(many=True, read_only=True)
    enrollments = EnrollmentSerializer(many=True, read_only=True)
    missing_documents = serializers.SerializerMethodField()
    verification_blockers = serializers.SerializerMethodField()
    available_actions = serializers.SerializerMethodField()
    student_matches = serializers.SerializerMethodField()

    class Meta:
        model = EnrollmentApplication
        fields = [
            "id", "reference", "full_name", "applicant", "applicant_name",
            "applicant_username", "student", "lrn",
            "first_name", "middle_name", "last_name", "date_of_birth", "sex",
            "address", "contact_number",
            "guardian_name", "guardian_relationship", "guardian_contact", "guardian_email",
            "period", "period_label", "school_year", "school_year_label",
            "enrollment_type", "grade_level", "grade_level_name", "strand",
            "previous_school", "previous_school_address",
            "status", "status_display", "documents", "events", "enrollments",
            "missing_documents", "verification_blockers", "available_actions",
            "student_matches",
            "assigned_section", "assigned_section_name",
            "section_approved_by_name", "section_assigned_at",
            "reviewer_name", "reviewed_at", "decided_at", "decision_reason",
            "submitted_at", "requirements_snapshot", "created_at", "updated_at",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_period_label(self, obj):
        return str(obj.period) if obj.period_id else None

    def get_reviewer_name(self, obj):
        if not obj.reviewer:
            return None
        return obj.reviewer.get_full_name() or obj.reviewer.username

    def get_section_approved_by_name(self, obj):
        if not obj.section_approved_by:
            return None
        return obj.section_approved_by.get_full_name() or obj.section_approved_by.username

    def get_missing_documents(self, obj):
        from .enrollment import document_blockers
        return document_blockers(obj)

    def get_verification_blockers(self, obj):
        from .enrollment import verification_blockers
        return verification_blockers(obj)

    def get_available_actions(self, obj):
        from .enrollment import ALLOWED_TRANSITIONS
        actions = [
            target
            for target, actor in ALLOWED_TRANSITIONS.get(obj.status, {}).items()
            if actor == "staff"
        ]
        if (
            "waitlisted" in actions
            and obj.period_id
            and not obj.period.allow_waitlist
        ):
            actions.remove("waitlisted")
        return actions

    def get_student_matches(self, obj):
        from .enrollment import find_student_matches
        return StudentMatchSerializer(find_student_matches(obj), many=True).data


# ---------------------------------------------------------------------------
# Staff action payloads
# ---------------------------------------------------------------------------

class StaffApplicationActionSerializer(serializers.Serializer):
    ACTION_CHOICES = (
        "start_review",
        "request_corrections",
        "accept",
        "reject",
        "waitlist",
        "cancel",
    )

    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    internal_note = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        action = attrs["action"]
        if action in ("reject", "cancel") and not attrs.get("reason", "").strip():
            raise serializers.ValidationError(
                {"reason": "A recorded reason is required for this action."}
            )
        if action == "request_corrections" and not attrs.get("note", "").strip():
            raise serializers.ValidationError(
                {"note": "Explain the required corrections — the applicant sees this note."}
            )
        return attrs


class StaffDocumentActionSerializer(serializers.Serializer):
    ACTION_CHOICES = ("verify", "return", "waive")

    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["action"] == "return" and not attrs.get("note", "").strip():
            raise serializers.ValidationError(
                {"note": "Explain what must be corrected — the applicant sees this note."}
            )
        return attrs


class AssignSectionSerializer(serializers.Serializer):
    section = serializers.IntegerField()

    def validate_section(self, value):
        from .models import Section
        try:
            return Section.objects.get(pk=value)
        except Section.DoesNotExist:
            raise serializers.ValidationError("Section not found.")


class LinkStudentSerializer(serializers.Serializer):
    student = serializers.IntegerField()

    def validate_student(self, value):
        from .models import StudentProfile
        try:
            return StudentProfile.objects.select_related("user").get(pk=value)
        except StudentProfile.DoesNotExist:
            raise serializers.ValidationError("Student record not found.")
