"""
TRACK — DRF Serializers
"""

import os

from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError
# Aliased: DRF calls `validate_<field>` hooks by name, so a hook called
# `validate_password` would otherwise shadow this import and read as recursion.
from django.contrib.auth.password_validation import validate_password as check_password
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .models import (
    Announcement,
    ApplicationDocument,
    ApplicationReviewEvent,
    ApplicationStatus,
    AuditLog,
    AttendanceRecord,
    AttendanceSession,
    ClassSchedule,
    Department,
    DepartmentPermission,
    Enrollment,
    EnrollmentApplication,
    EnrollmentPeriod,
    EnrollmentRequirement,
    EnrollmentType,
    FeeAssessment,
    FeeCategory,
    FeePayment,
    FeePaymentHistory,
    GradeLevel,
    Notification,
    ParentProfile,
    PermissionDefinition,
    Requirement,
    SchoolYear,
    Section,
    StudentProfile,
    Subject,
    Submission,
    SubmissionHistory,
    TeacherAssignment,
    User,
    UserPermission,
)
from .rbac import PERMISSIONS


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def section_label(section):
    """
    Canonical section label used by every serializer: "Grade 7 — Sampaguita
    (2026-2027)".

    This must match `Section.__str__` exactly — the frontend joins students,
    requirements and assignments on this string, so mixing the bare section
    name with the full label silently breaks those lookups.
    """
    return str(section) if section else None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginSerializer(serializers.Serializer):
    """
    Accepts a username *or* an email address in the `username` field.
    """
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, data):
        identifier = data["username"].strip()
        # Allow "name@school.edu.ph" to be used as the login identifier
        if "@" in identifier:
            matched = User.objects.filter(email__iexact=identifier).first()
            if matched is None:
                raise serializers.ValidationError("Invalid username or password.")
            identifier = matched.username
        user = authenticate(
            request=self.context.get("request"),
            username=identifier,
            password=data["password"],
        )
        if not user:
            raise serializers.ValidationError("Invalid username or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")
        data["user"] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        # Pass the user so UserAttributeSimilarityValidator can actually
        # compare against their name/username/email.
        check_password(value, user=self.context["request"].user)
        return value

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


class ResetPasswordSerializer(serializers.Serializer):
    """
    Admin: set a new password on someone else's account.

    This is the registrar's recovery path — there is no self-service email
    reset because the deployment has no SMTP. The password is written-only and
    never returned.
    """

    user_id = serializers.IntegerField()
    new_password = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )

    def validate_user_id(self, value):
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("No account with that id.")
        return value

    def validate_new_password(self, value):
        # Pass the target user so UserAttributeSimilarityValidator can compare
        # against *their* name/username/email — otherwise an admin could reset
        # an account to a password built from that user's own details.
        target = None
        user_id = self.initial_data.get("user_id")
        if user_id:
            target = User.objects.filter(pk=user_id).first()
        check_password(value, user=target)
        return value


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserSerializer(serializers.ModelSerializer):
    """
    The signed-in user's own profile (returned by /api/auth/me/ and login).

    Everything permission-related is read-only: a client can never write its
    own roles or grants through this serializer.
    """
    full_name = serializers.SerializerMethodField()
    is_super_admin = serializers.BooleanField(read_only=True)
    departments = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "middle_name",
            "last_name", "full_name", "role", "is_active",
            "is_super_admin", "departments", "permissions",
        ]
        read_only_fields = ["id", "username", "role", "is_active"]

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_departments(self, obj):
        if not obj.is_admin:
            return []
        return [
            {"id": d.id, "name": d.name, "code": d.code, "is_active": d.is_active}
            for d in obj.departments.all()
        ]

    def get_permissions(self, obj):
        """Effective permission keys — what the frontend uses to filter nav."""
        if not obj.is_admin:
            return []
        return sorted(obj.permission_keys())


