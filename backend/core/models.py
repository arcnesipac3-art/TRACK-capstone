"""
TRACK — Core models
Kiwalan National High School, Iligan City

All timestamps are stored in UTC and converted to Asia/Manila for display.
"""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from .rbac import PERMISSION_KEYS


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(AbstractUser):
    """
    Extends Django's built-in user.
    The `role` field drives all permission logic — always enforce on the backend.
    """

    class Role(models.TextChoices):
        ADMIN = "admin", "Administrator"
        TEACHER = "teacher", "Teacher"
        STUDENT = "student", "Student"
        PARENT = "parent", "Parent"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    # Middle name is common in Philippine records
    middle_name = models.CharField(max_length=60, blank=True)

    # ── Department-scoped administration (see core/rbac.py) ───────────────
    is_super_admin = models.BooleanField(
        default=False,
        help_text=(
            "Holds every permission key. Only meaningful for role='admin'; "
            "the Super Administrator may grant or revoke it."
        ),
    )
    departments = models.ManyToManyField(
        "Department",
        blank=True,
        related_name="administrators",
        help_text="Departments this administrator belongs to (admin accounts only).",
    )

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_teacher(self):
        return self.role == self.Role.TEACHER

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_parent(self):
        return self.role == self.Role.PARENT

    # -- permissions --------------------------------------------------------

    def permission_keys(self):
        """
        Every permission key this user currently holds.

        * Super administrators hold all of them.
        * Other administrators hold their personal grants plus the grants of
          every *active* department they belong to.
        * Non-administrative roles hold none — their access is role-scoped.
        """
        if not self.is_admin:
            return frozenset()
        if self.is_super_admin:
            return frozenset(PERMISSION_KEYS)

        cached = getattr(self, "_permission_keys_cache", None)
        if cached is not None:
            return cached

        keys = set(
            self.direct_grants.values_list("permission__key", flat=True)
        )
        keys |= set(
            DepartmentPermission.objects.filter(
                department__in=self.departments.all(),
                department__is_active=True,
            ).values_list("permission__key", flat=True)
        )
        keys = frozenset(keys)
        self._permission_keys_cache = keys
        return keys

    def has_perm_key(self, key):
        """True when this user holds the permission `key`."""
        return key in self.permission_keys()

    def invalidate_permission_cache(self):
        """Call after changing a user's grants or departments mid-request."""
        self._permission_keys_cache = None


# ---------------------------------------------------------------------------
# Departments & permissions
# ---------------------------------------------------------------------------

class Department(models.Model):
    """
    An administrative department — the unit administrators are assigned to.

    A department carries an explicit set of permission keys
    (DepartmentPermission). Belonging to a department never grants blanket
    access: an administrator only ever holds the keys that were granted.
    """

    name = models.CharField(max_length=120, unique=True)
    # Stable machine identifier ("REGISTRAR"). Set on creation, then fixed —
    # it is what the seeded default set and the audit log refer to.
    code = models.SlugField(max_length=40, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Deactivated departments stop granting their permissions.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class PermissionDefinition(models.Model):
    """
    One row per permission key the code knows about.

    The registry in `core/rbac.py` is the source of truth; a migration keeps
    this table in step so the permission matrix can be rendered from the
    database without the frontend hardcoding keys.
    """

    key = models.CharField(max_length=60, unique=True)  # e.g. "fees.record_payment"
    module = models.CharField(max_length=40)            # rbac.MODULES key
    action = models.CharField(max_length=40)            # matrix column
    label = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)   # registry order

    class Meta:
        ordering = ["position", "key"]
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"

    def __str__(self):
        return self.key


class DepartmentPermission(models.Model):
    """A permission key granted to a department (its matrix row)."""

    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="permission_grants"
    )
    permission = models.ForeignKey(
        PermissionDefinition, on_delete=models.CASCADE, related_name="department_grants"
    )
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["department", "permission"], name="uniq_department_permission"
            )
        ]
        ordering = ["department__name", "permission__position"]

    def __str__(self):
        return f"{self.department.code} → {self.permission.key}"


