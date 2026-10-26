from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    Announcement,
    ApplicationDocument,
    ApplicationReviewEvent,
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    ClassSchedule,
    Enrollment,
    EnrollmentApplication,
    EnrollmentPeriod,
    EnrollmentRequirement,
    FeeAssessment,
    FeeCategory,
    FeePayment,
    FeePaymentHistory,
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


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "get_full_name", "role", "email", "is_active")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("username", "first_name", "last_name", "email")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("TRACK Profile", {"fields": ("role", "middle_name")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("TRACK Profile", {"fields": ("role", "first_name", "last_name", "middle_name", "email")}),
    )


@admin.register(SchoolYear)
class SchoolYearAdmin(admin.ModelAdmin):
    list_display = ("label", "start_date", "end_date", "is_active")
    list_editable = ("is_active",)


@admin.register(GradeLevel)
class GradeLevelAdmin(admin.ModelAdmin):
    list_display = ("name", "order")


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "grade_level", "school_year", "adviser")
    list_filter = ("school_year", "grade_level")
    search_fields = ("name",)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "grade_level", "school_year")
    list_filter = ("school_year", "grade_level")
    search_fields = ("name", "code")


@admin.register(TeacherAssignment)
class TeacherAssignmentAdmin(admin.ModelAdmin):
    list_display = ("teacher", "subject", "section")
    list_filter = ("subject__school_year",)
    search_fields = ("teacher__last_name", "subject__name")


@admin.register(ClassSchedule)
class ClassScheduleAdmin(admin.ModelAdmin):
    list_display = ("teacher_assignment", "get_day_of_week_display", "start_time", "end_time", "room")
    list_filter = ("day_of_week",)
    search_fields = ("teacher_assignment__teacher__last_name", "room")


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ("__str__", "lrn", "section")
    search_fields = ("user__last_name", "user__first_name", "lrn")
    list_filter = ("section__grade_level",)


@admin.register(ParentProfile)
class ParentProfileAdmin(admin.ModelAdmin):
    list_display = ("__str__",)
    search_fields = ("user__last_name", "user__first_name")
    filter_horizontal = ("children",)


@admin.register(Requirement)
class RequirementAdmin(admin.ModelAdmin):
    list_display = ("title", "requirement_type", "teacher_assignment", "deadline", "is_overdue")
    list_filter = ("requirement_type", "teacher_assignment__subject__school_year")
    search_fields = ("title",)


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ("student", "requirement", "status", "submitted_at")
    list_filter = ("status",)
    search_fields = ("student__user__last_name", "requirement__title")


@admin.register(SubmissionHistory)
class SubmissionHistoryAdmin(admin.ModelAdmin):
    list_display = ("submission", "old_status", "new_status", "changed_by", "timestamp")
    readonly_fields = ("timestamp",)


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "date", "status", "schedule", "created_by")
    list_filter = ("status", "date", "teacher_assignment__subject__school_year")
    readonly_fields = ("status",)


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("student", "session", "status", "recorded_by")
    list_filter = ("status",)
    search_fields = ("student__user__last_name",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "notif_type", "title", "is_read", "created_at")
    list_filter = ("notif_type", "is_read")
    search_fields = ("recipient__username", "title")


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "audience", "author", "is_pinned", "published_at")
    list_filter = ("audience", "is_pinned")
    search_fields = ("title", "body")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("actor", "action", "target_model", "target_id", "timestamp")
    readonly_fields = ("timestamp",)
    list_filter = ("action",)
    search_fields = ("actor__username", "action", "description")


@admin.register(FeeCategory)
class FeeCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "fee_type", "is_active", "created_at")
    list_filter = ("fee_type", "is_active")
    search_fields = ("name", "code")
    list_editable = ("is_active",)


@admin.register(FeeAssessment)
class FeeAssessmentAdmin(admin.ModelAdmin):
    list_display = ("__str__", "category", "school_year", "grade_level", "section", "amount", "due_date", "status")
    list_filter = ("status", "school_year", "grade_level", "category__fee_type")
    search_fields = ("category__name", "student__user__last_name", "student__lrn")
    readonly_fields = ("created_at", "updated_at", "created_by")
    list_editable = ("status",)


@admin.register(FeePayment)
class FeePaymentAdmin(admin.ModelAdmin):
    list_display = ("__str__", "assessment", "student", "amount", "payment_date", "payment_method", "status", "receipt_number")
    list_filter = ("status", "payment_method", "assessment__school_year", "assessment__category")
    search_fields = ("student__user__last_name", "student__lrn", "reference_number", "receipt_number")
    readonly_fields = ("receipt_number", "created_at", "updated_at", "recorded_by", "voided_by", "voided_at")
    list_editable = ("status",)


@admin.register(FeePaymentHistory)
class FeePaymentHistoryAdmin(admin.ModelAdmin):
    list_display = ("payment", "old_status", "new_status", "changed_by", "timestamp")
    readonly_fields = ("timestamp",)
    list_filter = ("new_status",)
    search_fields = ("payment__student__user__last_name", "note")


# ---------------------------------------------------------------------------
# Enrollment & Admissions
# ---------------------------------------------------------------------------

@admin.register(EnrollmentPeriod)
class EnrollmentPeriodAdmin(admin.ModelAdmin):
    list_display = ("__str__", "school_year", "status", "opens_at", "closes_at", "allow_waitlist", "created_at")
    list_filter = ("status", "school_year", "allow_waitlist")
    filter_horizontal = ("grade_levels",)
    readonly_fields = ("created_by", "created_at", "updated_at")


@admin.register(EnrollmentRequirement)
class EnrollmentRequirementAdmin(admin.ModelAdmin):
    list_display = ("name", "period", "grade_level", "enrollment_type", "is_required", "requires_verification", "is_active", "position")
    list_filter = ("is_active", "is_required", "requires_verification", "period", "enrollment_type")
    search_fields = ("name",)


@admin.register(EnrollmentApplication)
class EnrollmentApplicationAdmin(admin.ModelAdmin):
    list_display = ("reference", "get_full_name", "status", "enrollment_type", "grade_level", "school_year", "assigned_section", "submitted_at")
    list_filter = ("status", "enrollment_type", "school_year", "grade_level")
    search_fields = ("reference", "first_name", "last_name", "lrn", "applicant_name")
    readonly_fields = ("reference", "requirements_snapshot", "created_at", "updated_at")


@admin.register(ApplicationDocument)
class ApplicationDocumentAdmin(admin.ModelAdmin):
    list_display = ("name", "application", "status", "is_required", "requires_verification", "submitted_at", "verified_at", "verified_by")
    list_filter = ("status", "is_required", "requires_verification")
    search_fields = ("name", "application__reference", "original_filename")


@admin.register(ApplicationReviewEvent)
class ApplicationReviewEventAdmin(admin.ModelAdmin):
    list_display = ("application", "action", "actor_name", "from_status", "to_status", "created_at")
    list_filter = ("action", "to_status")
    search_fields = ("application__reference", "actor_name")
    readonly_fields = ("application", "actor", "actor_name", "action", "from_status", "to_status", "note", "internal_note", "created_at")


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student", "school_year", "grade_level", "section_name", "status", "confirmed_by", "confirmed_at")
    list_filter = ("status", "school_year", "grade_level")
    search_fields = ("student__user__last_name", "student__lrn", "application__reference")
