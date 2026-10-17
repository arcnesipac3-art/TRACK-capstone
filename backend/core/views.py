"""
TRACK — API Views
"""

from django.contrib.auth import login, logout
from django.db.models import Count, ProtectedError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import generics

from .models import (
    Announcement,
    AuditLog,
    AttendanceRecord,
    AttendanceSession,
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
from .permissions import IsAdmin, IsAdminOrReadOnly, IsAdminOrTeacher, IsTeacher
from .serializers import (
    AdminUserSerializer,
    AnnouncementSerializer,
    AttendanceRecordSerializer,
    AttendanceSessionSerializer,
    ChangePasswordSerializer,
    GradeLevelSerializer,
    LoginSerializer,
    NotificationSerializer,
    RequirementSerializer,
    ResetPasswordSerializer,
    SchoolYearSerializer,
    SectionSerializer,
    StudentProfileSerializer,
    SubjectSerializer,
    SubmissionSerializer,
    TeacherAssignmentSerializer,
    UserSerializer,
)


# ---------------------------------------------------------------------------
# Health check (public)
# ---------------------------------------------------------------------------

def _client_ip(request):
    """Best-effort client IP for the audit log."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


@require_GET
def health_check(request):
    return JsonResponse({
        "status": "success",
        "project": "TRACK",
        "message": "TRACK backend is running.",
    })


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    """Return a CSRF token so the React SPA can attach it to POST requests."""
    return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.validated_data["user"]
        login(request, user)
        AuditLog.objects.create(
            actor=user,
            action="auth.login",
            target_model="User",
            target_id=str(user.pk),
            description=f"{user.get_full_name()} signed in.",
            ip_address=_client_ip(request),
        )
        return Response({
            "message": "Logged in successfully.",
            "user": UserSerializer(user).data,
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"message": "Logged out successfully."})

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        # Re-login so the session stays valid after password change
        login(request, request.user)
        return Response({"message": "Password changed successfully."})


class ResetPasswordView(APIView):
    """
    Admin: reset another account's password.

    This is the registrar's recovery path for a locked-out teacher, student or
    parent. There is no self-service email reset because the deployment has no
    SMTP configured. Every reset is written to the audit log.
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.get(pk=serializer.validated_data["user_id"])
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        # Changing a password invalidates every other session for that user,
        # because Django hashes the password into the session hash.
        AuditLog.objects.create(
            actor=request.user,
            action="auth.password_reset",
            target_model="User",
            target_id=str(user.pk),
            description=(
                f"{request.user.get_full_name()} reset the password for "
                f"{user.get_full_name() or user.username}."
            ),
            ip_address=_client_ip(request),
        )
        return Response({
            "message": (
                f"Password reset for {user.get_full_name() or user.username}."
            ),
        })


# ---------------------------------------------------------------------------
# Admin — User management
# ---------------------------------------------------------------------------

class UserListCreateView(generics.ListCreateAPIView):
    """Admin: list all users or create a new account (with its profile)."""
    permission_classes = [IsAdmin]
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        qs = User.objects.select_related("student_profile", "parent_profile").prefetch_related(
            "parent_profile__children__user"
        )
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AdminUserSerializer
        return AdminUserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="user.created",
            target_model="User",
            target_id=str(user.pk),
            description=f"Created account '{user.username}' with role '{user.role}'.",
            ip_address=_client_ip(self.request),
        )


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin: retrieve, update, or deactivate a user."""
    permission_classes = [IsAdmin]
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        return User.objects.select_related("student_profile", "parent_profile").prefetch_related(
            "parent_profile__children__user"
        )

    def perform_update(self, serializer):
        user = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="user.updated",
            target_model="User",
            target_id=str(user.pk),
            description=f"Updated account '{user.username}'.",
            ip_address=_client_ip(self.request),
        )


# ---------------------------------------------------------------------------
# School structure
# ---------------------------------------------------------------------------

class SchoolYearListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrReadOnly]
    queryset = SchoolYear.objects.all()
    serializer_class = SchoolYearSerializer


class SchoolYearDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    queryset = SchoolYear.objects.all()
    serializer_class = SchoolYearSerializer

    def perform_destroy(self, instance):
        # Section.school_year and Subject.school_year are CASCADE, so deleting
        # a school year would silently erase every section and subject in it —
        # and every TeacherAssignment -> Requirement -> Submission (plus the
        # SubmissionHistory audit trail) hangs off those sections. That is the
        # school's whole academic record, so refuse instead of cascading.
        sections = instance.sections.count()
        if sections:
            raise ValidationError({"detail": (
                f"'{instance}' still has {sections} section(s). Move or delete "
                "them first — deleting a school year would also erase every "
                "class assignment, requirement, submission and attendance "
                "record tied to it."
            )})
        subjects = instance.subjects.count()
        if subjects:
            raise ValidationError({"detail": (
                f"'{instance}' still has {subjects} subject(s). Move or delete "
                "them first."
            )})
        instance.delete()


class GradeLevelListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrReadOnly]
    queryset = GradeLevel.objects.all()
    serializer_class = GradeLevelSerializer


class GradeLevelDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    queryset = GradeLevel.objects.all()
    serializer_class = GradeLevelSerializer

    def perform_destroy(self, instance):
        # Section.grade_level and Subject.grade_level are PROTECT, so Django
        # raises ProtectedError — which DRF would surface as an unhandled 500.
        # Translate it into a readable 400 the UI can show.
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({"detail": (
                f"'{instance}' is still used by sections or subjects. Reassign "
                "or delete those first."
            )})


class SectionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = SectionSerializer

    def get_queryset(self):
        qs = Section.objects.select_related("grade_level", "school_year", "adviser")
        school_year = self.request.query_params.get("school_year")
        grade = self.request.query_params.get("grade_level")
        if school_year:
            qs = qs.filter(school_year_id=school_year)
        if grade:
            qs = qs.filter(grade_level_id=grade)
        return qs


class SectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    queryset = Section.objects.all()
    serializer_class = SectionSerializer

    def perform_destroy(self, instance):
        # StudentProfile.section is SET_NULL, so deleting a section in use
        # would silently strip every student's section. Refuse instead.
        students = instance.students.count()
        if students:
            raise ValidationError({"detail": (
                f"'{instance}' still has {students} student(s). Reassign them "
                "to another section before deleting it."
            )})
        if instance.assignments.exists():
            raise ValidationError({"detail": (
                f"'{instance}' still has class assignments. Remove them first."
            )})
        instance.delete()


class SubjectListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = SubjectSerializer

    def get_queryset(self):
        qs = Subject.objects.select_related("grade_level", "school_year")
        school_year = self.request.query_params.get("school_year")
        grade = self.request.query_params.get("grade_level")
        if school_year:
            qs = qs.filter(school_year_id=school_year)
        if grade:
            qs = qs.filter(grade_level_id=grade)
        return qs


class SubjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer

    def perform_destroy(self, instance):
        # Requirements hang off an assignment of this subject; deleting the
        # subject would orphan them.
        if instance.assignments.exists():
            raise ValidationError({"detail": (
                f"'{instance}' is still assigned to a teacher. Remove the "
                "class assignment first."
            )})
        instance.delete()


class TeacherAssignmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = TeacherAssignmentSerializer

    def get_queryset(self):
        qs = TeacherAssignment.objects.select_related(
            "teacher", "subject", "section__grade_level"
        ).order_by("subject__grade_level__order", "section__name")
        teacher = self.request.query_params.get("teacher")
        if teacher:
            qs = qs.filter(teacher_id=teacher)
        # Teachers see only their own assignments
        if self.request.user.is_teacher:
            qs = qs.filter(teacher=self.request.user)
        return qs


class TeacherAssignmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    queryset = TeacherAssignment.objects.all()
    serializer_class = TeacherAssignmentSerializer


# ---------------------------------------------------------------------------
# Student profiles
# ---------------------------------------------------------------------------

class StudentProfileListView(generics.ListAPIView):
    """Admin/teachers can list students; students see only themselves."""
    permission_classes = [IsAuthenticated]
    serializer_class = StudentProfileSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return StudentProfile.objects.select_related("user", "section")
        if user.is_teacher:
            # Teachers see students in their assigned sections
            sections = TeacherAssignment.objects.filter(teacher=user).values_list(
                "section_id", flat=True
            )
            return StudentProfile.objects.filter(
                section_id__in=sections
            ).select_related("user", "section")
        if user.is_student:
            return StudentProfile.objects.filter(user=user).select_related("user", "section")
        if user.is_parent:
            try:
                parent = user.parent_profile
                return parent.children.select_related("user", "section")
            except Exception:
                return StudentProfile.objects.none()
        return StudentProfile.objects.none()


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------

class RequirementListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = RequirementSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            qs = Requirement.objects.select_related(
                "teacher_assignment__subject",
                "teacher_assignment__section",
            )
            section = self.request.query_params.get("section")
            if section:
                qs = qs.filter(teacher_assignment__section_id=section)
            return qs
        if user.is_teacher:
            assignments = TeacherAssignment.objects.filter(teacher=user)
            return Requirement.objects.filter(
                teacher_assignment__in=assignments
            ).select_related(
                "teacher_assignment__subject",
                "teacher_assignment__section",
            )
        if user.is_student:
            try:
                profile = user.student_profile
                if profile.section:
                    assignments = TeacherAssignment.objects.filter(section=profile.section)
                    return Requirement.objects.filter(
                        teacher_assignment__in=assignments
                    ).select_related(
                        "teacher_assignment__subject",
                        "teacher_assignment__section",
                    )
            except Exception:
                pass
        if user.is_parent:
            # A parent may only request requirements belonging to their own
            # linked children — enforced here, not in the browser.
            try:
                children = user.parent_profile.children.all()
            except ParentProfile.DoesNotExist:
                return Requirement.objects.none()
            child_id = self.request.query_params.get("child")
            if child_id:
                children = children.filter(pk=child_id)
                if not children.exists():
                    return Requirement.objects.none()
            sections = [c.section_id for c in children if c.section_id]
            assignments = TeacherAssignment.objects.filter(section_id__in=sections)
            return Requirement.objects.filter(
                teacher_assignment__in=assignments
            ).select_related(
                "teacher_assignment__subject",
                "teacher_assignment__section",
            )
        return Requirement.objects.none()

    def perform_create(self, serializer):
        # Only teachers (and admins) can create requirements — and only for
        # assignments they actually own.
        user = self.request.user
        if not (user.is_admin or user.is_teacher):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only teachers can create requirements.")
        assignment = serializer.validated_data.get("teacher_assignment")
        if user.is_teacher:
            if assignment is None or assignment.teacher_id != user.pk:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only create requirements for your own classes.")
        serializer.save()


class RequirementDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = RequirementSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Requirement.objects.all()
        if user.is_teacher:
            assignments = TeacherAssignment.objects.filter(teacher=user)
            return Requirement.objects.filter(teacher_assignment__in=assignments)
        return Requirement.objects.none()


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------

class SubmissionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Submission.objects.select_related(
            "student__user",
            "requirement__teacher_assignment__subject",
            "requirement__teacher_assignment__section",
        )
        child_id = self.request.query_params.get("child")
        requirement_id = self.request.query_params.get("requirement")
        status_param = self.request.query_params.get("status")

        if user.is_admin:
            if child_id:
                qs = qs.filter(student_id=child_id)
            if requirement_id:
                qs = qs.filter(requirement_id=requirement_id)
            if status_param:
                qs = qs.filter(status=status_param)
            return qs

        if user.is_teacher:
            assignments = TeacherAssignment.objects.filter(teacher=user)
            requirements = Requirement.objects.filter(teacher_assignment__in=assignments)
            qs = qs.filter(requirement__in=requirements)
            if requirement_id:
                qs = qs.filter(requirement_id=requirement_id)
            if status_param:
                qs = qs.filter(status=status_param)
            return qs

        if user.is_student:
            try:
                profile = user.student_profile
            except StudentProfile.DoesNotExist:
                return Submission.objects.none()
            qs = qs.filter(student=profile)
            if status_param:
                qs = qs.filter(status=status_param)
            return qs

        if user.is_parent:
            # Only submissions belonging to linked children.
            try:
                children = user.parent_profile.children.all()
            except ParentProfile.DoesNotExist:
                return Submission.objects.none()
            if child_id:
                if not children.filter(pk=child_id).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied(
                        "You may only view submissions for your linked children."
                    )
                qs = qs.filter(student_id=child_id)
            else:
                qs = qs.filter(student__in=children)
            if status_param:
                qs = qs.filter(status=status_param)
            return qs

        return Submission.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_student:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only students can submit work.")
        try:
            profile = user.student_profile
        except StudentProfile.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("No student profile is linked to this account.")
        student = serializer.validated_data.get("student")
        if student is not None and student.pk != profile.pk:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only submit your own work.")
        status_value = serializer.validated_data.get(
            "status", Submission.Status.SUBMITTED
        )
        submission = serializer.save(
            student=profile,
            submitted_at=(
                timezone.now()
                if status_value == Submission.Status.SUBMITTED
                else None
            ),
        )
        SubmissionHistory.objects.create(
            submission=submission,
            changed_by=user,
            old_status=Submission.Status.NOT_SUBMITTED,
            new_status=submission.status,
            note="Work submitted by student.",
        )


class SubmissionDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Submission.objects.all()
        if user.is_teacher:
            assignments = TeacherAssignment.objects.filter(teacher=user)
            requirements = Requirement.objects.filter(teacher_assignment__in=assignments)
            return Submission.objects.filter(requirement__in=requirements)
        if user.is_student:
            try:
                return Submission.objects.filter(student=user.student_profile)
            except Exception:
                pass
        return Submission.objects.none()

    def perform_update(self, serializer):
        user = self.request.user
        old_status = serializer.instance.status
        submission = serializer.save()
        if submission.status != old_status:
            if submission.status == Submission.Status.SUBMITTED and not submission.submitted_at:
                submission.submitted_at = timezone.now()
                submission.save(update_fields=["submitted_at"])
            if submission.status == Submission.Status.VERIFIED:
                submission.verified_at = timezone.now()
                submission.save(update_fields=["verified_at"])
            SubmissionHistory.objects.create(
                submission=submission,
                changed_by=user,
                old_status=old_status,
                new_status=submission.status,
                note=f"Status changed to {submission.get_status_display()}.",
            )


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceSessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrTeacher]
    serializer_class = AttendanceSessionSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return AttendanceSession.objects.select_related("teacher_assignment")
        assignments = TeacherAssignment.objects.filter(teacher=user)
        return AttendanceSession.objects.filter(
            teacher_assignment__in=assignments
        ).select_related("teacher_assignment")

    def perform_create(self, serializer):
        user = self.request.user
        assignment = serializer.validated_data.get("teacher_assignment")
        if user.is_teacher and (
            assignment is None or assignment.teacher_id != user.pk
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only take attendance for your own classes.")
        serializer.save(created_by=user)


class AttendanceSessionDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminOrTeacher]
    serializer_class = AttendanceSessionSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return AttendanceSession.objects.all()
        assignments = TeacherAssignment.objects.filter(teacher=user)
        return AttendanceSession.objects.filter(teacher_assignment__in=assignments)


class AttendanceRecordListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AttendanceRecordSerializer

    def get_queryset(self):
        user = self.request.user
        qs = AttendanceRecord.objects.select_related(
            "student__user", "session__teacher_assignment__subject",
            "session__teacher_assignment__section",
        )
        student_id = self.request.query_params.get("student")

        if user.is_admin:
            if student_id:
                qs = qs.filter(student_id=student_id)
            return qs

        if user.is_teacher:
            assignments = TeacherAssignment.objects.filter(teacher=user)
            sessions = AttendanceSession.objects.filter(teacher_assignment__in=assignments)
            qs = qs.filter(session__in=sessions)
            if student_id:
                # Only students inside this teacher's own sections
                own_sections = assignments.values_list("section_id", flat=True)
                allowed = StudentProfile.objects.filter(
                    section_id__in=own_sections, pk=student_id
                )
                if not allowed.exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You may not view that student's attendance.")
                qs = qs.filter(student_id=student_id)
            return qs

        if user.is_student:
            try:
                profile = user.student_profile
            except StudentProfile.DoesNotExist:
                return AttendanceRecord.objects.none()
            if student_id and str(profile.pk) != str(student_id):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You may only view your own attendance.")
            return qs.filter(student=profile)

        if user.is_parent:
            try:
                children = user.parent_profile.children.all()
            except ParentProfile.DoesNotExist:
                return AttendanceRecord.objects.none()
            if student_id:
                if not children.filter(pk=student_id).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied(
                        "You may only view attendance for your linked children."
                    )
                return qs.filter(student_id=student_id)
            return qs.filter(student__in=children)

        return AttendanceRecord.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        session = serializer.validated_data.get("session")
        student = serializer.validated_data.get("student")
        if user.is_teacher:
            from rest_framework.exceptions import PermissionDenied
            if session is None:
                raise PermissionDenied("An attendance session is required.")
            assignment = session.teacher_assignment
            if assignment.teacher_id != user.pk:
                raise PermissionDenied(
                    "You can only record attendance for your own classes."
                )
            if student is not None and student.section_id != assignment.section_id:
                raise PermissionDenied(
                    "That student is not enrolled in this class."
                )
        serializer.save(recorded_by=user)


class AttendanceRecordDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminOrTeacher]
    serializer_class = AttendanceRecordSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return AttendanceRecord.objects.all()
        assignments = TeacherAssignment.objects.filter(teacher=user)
        sessions = AttendanceSession.objects.filter(teacher_assignment__in=assignments)
        return AttendanceRecord.objects.filter(session__in=sessions)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationListView(generics.ListAPIView):
    """A user can only ever see their own notifications."""
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return self.request.user.notifications.all()


class NotificationMarkReadView(generics.UpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        # Strict: only the owner can mark their own notifications read
        return self.request.user.notifications.all()

    def patch(self, request, *args, **kwargs):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        return Response({"message": "Marked as read."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_notifications_read(request):
    request.user.notifications.filter(is_read=False).update(is_read=True)
    return Response({"message": "All notifications marked as read."})


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

class AnnouncementListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AnnouncementSerializer

    def get_queryset(self):
        user = self.request.user
        # Build audience filter
        qs = Announcement.objects.select_related("author")
        from .models import Announcement as A
        if user.is_student:
            qs = qs.filter(audience__in=[A.Audience.ALL, A.Audience.STUDENTS])
        elif user.is_parent:
            qs = qs.filter(audience__in=[A.Audience.ALL, A.Audience.PARENTS])
        elif user.is_teacher:
            qs = qs.filter(audience__in=[A.Audience.ALL, A.Audience.TEACHERS])
        # Admins see all
        return qs

    def perform_create(self, serializer):
        if not (self.request.user.is_admin or self.request.user.is_teacher):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only teachers and admins can post announcements.")
        serializer.save(author=self.request.user)


class AnnouncementDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AnnouncementSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Announcement.objects.all()
        # Teachers can only edit their own
        if user.is_teacher:
            return Announcement.objects.filter(author=user)
        return Announcement.objects.none()


# ---------------------------------------------------------------------------
# Dashboard summaries
# ---------------------------------------------------------------------------

def _attendance_summary(records_qs):
    """Counts by status plus a present rate for a queryset of records."""
    counts = {key: 0 for key, _ in AttendanceRecord.Status.choices}
    for row in records_qs.values("status").annotate(n=Count("id")):
        counts[row["status"]] = row["n"]
    total = sum(counts.values())
    return {
        "total_records": total,
        "by_status": counts,
        "present_rate": (
            round(100 * counts["present"] / total, 1) if total else None
        ),
    }


def _submission_summary(submissions_qs, requirements_qs=None):
    """
    Counts of submissions by status, plus `none` — the number of requirements
    in scope that have no submission record at all.

    `none` used to be hardcoded to 0, which made the teacher dashboard's
    "not yet submitted" line permanently invisible. It is now derived from
    `requirements_qs` so it tracks the database like every other figure here.
    """
    counts = {key: 0 for key, _ in Submission.Status.choices}
    for row in submissions_qs.values("status").annotate(n=Count("id")):
        counts[row["status"]] = row["n"]

    if requirements_qs is None:
        counts["none"] = 0
    else:
        # .order_by() clears Meta.ordering ("-submitted_at"). Without it the
        # ordering column is pulled into the SELECT beside DISTINCT, so the
        # result is not actually distinct. Duplicated ids are harmless inside
        # an IN clause, but relying on that would be fragile.
        covered = (
            submissions_qs.order_by()
            .values_list("requirement_id", flat=True)
            .distinct()
        )
        counts["none"] = requirements_qs.exclude(id__in=covered).count()
    return counts


def _section_label(assignment_section):
    return f"{assignment_section.grade_level.name} — {assignment_section.name}"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    user = request.user
    now = timezone.now()

    if user.is_student:
        try:
            profile = user.student_profile
        except StudentProfile.DoesNotExist:
            return Response({"error": "Student profile not found."}, status=404)

        assignments = TeacherAssignment.objects.filter(
            section=profile.section
        ) if profile.section else TeacherAssignment.objects.none()

        requirements = Requirement.objects.filter(teacher_assignment__in=assignments)
        submissions = Submission.objects.filter(student=profile)
        submitted_ok_ids = submissions.filter(
            status__in=[Submission.Status.SUBMITTED, Submission.Status.VERIFIED]
        ).values_list("requirement_id", flat=True)

        unread_count = user.notifications.filter(is_read=False).count()

        return Response({
            "role": "student",
            "student_name": user.get_full_name(),
            "section": str(profile.section) if profile.section else None,
            "total_requirements": requirements.count(),
            "not_submitted": requirements.exclude(id__in=submitted_ok_ids).count(),
            "overdue": requirements.filter(
                deadline__lt=now
            ).exclude(id__in=submitted_ok_ids).count(),
            "awaiting_verification": submissions.filter(
                status=Submission.Status.SUBMITTED
            ).count(),
            "verified": submissions.filter(
                status=Submission.Status.VERIFIED
            ).count(),
            "returned": submissions.filter(
                status=Submission.Status.RETURNED
            ).count(),
            "attendance": _attendance_summary(
                AttendanceRecord.objects.filter(student=profile)
            ),
            "unread_notifications": unread_count,
        })

    if user.is_parent:
        try:
            children = list(user.parent_profile.children.select_related(
                "user", "section__grade_level"
            ))
        except ParentProfile.DoesNotExist:
            children = []

        child_data = []
        for child in children:
            assignments = TeacherAssignment.objects.filter(
                section=child.section
            ) if child.section else TeacherAssignment.objects.none()
            requirements = Requirement.objects.filter(teacher_assignment__in=assignments)
            submissions = Submission.objects.filter(student=child)
            submitted_ok_ids = submissions.filter(
                status__in=[Submission.Status.SUBMITTED, Submission.Status.VERIFIED]
            ).values_list("requirement_id", flat=True)
            child_data.append({
                "student_id": child.id,
                "name": child.user.get_full_name(),
                "section": str(child.section) if child.section else None,
                "total_requirements": requirements.count(),
                "not_submitted": requirements.exclude(id__in=submitted_ok_ids).count(),
                "overdue": requirements.filter(
                    deadline__lt=now
                ).exclude(id__in=submitted_ok_ids).count(),
                "awaiting_verification": submissions.filter(
                    status=Submission.Status.SUBMITTED
                ).count(),
                "verified": submissions.filter(status=Submission.Status.VERIFIED).count(),
                "returned": submissions.filter(status=Submission.Status.RETURNED).count(),
                "attendance": _attendance_summary(
                    AttendanceRecord.objects.filter(student=child)
                ),
            })

        return Response({
            "role": "parent",
            "parent_name": user.get_full_name(),
            "children": child_data,
            "unread_notifications": user.notifications.filter(is_read=False).count(),
        })

    if user.is_teacher:
        assignments = list(
            TeacherAssignment.objects.filter(teacher=user).select_related(
                "subject", "section__grade_level"
            )
        )
        requirements = Requirement.objects.filter(teacher_assignment__in=assignments)
        submissions = Submission.objects.filter(requirement__in=requirements)

        classes = [
            {
                "id": a.id,
                "subject": a.subject.name,
                "subject_id": a.subject_id,
                "section_id": a.section_id,
                "section": _section_label(a.section),
            }
            for a in assignments
        ]

        upcoming = [
            {
                "id": r.id,
                "title": r.title,
                "subject": r.teacher_assignment.subject.name,
                "section": _section_label(r.teacher_assignment.section),
                "deadline": r.deadline.isoformat(),
                "is_overdue": r.is_overdue,
            }
            for r in requirements.filter(
                deadline__gte=now
            ).select_related(
                "teacher_assignment__subject", "teacher_assignment__section__grade_level"
            ).order_by("deadline")[:6]
        ]

        recent_submissions = [
            {
                "id": s.id,
                "requirement_title": s.requirement.title,
                "student_name": s.student.user.get_full_name(),
                "status": s.status,
                "submitted_at": s.submitted_at,
                "updated_at": s.updated_at.isoformat(),
            }
            for s in submissions.select_related(
                "student__user", "requirement"
            ).order_by("-updated_at")[:6]
        ]

        return Response({
            "role": "teacher",
            "teacher_name": user.get_full_name(),
            "assigned_classes": len(classes),
            "classes": classes,
            "total_requirements": requirements.count(),
            "pending_verification": submissions.filter(
                status=Submission.Status.SUBMITTED
            ).count(),
            "submission_status": _submission_summary(submissions, requirements),
            "upcoming_deadlines": upcoming,
            "recent_activity": recent_submissions,
            "attendance": _attendance_summary(
                AttendanceRecord.objects.filter(
                    session__teacher_assignment__in=assignments
                )
            ),
            "unread_notifications": user.notifications.filter(is_read=False).count(),
        })

    if user.is_admin:
        recent_activity = [
            {
                "id": entry.id,
                "action": entry.action,
                "description": entry.description,
                "actor": entry.actor.get_full_name() or entry.actor.username
                if entry.actor else None,
                "timestamp": entry.timestamp.isoformat(),
            }
            for entry in AuditLog.objects.select_related("actor")[:8]
        ]
        return Response({
            "role": "admin",
            "total_users": User.objects.count(),
            "total_students": User.objects.filter(role=User.Role.STUDENT).count(),
            "total_teachers": User.objects.filter(role=User.Role.TEACHER).count(),
            "total_parents": User.objects.filter(role=User.Role.PARENT).count(),
            "total_sections": Section.objects.count(),
            "total_requirements": Requirement.objects.count(),
            "active_requirements": Requirement.objects.filter(
                deadline__gte=now
            ).count(),
            "total_submissions": Submission.objects.count(),
            "submission_status": _submission_summary(
                Submission.objects.all(), Requirement.objects.all()
            ),
            "attendance": _attendance_summary(AttendanceRecord.objects.all()),
            "recent_activity": recent_activity,
            "unread_notifications": user.notifications.filter(is_read=False).count(),
        })

    return Response({"error": "Unknown role."}, status=400)