class AdminUserSerializer(serializers.ModelSerializer):
    """
    Admin-only serializer for creating and editing accounts.

    Unlike UserSerializer this exposes `role`, `is_active` and `password`, and
    it keeps the role-specific profile rows in step: students get a
    StudentProfile (section + LRN) and parents get a ParentProfile that can be
    linked to their children.

    It is used exclusively by IsAdmin views — never by CurrentUserView — so a
    signed-in user can never escalate their own role through /api/auth/me/.
    """

    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        help_text="Required for new accounts; leave blank to keep the current one.",
    )
    full_name = serializers.SerializerMethodField()
    # Department-scoped administration (see core/rbac.py). `departments` is
    # writable only through this admin serializer, and only for accounts the
    # actor is allowed to touch — validated in validate().
    is_super_admin = serializers.BooleanField(required=False)
    departments = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), many=True, required=False,
    )
    # Write-only: the read values are assembled from the profile rows below.
    section = serializers.PrimaryKeyRelatedField(
        queryset=Section.objects.all(), write_only=True,
        required=False, allow_null=True,
    )
    lrn = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=12,
    )
    children = serializers.PrimaryKeyRelatedField(
        queryset=StudentProfile.objects.all(), many=True,
        write_only=True, required=False,
    )
    contact_number = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=20,
    )

    class Meta:
        model = User
        fields = [
            "id", "username", "password", "email", "first_name", "middle_name",
            "last_name", "full_name", "role", "is_active",
            "is_super_admin", "departments",
            "section", "lrn", "children", "contact_number",
        ]
        read_only_fields = ["id"]

    def get_full_name(self, obj):
        return obj.get_full_name()

    # -- validation ---------------------------------------------------------

    def validate_password(self, value):
        """
        Admin-created and admin-reset passwords must meet the same strength
        rules as a self-service change. Previously `set_password()` was called
        straight from create()/update() with no validation at all, so a PATCH
        could set a password to anything.

        A blank value means "keep the current password" on edit, so it is
        passed through untouched.
        """
        if not value:
            return value
        # Pass the instance on edit so the similarity validator can compare
        # against this user's own name/username/email.
        check_password(value, user=self.instance)
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        role = attrs.get(
            "role", self.instance.role if self.instance else None
        )

        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError(
                {"password": "A password is required for a new account."}
            )

        # LRN is unique and blank=True only allows a single empty row, so a
        # new student must be given one.
        if role == User.Role.STUDENT and self.instance is None:
            if not (attrs.get("lrn") or "").strip():
                raise serializers.ValidationError(
                    {"lrn": "A Learner Reference Number is required for students."}
                )

        # Never let an administrator lock themselves out or demote themselves.
        if request and self.instance and request.user == self.instance:
            if attrs.get("is_active") is False:
                raise serializers.ValidationError(
                    {"is_active": "You cannot deactivate your own account."}
                )
            if "role" in attrs and attrs["role"] != self.instance.role:
                raise serializers.ValidationError(
                    {"role": "You cannot change your own role."}
                )

        self._check_department_scoped_rules(attrs, role)
        return attrs

    # -- department-scoped administration ----------------------------------

    def _check_department_scoped_rules(self, attrs, role):
        """
        Enforce the RBAC rules on administrator and student accounts.

        Runs for every create and update that comes through the admin
        endpoints. A non-admin actor never reaches this code — the views are
        gated on the `users.*` keys before the serializer runs.
        """
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if actor is None or not actor.is_admin:
            return

        target_is_admin = role == User.Role.ADMIN or (
            self.instance is not None and self.instance.is_admin
        )

        # Touching an administrator account needs the administrator key.
        if target_is_admin and not actor.has_perm_key("users.manage_admins"):
            raise PermissionDenied(
                "Only administrators with the 'Manage administrators' "
                "permission can change administrator accounts."
            )

        # Student records are a separate permission from account management.
        if role == User.Role.STUDENT and not actor.has_perm_key("students.manage"):
            raise PermissionDenied(
                "You do not have the 'Manage student records' permission."
            )

        departments = attrs.get("departments")
        # On HTML-form input DRF fills a missing list field with [], so only a
        # real assignment counts as "assigning departments".
        if departments and role != User.Role.ADMIN:
            raise serializers.ValidationError(
                {"departments": "Only administrator accounts can be assigned to departments."}
            )

        # Every administrator must be reachable: a department, or the super
        # flag. This keeps new accounts least-privilege by construction.
        if self.instance is None and role == User.Role.ADMIN:
            if not departments and not attrs.get("is_super_admin"):
                raise serializers.ValidationError(
                    {"departments": (
                        "Assign the new administrator to at least one "
                        "department, or make them a Super Administrator."
                    )}
                )

        if "is_super_admin" in attrs:
            if attrs["is_super_admin"] and not actor.is_super_admin:
                raise PermissionDenied(
                    "Only a Super Administrator can grant the Super "
                    "Administrator flag."
                )
            if (
                attrs["is_super_admin"] is False
                and self.instance is not None
                and self.instance.is_super_admin
            ):
                self._require_another_super_admin()

        # Leaving the administrator role also loses the super flag, so it
        # needs the same safeguard.
        if (
            self.instance is not None
            and self.instance.is_super_admin
            and role != User.Role.ADMIN
        ):
            self._require_another_super_admin()

        # Deactivating the last active super administrator would lock the
        # school out of its own permission system.
        if (
            attrs.get("is_active") is False
            and self.instance is not None
            and self.instance.is_super_admin
        ):
            self._require_another_super_admin()

    def _require_another_super_admin(self):
        others = User.objects.filter(
            role=User.Role.ADMIN, is_super_admin=True, is_active=True
        ).exclude(pk=self.instance.pk)
        if not others.exists():
            raise serializers.ValidationError(
                {"is_super_admin": (
                    "This is the last active Super Administrator. Promote "
                    "another administrator first."
                )}
            )

    # -- read ---------------------------------------------------------------

    def to_representation(self, instance):
        data = super().to_representation(instance)

        student = getattr(instance, "student_profile", None)
        parent = getattr(instance, "parent_profile", None)

        data["section"] = student.section_id if student else None
        data["section_name"] = str(student.section) if student and student.section else None
        data["lrn"] = student.lrn if student else ""
        data["children"] = (
            list(parent.children.values_list("id", flat=True)) if parent else []
        )
        data["children_detail"] = (
            [
                {
                    "id": c.id,
                    "name": c.user.get_full_name(),
                    "section": str(c.section) if c.section else None,
                }
                for c in parent.children.select_related("user", "section")
            ]
            if parent
            else []
        )
        data["contact_number"] = parent.contact_number if parent else ""
        data["department_detail"] = (
            [
                {"id": d.id, "name": d.name, "code": d.code, "is_active": d.is_active}
                for d in instance.departments.all()
            ]
            if instance.is_admin
            else []
        )
        return data

    # -- write --------------------------------------------------------------

    def create(self, validated_data):
        password = validated_data.pop("password")
        departments = validated_data.pop("departments", None)
        section = validated_data.pop("section", None)
        lrn = (validated_data.pop("lrn", "") or "").strip()
        children = validated_data.pop("children", None)
        contact_number = validated_data.pop("contact_number", "")

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        # M2M cannot go through User(**validated_data); set it after save.
        if departments:
            user.departments.set(departments)

        if user.is_student:
            StudentProfile.objects.create(
                user=user, section=section, lrn=lrn,
                contact_number=contact_number,
            )
        elif user.is_parent:
            profile = ParentProfile.objects.create(
                user=user, contact_number=contact_number
            )
            if children:
                profile.children.set(children)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        has_departments = "departments" in validated_data
        departments = validated_data.pop("departments", [])
        # Track explicit nulls (e.g. clearing a section) apart from omissions.
        has_section = "section" in validated_data
        section = validated_data.pop("section", None)
        has_lrn = "lrn" in validated_data
        lrn = (validated_data.pop("lrn", "") or "").strip()
        has_children = "children" in validated_data
        children = validated_data.pop("children", [])
        has_contact = "contact_number" in validated_data
        contact_number = validated_data.pop("contact_number", "")

        if password:
            instance.set_password(password)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if instance.is_admin and has_departments:
            instance.departments.set(departments)
        elif not instance.is_admin:
            # A demoted account must not keep department assignments (and
            # with them a back door to their permissions).
            instance.departments.clear()
        instance.invalidate_permission_cache()

        if instance.is_student:
            profile, _ = StudentProfile.objects.get_or_create(user=instance)
            if has_section:
                profile.section = section
            if has_lrn:
                profile.lrn = lrn
            if has_contact:
                profile.contact_number = contact_number
            profile.save()
        elif instance.is_parent:
            profile, _ = ParentProfile.objects.get_or_create(user=instance)
            if has_contact:
                profile.contact_number = contact_number
                profile.save()
            if has_children:
                profile.children.set(children)
        return instance


