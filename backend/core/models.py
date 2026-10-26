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
    capacity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            "Maximum number of active enrollments in this section. "
            "Leave blank for no configured limit."
        ),
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
        ENROLLMENT_SUBMITTED = "enrollment_submitted", "Enrollment Application Submitted"
        ENROLLMENT_CORRECTIONS = "enrollment_corrections", "Enrollment Corrections Requested"
        ENROLLMENT_DECISION = "enrollment_decision", "Enrollment Application Decision"
        ENROLLMENT_CONFIRMED = "enrollment_confirmed", "Enrollment Confirmed"

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
    # Enrollment applications (see the Enrollment & Admissions section below)
    application = models.ForeignKey(
        "EnrollmentApplication",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
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


# ---------------------------------------------------------------------------
# Enrollment & Admissions
# ---------------------------------------------------------------------------
#
# A separate module (core/enrollment.py) implements the workflow rules on top
# of these models. Design notes:
#
#   * Admission document requirements (EnrollmentRequirement) are distinct
#     from the academic Requirement model above — never conflate the two.
#   * Every application freezes its effective requirement checklist at
#     creation time (requirements_snapshot + per-document snapshot fields), so
#     later configuration edits never rewrite historical evidence.
#   * An accepted application is NOT an enrollment. Enrollment rows are only
#     created by the Registrar's final confirmation, which re-validates
#     documents, section capacity and student identity inside one transaction.
#   * Occupancy for capacity checks counts Enrollment rows with
#     status='active' only — cancelled/dropped enrollments never occupy a
#     slot, and a null Section.capacity means "no configured limit".


class EnrollmentType(models.TextChoices):
    """How the applicant is entering the requested grade level."""

    NEW = "new", "New enrollee"
    RETURNING = "returning", "Returning student"
    TRANSFEREE = "transferee", "Transferee"


class EnrollmentPeriod(models.Model):
    """
    An application window for one school year.

    Closing a period stops new submissions; it never deletes or cancels
    existing applications.
    """

    class Status(models.TextChoices):
        UPCOMING = "upcoming", "Upcoming"
        OPEN = "open", "Open for applications"
        CLOSED = "closed", "Closed"

    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.PROTECT, related_name="enrollment_periods"
    )
    name = models.CharField(
        max_length=120,
        blank=True,
        help_text="Optional label, e.g. 'SY 2026-2027 Registration'.",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UPCOMING
    )
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    grade_levels = models.ManyToManyField(
        GradeLevel,
        blank=True,
        related_name="enrollment_periods",
        help_text="Grade levels this period accepts. Empty = every grade level.",
    )
    allowed_enrollment_types = models.JSONField(
        blank=True,
        null=True,
        help_text=(
            "List of enrollment_type codes this period accepts "
            "(see EnrollmentType). Empty/null = all types."
        ),
    )
    allow_waitlist = models.BooleanField(
        default=False,
        help_text="Whether staff may waitlist applications when a grade level is full.",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_enrollment_periods",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-school_year__start_date", "opens_at"]

    def __str__(self):
        label = self.name or f"{self.school_year.label} enrollment"
        return f"{label} ({self.get_status_display()})"

    def clean(self):
        if self.opens_at and self.closes_at and self.opens_at >= self.closes_at:
            raise ValidationError("The opening date must be before the closing date.")

    def accepts_grade_level(self, grade_level) -> bool:
        allowed = list(self.grade_levels.all())
        if not allowed:
            return True
        return any(g.pk == getattr(grade_level, "pk", grade_level) for g in allowed)

    def accepts_type(self, enrollment_type: str) -> bool:
        allowed = self.allowed_enrollment_types or []
        if not allowed:
            return True
        return enrollment_type in allowed

    @property
    def is_accepting_applications(self) -> bool:
        now = timezone.now()
        return (
            self.status == self.Status.OPEN
            and self.opens_at <= now <= self.closes_at
        )