class UserPermission(models.Model):
    """A permission key granted to one administrator personally."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="direct_grants"
    )
    permission = models.ForeignKey(
        PermissionDefinition, on_delete=models.CASCADE, related_name="user_grants"
    )
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "permission"], name="uniq_user_permission"
            )
        ]
        ordering = ["user__username", "permission__position"]

    def __str__(self):
        return f"{self.user.username} → {self.permission.key}"


# ---------------------------------------------------------------------------
# School structure
# ---------------------------------------------------------------------------

class SchoolYear(models.Model):
    """e.g. 2026–2027"""

    label = models.CharField(max_length=20, unique=True)  # "2026-2027"
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=False)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.label

    def clean(self):
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValidationError("Start date must be before end date.")

    def save(self, *args, **kwargs):
        # Only one active school year at a time
        if self.is_active:
            SchoolYear.objects.exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class GradeLevel(models.Model):
    """Grades 7–12"""

    name = models.CharField(max_length=20, unique=True)   # "Grade 7"
    order = models.PositiveSmallIntegerField(unique=True)  # 7–12 for sorting

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.name


class Section(models.Model):
    """A specific class group, e.g. 'Grade 7 — Sampaguita'"""

    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.CASCADE, related_name="sections"
    )
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.PROTECT, related_name="sections"
    )
    name = models.CharField(max_length=60)  # "Sampaguita"
    adviser = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": User.Role.TEACHER},
        related_name="advised_sections",
    )

    class Meta:
        ordering = ["grade_level__order", "name"]
        unique_together = [["school_year", "grade_level", "name"]]

    def __str__(self):
        return f"{self.grade_level} — {self.name} ({self.school_year})"


class Subject(models.Model):
    """A subject offered in a particular grade level and school year."""

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.PROTECT, related_name="subjects"
    )
    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.CASCADE, related_name="subjects"
    )
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["grade_level__order", "name"]
        unique_together = [["name", "grade_level", "school_year"]]

    def __str__(self):
        return f"{self.name} ({self.grade_level}, {self.school_year})"


class TeacherAssignment(models.Model):
    """Links a teacher to a subject and section for a school year."""

    teacher = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.TEACHER},
        related_name="assignments",
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="assignments"
    )
    section = models.ForeignKey(
        Section, on_delete=models.CASCADE, related_name="assignments"
    )

    class Meta:
        unique_together = [["teacher", "subject", "section"]]

    def __str__(self):
        return f"{self.teacher.get_full_name()} — {self.subject} / {self.section}"


class ClassSchedule(models.Model):
    """Weekly class schedule for a teacher assignment."""

    class DayOfWeek(models.IntegerChoices):
        MONDAY = 1, "Monday"
        TUESDAY = 2, "Tuesday"
        WEDNESDAY = 3, "Wednesday"
        THURSDAY = 4, "Thursday"
        FRIDAY = 5, "Friday"
        SATURDAY = 6, "Saturday"
        SUNDAY = 7, "Sunday"

    teacher_assignment = models.ForeignKey(
        TeacherAssignment,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    day_of_week = models.IntegerField(choices=DayOfWeek.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ["day_of_week", "start_time"]
        unique_together = [["teacher_assignment", "day_of_week", "start_time"]]

    def __str__(self):
        return f"{self.teacher_assignment} — {self.get_day_of_week_display()} {self.start_time}-{self.end_time}"

    def clean(self):
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time.")


# ---------------------------------------------------------------------------
# Student & Parent profiles
# ---------------------------------------------------------------------------

class StudentProfile(models.Model):
    """Extra school-specific info for a student user."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.STUDENT},
        related_name="student_profile",
    )
    lrn = models.CharField(
        "Learner Reference Number", max_length=12, unique=True, blank=True
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
    )
    date_of_birth = models.DateField(null=True, blank=True)
    address = models.TextField(blank=True)
    contact_number = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["user__last_name", "user__first_name"]

    def __str__(self):
        return f"Student: {self.user.get_full_name()}"