# ---------------------------------------------------------------------------
# School structure
# ---------------------------------------------------------------------------

class SchoolYearSerializer(serializers.ModelSerializer):
    section_count = serializers.IntegerField(read_only=True)
    subject_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SchoolYear
        fields = ["id", "label", "start_date", "end_date", "is_active", "section_count", "subject_count"]

    def validate(self, attrs):
        # The model's clean() is never invoked by DRF (no full_clean call),
        # so the date ordering has to be enforced here.
        start = attrs.get(
            "start_date", self.instance.start_date if self.instance else None
        )
        end = attrs.get(
            "end_date", self.instance.end_date if self.instance else None
        )
        if start and end and start >= end:
            raise serializers.ValidationError(
                {"end_date": "The end date must be after the start date."}
            )
        return attrs


class GradeLevelSerializer(serializers.ModelSerializer):
    section_count = serializers.IntegerField(read_only=True)
    subject_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = GradeLevel
        fields = ["id", "name", "order", "section_count", "subject_count"]


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    adviser_name = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Section
        fields = [
            "id", "name", "grade_level", "grade_level_name",
            "school_year", "school_year_label", "adviser", "adviser_name",
            "student_count",
        ]

    def get_adviser_name(self, obj):
        return obj.adviser.get_full_name() if obj.adviser else None


class SubjectSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    assignment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Subject
        fields = [
            "id", "name", "code", "description",
            "grade_level", "grade_level_name",
            "school_year", "school_year_label",
            "assignment_count",
        ]


class TeacherAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    section_name = serializers.SerializerMethodField()

    class Meta:
        model = TeacherAssignment
        fields = [
            "id", "teacher", "teacher_name",
            "subject", "subject_name",
            "section", "section_name",
        ]

    def get_teacher_name(self, obj):
        return obj.teacher.get_full_name()

    def get_section_name(self, obj):
        return section_label(obj.section)

    def validate_teacher(self, value):
        if value.role != User.Role.TEACHER:
            raise serializers.ValidationError(
                "Only accounts with the teacher role can be assigned a class."
            )
        if not value.is_active:
            raise serializers.ValidationError(
                "This account is inactive, so it cannot be assigned a class."
            )
        return value

    def validate(self, attrs):
        subject = attrs.get(
            "subject", self.instance.subject if self.instance else None
        )
        section = attrs.get(
            "section", self.instance.section if self.instance else None
        )
        if subject and section:
            if subject.grade_level_id != section.grade_level_id:
                raise serializers.ValidationError(
                    {"subject": (
                        f"{subject.name} is offered in {subject.grade_level}, "
                        f"but this section is {section.grade_level}."
                    )}
                )
            if subject.school_year_id != section.school_year_id:
                raise serializers.ValidationError(
                    {"subject": (
                        f"{subject.name} belongs to {subject.school_year}, "
                        f"but this section is in {section.school_year}."
                    )}
                )
        return attrs


# ---------------------------------------------------------------------------
# Student & Parent profiles
# ---------------------------------------------------------------------------

class StudentProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    section_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentProfile
        fields = [
            "id", "user", "lrn", "section", "section_name",
            "date_of_birth", "address", "contact_number",
        ]

    def get_section_name(self, obj):
        return str(obj.section) if obj.section else None


class ParentProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    children = StudentProfileSerializer(many=True, read_only=True)

    class Meta:
        model = ParentProfile
        fields = ["id", "user", "children", "contact_number"]


# ---------------------------------------------------------------------------
# Requirements & Submissions
# ---------------------------------------------------------------------------

class RequirementSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    subject_name = serializers.CharField(
        source="teacher_assignment.subject.name", read_only=True
    )
    section_name = serializers.SerializerMethodField()

    class Meta:
        model = Requirement
        fields = [
            "id", "title", "description", "requirement_type",
            "deadline", "is_overdue", "allow_file_upload",
            "allow_link_submission", "subject_name", "section_name",
            "teacher_assignment", "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_section_name(self, obj):
        return section_label(obj.teacher_assignment.section)


class SubmissionHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionHistory
        fields = [
            "id", "old_status", "new_status",
            "changed_by", "changed_by_name", "note", "timestamp",
        ]

    def get_changed_by_name(self, obj):
        return obj.changed_by.get_full_name() if obj.changed_by else None


class SubmissionSerializer(serializers.ModelSerializer):
    history = SubmissionHistorySerializer(many=True, read_only=True)
    requirement_title = serializers.CharField(source="requirement.title", read_only=True)
    student_name = serializers.SerializerMethodField()
    # Optional on write: SubmissionListCreateView.perform_create always stamps
    # the authenticated student's own profile, so clients are not expected to
    # send it. Leaving it required made the real submission flow (which posts
    # only requirement/link_url/status) fail with a 400.
    student = serializers.PrimaryKeyRelatedField(
        queryset=StudentProfile.objects.all(), required=False
    )

    class Meta:
        model = Submission
        fields = [
            "id", "requirement", "requirement_title",
            "student", "student_name", "status",
            "submitted_at", "verified_at",
            "file_upload", "link_url", "teacher_feedback",
            "created_at", "updated_at", "history",
        ]
        read_only_fields = ["created_at", "updated_at", "verified_at", "history"]
        # DRF auto-attaches a UniqueTogetherValidator for the model's
        # unique_together on (requirement, student). That validator runs before
        # validate() and demands `student` in the request body, but
        # SubmissionListCreateView.perform_create stamps the student from the
        # authenticated user — clients never send it. Left attached, it rejected
        # every submission with {"student": ["This field is required."]}.
        # The uniqueness rule itself is still enforced: the database UNIQUE
        # constraint stands, and perform_create reuses the existing row so a
        # resubmission updates rather than duplicating.
        validators = []

    def get_student_name(self, obj):
        return obj.student.user.get_full_name()

    # Only document/image types a school would accept. Everything else (HTML,
    # SVG, executables, etc.) is refused so a hostile upload can never be served
    # back as active content from /media/.
    ALLOWED_UPLOAD_EXTENSIONS = {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".txt", ".jpg", ".jpeg", ".png", ".gif", ".webp",
    }
    MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

    def validate_file_upload(self, value):
        if not value:
            return value
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in self.ALLOWED_UPLOAD_EXTENSIONS:
            raise serializers.ValidationError(
                "That file type is not allowed. Upload a document or image "
                "(PDF, Word, Excel, PowerPoint, TXT, or JPG/PNG/GIF/WebP)."
            )
        if value.size > self.MAX_UPLOAD_BYTES:
            raise serializers.ValidationError(
                "That file is too large (10 MB maximum)."
            )
        return value

    def get_extra_kwargs(self):
        """
        Freeze server-owned fields.

        On update a submission's identity (`requirement`, `student`) and its
        hand-in time (`submitted_at`) must not be client-writable — otherwise a
        student can re-point their work at a different requirement, reassign it
        to a classmate, or backdate the timestamp (all observed live). Teachers
        legitimately PATCH `{status, teacher_feedback}` only, so freezing these
        does not touch that flow.
        """
        extra = super().get_extra_kwargs()
        if self.instance is not None:
            extra["requirement"] = {"read_only": True}
            # The hand-in time is stamped by the server (create/resubmit/status
            # change); a client must not be able to backdate it. (`student` is
            # an explicitly declared field, so extra_kwargs cannot freeze it —
            # ownership immutability is enforced in validate() instead.)
            extra["submitted_at"] = {"read_only": True}
        # `teacher_feedback` is authored by the reviewer, never the student.
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated and user.is_student:
            extra["teacher_feedback"] = {"read_only": True}
        return extra

    def validate(self, data):
        request = self.context.get("request")
        # A submission's owner is fixed at creation. `student` is an explicitly
        # declared field, so extra_kwargs cannot mark it read-only — enforce the
        # immutability here instead of relying on the UNIQUE constraint to catch
        # it (which only fires if the target student already submitted).
        if self.instance is not None and "student" in data:
            if data["student"].pk != self.instance.student_id:
                raise serializers.ValidationError(
                    {"student": "A submission's student cannot be changed."}
                )
        if request and request.user.is_student:
            # Students may only create/update their own work as
            # "not submitted" or "submitted" — never verified/returned/overdue,
            # and they may never change an existing status themselves.
            if self.instance is None:
                new_status = data.get("status", Submission.Status.SUBMITTED)
                if new_status not in (
                    Submission.Status.SUBMITTED,
                    Submission.Status.NOT_SUBMITTED,
                ):
                    raise serializers.ValidationError(
                        "Students can only mark work as submitted."
                    )
            elif "status" in data and data["status"] != self.instance.status:
                raise serializers.ValidationError(
                    {"status": "Students cannot change a submission's status."}
                )
        return data


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class ClassScheduleSerializer(serializers.ModelSerializer):
    day_of_week_display = serializers.CharField(source="get_day_of_week_display", read_only=True)
    teacher_assignment_detail = serializers.SerializerMethodField()

    class Meta:
        model = ClassSchedule
        fields = [
            "id", "teacher_assignment", "teacher_assignment_detail",
            "day_of_week", "day_of_week_display",
            "start_time", "end_time", "room",
        ]

    def get_teacher_assignment_detail(self, obj):
        return {
            "id": obj.teacher_assignment.id,
            "teacher_id": obj.teacher_assignment.teacher_id,
            "teacher_name": obj.teacher_assignment.teacher.get_full_name(),
            "subject_name": obj.teacher_assignment.subject.name,
            "section_id": obj.teacher_assignment.section_id,
            "section_name": section_label(obj.teacher_assignment.section),
            "grade_level": obj.teacher_assignment.section.grade_level.name,
        }

    def validate(self, attrs):
        start = attrs.get("start_time", self.instance.start_time if self.instance else None)
        end = attrs.get("end_time", self.instance.end_time if self.instance else None)
        if start and end and start >= end:
            raise serializers.ValidationError(
                {"end_time": "End time must be after start time."}
            )
        return attrs


class AttendanceSessionBriefSerializer(serializers.ModelSerializer):
    """Read-only session summary embedded in attendance records."""
    subject_name = serializers.CharField(
        source="teacher_assignment.subject.name", read_only=True
    )
    section_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = ["id", "date", "subject_name", "section_name"]

    def get_section_name(self, obj):
        return section_label(obj.teacher_assignment.section)


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    session_detail = AttendanceSessionBriefSerializer(source="session", read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            "id", "session", "session_detail", "student", "student_name", "status",
            "notes", "recorded_by", "modified_by", "recorded_at", "modified_at",
        ]
        # Who recorded/modified a mark is stamped by the server from the
        # authenticated user — never taken from the request body.
        read_only_fields = [
            "recorded_at", "modified_at", "recorded_by", "modified_by",
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name()

    def get_extra_kwargs(self):
        """
        A record's identity (which session, which student) is fixed at creation.
        Freezing both on update stops a teacher moving a mark into another
        teacher's session or re-pointing it at a classmate — only `status` and
        `notes` (the fields the attendance UI actually PATCHes) stay editable.
        """
        extra = super().get_extra_kwargs()
        if self.instance is not None:
            extra["session"] = {"read_only": True}
            extra["student"] = {"read_only": True}
        return extra


class AttendanceSessionSerializer(serializers.ModelSerializer):
    records = AttendanceRecordSerializer(many=True, read_only=True)
    subject_name = serializers.CharField(
        source="teacher_assignment.subject.name", read_only=True
    )
    section_name = serializers.SerializerMethodField()
    schedule_time = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = AttendanceSession
        fields = [
            "id", "teacher_assignment", "subject_name", "section_name",
            "date", "schedule", "schedule_time", "status", "status_display",
            "notes", "created_by", "created_at", "records",
        ]
        # `created_by` is stamped by the server from the authenticated user.
        read_only_fields = ["created_at", "status", "created_by"]

    def get_extra_kwargs(self):
        """
        A session's identity (which class, which weekly slot) is fixed at
        creation. Freezing `teacher_assignment` and `schedule` on update stops a
        teacher re-parenting their session onto another teacher's class; only
        `date` and `notes` (what the attendance UI PATCHes) stay editable.
        """
        extra = super().get_extra_kwargs()
        if self.instance is not None:
            extra["teacher_assignment"] = {"read_only": True}
            extra["schedule"] = {"read_only": True}
        return extra

    def get_section_name(self, obj):
        return section_label(obj.teacher_assignment.section)

    def get_schedule_time(self, obj):
        if obj.schedule:
            return {
                "start_time": obj.schedule.start_time.strftime("%H:%M"),
                "end_time": obj.schedule.end_time.strftime("%H:%M"),
                "room": obj.schedule.room,
            }
        return None

    def validate(self, attrs):
        """Validate uniqueness before database constraint raises IntegrityError."""
        assignment = attrs.get("teacher_assignment", getattr(self.instance, "teacher_assignment", None))
        date = attrs.get("date", getattr(self.instance, "date", None))
        schedule = attrs.get("schedule", getattr(self.instance, "schedule", None))

        if assignment and date and self.instance is None:
            # Check for duplicate sessions
            if schedule is None:
                # Manual session: only one per (assignment, date)
                if AttendanceSession.objects.filter(
                    teacher_assignment=assignment,
                    date=date,
                    schedule__isnull=True
                ).exists():
                    raise serializers.ValidationError(
                        "A session for this class on this date already exists."
                    )
            else:
                # Scheduled session: one per (assignment, date, schedule)
                if AttendanceSession.objects.filter(
                    teacher_assignment=assignment,
                    date=date,
                    schedule=schedule
                ).exists():
                    raise serializers.ValidationError(
                        "A session for this class at this time already exists."
                    )
        return attrs


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id", "notif_type", "title", "body", "is_read",
            "requirement", "submission", "attendance_record", "created_at",
        ]
        read_only_fields = [
            "notif_type", "title", "body", "created_at",
            "requirement", "submission", "attendance_record",
        ]


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "body", "audience", "section",
            "is_pinned", "published_at", "created_at",
            "author", "author_name",
        ]
        read_only_fields = ["created_at", "author"]

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else None

    def validate_section(self, value):
        """
        A teacher may only aim a section-scoped announcement at a section they
        actually teach. Admins may target any section; `null` stays school-wide.
        Without this a teacher could post into another teacher's class feed.
        """
        if value is None:
            return value
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated and user.is_teacher:
            from .models import TeacherAssignment
            teaches = TeacherAssignment.objects.filter(
                teacher=user, section=value
            ).exists()
            if not teaches:
                raise serializers.ValidationError(
                    "You can only post announcements to a section you teach."
                )
        return value


