"""
TRACK — DRF Serializers
"""

import os

from django.contrib.auth import authenticate
# Aliased: DRF calls `validate_<field>` hooks by name, so a hook called
# `validate_password` would otherwise shadow this import and read as recursion.
from django.contrib.auth.password_validation import validate_password as check_password
from rest_framework import serializers

from .models import (
    Announcement,
    AttendanceRecord,
    AttendanceSession,
    ClassSchedule,
    GradeLevel,
    Notification,
    ParentProfile,
    Requirement,
    SchoolYear,
    Section,
    StudentProfile,
    Subject,
    Submission,
    SubmissionHistory,
    TeacherAssignment,
    User,
)


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
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "middle_name",
            "last_name", "full_name", "role", "is_active",
        ]
        read_only_fields = ["id", "username", "role", "is_active"]

    def get_full_name(self, obj):
        return obj.get_full_name()


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
        return attrs

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
        return data

    # -- write --------------------------------------------------------------

    def create(self, validated_data):
        password = validated_data.pop("password")
        section = validated_data.pop("section", None)
        lrn = (validated_data.pop("lrn", "") or "").strip()
        children = validated_data.pop("children", None)
        contact_number = validated_data.pop("contact_number", "")

        user = User(**validated_data)
        user.set_password(password)
        user.save()

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