class ParentProfile(models.Model):
    """Extra info for a parent user, linked to one or more students."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.PARENT},
        related_name="parent_profile",
    )
    children = models.ManyToManyField(
        StudentProfile,
        blank=True,
        related_name="parents",
    )
    contact_number = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return f"Parent: {self.user.get_full_name()}"


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------

class Requirement(models.Model):
    """
    A task/assignment/project created by a teacher for a section + subject.
    """

    class Type(models.TextChoices):
        ASSIGNMENT = "assignment", "Assignment"
        PROJECT = "project", "Project"
        ACTIVITY = "activity", "Activity"
        QUIZ = "quiz", "Quiz"
        PERFORMANCE = "performance", "Performance Task"
        OTHER = "other", "Other"

    teacher_assignment = models.ForeignKey(
        TeacherAssignment,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    requirement_type = models.CharField(
        max_length=20, choices=Type.choices, default=Type.ASSIGNMENT
    )
    deadline = models.DateTimeField()
    allow_file_upload = models.BooleanField(default=False)
    allow_link_submission = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["deadline"]

    def __str__(self):
        return f"{self.title} — {self.teacher_assignment.section}"

    @property
    def is_overdue(self):
        return timezone.now() > self.deadline


class Submission(models.Model):
    """A student's submission for a requirement."""

    class Status(models.TextChoices):
        NOT_SUBMITTED = "not_submitted", "Not Submitted"
        SUBMITTED = "submitted", "Submitted — Awaiting Verification"
        VERIFIED = "verified", "Verified"
        RETURNED = "returned", "Returned for Revision"
        OVERDUE = "overdue", "Overdue"

    requirement = models.ForeignKey(
        Requirement, on_delete=models.CASCADE, related_name="submissions"
    )
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="submissions"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NOT_SUBMITTED
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    file_upload = models.FileField(
        upload_to="submissions/%Y/%m/", blank=True, null=True
    )
    link_url = models.URLField(blank=True)
    teacher_feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at"]
        unique_together = [["requirement", "student"]]

    def __str__(self):
        return f"{self.student} — {self.requirement.title} [{self.status}]"


class SubmissionHistory(models.Model):
    """Immutable log of every status change on a submission."""

    submission = models.ForeignKey(
        Submission, on_delete=models.CASCADE, related_name="history"
    )
    changed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="submission_changes"
    )
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    note = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return (
            f"{self.submission} | {self.old_status} → {self.new_status}"
        )


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceSession(models.Model):
    """
    One attendance-taking event — e.g. 'Grade 7 Sampaguita, Math, Oct 17 2026'.
    Can be auto-generated from schedule or manually created.
    """

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not Started"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"

    teacher_assignment = models.ForeignKey(
        TeacherAssignment,
        on_delete=models.CASCADE,
        related_name="attendance_sessions",
    )
    date = models.DateField()
    schedule = models.ForeignKey(
        'ClassSchedule',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_sessions",
        help_text="The schedule entry that generated this session (null for manual sessions)"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_sessions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "schedule__start_time"]
        # Unique: one session per (assignment, date, schedule)
        # For manual sessions (schedule=null), only one per (assignment, date)
        constraints = [
            models.UniqueConstraint(
                fields=['teacher_assignment', 'date', 'schedule'],
                name='unique_scheduled_session',
                condition=models.Q(schedule__isnull=False)
            ),
            models.UniqueConstraint(
                fields=['teacher_assignment', 'date'],
                name='unique_manual_session',
                condition=models.Q(schedule__isnull=True)
            ),
        ]

    def __str__(self):
        time_str = f" {self.schedule.start_time}" if self.schedule else ""
        return f"{self.teacher_assignment} — {self.date}{time_str}"

    def update_status(self):
        """Auto-update status based on records."""
        from django.db.models import Count
        total_students = self.teacher_assignment.section.students.count()
        if total_students == 0:
            self.status = self.Status.NOT_STARTED
        else:
            recorded_count = self.records.count()
            if recorded_count == 0:
                self.status = self.Status.NOT_STARTED
            elif recorded_count < total_students:
                self.status = self.Status.IN_PROGRESS
            else:
                self.status = self.Status.COMPLETED
        self.save(update_fields=['status'])


