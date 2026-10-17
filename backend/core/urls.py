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

    # ── Dashboard ────────────────────────────────────────────────────────────
    path("dashboard/", views.dashboard_summary, name="dashboard_summary"),
]