class EnrollmentRequirement(models.Model):
    """
    A configurable admission-document requirement for an enrollment period.

    Requirements are snapshot onto each application when it is created, so
    editing or deactivating a requirement never alters applications that
    already exist. Deleting one is blocked (PROTECT) once documents reference
    it — deactivate instead.
    """

    period = models.ForeignKey(
        EnrollmentPeriod, on_delete=models.CASCADE, related_name="document_requirements"
    )
    grade_level = models.ForeignKey(
        GradeLevel,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="enrollment_requirements",
        help_text="Applies to this grade level only. Empty = every grade level in the period.",
    )
    enrollment_type = models.CharField(
        max_length=20,
        choices=EnrollmentType.choices,
        blank=True,
        help_text="Applies to this enrollment type only. Empty = every type.",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_required = models.BooleanField(
        default=True,
        help_text="Required documents must be verified (or waived) before the "
        "application can be accepted or confirmed.",
    )
    requires_verification = models.BooleanField(
        default=True,
        help_text="A reviewer must explicitly verify the uploaded file.",
    )
    is_active = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        scope = self.grade_level.name if self.grade_level else "All grades"
        return f"{self.name} — {self.period} ({scope})"

    def applies_to(self, grade_level, enrollment_type) -> bool:
        if not self.is_active:
            return False
        if self.grade_level_id and self.grade_level_id != getattr(grade_level, "pk", grade_level):
            return False
        if self.enrollment_type and self.enrollment_type != enrollment_type:
            return False
        return True


class ApplicationStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    UNDER_REVIEW = "under_review", "Under Review"
    INCOMPLETE = "incomplete", "Incomplete — Corrections Required"
    RESUBMITTED = "resubmitted", "Resubmitted"
    ACCEPTED = "accepted", "Accepted"
    WAITLISTED = "waitlisted", "Waitlisted"
    REJECTED = "rejected", "Rejected"
    ENROLLED = "enrolled", "Enrolled"
    WITHDRAWN = "withdrawn", "Withdrawn"
    CANCELLED = "cancelled", "Cancelled"


class EnrollmentApplication(models.Model):
    """
    One application to enroll in a grade level for a school year.

    The applicant is the authenticated user who submits (a student or a
    parent/guardian). Object-level access is enforced through queryset
    scoping: an applicant only ever sees rows where they are the applicant or
    the linked student's user.
    """

    reference = models.CharField(
        max_length=20, unique=True, blank=True, db_index=True,
        help_text="Non-guessable application reference, assigned on creation.",
    )
    applicant = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollment_applications",
        help_text="The authenticated user who created/owns the application.",
    )
    applicant_name = models.CharField(
        max_length=200, blank=True,
        help_text="Snapshot of the submitting account's name.",
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollment_applications",
        help_text="Existing student identity, when matched or linked by staff.",
    )
    period = models.ForeignKey(
        EnrollmentPeriod, on_delete=models.PROTECT, related_name="applications"
    )
    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.PROTECT, related_name="enrollment_applications"
    )
    enrollment_type = models.CharField(max_length=20, choices=EnrollmentType.choices)
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.PROTECT, related_name="enrollment_applications"
    )
    strand = models.CharField(
        max_length=120, blank=True,
        help_text="Intended Senior High School strand/track (Grades 11–12 only).",
    )
    previous_school = models.CharField(max_length=150, blank=True)
    previous_school_address = models.CharField(max_length=200, blank=True)

    # -- applicant identity (reused from the linked user/profile when present)
    lrn = models.CharField("Learner Reference Number", max_length=12, blank=True)
    first_name = models.CharField(max_length=150, blank=True)
    middle_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    sex = models.CharField(
        max_length=10,
        choices=[("female", "Female"), ("male", "Male")],
        blank=True,
    )
    address = models.TextField(blank=True)
    contact_number = models.CharField(max_length=20, blank=True)

    # -- parent / guardian
    guardian_name = models.CharField(max_length=150, blank=True)
    guardian_relationship = models.CharField(max_length=60, blank=True)
    guardian_contact = models.CharField(max_length=100, blank=True)
    guardian_email = models.EmailField(blank=True)

    # -- workflow
    status = models.CharField(
        max_length=20,
        choices=ApplicationStatus.choices,
        default=ApplicationStatus.DRAFT,
        db_index=True,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    reviewer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_enrollment_applications",
    )
    decision_reason = models.TextField(blank=True)

    # -- section assignment (approved by staff; enrollment created on confirm)
    assigned_section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollment_applications",
    )
    section_approved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    section_assigned_at = models.DateTimeField(null=True, blank=True)

    # -- public (account-less) access & post-enrollment account claim
    # A guest application has no `applicant` account yet; `guest_token` is the
    # non-guessable credential its owner uses to track and edit it (it can be
    # re-issued through the reference + contact lookup). After the Registrar
    # confirms enrollment, `account_claim_token` lets the enrolled student set
    # up their account exactly once; `account_claimed_at` records the claim.
    guest_token = models.CharField(
        max_length=64, unique=True, null=True, blank=True, editable=False
    )
    account_claim_token = models.CharField(
        max_length=64, unique=True, null=True, blank=True, editable=False
    )
    account_claimed_at = models.DateTimeField(null=True, blank=True)

    # -- checklist frozen when the application record is created
    requirements_snapshot = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["applicant", "school_year"],
                condition=models.Q(applicant__isnull=False)
                & models.Q(
                    status__in=[
                        ApplicationStatus.DRAFT,
                        ApplicationStatus.SUBMITTED,
                        ApplicationStatus.UNDER_REVIEW,
                        ApplicationStatus.INCOMPLETE,
                        ApplicationStatus.RESUBMITTED,
                        ApplicationStatus.ACCEPTED,
                        ApplicationStatus.WAITLISTED,
                    ]
                ),
                name="uniq_open_application_per_applicant_year",
            ),
        ]

    def __str__(self):
        return f"{self.reference} — {self.get_full_name()} ({self.get_status_display()})"

    def get_full_name(self):
        return " ".join(
            part for part in (self.first_name, self.middle_name, self.last_name) if part
        ).strip() or self.applicant_name or f"Application {self.reference}"

    def save(self, *args, **kwargs):
        if self.period_id and not self.school_year_id:
            self.school_year_id = self.period.school_year_id
        import secrets

        if not self.reference:
            # Non-guessable reference: 40 bits of CSPRNG entropy, retrying on
            # the (astronomically unlikely) collision.
            while True:
                candidate = f"APP-{secrets.token_hex(5).upper()}"
                if not EnrollmentApplication.objects.filter(reference=candidate).exists():
                    self.reference = candidate
                    break
        if self.applicant_id is None and not self.guest_token:
            # Account-less applications need their own non-guessable credential
            # (128 bits) so the owner can return to them without an account.
            while True:
                candidate = secrets.token_hex(16)
                if not EnrollmentApplication.objects.filter(guest_token=candidate).exists():
                    self.guest_token = candidate
                    break
        super().save(*args, **kwargs)

    def clean(self):
        if self.period_id and self.grade_level_id:
            if not self.period.accepts_grade_level(self.grade_level_id):
                raise ValidationError(
                    {"grade_level": "This grade level is not accepted in the selected enrollment period."}
                )
        if self.period_id and self.enrollment_type:
            if not self.period.accepts_type(self.enrollment_type):
                raise ValidationError(
                    {"enrollment_type": "This enrollment type is not accepted in the selected enrollment period."}
                )

    @property
    def is_editable_by_applicant(self):
        return self.status in (ApplicationStatus.DRAFT, ApplicationStatus.INCOMPLETE)