class AttendanceRecord(models.Model):
    """One student's attendance status for one session."""

    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        LATE = "late", "Late"
        EXCUSED = "excused", "Excused"

    session = models.ForeignKey(
        AttendanceSession, on_delete=models.CASCADE, related_name="records"
    )
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="attendance_records"
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PRESENT
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="recorded_attendance",
    )
    modified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="modified_attendance",
    )
    recorded_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-session__date"]
        unique_together = [["session", "student"]]

    def __str__(self):
        return f"{self.student} — {self.session.date} [{self.status}]"


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class Notification(models.Model):
    """In-app notification for a specific user."""

    class NotifType(models.TextChoices):
        REQUIREMENT_NEW = "requirement_new", "New Requirement"
        DEADLINE_APPROACHING = "deadline_approaching", "Deadline Approaching"
        OVERDUE = "overdue", "Overdue Requirement"
        SUBMISSION_VERIFIED = "submission_verified", "Submission Verified"
        SUBMISSION_RETURNED = "submission_returned", "Submission Returned"
        ATTENDANCE_ABSENT = "attendance_absent", "Marked Absent"
        ATTENDANCE_LATE = "attendance_late", "Marked Late"
        ANNOUNCEMENT = "announcement", "Announcement"

    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notifications"
    )
    notif_type = models.CharField(max_length=30, choices=NotifType.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    # Optional links back to source objects
    requirement = models.ForeignKey(
        Requirement, on_delete=models.SET_NULL, null=True, blank=True
    )
    submission = models.ForeignKey(
        Submission, on_delete=models.SET_NULL, null=True, blank=True
    )
    attendance_record = models.ForeignKey(
        AttendanceRecord, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.notif_type}] → {self.recipient.username}: {self.title}"


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

class Announcement(models.Model):
    """School-wide or section-specific announcement."""

    class Audience(models.TextChoices):
        ALL = "all", "Everyone"
        STUDENTS = "students", "Students"
        PARENTS = "parents", "Parents"
        TEACHERS = "teachers", "Teachers"

    author = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="announcements"
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    audience = models.CharField(
        max_length=10, choices=Audience.choices, default=Audience.ALL
    )
    # If null, the announcement is school-wide; otherwise it targets one section
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements",
    )
    is_pinned = models.BooleanField(default=False)
    published_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_pinned", "-published_at"]

    def __str__(self):
        return f"{self.title} ({self.audience})"


# ---------------------------------------------------------------------------
# Fee Management
# ---------------------------------------------------------------------------