# ---------------------------------------------------------------------------
# Fee Management
# ---------------------------------------------------------------------------

class FeeCategorySerializer(serializers.ModelSerializer):
    assessment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = FeeCategory
        fields = [
            "id", "name", "code", "fee_type", "description",
            "is_active", "assessment_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_code(self, value):
        value = value.upper().strip()
        if self.instance and self.instance.code == value:
            return value
        if FeeCategory.objects.filter(code__iexact=value).exists():
            raise serializers.ValidationError("A fee category with this code already exists.")
        return value


class FeeAssessmentSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_code = serializers.CharField(source="category.code", read_only=True)
    category_fee_type = serializers.CharField(source="category.fee_type", read_only=True)
    school_year_label = serializers.CharField(source="school_year.label", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    section_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    total_assessed = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_collected = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    outstanding_balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = FeeAssessment
        fields = [
            "id", "category", "category_name", "category_code", "category_fee_type",
            "school_year", "school_year_label", "grade_level", "grade_level_name",
            "section", "section_name", "student", "student_name",
            "amount", "due_date", "status", "description",
            "created_by", "created_by_name", "created_at", "updated_at",
            "total_assessed", "total_collected", "outstanding_balance", "student_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]

    def get_section_name(self, obj):
        return str(obj.section) if obj.section else None

    def get_student_name(self, obj):
        return obj.student.user.get_full_name() if obj.student else None

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_extra_kwargs(self):
        extra = super().get_extra_kwargs()
        if self.instance is not None:
            extra["category"] = {"read_only": True}
            extra["school_year"] = {"read_only": True}
        return extra

    def validate(self, attrs):
        # Run model's clean method
        instance = FeeAssessment(**attrs)
        if self.instance:
            instance.pk = self.instance.pk
        try:
            instance.clean()
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict if hasattr(e, 'message_dict') else e.messages)
        return attrs


class FeePaymentSerializer(serializers.ModelSerializer):
    assessment_category = serializers.CharField(source="assessment.category.name", read_only=True)
    assessment_amount = serializers.DecimalField(source="assessment.amount", max_digits=12, decimal_places=2, read_only=True)
    student_name = serializers.SerializerMethodField()
    student_lrn = serializers.CharField(source="student.lrn", read_only=True)
    section_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FeePayment
        fields = [
            "id", "assessment", "assessment_category", "assessment_amount",
            "student", "student_name", "student_lrn", "section_name",
            "amount", "payment_date", "payment_method", "reference_number",
            "receipt_number", "status", "notes",
            "recorded_by", "recorded_by_name",
            "voided_by", "voided_by_name", "voided_at", "void_reason",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "receipt_number", "recorded_by", "recorded_by_name",
            "voided_by", "voided_by_name", "voided_at", "created_at", "updated_at",
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name()

    def get_section_name(self, obj):
        return str(obj.student.section) if obj.student.section else None

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() if obj.recorded_by else None

    def get_voided_by_name(self, obj):
        return obj.voided_by.get_full_name() if obj.voided_by else None

    def get_extra_kwargs(self):
        extra = super().get_extra_kwargs()
        if self.instance is not None:
            extra["assessment"] = {"read_only": True}
            extra["student"] = {"read_only": True}
        return extra

    def validate(self, attrs):
        # Run model's clean method
        instance = FeePayment(**attrs)
        if self.instance:
            instance.pk = self.instance.pk
        try:
            instance.clean()
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict if hasattr(e, 'message_dict') else e.messages)
        return attrs


class FeePaymentHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FeePaymentHistory
        fields = [
            "id", "old_status", "new_status", "old_amount", "new_amount",
            "changed_by", "changed_by_name", "note", "timestamp",
        ]

    def get_changed_by_name(self, obj):
        return obj.changed_by.get_full_name() if obj.changed_by else None


class FeeAssessmentDetailSerializer(FeeAssessmentSerializer):
    """Detailed serializer with payments for a single assessment."""
    payments = FeePaymentSerializer(many=True, read_only=True)

    class Meta(FeeAssessmentSerializer.Meta):
        fields = FeeAssessmentSerializer.Meta.fields + ["payments"]


class StudentFeeSummarySerializer(serializers.ModelSerializer):
    """Serializer for student fee summary (for student/parent view)."""
    user = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    assessments = serializers.SerializerMethodField()
    total_assessed = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_paid = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_outstanding = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = StudentProfile
        fields = [
            "id", "user", "lrn", "section", "section_name",
            "assessments", "total_assessed", "total_paid", "total_outstanding",
        ]

    def get_user(self, obj):
        return {
            "id": obj.user.id,
            "username": obj.user.username,
            "first_name": obj.user.first_name,
            "middle_name": obj.user.middle_name,
            "last_name": obj.user.last_name,
            "full_name": obj.user.get_full_name(),
        }

    def get_section_name(self, obj):
        return str(obj.section) if obj.section else None

    def get_assessments(self, obj):
        # This will be populated by the view with filtered assessments
        return getattr(obj, 'fee_assessments_data', [])


class FeeCollectionReportSerializer(serializers.Serializer):
    """Serializer for fee collection reports."""
    school_year = serializers.CharField()
    category = serializers.CharField()
    total_assessed = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_collected = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_outstanding = serializers.DecimalField(max_digits=14, decimal_places=2)
    collection_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    student_count = serializers.IntegerField()
    paid_count = serializers.IntegerField()
    partial_count = serializers.IntegerField()
    unpaid_count = serializers.IntegerField()


class FeeOutstandingReportSerializer(serializers.Serializer):
    """Serializer for outstanding balance reports."""
    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    lrn = serializers.CharField()
    section = serializers.CharField()
    category = serializers.CharField()
    assessed = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    outstanding = serializers.DecimalField(max_digits=12, decimal_places=2)
    due_date = serializers.DateField()
    payment_status = serializers.CharField()


# ---------------------------------------------------------------------------
# Departments, roles & permissions
# ---------------------------------------------------------------------------

class DepartmentSerializer(serializers.ModelSerializer):
    """Department row for the administration screens."""

    administrator_count = serializers.SerializerMethodField()
    permission_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            "id", "name", "code", "description", "is_active",
            "administrator_count", "permission_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_administrator_count(self, obj):
        return obj.administrators.count()

    def get_permission_count(self, obj):
        return obj.permission_grants.count()

    def validate_code(self, value):
        value = value.upper().strip()
        if self.instance and self.instance.code == value:
            return value
        if Department.objects.filter(code__iexact=value).exists():
            raise serializers.ValidationError(
                "A department with this code already exists."
            )
        return value

    def validate(self, attrs):
        # The code is the stable identifier the audit log and seeded grants
        # refer to, so it is fixed after creation.
        if self.instance and "code" in attrs and attrs["code"] != self.instance.code:
            attrs.pop("code")
        return attrs


class PermissionDefinitionSerializer(serializers.ModelSerializer):
    """One cell of the permission matrix, rendered from the registry."""

    module_label = serializers.SerializerMethodField()

    class Meta:
        model = PermissionDefinition
        fields = [
            "key", "module", "module_label", "action", "label",
            "description", "position",
        ]
        read_only_fields = fields

    def get_module_label(self, obj):
        from .rbac import MODULES
        return MODULES.get(obj.module, obj.module)


class PermissionMatrixSerializer(serializers.Serializer):
    """
    Body of a matrix save: the complete list of granted keys.

    Replacing the whole set (rather than diffing) means what you see in the
    UI is exactly what the database ends up holding.
    """
    permissions = serializers.ListField(
        child=serializers.CharField(max_length=60),
        allow_empty=True,
    )

    def validate_permissions(self, value):
        unknown = [key for key in value if key not in PERMISSIONS]
        if unknown:
            raise serializers.ValidationError(
                f"Unknown permission key(s): {', '.join(sorted(unknown))}."
            )
        # Keep registry order and drop duplicates so the audit entry is stable.
        ordered = [key for key in PERMISSIONS if key in set(value)]
        return ordered


class AuditLogSerializer(serializers.ModelSerializer):
    """Audit trail row. Read-only — nothing here is ever written by a client."""

    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id", "actor", "actor_name", "action", "target_model", "target_id",
            "description", "ip_address", "timestamp",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        return obj.actor.get_full_name() or obj.actor.username
