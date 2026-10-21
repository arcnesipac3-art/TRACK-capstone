from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    Announcement,
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
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