class FeeCategory(models.Model):
    """
    A category of school fees — e.g. Tuition, PTA, Laboratory, Computer, etc.
    Supports both compulsory and voluntary fees.
    """

    class FeeType(models.TextChoices):
        COMPULSORY = "compulsory", "Compulsory"
        VOLUNTARY = "voluntary", "Voluntary"

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)  # e.g. "TUITION", "PTA", "LAB"
    fee_type = models.CharField(
        max_length=20, choices=FeeType.choices, default=FeeType.COMPULSORY
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Fee Category"
        verbose_name_plural = "Fee Categories"

    def __str__(self):
        return f"{self.name} ({self.get_fee_type_display()})"


class FeeAssessment(models.Model):
    """
    A fee assessment for a specific school year, grade level, section, or student.
    Supports bulk assessments by school year/grade/section and individual assessments.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    category = models.ForeignKey(
        FeeCategory, on_delete=models.PROTECT, related_name="assessments"
    )
    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.CASCADE, related_name="fee_assessments"
    )
    grade_level = models.ForeignKey(
        GradeLevel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fee_assessments",
        help_text="If set, applies to all sections in this grade level. If null, applies to specific sections or students.",
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fee_assessments",
        help_text="If set with grade_level, applies only to this section. If grade_level is null, applies only to this section.",
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fee_assessments",
        help_text="If set, applies only to this specific student (individual assessment).",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_fee_assessments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-school_year__start_date", "category__name"]
        verbose_name = "Fee Assessment"
        verbose_name_plural = "Fee Assessments"

    def __str__(self):
        scope = []
        if self.grade_level:
            scope.append(str(self.grade_level))
        if self.section:
            scope.append(str(self.section))
        if self.student:
            scope.append(f"Student: {self.student.user.get_full_name()}")
        scope_str = " / ".join(scope) if scope else "School-wide"
        return f"{self.category.name} — {self.amount} — {scope_str} ({self.school_year})"

    def clean(self):
        from django.core.exceptions import ValidationError
        # Validate scope: at least one of grade_level, section, or student must be set
        if not self.grade_level and not self.section and not self.student:
            raise ValidationError("At least one of grade_level, section, or student must be specified.")
        # If student is set, grade_level and section should be null (individual assessment)
        if self.student and (self.grade_level or self.section):
            raise ValidationError("Individual student assessments cannot have grade_level or section set.")
        # If section is set, grade_level must match
        if self.section and self.grade_level and self.section.grade_level_id != self.grade_level_id:
            raise ValidationError("Section's grade level must match the assessment's grade level.")
        # If section is set, school_year must match
        if self.section and self.section.school_year_id != self.school_year_id:
            raise ValidationError("Section's school year must match the assessment's school year.")

    def get_applicable_students(self):
        """
        Returns a queryset of StudentProfile objects this assessment applies to.
        """
        from django.db.models import Q
        qs = StudentProfile.objects.filter(user__is_active=True)

        if self.student:
            return qs.filter(pk=self.student.pk)

        if self.section:
            return qs.filter(section=self.section)

        if self.grade_level:
            sections = Section.objects.filter(
                school_year=self.school_year, grade_level=self.grade_level
            )
            return qs.filter(section__in=sections)

        # School-wide: all students in the school year
        sections = Section.objects.filter(school_year=self.school_year)
        return qs.filter(section__in=sections)

    @property
    def total_assessed(self):
        """Total amount assessed across all applicable students."""
        count = self.get_applicable_students().count()
        return self.amount * count

    @property
    def total_collected(self):
        """Total amount collected for this assessment."""
        from django.db.models import Sum
        students = self.get_applicable_students()
        payments = FeePayment.objects.filter(
            assessment=self, student__in=students, status=FeePayment.Status.COMPLETED
        )
        return payments.aggregate(total=Sum("amount"))["total"] or 0

    @property
    def outstanding_balance(self):
        """Total outstanding balance for this assessment."""
        return self.total_assessed - self.total_collected


class FeePayment(models.Model):
    """
    A payment record for a fee assessment by a student.
    Supports partial payments and tracks payment method, reference, etc.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        VOIDED = "voided", "Voided"
        REFUNDED = "refunded", "Refunded"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CHECK = "check", "Check"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        ONLINE = "online", "Online Payment"
        OTHER = "other", "Other"

    assessment = models.ForeignKey(
        FeeAssessment, on_delete=models.CASCADE, related_name="payments"
    )
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="fee_payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    reference_number = models.CharField(max_length=100, blank=True)
    receipt_number = models.CharField(max_length=50, blank=True, unique=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.COMPLETED
    )
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="recorded_fee_payments",
    )
    voided_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="voided_fee_payments",
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-payment_date", "-created_at"]
        verbose_name = "Fee Payment"
        verbose_name_plural = "Fee Payments"

    def __str__(self):
        return f"{self.student.user.get_full_name()} — {self.assessment.category.name} — {self.amount} — {self.payment_date}"

    def clean(self):
        from django.core.exceptions import ValidationError
        # Validate amount is positive
        if self.amount and self.amount <= 0:
            raise ValidationError({"amount": "Payment amount must be positive."})
        # Validate student is applicable for this assessment
        if self.assessment_id and self.student_id:
            applicable = self.assessment.get_applicable_students()
            if not applicable.filter(pk=self.student_id).exists():
                raise ValidationError(
                    {"student": "This student is not covered by the selected assessment."}
                )

    @property
    def is_voided_or_refunded(self):
        return self.status in [self.Status.VOIDED, self.Status.REFUNDED]


class FeePaymentHistory(models.Model):
    """
    Immutable audit trail for every payment status change.
    Preserves history for voided or reversed payments.
    """

    payment = models.ForeignKey(
        FeePayment, on_delete=models.CASCADE, related_name="history"
    )
    changed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="fee_payment_changes"
    )
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    old_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    new_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    note = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Fee Payment History"
        verbose_name_plural = "Fee Payment Histories"

    def __str__(self):
        return f"{self.payment} | {self.old_status} → {self.new_status}"


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

class AuditLog(models.Model):
    """Records important administrative actions for accountability."""

    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="audit_logs"
    )
    action = models.CharField(max_length=100)  # e.g. "user.created"
    target_model = models.CharField(max_length=60, blank=True)
    target_id = models.CharField(max_length=40, blank=True)
    description = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.actor} — {self.action} @ {self.timestamp:%Y-%m-%d %H:%M}"
