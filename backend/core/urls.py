"""
TRACK — API URL configuration
All routes are prefixed with /api/ from config/urls.py
"""

from django.urls import path

from . import views

urlpatterns = [
    # ── Health ──────────────────────────────────────────────────────────────
    path("health/", views.health_check, name="health_check"),

    # ── Auth ────────────────────────────────────────────────────────────────
    path("auth/csrf/", views.csrf_token, name="csrf_token"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    # Mobile: the Expo app exchanges credentials for a DRF token, since it has
    # no cookie jar to hold a Django session or a CSRF token.
    path("auth/token/", views.TokenLoginView.as_view(), name="token_login"),
    path("auth/token/logout/", views.TokenLogoutView.as_view(), name="token_logout"),
    path("auth/me/", views.CurrentUserView.as_view(), name="current_user"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="change_password"),
    path("auth/reset-password/", views.ResetPasswordView.as_view(), name="reset_password"),

    # ── Users (admin) ────────────────────────────────────────────────────────
    path("users/", views.UserListCreateView.as_view(), name="user_list"),
    path("users/<int:pk>/", views.UserDetailView.as_view(), name="user_detail"),

    # ── School structure ────────────────────────────────────────────────────
    path("school-years/", views.SchoolYearListCreateView.as_view(), name="school_year_list"),
    path("school-years/<int:pk>/", views.SchoolYearDetailView.as_view(), name="school_year_detail"),
    path("grade-levels/", views.GradeLevelListCreateView.as_view(), name="grade_level_list"),
    path("grade-levels/<int:pk>/", views.GradeLevelDetailView.as_view(), name="grade_level_detail"),
    path("sections/", views.SectionListCreateView.as_view(), name="section_list"),
    path("sections/<int:pk>/", views.SectionDetailView.as_view(), name="section_detail"),
    path("subjects/", views.SubjectListCreateView.as_view(), name="subject_list"),
    path("subjects/<int:pk>/", views.SubjectDetailView.as_view(), name="subject_detail"),
    path("teacher-assignments/", views.TeacherAssignmentListCreateView.as_view(), name="teacher_assignment_list"),
    path("teacher-assignments/<int:pk>/", views.TeacherAssignmentDetailView.as_view(), name="teacher_assignment_detail"),

    # ── Students ────────────────────────────────────────────────────────────
    path("students/", views.StudentProfileListView.as_view(), name="student_list"),

    # ── Requirements ────────────────────────────────────────────────────────
    path("requirements/", views.RequirementListCreateView.as_view(), name="requirement_list"),
    path("requirements/<int:pk>/", views.RequirementDetailView.as_view(), name="requirement_detail"),

    # ── Submissions ──────────────────────────────────────────────────────────
    path("submissions/", views.SubmissionListCreateView.as_view(), name="submission_list"),
    path("submissions/<int:pk>/", views.SubmissionDetailView.as_view(), name="submission_detail"),

    # ── Attendance ──────────────────────────────────────────────────────────
    path("schedules/", views.ClassScheduleListCreateView.as_view(), name="schedule_list"),
    path("schedules/<int:pk>/", views.ClassScheduleDetailView.as_view(), name="schedule_detail"),
    path("attendance/generate/", views.generate_attendance_sessions, name="generate_attendance"),
    path("attendance/sessions/", views.AttendanceSessionListCreateView.as_view(), name="attendance_session_list"),
    path("attendance/sessions/<int:pk>/", views.AttendanceSessionDetailView.as_view(), name="attendance_session_detail"),
    path("attendance/records/", views.AttendanceRecordListCreateView.as_view(), name="attendance_record_list"),
    path("attendance/records/<int:pk>/", views.AttendanceRecordDetailView.as_view(), name="attendance_record_detail"),

    # ── Notifications ────────────────────────────────────────────────────────
    path("notifications/", views.NotificationListView.as_view(), name="notification_list"),
    path("notifications/<int:pk>/read/", views.NotificationMarkReadView.as_view(), name="notification_mark_read"),
    path("notifications/read-all/", views.mark_all_notifications_read, name="notifications_read_all"),

    # ── Announcements ────────────────────────────────────────────────────────
    path("announcements/", views.AnnouncementListCreateView.as_view(), name="announcement_list"),
    path("announcements/<int:pk>/", views.AnnouncementDetailView.as_view(), name="announcement_detail"),

    # ── Fee Management ──────────────────────────────────────────────────────
    path("fee-categories/", views.FeeCategoryListCreateView.as_view(), name="fee_category_list"),
    path("fee-categories/<int:pk>/", views.FeeCategoryDetailView.as_view(), name="fee_category_detail"),
    path("fee-assessments/", views.FeeAssessmentListCreateView.as_view(), name="fee_assessment_list"),
    path("fee-assessments/<int:pk>/", views.FeeAssessmentDetailView.as_view(), name="fee_assessment_detail"),
    path("fee-payments/", views.FeePaymentListCreateView.as_view(), name="fee_payment_list"),
    path("fee-payments/<int:pk>/", views.FeePaymentDetailView.as_view(), name="fee_payment_detail"),
    path("fee-payments/<int:payment_id>/history/", views.FeePaymentHistoryView.as_view(), name="fee_payment_history"),
    path("fee-summary/", views.StudentFeeSummaryView.as_view(), name="student_fee_summary"),
    path("fee-reports/collection/", views.fee_collection_report, name="fee_collection_report"),
    path("fee-reports/outstanding/", views.fee_outstanding_report, name="fee_outstanding_report"),
    path("fee-dashboard/", views.fee_dashboard_summary, name="fee_dashboard_summary"),

    # ── Dashboard ────────────────────────────────────────────────────────────
    path("dashboard/", views.dashboard_summary, name="dashboard_summary"),

    # ── Departments, roles & permissions ────────────────────────────────────
    path("departments/", views.DepartmentListCreateView.as_view(), name="department_list"),
    path("departments/<int:pk>/", views.DepartmentDetailView.as_view(), name="department_detail"),
    path("departments/<int:pk>/permissions/", views.DepartmentPermissionsView.as_view(), name="department_permissions"),
    path("permissions/", views.PermissionDefinitionListView.as_view(), name="permission_list"),
    path("users/<int:pk>/permissions/", views.UserPermissionsView.as_view(), name="user_permissions"),

    # ── Audit log ────────────────────────────────────────────────────────────
    path("audit-logs/", views.AuditLogListView.as_view(), name="audit_log_list"),
]