class ApplicationDocument(models.Model):
    """
    One application's submission of one requirement.

    The requirement's identity and policy (name, required, verification) are
    copied onto the row when it is created so later configuration edits never
    rewrite historical evidence.
    """

    class Status(models.TextChoices):
        NOT_SUBMITTED = "not_submitted", "Not Submitted"
        SUBMITTED = "submitted", "Submitted — Awaiting Review"
        VERIFIED = "verified", "Verified"
        RETURNED = "returned", "Returned for Correction"
        WAIVED = "waived", "Waived"

    application = models.ForeignKey(
        EnrollmentApplication, on_delete=models.CASCADE, related_name="documents"
    )
    requirement = models.ForeignKey(
        EnrollmentRequirement, on_delete=models.PROTECT, related_name="documents"
    )
    name = models.CharField(max_length=150)
    is_required = models.BooleanField(default=True)
    requires_verification = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)
    file = models.FileField(
        upload_to="enrollment/documents/%Y/", blank=True, null=True
    )
    original_filename = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NOT_SUBMITTED
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    review_note = models.TextField(
        blank=True, help_text="Applicant-facing review note."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "name"]
        unique_together = [["application", "requirement"]]

    def __str__(self):
        return f"{self.name} — {self.application.reference} [{self.status}]"


class ApplicationReviewEvent(models.Model):
    """
    Immutable history of everything that happened to an application.

    Applicants and parents only ever see `note` (the applicant-facing
    explanation); `internal_note` is restricted to staff holding
    enrollment.view.
    """

    application = models.ForeignKey(
        EnrollmentApplication, on_delete=models.CASCADE, related_name="events"
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    actor_name = models.CharField(max_length=200, blank=True)
    action = models.CharField(max_length=50)  # e.g. "submitted", "status_changed"
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    note = models.TextField(blank=True)
    internal_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.application.reference}: {self.action} ({self.to_status or '-'})"

    def save(self, *args, **kwargs):
        if self.actor and not self.actor_name:
            self.actor_name = self.actor.get_full_name() or self.actor.username
        super().save(*args, **kwargs)


class Enrollment(models.Model):
    """
    A confirmed, school-year-specific enrollment of a permanent student.

    Created only by the Registrar's final confirmation. One student may hold
    one active enrollment per school year (DB-enforced) and keeps every
    historical row when advancing or changing sections.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        DROPPED = "dropped", "Dropped"
        WITHDRAWN = "withdrawn", "Withdrawn"

    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="enrollments"
    )
    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.PROTECT, related_name="enrollments"
    )
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.PROTECT, related_name="enrollments"
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollments",
    )
    section_name = models.CharField(
        max_length=60, blank=True, help_text="Snapshot of the section name at confirmation."
    )
    application = models.ForeignKey(
        EnrollmentApplication,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollments",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    confirmed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_enrollments",
    )
    confirmed_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-school_year__start_date", "grade_level__order", "student__user__last_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "school_year"],
                condition=models.Q(status="active"),
                name="uniq_active_enrollment_per_student_year",
            ),
            models.UniqueConstraint(
                fields=["application"],
                condition=models.Q(application__isnull=False),
                name="uniq_enrollment_per_application",
            ),
        ]

    def __str__(self):
        return f"{self.student} — {self.school_year} [{self.get_status_display()}]"
