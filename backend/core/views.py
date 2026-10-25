"""
TRACK — API Views
"""

from decimal import Decimal

from django.contrib.auth import login, logout
from functools import partial
from django.db import transaction
from django.db.models import Count, ProtectedError, Q, Sum
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.authtoken.models import Token

from .models import (
    Announcement,
    AuditLog,
    AttendanceRecord,
    AttendanceSession,
    ClassSchedule,
    Department,
    DepartmentPermission,
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
from .notifications import (
    notify_announcement,
    notify_attendance_marked,
    notify_new_requirement,
    notify_submission_received,
    notify_submission_reviewed,
)
from .permissions import (
    SAFE_METHODS,
    AdminCan,
    AdminKeyOrReadOnly,
    AdminKeyOrTeacher,
    IsAdmin,
    require_key,
)
from .rbac import MODULES
from .serializers import (
    AdminUserSerializer,
    AnnouncementSerializer,
    AttendanceRecordSerializer,
    AttendanceSessionSerializer,
    AuditLogSerializer,
    ChangePasswordSerializer,
    ClassScheduleSerializer,
    DepartmentSerializer,
    FeeAssessmentSerializer,
    FeeAssessmentDetailSerializer,
    FeeCategorySerializer,
    FeeCollectionReportSerializer,
    FeeOutstandingReportSerializer,
    FeePaymentSerializer,
    FeePaymentHistorySerializer,
    GradeLevelSerializer,
    LoginSerializer,
    NotificationSerializer,
    PermissionDefinitionSerializer,
    PermissionMatrixSerializer,
    RequirementSerializer,
    ResetPasswordSerializer,
    SchoolYearSerializer,
    SectionSerializer,
    StudentFeeSummarySerializer,
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


def _is_mobile(request):
    """True when the request looks like it came from the Expo / React Native app."""
    ua = request.META.get("HTTP_USER_AGENT", "").lower()
    return any(kw in ua for kw in ("okhttp", "expo", "reactnative", "react-native", "dalvik"))


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
    """
    Return a CSRF token and explicitly set the csrftoken cookie.

    In a split-origin deploy (Vercel frontend + Render backend) the browser
    drops Set-Cookie headers that lack SameSite=None; Secure. Django's
    middleware sets those attributes when CSRF_COOKIE_SAMESITE="None" and
    CSRF_COOKIE_SECURE=True are configured, but only if the cookie is
    explicitly written onto the response — calling get_token() alone is not
    enough because Django defers the Set-Cookie until process_response, which
    DRF's Response bypasses.  Force it here so the browser receives the cookie
    on this preflight GET before the login POST.
    """
    token = get_token(request)
    response = Response({"csrfToken": token})
    response.set_cookie(
        "csrftoken",
        token,
        max_age=31449600,          # 1 year — matches Django's default
        secure=True,
        httponly=False,            # JS must be able to read this cookie
        samesite="None",           # cross-origin: Vercel → Render
    )
    return response


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

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


class TokenLoginView(APIView):
    """
    Mobile counterpart to LoginView.

    The Expo app has no browser cookie jar, so it cannot hold a Django session
    or echo a CSRF header. It exchanges credentials for a DRF token instead.

    Reuses LoginSerializer, so a username *or* an email address works here
    exactly as it does on the web.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.validated_data["user"]

        # get_or_create, not create: a user has exactly one token, and a
        # reinstall of the app must not mint a second one.
        token, _ = Token.objects.get_or_create(user=user)

        AuditLog.objects.create(
            actor=user,
            action="auth.login",
            target_model="User",
            target_id=str(user.pk),
            description=(
                f"{user.get_full_name()} signed in (mobile)."
                if _is_mobile(request)
                else f"{user.get_full_name()} signed in."
            ),
            ip_address=_client_ip(request),
        )
        return Response({
            "token": token.key,
            "user": UserSerializer(user).data,
        })


class TokenLogoutView(APIView):
    """
    Discard the token that authenticated the request.

    Deletes the key server-side so it stops working immediately — dropping it
    only on the device would leave a stolen token valid forever.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
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

    def get_permissions(self):
        return [AdminCan("users.manage")]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.get(pk=serializer.validated_data["user_id"])
        # Recovering an administrator's password is administrator management.
        if user.is_admin and not request.user.has_perm_key("users.manage_admins"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "Only administrators with the 'Manage administrators' "
                "permission can reset an administrator's password."
            )
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
    """
    Admin: list all users or create a new account (with its profile).

    Reading the account directory needs `users.view`; writing needs
    `users.manage`, and touching an administrator account or a student record
    needs the extra keys checked in AdminUserSerializer.
    """
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [AdminCan("users.view")]
        return [AdminCan("users.manage")]

    serializer_class = AdminUserSerializer

    def get_queryset(self):
        qs = User.objects.select_related("student_profile", "parent_profile").prefetch_related(
            "parent_profile__children__user", "departments"
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
            description=(
                f"Created account '{user.username}' with role '{user.role}'."
                + (
                    f" Super administrator: yes."
                    if user.is_super_admin else ""
                )
                + (
                    " Departments: "
                    + ", ".join(user.departments.values_list("name", flat=True)) + "."
                    if user.is_admin and user.departments.exists() else ""
                )
            ),
            ip_address=_client_ip(self.request),
        )


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Admin: retrieve, update, or deactivate a user.

    Same key rules as the list view; role, department and super-administrator
    changes are validated in AdminUserSerializer and recorded in the audit log.
    """
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [AdminCan("users.view")]
        return [AdminCan("users.manage")]

    def get_queryset(self):
        return User.objects.select_related("student_profile", "parent_profile").prefetch_related(
            "parent_profile__children__user", "departments"
        )

    def perform_update(self, serializer):
        # Captured before save(): serializer.instance is still the old row.
        old = {
            "role": serializer.instance.role,
            "is_active": serializer.instance.is_active,
            "is_super_admin": serializer.instance.is_super_admin,
        }
        old_departments = set(
            serializer.instance.departments.values_list("id", flat=True)
        )

        user = serializer.save()

        changes = []
        if old["role"] != user.role:
            changes.append(f"role {old['role']} → {user.role}")
        if old["is_active"] != user.is_active:
            changes.append(
                "account activated" if user.is_active else "account deactivated"
            )
        if old["is_super_admin"] != user.is_super_admin:
            changes.append(
                "super administrator granted"
                if user.is_super_admin else "super administrator revoked"
            )
        new_departments = set(user.departments.values_list("id", flat=True))
        if old_departments != new_departments:
            added = user.departments.filter(id__in=new_departments - old_departments)
            removed_ids = old_departments - new_departments
            removed = Department.objects.filter(id__in=removed_ids)
            parts = []
            if added:
                parts.append("added " + ", ".join(d.name for d in added))
            if removed:
                parts.append("removed " + ", ".join(d.name for d in removed))
            changes.append("departments " + " and ".join(parts))

        AuditLog.objects.create(
            actor=self.request.user,
            action="user.updated",
            target_model="User",
            target_id=str(user.pk),
            description=(
                f"Updated account '{user.username}'."
                + (f" Changes: {'; '.join(changes)}." if changes else "")
            ),
            ip_address=_client_ip(self.request),
        )

    def perform_destroy(self, instance):
        # The last active super administrator cannot be deleted — the school
        # would lose control of its own permission system.
        if instance.is_super_admin:
            others = User.objects.filter(
                role=User.Role.ADMIN, is_super_admin=True, is_active=True
            ).exclude(pk=instance.pk)
            if not others.exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"detail": (
                    "This is the last active Super Administrator. Promote "
                    "another administrator before deleting this account."
                )})
        username = instance.username
        instance.delete()
        AuditLog.objects.create(
            actor=self.request.user,
            action="user.deleted",
            target_model="User",
            target_id=str(instance.pk),
            description=f"Deleted account '{username}'.",
            ip_address=_client_ip(self.request),
        )


# ---------------------------------------------------------------------------
# School structure
# ---------------------------------------------------------------------------

from django.db.models import Q, Count


class SchoolYearPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class SchoolYearListCreateView(generics.ListCreateAPIView):
    # The school calendar is a school-wide setting: reading stays open,
    # writing needs `settings.manage` (super administrators by default).
    queryset = SchoolYear.objects.all().annotate(
        section_count=Count('sections'),
        subject_count=Count('subjects')
    )
    serializer_class = SchoolYearSerializer
    pagination_class = SchoolYearPagination
    ordering_fields = ['label', 'start_date', 'end_date', 'is_active']
    ordering = ['-start_date']

    def get_permissions(self):
        return [AdminKeyOrReadOnly("settings.manage")]

    def get_queryset(self):
        # Annotate() drops Meta.ordering, and no OrderingFilter is enabled, so
        # without an explicit order_by() DRF paginated this list in whatever
        # order SQLite produced from the GROUP BY — rows could shift between
        # pages and between refreshes.
        qs = super().get_queryset().order_by('-start_date')
        search = self.request.query_params.get('search')
        is_active = self.request.query_params.get('is_active')
        if search:
            qs = qs.filter(label__icontains=search)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class SchoolYearDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SchoolYear.objects.all().annotate(
        section_count=Count('sections'),
        subject_count=Count('subjects')
    )
    serializer_class = SchoolYearSerializer

    def get_permissions(self):
        # Reads stay administrator-only as before; writes are a school-wide
        # setting.
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAdmin()]
        return [AdminCan("settings.manage")]

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


class GradeLevelPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class GradeLevelListCreateView(generics.ListCreateAPIView):
    # Reads stay open; writes are school-structure management.
    queryset = GradeLevel.objects.all().annotate(
        section_count=Count('sections'),
        subject_count=Count('subjects')
    ).order_by('order')
    serializer_class = GradeLevelSerializer
    pagination_class = GradeLevelPagination
    ordering_fields = ['name', 'order']
    ordering = ['order']

    def get_permissions(self):
        return [AdminKeyOrReadOnly("structure.manage")]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class GradeLevelDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = GradeLevel.objects.all().annotate(
        section_count=Count('sections'),
        subject_count=Count('subjects')
    )
    serializer_class = GradeLevelSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAdmin()]
        return [AdminCan(write_key="structure.manage")]

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


class SectionPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class SectionListCreateView(generics.ListCreateAPIView):
    serializer_class = SectionSerializer
    pagination_class = SectionPagination
    ordering_fields = ['name', 'grade_level__order', 'school_year__label', 'adviser__last_name']
    ordering = ['grade_level__order', 'name']

    def get_permissions(self):
        return [AdminKeyOrReadOnly("structure.manage")]

    def get_queryset(self):
        # annotate() drops Meta.ordering and no OrderingFilter is enabled, so
        # without an explicit order_by() this paginated list had no ORDER BY
        # at all (DRF logged UnorderedObjectListWarning) and rows moved
        # between pages and between refreshes.
        qs = Section.objects.select_related("grade_level", "school_year", "adviser").annotate(
            student_count=Count('students')
        ).order_by('grade_level__order', 'name')
        school_year = self.request.query_params.get("school_year")
        grade = self.request.query_params.get("grade_level")
        adviser = self.request.query_params.get("adviser")
        search = self.request.query_params.get("search")
        if school_year:
            qs = qs.filter(school_year_id=school_year)
        if grade:
            qs = qs.filter(grade_level_id=grade)
        if adviser:
            qs = qs.filter(adviser_id=adviser)
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class SectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Section.objects.select_related("grade_level", "school_year", "adviser").annotate(
        student_count=Count('students')
    )
    serializer_class = SectionSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAdmin()]
        return [AdminCan(write_key="structure.manage")]

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


class SubjectPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class SubjectListCreateView(generics.ListCreateAPIView):
    serializer_class = SubjectSerializer
    pagination_class = SubjectPagination
    ordering_fields = ['name', 'code', 'grade_level__order', 'school_year__label']
    ordering = ['grade_level__order', 'name']

    def get_permissions(self):
        return [AdminKeyOrReadOnly("structure.manage")]

    def get_queryset(self):
        # annotate() drops Meta.ordering and no OrderingFilter is enabled, so
        # this list also had no ORDER BY — pin the documented order here.
        qs = Subject.objects.select_related("grade_level", "school_year").annotate(
            assignment_count=Count('assignments')
        ).order_by('grade_level__order', 'name')
        school_year = self.request.query_params.get("school_year")
        grade = self.request.query_params.get("grade_level")
        search = self.request.query_params.get("search")
        if school_year:
            qs = qs.filter(school_year_id=school_year)
        if grade:
            qs = qs.filter(grade_level_id=grade)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return qs


class SubjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Subject.objects.select_related("grade_level", "school_year").annotate(
        assignment_count=Count('assignments')
    )
    serializer_class = SubjectSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAdmin()]
        return [AdminCan(write_key="structure.manage")]

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
    serializer_class = TeacherAssignmentSerializer

    def get_permissions(self):
        return [AdminKeyOrReadOnly("structure.manage")]

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
    queryset = TeacherAssignment.objects.all()
    serializer_class = TeacherAssignmentSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAdmin()]
        return [AdminCan(write_key="structure.manage")]


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
            # The student directory is personal data: an administrator needs
            # `students.view` (registrar, finance for assessments, attendance).
            require_key(user, "students.view")
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

def _requirement_queryset_for(user, query_params=None):
    """
    Every requirement `user` is allowed to see.

    Shared by the list *and* the detail endpoint so a client can never list a
    row it is then unable to open. The list view layers its own `?section=`
    filter on top of the admin branch.
    """
    query_params = query_params or {}

    if user.is_admin:
        # Admins see every requirement — but only with `requirements.view`.
        require_key(user, "requirements.view")
        qs = Requirement.objects.select_related(
            "teacher_assignment__subject",
            "teacher_assignment__section",
        )
        section = query_params.get("section")
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
        except StudentProfile.DoesNotExist:
            return Requirement.objects.none()
        if not profile.section:
            return Requirement.objects.none()
        assignments = TeacherAssignment.objects.filter(section=profile.section)
        return Requirement.objects.filter(
            teacher_assignment__in=assignments
        ).select_related(
            "teacher_assignment__subject",
            "teacher_assignment__section",
        )

    if user.is_parent:
        # A parent may only request requirements belonging to their own
        # linked children — enforced here, not in the browser.
        try:
            children = user.parent_profile.children.all()
        except ParentProfile.DoesNotExist:
            return Requirement.objects.none()
        child_id = query_params.get("child")
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


class RequirementListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = RequirementSerializer

    def get_queryset(self):
        return _requirement_queryset_for(
            self.request.user, self.request.query_params
        )

    def perform_create(self, serializer):
        # Only teachers (and admins) can create requirements — and only for
        # assignments they actually own.
        user = self.request.user
        if not (user.is_admin or user.is_teacher):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only teachers can create requirements.")
        if user.is_admin:
            require_key(user, "requirements.manage")
        assignment = serializer.validated_data.get("teacher_assignment")
        if user.is_teacher:
            if assignment is None or assignment.teacher_id != user.pk:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only create requirements for your own classes.")
        requirement = serializer.save()
        # Tell every student in the target section that work was posted.
        notify_new_requirement(requirement)


class RequirementDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = RequirementSerializer

    def get_permissions(self):
        # Reads follow the list scoping (student: own section, parent: linked
        # children). Writes stay staff-only — widening `get_queryset` to those
        # roles must not hand them an edit/delete route they never had.
        # Teachers keep the route they always had; administrators need
        # `requirements.manage`.
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [AdminKeyOrTeacher("requirements.manage")]

    def get_queryset(self):
        # Same scoping as the list view. Returning `none()` here (the old
        # behaviour) meant a student or parent could list their assigned work
        # and then get a 404 the moment they opened any row of it.
        return _requirement_queryset_for(
            self.request.user, self.request.query_params
        )


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
            # Submissions belong to the requirements module.
            require_key(user, "requirements.view")
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
        # A student may only hand in work for a requirement issued to their own
        # section. Without this check a student could submit into any class in
        # the school by swapping the requirement id (observed live: a Grade 7
        # student submitted into a Grade 8 requirement).
        requirement = serializer.validated_data["requirement"]
        req_section_id = requirement.teacher_assignment.section_id
        if profile.section_id != req_section_id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "You can only submit work for a requirement issued to your section."
            )
        status_value = serializer.validated_data.get(
            "status", Submission.Status.SUBMITTED
        )
        submitted_at = (
            timezone.now()
            if status_value == Submission.Status.SUBMITTED
            else None
        )

        # One row per (requirement, student) — enforced by the database. A
        # student may hand work in more than once (the UI re-enables "Submit"
        # once a requirement is returned or overdue), so a second POST must
        # refresh the existing row rather than collide with the UNIQUE
        # constraint and surface as a 500.
        existing = Submission.objects.filter(
            requirement=serializer.validated_data["requirement"],
            student=profile,
        ).first()

        if existing is not None:
            old_status = existing.status
            existing.link_url = serializer.validated_data.get(
                "link_url", existing.link_url
            )
            existing.file_upload = serializer.validated_data.get(
                "file_upload", existing.file_upload
            )
            existing.status = status_value
            existing.submitted_at = submitted_at
            # A resubmission is no longer verified — the new work has to be
            # checked again.
            existing.verified_at = None
            existing.save()
            if existing.status != old_status:
                SubmissionHistory.objects.create(
                    submission=existing,
                    changed_by=user,
                    old_status=old_status,
                    new_status=existing.status,
                    note="Work resubmitted by student.",
                )
                notify_submission_received(existing)
            # DRF builds the response from serializer.data. Leaving instance
            # unset made it fall back to serializing the input dict, and
            # get_student_name then read .student off a dict and 500'd.
            serializer.instance = existing
            return

        submission = serializer.save(
            student=profile,
            submitted_at=submitted_at,
        )
        SubmissionHistory.objects.create(
            submission=submission,
            changed_by=user,
            old_status=Submission.Status.NOT_SUBMITTED,
            new_status=submission.status,
            note="Work submitted by student.",
        )
        # Tell the teacher that something is waiting to be checked.
        notify_submission_received(submission)


class SubmissionDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            require_key(user, "requirements.view")
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
        if user.is_parent:
            # Read-only mirror of the list view: a parent may open a
            # submission they can already list, and nothing else.
            try:
                return Submission.objects.filter(
                    student__in=user.parent_profile.children.all()
                )
            except ParentProfile.DoesNotExist:
                pass
        return Submission.objects.none()

    def perform_update(self, serializer):
        user = self.request.user
        if user.is_parent:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "Parents have read-only access to submissions."
            )
        if user.is_admin:
            # Reviewing submissions is the requirements module's "verify"
            # permission — not every administrator gets it.
            require_key(user, "requirements.verify")
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
            # Tell the student their work was verified or returned.
            notify_submission_reviewed(submission, old_status)


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class ClassScheduleListCreateView(generics.ListCreateAPIView):
    """Admin can create schedules, teachers can view their own."""
    permission_classes = [IsAuthenticated]
    serializer_class = ClassScheduleSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return ClassSchedule.objects.select_related("teacher_assignment")
        if user.is_teacher:
            assignments = TeacherAssignment.objects.filter(teacher=user)
            return ClassSchedule.objects.filter(
                teacher_assignment__in=assignments
            ).select_related("teacher_assignment")
        return ClassSchedule.objects.none()

    def perform_create(self, serializer):
        if not self.request.user.is_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only administrators can create schedules.")
        # Class scheduling is part of the school structure.
        require_key(self.request.user, "structure.manage")
        serializer.save()


class ClassScheduleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin only for schedule management."""
    queryset = ClassSchedule.objects.all()
    serializer_class = ClassScheduleSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAdmin()]
        return [AdminCan(write_key="structure.manage")]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_attendance_sessions(request):
    """
    Generate attendance sessions based on class schedules for a date range.
    This is called automatically by the frontend, or manually by teachers/admins.
    """
    from datetime import datetime, timedelta
    
    # Get date range from request
    start_date_str = request.data.get("start_date")
    end_date_str = request.data.get("end_date")

    # Parse defensively: a malformed date used to raise an unhandled ValueError
    # and surface as a 500 (with a stack trace when DEBUG=True). Return a clean
    # 400 instead.
    try:
        if not start_date_str:
            start_date = timezone.now().date()
        else:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()

        if not end_date_str:
            # Default: generate for next 7 days
            end_date = start_date + timedelta(days=7)
        else:
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return Response(
            {"error": "Dates must be in YYYY-MM-DD format (e.g. 2026-10-19)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if end_date < start_date:
        return Response(
            {"error": "The end date must not be before the start date."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Cap the span. A school year is well under a year; an unbounded range lets
    # any teacher create tens of thousands of rows in one call (observed: a
    # 1990–2099 request generated 5,738 sessions). 366 days is generous for any
    # legitimate batch while keeping the operation bounded.
    MAX_GENERATION_SPAN_DAYS = 366
    if (end_date - start_date).days > MAX_GENERATION_SPAN_DAYS:
        return Response(
            {"error": (
                "The date range is too long. Generate at most "
                f"{MAX_GENERATION_SPAN_DAYS} days at a time."
            )},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    user = request.user
    
    # Get teacher assignments
    if user.is_admin:
        # Generating sessions for every class is an attendance action.
        require_key(user, "attendance.manage")
        # Admin can generate for all teachers
        teacher_param = request.data.get("teacher_id")
        if teacher_param:
            assignments = TeacherAssignment.objects.filter(teacher_id=teacher_param)
        else:
            assignments = TeacherAssignment.objects.all()
    elif user.is_teacher:
        # Teachers generate only for themselves
        assignments = TeacherAssignment.objects.filter(teacher=user)
    else:
        return Response(
            {"error": "Only teachers and administrators can generate sessions."},
            status=status.HTTP_403_FORBIDDEN
        )
    
    generated = []
    skipped = []
    
    # For each assignment with schedules
    for assignment in assignments:
        schedules = assignment.schedules.all()
        
        if not schedules.exists():
            continue
        
        # Generate sessions for each day in range
        current_date = start_date
        while current_date <= end_date:
            # Get day of week (1=Monday, 7=Sunday)
            day_of_week = current_date.isoweekday()
            
            # Find schedules for this day
            day_schedules = schedules.filter(day_of_week=day_of_week)
            
            for schedule in day_schedules:
                # Check if session already exists
                existing = AttendanceSession.objects.filter(
                    teacher_assignment=assignment,
                    date=current_date,
                    schedule=schedule
                ).first()
                
                if existing:
                    skipped.append({
                        "date": current_date.isoformat(),
                        "assignment": str(assignment),
                        "time": schedule.start_time.strftime("%H:%M"),
                        "reason": "Already exists"
                    })
                else:
                    # Create new session
                    session = AttendanceSession.objects.create(
                        teacher_assignment=assignment,
                        date=current_date,
                        schedule=schedule,
                        status=AttendanceSession.Status.NOT_STARTED,
                        created_by=user
                    )
                    generated.append({
                        "id": session.id,
                        "date": current_date.isoformat(),
                        "assignment": str(assignment),
                        "time": schedule.start_time.strftime("%H:%M"),
                    })
            
            current_date += timedelta(days=1)
    
    return Response({
        "generated": len(generated),
        "skipped": len(skipped),
        "sessions": generated,
        "skipped_details": skipped,
    })


class AttendanceSessionListCreateView(generics.ListCreateAPIView):
    serializer_class = AttendanceSessionSerializer

    def get_permissions(self):
        # Teachers keep their existing route; administrators are
        # department-scoped (attendance department / super administrator).
        return [AdminKeyOrTeacher("attendance.view", "attendance.manage")]

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
    serializer_class = AttendanceSessionSerializer

    def get_permissions(self):
        return [AdminKeyOrTeacher("attendance.view", "attendance.manage")]

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
            # Reading school-wide attendance is the attendance module's
            # "view" permission; students and parents keep their own rows.
            require_key(user, "attendance.view")
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
        from rest_framework.exceptions import PermissionDenied
        # GET stays open to every role (students read their own rows, parents
        # their children's), but writing a mark is a staff action. Without
        # this guard any signed-in student or parent could POST a record for
        # any session and any student — only the (session, student) UNIQUE
        # constraint happened to stand in the way.
        if not (user.is_admin or user.is_teacher):
            raise PermissionDenied(
                "Only teachers and administrators can record attendance."
            )
        if user.is_admin:
            require_key(user, "attendance.manage")
        session = serializer.validated_data.get("session")
        student = serializer.validated_data.get("student")
        if user.is_teacher:
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
        record = serializer.save(recorded_by=user)
        # Update session status
        session.update_status()
        # Absent/late marks alert the student's linked parents.
        notify_attendance_marked(record)


class AttendanceRecordDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = AttendanceRecordSerializer

    def get_permissions(self):
        return [AdminKeyOrTeacher("attendance.view", "attendance.manage")]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return AttendanceRecord.objects.all()
        assignments = TeacherAssignment.objects.filter(teacher=user)
        sessions = AttendanceSession.objects.filter(teacher_assignment__in=assignments)
        return AttendanceRecord.objects.filter(session__in=sessions)

    def perform_update(self, serializer):
        record = serializer.save(modified_by=self.request.user)
        # Update session status
        record.session.update_status()
        # A mark changed to absent/late must alert parents, not just the
        # initial creation.
        notify_attendance_marked(record)


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
        return self._mark_read(request, *args, **kwargs)

    # The Expo app posts to this action URL. DRF's UpdateAPIView only wires
    # PUT/PATCH, so POST fell through to `http_method_not_allowed` and the
    # mobile "mark as read" tap was a silent 405 no-op. Both verbs perform the
    # same single-field update on the caller's own notification.
    def post(self, request, *args, **kwargs):
        return self._mark_read(request, *args, **kwargs)

    def _mark_read(self, request, *args, **kwargs):
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
        if user.is_admin:
            # Admins see every announcement — with `announcements.view`.
            require_key(user, "announcements.view")
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

        # Section scoping: a section-targeted announcement must stay inside that
        # section. `section__isnull=True` means school-wide and is visible to
        # everyone who passes the audience filter above. Without this, students,
        # parents and teachers in *other* sections could read a notice meant for
        # a single class (observed live).
        if not user.is_admin:
            if user.is_student:
                try:
                    my_sections = [user.student_profile.section_id]
                except StudentProfile.DoesNotExist:
                    my_sections = []
            elif user.is_parent:
                try:
                    my_sections = list(
                        user.parent_profile.children.values_list(
                            "section_id", flat=True
                        )
                    )
                except ParentProfile.DoesNotExist:
                    my_sections = []
            elif user.is_teacher:
                my_sections = list(
                    TeacherAssignment.objects.filter(teacher=user)
                    .values_list("section_id", flat=True)
                )
            else:
                my_sections = []
            my_sections = [s for s in my_sections if s is not None]
            qs = qs.filter(Q(section__isnull=True) | Q(section__in=my_sections))

        # Search by title or body
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(body__icontains=search))

        # Filter by audience (explicit, in addition to role-based filtering)
        audience = self.request.query_params.get("audience")
        if audience:
            qs = qs.filter(audience=audience)

        # Filter by pinned status
        is_pinned = self.request.query_params.get("is_pinned")
        if is_pinned is not None:
            qs = qs.filter(is_pinned=is_pinned.lower() == "true")

        # Ordering
        ordering = self.request.query_params.get("ordering")
        if ordering:
            # Validate ordering fields to prevent injection
            allowed_fields = ["published_at", "-published_at", "created_at", "-created_at", "is_pinned", "-is_pinned", "title", "-title"]
            ordering_fields = [f.strip() for f in ordering.split(",")]
            safe_ordering = [f for f in ordering_fields if f in allowed_fields]
            if safe_ordering:
                qs = qs.order_by(*safe_ordering)

        return qs

    def perform_create(self, serializer):
        if not (self.request.user.is_admin or self.request.user.is_teacher):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only teachers and admins can post announcements.")
        if self.request.user.is_admin:
            # Publishing announcements is the communications department's job.
            require_key(self.request.user, "announcements.publish")
        announcement = serializer.save(author=self.request.user)
        # Fan out to everyone in the target audience.
        notify_announcement(announcement)


class AnnouncementDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AnnouncementSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            require_key(user, "announcements.view")
            return Announcement.objects.all()
        # Teachers can only edit their own
        if user.is_teacher:
            return Announcement.objects.filter(author=user)
        return Announcement.objects.none()

    def perform_update(self, serializer):
        if self.request.user.is_admin:
            require_key(self.request.user, "announcements.publish")
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.is_admin:
            require_key(self.request.user, "announcements.publish")
        instance.delete()


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


def _fee_scope_ids(assessment, cache):
    """
    The student ids one assessment applies to, memoized by scope key.

    `FeeAssessment.get_applicable_students()` depends only on the
    (student, section, grade_level, school_year) scope, so assessments
    sharing a scope share a single query instead of one each.
    """
    key = (
        assessment.student_id,
        assessment.section_id,
        assessment.grade_level_id,
        assessment.school_year_id,
    )
    if key not in cache:
        cache[key] = list(
            assessment.get_applicable_students().values_list("id", flat=True)
        )
    return cache[key]


def _fee_assessed_total(assessments, cache=None):
    """amount x applicable students, one query per distinct scope."""
    if cache is None:
        cache = {}
    total = Decimal("0")
    for assessment in assessments:
        total += assessment.amount * len(_fee_scope_ids(assessment, cache))
    return total


def _fee_assessed_by_student(assessments, students):
    """
    {student id: total applicable amount}, computed in Python with exactly
    the scope rules of `FeeAssessment.get_applicable_students()`: student
    beats section beats grade level beats school-wide, and an assessment
    that sets several of them (e.g. a section that also carries its grade
    level) applies through its strongest scope only. The paid, partial and
    unpaid counts derived from it follow the same rule; only the
    one-query-per-student cost is gone.
    """
    by_section = {}
    by_grade = {}
    by_year = {}
    for student in students:
        if student.section:
            by_section.setdefault(student.section_id, []).append(student.id)
            by_grade.setdefault(
                (student.section.grade_level_id, student.section.school_year_id), []
            ).append(student.id)
            by_year.setdefault(student.section.school_year_id, []).append(student.id)

    assessed = {student.id: Decimal("0") for student in students}
    for assessment in assessments:
        amount = assessment.amount
        # First matching scope wins, mirroring get_applicable_students().
        matched = set()
        if assessment.student_id:
            if assessment.student_id in assessed:
                matched.add(assessment.student_id)
        elif assessment.section_id:
            matched.update(by_section.get(assessment.section_id, ()))
        elif assessment.grade_level_id:
            matched.update(by_grade.get(
                (assessment.grade_level_id, assessment.school_year_id), ()
            ))
        else:
            matched.update(by_year.get(assessment.school_year_id, ()))
        for sid in matched:
            assessed[sid] += amount
    return assessed


def _fee_paid_by_student(payments):
    """{student id: completed amount} from one grouped query."""
    return {
        row["student"]: row["total"]
        # .order_by() clears Meta.ordering, which would otherwise be pulled
        # into the GROUP BY and return one row per payment instead of one
        # per student.
        for row in payments.order_by().values("student").annotate(
            total=Sum("amount")
        )
    }


def _section_label(assignment_section):
    return f"{assignment_section.grade_level.name} — {assignment_section.name}"


def _admin_dashboard_payload(user, now):
    """
    The administrator dashboard, scoped by permission.

    The legacy top-level figures stay for anyone holding `users.view` (the
    full-administrator dashboard), and every administrator additionally gets a
    `blocks` object containing only the modules they are authorized for — a
    department administrator never receives school-wide numbers for modules
    outside their department. Every figure is a real count; a missing block
    means "not authorized", never "no data".
    """
    perms = user.permission_keys()
    payload = {
        "role": "admin",
        "is_super_admin": user.is_super_admin,
        "departments": [
            {"id": d.id, "name": d.name, "code": d.code, "is_active": d.is_active}
            for d in user.departments.all()
        ],
        "permissions": sorted(perms),
        "unread_notifications": user.notifications.filter(is_read=False).count(),
        "blocks": {},
    }
    blocks = payload["blocks"]

    if "users.view" in perms:
        accounts = {
            "total_users": User.objects.count(),
            "total_students": User.objects.filter(role=User.Role.STUDENT).count(),
            "total_teachers": User.objects.filter(role=User.Role.TEACHER).count(),
            "total_parents": User.objects.filter(role=User.Role.PARENT).count(),
        }
        blocks["accounts"] = accounts
        payload.update(accounts)

    if "structure.manage" in perms:
        active_year = SchoolYear.objects.filter(is_active=True).first()
        blocks["structure"] = {
            "total_sections": Section.objects.count(),
            "total_grade_levels": GradeLevel.objects.count(),
            "total_subjects": Subject.objects.count(),
            "active_school_year": active_year.label if active_year else None,
        }
        if "users.view" in perms:
            payload["total_sections"] = blocks["structure"]["total_sections"]

    if "requirements.view" in perms:
        requirements = Requirement.objects.all()
        blocks["requirements"] = {
            "total_requirements": requirements.count(),
            "active_requirements": requirements.filter(deadline__gte=now).count(),
            "total_submissions": Submission.objects.count(),
            "awaiting_verification": Submission.objects.filter(
                status=Submission.Status.SUBMITTED
            ).count(),
            "submission_status": _submission_summary(
                Submission.objects.all(), requirements
            ),
        }
        if "users.view" in perms:
            payload["total_requirements"] = blocks["requirements"]["total_requirements"]
            payload["active_requirements"] = blocks["requirements"]["active_requirements"]
            payload["total_submissions"] = blocks["requirements"]["total_submissions"]
            payload["submission_status"] = blocks["requirements"]["submission_status"]

    if "attendance.view" in perms:
        blocks["attendance"] = _attendance_summary(AttendanceRecord.objects.all())
        # Date-scoped so the dashboard can answer "who is here today?"
        # without counting the whole school year.
        blocks["attendance_today"] = _attendance_summary(
            AttendanceRecord.objects.filter(session__date=timezone.localdate())
        )
        if "users.view" in perms:
            payload["attendance"] = blocks["attendance"]

    if "fees.view" in perms:
        from decimal import Decimal

        from django.db.models import Sum

        active_year = SchoolYear.objects.filter(is_active=True).first()
        assessments = FeeAssessment.objects.filter(
            status=FeeAssessment.Status.PUBLISHED
        )
        if active_year:
            assessments = assessments.filter(school_year=active_year)
        total_assessed = _fee_assessed_total(assessments)
        total_collected = FeePayment.objects.filter(
            assessment__in=assessments, status=FeePayment.Status.COMPLETED
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        blocks["fees"] = {
            "total_assessed": float(total_assessed),
            "total_collected": float(total_collected),
            "total_outstanding": float(total_assessed - total_collected),
            "active_school_year": active_year.label if active_year else None,
        }

    if "announcements.view" in perms:
        announcements = Announcement.objects.all()
        blocks["announcements"] = {
            "total": announcements.count(),
            "pinned": announcements.filter(is_pinned=True).count(),
            "latest": [
                {
                    "id": a.id,
                    "title": a.title,
                    "audience": a.audience,
                    "published_at": a.published_at.isoformat() if a.published_at else None,
                }
                for a in announcements.order_by("-is_pinned", "-published_at")[:3]
            ],
        }

    if "audit.view" in perms:
        blocks["audit"] = {
            "recent_activity": [
                {
                    "id": entry.id,
                    "action": entry.action,
                    "description": entry.description,
                    "actor": entry.actor.get_full_name() or entry.actor.username
                    if entry.actor else None,
                    "timestamp": entry.timestamp.isoformat(),
                }
                for entry in AuditLog.objects.select_related("actor")[:5]
            ],
        }
        if "users.view" in perms:
            payload["recent_activity"] = blocks["audit"]["recent_activity"]

    if "departments.view" in perms:
        blocks["departments"] = {
            "total": Department.objects.count(),
            "active": Department.objects.filter(is_active=True).count(),
            "super_admins": User.objects.filter(
                role=User.Role.ADMIN, is_super_admin=True, is_active=True
            ).count(),
        }

    return payload


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
        return Response(_admin_dashboard_payload(user, now))

    return Response({"error": "Unknown role."}, status=400)


# ---------------------------------------------------------------------------
# Fee Management
# ---------------------------------------------------------------------------

class FeePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class FeeCategoryListCreateView(generics.ListCreateAPIView):
    """Admin: list and create fee categories."""
    queryset = FeeCategory.objects.all().annotate(
        assessment_count=Count('assessments')
    ).order_by('name')
    serializer_class = FeeCategorySerializer
    pagination_class = FeePagination

    def get_permissions(self):
        return [AdminKeyOrReadOnly("fees.manage")]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        fee_type = self.request.query_params.get('fee_type')
        is_active = self.request.query_params.get('is_active')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        if fee_type:
            qs = qs.filter(fee_type=fee_type)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    def perform_create(self, serializer):
        serializer.save()


class FeeCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin: retrieve, update, or delete a fee category."""
    queryset = FeeCategory.objects.all()
    serializer_class = FeeCategorySerializer

    def get_permissions(self):
        return [AdminCan("fees.view", "fees.manage")]

    def perform_destroy(self, instance):
        # Prevent deletion if assessments exist
        if instance.assessments.exists():
            raise ValidationError({"detail": (
                f"'{instance}' has {instance.assessments.count()} assessment(s). "
                "Archive or delete them first."
            )})
        instance.delete()


class FeeAssessmentListCreateView(generics.ListCreateAPIView):
    """Admin: list and create fee assessments."""
    serializer_class = FeeAssessmentSerializer
    pagination_class = FeePagination

    def get_permissions(self):
        return [AdminKeyOrReadOnly("fees.manage")]

    def get_queryset(self):
        qs = FeeAssessment.objects.select_related(
            "category", "school_year", "grade_level", "section", "student__user", "created_by"
        ).order_by('-school_year__start_date', 'category__name')
        school_year = self.request.query_params.get("school_year")
        grade_level = self.request.query_params.get("grade_level")
        section = self.request.query_params.get("section")
        category = self.request.query_params.get("category")
        status = self.request.query_params.get("status")
        search = self.request.query_params.get("search")
        if school_year:
            qs = qs.filter(school_year_id=school_year)
        if grade_level:
            qs = qs.filter(grade_level_id=grade_level)
        if section:
            qs = qs.filter(section_id=section)
        if category:
            qs = qs.filter(category_id=category)
        if status:
            qs = qs.filter(status=status)
        if search:
            qs = qs.filter(
                Q(category__name__icontains=search) |
                Q(category__code__icontains=search) |
                Q(student__user__first_name__icontains=search) |
                Q(student__user__last_name__icontains=search) |
                Q(student__lrn__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        AuditLog.objects.create(
            actor=self.request.user,
            action="fee_assessment.created",
            target_model="FeeAssessment",
            target_id=str(serializer.instance.pk),
            description=f"Created fee assessment: {serializer.instance}",
            ip_address=_client_ip(self.request),
        )


class FeeAssessmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin: retrieve, update, or archive a fee assessment."""
    queryset = FeeAssessment.objects.select_related(
        "category", "school_year", "grade_level", "section", "student__user", "created_by"
    )
    serializer_class = FeeAssessmentDetailSerializer

    def get_permissions(self):
        return [AdminCan("fees.view", "fees.manage")]

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="fee_assessment.updated",
            target_model="FeeAssessment",
            target_id=str(instance.pk),
            description=f"Updated fee assessment: {instance}",
            ip_address=_client_ip(self.request),
        )

    def perform_destroy(self, instance):
        # Archive instead of delete to preserve history
        if instance.status == FeeAssessment.Status.ARCHIVED:
            raise ValidationError({"detail": "This assessment is already archived."})
        instance.status = FeeAssessment.Status.ARCHIVED
        instance.save(update_fields=["status", "updated_at"])
        AuditLog.objects.create(
            actor=self.request.user,
            action="fee_assessment.archived",
            target_model="FeeAssessment",
            target_id=str(instance.pk),
            description=f"Archived fee assessment: {instance}",
            ip_address=_client_ip(self.request),
        )


class FeePaymentListCreateView(generics.ListCreateAPIView):
    """Admin/staff: list and record fee payments."""
    serializer_class = FeePaymentSerializer
    pagination_class = FeePagination

    def get_permissions(self):
        # Teachers keep their existing route; administrators need the finance
        # department's keys — recording a payment is not viewing one.
        return [AdminKeyOrTeacher("fees.view", "fees.record_payment")]

    def get_queryset(self):
        user = self.request.user
        qs = FeePayment.objects.select_related(
            "assessment__category", "assessment__school_year",
            "student__user", "student__section__grade_level",
            "recorded_by", "voided_by"
        ).order_by('-payment_date', '-created_at')
        assessment = self.request.query_params.get("assessment")
        student = self.request.query_params.get("student")
        status = self.request.query_params.get("status")
        payment_method = self.request.query_params.get("payment_method")
        school_year = self.request.query_params.get("school_year")
        grade_level = self.request.query_params.get("grade_level")
        section = self.request.query_params.get("section")
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if assessment:
            qs = qs.filter(assessment_id=assessment)
        if student:
            qs = qs.filter(student_id=student)
        if status:
            qs = qs.filter(status=status)
        if payment_method:
            qs = qs.filter(payment_method=payment_method)
        if school_year:
            qs = qs.filter(assessment__school_year_id=school_year)
        if grade_level:
            qs = qs.filter(student__section__grade_level_id=grade_level)
        if section:
            qs = qs.filter(student__section_id=section)
        if category:
            qs = qs.filter(assessment__category_id=category)
        if date_from:
            qs = qs.filter(payment_date__gte=date_from)
        if date_to:
            qs = qs.filter(payment_date__lte=date_to)
        if search:
            qs = qs.filter(
                Q(student__user__first_name__icontains=search) |
                Q(student__user__last_name__icontains=search) |
                Q(student__lrn__icontains=search) |
                Q(reference_number__icontains=search) |
                Q(receipt_number__icontains=search)
            )

        # Teachers can only see payments for their sections
        if user.is_teacher:
            teacher_sections = TeacherAssignment.objects.filter(
                teacher=user
            ).values_list("section_id", flat=True)
            qs = qs.filter(student__section_id__in=teacher_sections)

        return qs

    def perform_create(self, serializer):
        with transaction.atomic():
            # Generate receipt number
            receipt_number = self._generate_receipt_number()
            payment = serializer.save(
                recorded_by=self.request.user,
                receipt_number=receipt_number,
            )
            # Create history entry
            FeePaymentHistory.objects.create(
                payment=payment,
                changed_by=self.request.user,
                old_status="",
                new_status=payment.status,
                old_amount=None,
                new_amount=payment.amount,
                note="Payment recorded.",
            )
            AuditLog.objects.create(
                actor=self.request.user,
                action="fee_payment.recorded",
                target_model="FeePayment",
                target_id=str(payment.pk),
                description=f"Recorded payment: {payment}",
                ip_address=_client_ip(self.request),
            )
        return payment

    def _generate_receipt_number(self):
        """Generate a unique receipt number."""
        from django.utils import timezone
        import random
        date_str = timezone.now().strftime("%Y%m%d")
        while True:
            suffix = ''.join(random.choices('0123456789', k=6))
            receipt = f"RCPT-{date_str}-{suffix}"
            if not FeePayment.objects.filter(receipt_number=receipt).exists():
                return receipt


class FeePaymentDetailView(generics.RetrieveUpdateAPIView):
    """Admin: retrieve or update a fee payment (void/refund)."""
    queryset = FeePayment.objects.select_related(
        "assessment__category", "assessment__school_year",
        "student__user", "student__section__grade_level",
        "recorded_by", "voided_by"
    )
    serializer_class = FeePaymentSerializer

    def get_permissions(self):
        # Reads need fees.view; every write here is a reversal.
        return [AdminCan("fees.view", "fees.reverse")]

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        old_amount = serializer.instance.amount
        payment = serializer.save()
        
        # If status changed, create history entry
        if old_status != payment.status or old_amount != payment.amount:
            FeePaymentHistory.objects.create(
                payment=payment,
                changed_by=self.request.user,
                old_status=old_status,
                new_status=payment.status,
                old_amount=old_amount,
                new_amount=payment.amount,
                note=f"Status changed from {old_status} to {payment.status}.",
            )
            AuditLog.objects.create(
                actor=self.request.user,
                action=f"fee_payment.{payment.status}",
                target_model="FeePayment",
                target_id=str(payment.pk),
                description=f"Payment {payment.status}: {payment}",
                ip_address=_client_ip(self.request),
            )


class FeePaymentHistoryView(generics.ListAPIView):
    """View payment history for a specific payment."""
    serializer_class = FeePaymentHistorySerializer

    def get_permissions(self):
        return [AdminKeyOrTeacher("fees.view")]

    def get_queryset(self):
        payment_id = self.kwargs["payment_id"]
        return FeePaymentHistory.objects.filter(
            payment_id=payment_id
        ).select_related("changed_by")


class StudentFeeSummaryView(generics.ListAPIView):
    """Student/Parent: view fee summary for student(s)."""
    permission_classes = [IsAuthenticated]
    serializer_class = StudentFeeSummarySerializer

    def get_queryset(self):
        user = self.request.user
        school_year = self.request.query_params.get("school_year")
        status = self.request.query_params.get("status")
        category = self.request.query_params.get("category")

        if user.is_student:
            try:
                profile = user.student_profile
            except StudentProfile.DoesNotExist:
                return StudentProfile.objects.none()
            qs = StudentProfile.objects.filter(pk=profile.pk)
        elif user.is_parent:
            try:
                children = user.parent_profile.children.all()
                child_id = self.request.query_params.get("child")
                if child_id:
                    children = children.filter(pk=child_id)
                    if not children.exists():
                        return StudentProfile.objects.none()
                qs = StudentProfile.objects.filter(pk__in=children.values_list("pk", flat=True))
            except ParentProfile.DoesNotExist:
                return StudentProfile.objects.none()
        else:
            return StudentProfile.objects.none()

        # Annotate with fee data
        qs = qs.select_related("user", "section__grade_level", "section__school_year")
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset().select_related("section__grade_level", "section__school_year")
        school_year = request.query_params.get("school_year")
        status = request.query_params.get("status")
        category = request.query_params.get("category")

        for profile in qs:
            # Get assessments for this student
            assessment_filter = Q(student=profile)
            if profile.section:
                assessment_filter |= Q(section=profile.section)
                # Grade-wide only when nothing narrower is set: a
                # section-scoped assessment belongs to its section, even if
                # it also carries the grade level (scope precedence mirrors
                # FeeAssessment.get_applicable_students()).
                assessment_filter |= Q(
                    grade_level=profile.section.grade_level,
                    school_year=profile.section.school_year,
                    section__isnull=True,
                    student__isnull=True,
                )
                assessment_filter |= Q(school_year=profile.section.school_year, grade_level__isnull=True, section__isnull=True, student__isnull=True)
            
            assessments = FeeAssessment.objects.filter(assessment_filter).distinct() if profile.section else FeeAssessment.objects.filter(student=profile)

            if school_year:
                assessments = assessments.filter(school_year_id=school_year)
            if status:
                assessments = assessments.filter(status=status)
            if category:
                assessments = assessments.filter(category_id=category)
            assessments = assessments.filter(status=FeeAssessment.Status.PUBLISHED)

            # Get payments for this student
            payments = FeePayment.objects.filter(
                student=profile, status=FeePayment.Status.COMPLETED
            ).select_related("assessment__category")

            # Build assessment data with payment info
            assessment_data = []
            total_assessed = 0
            total_paid = 0

            for assessment in assessments:
                # Get payment for this assessment
                payment = payments.filter(assessment=assessment).first()
                paid_amount = payment.amount if payment else 0
                outstanding = assessment.amount - paid_amount
                
                payment_status = "unpaid"
                if paid_amount >= assessment.amount:
                    payment_status = "paid"
                elif paid_amount > 0:
                    payment_status = "partial"

                assessment_data.append({
                    "id": assessment.id,
                    "category": assessment.category.name,
                    "category_code": assessment.category.code,
                    "category_fee_type": assessment.category.fee_type,
                    "amount": float(assessment.amount),
                    "due_date": assessment.due_date,
                    "description": assessment.description,
                    "paid_amount": float(paid_amount),
                    "outstanding": float(outstanding),
                    "payment_status": payment_status,
                    "payment_date": payment.payment_date if payment else None,
                    "receipt_number": payment.receipt_number if payment else None,
                })
                total_assessed += assessment.amount
                total_paid += paid_amount

            profile.fee_assessments_data = assessment_data
            profile.total_assessed = total_assessed
            profile.total_paid = total_paid
            profile.total_outstanding = total_assessed - total_paid

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


@api_view(["GET"])
# Function-based views instantiate their permission classes with no args, so
# the keyed class is passed as a partial.
@permission_classes([partial(AdminCan, "reports.view")])
def fee_collection_report(request):
    """Reports: fee collection summary report."""
    from decimal import Decimal

    school_year_id = request.query_params.get("school_year")
    grade_level_id = request.query_params.get("grade_level")
    section_id = request.query_params.get("section")
    category_id = request.query_params.get("category")

    assessments = FeeAssessment.objects.filter(status=FeeAssessment.Status.PUBLISHED)
    if school_year_id:
        assessments = assessments.filter(school_year_id=school_year_id)
    if grade_level_id:
        assessments = assessments.filter(grade_level_id=grade_level_id)
    if section_id:
        assessments = assessments.filter(section_id=section_id)
    if category_id:
        assessments = assessments.filter(category_id=category_id)

    # Group by category
    categories = FeeCategory.objects.filter(is_active=True)
    report_data = []
    scope_cache = {}

    for cat in categories:
        cat_assessments = assessments.filter(category=cat)
        if not cat_assessments.exists():
            continue

        # Students covered by these assessments, one query per distinct
        # scope instead of one per assessment.
        cat_list = list(cat_assessments.select_related("school_year"))
        student_ids = set()
        for assessment in cat_list:
            student_ids.update(_fee_scope_ids(assessment, scope_cache))

        if not student_ids:
            continue

        students = StudentProfile.objects.filter(id__in=student_ids)
        student_list = list(
            students.select_related("section__grade_level", "section__school_year")
        )
        total_assessed = _fee_assessed_total(cat_list, scope_cache)

        payments = FeePayment.objects.filter(
            assessment__in=cat_list,
            student__in=students,
            status=FeePayment.Status.COMPLETED
        )
        total_collected = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        total_outstanding = total_assessed - total_collected
        collection_rate = round(100 * total_collected / total_assessed, 2) if total_assessed > 0 else 0

        # Payment statuses per student, aggregated in Python from one
        # grouped payments query instead of two queries per student.
        assessed_by_student = _fee_assessed_by_student(cat_list, student_list)
        paid_by_student = _fee_paid_by_student(payments)

        paid_count = 0
        partial_count = 0
        unpaid_count = 0
        for student in student_list:
            student_assessed = assessed_by_student[student.id]
            if student_assessed == 0:
                continue
            student_paid = paid_by_student.get(student.id, Decimal("0"))
            if student_paid >= student_assessed:
                paid_count += 1
            elif student_paid > 0:
                partial_count += 1
            else:
                unpaid_count += 1

        report_data.append({
            "school_year": cat_list[0].school_year.label,
            "category": cat.name,
            "total_assessed": total_assessed,
            "total_collected": total_collected,
            "total_outstanding": total_outstanding,
            "collection_rate": collection_rate,
            "student_count": len(student_ids),
            "paid_count": paid_count,
            "partial_count": partial_count,
            "unpaid_count": unpaid_count,
        })

    serializer = FeeCollectionReportSerializer(report_data, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([partial(AdminCan, "reports.view")])
def fee_outstanding_report(request):
    """Reports: outstanding balance report."""
    from decimal import Decimal

    school_year_id = request.query_params.get("school_year")
    grade_level_id = request.query_params.get("grade_level")
    section_id = request.query_params.get("section")
    category_id = request.query_params.get("category")
    status_filter = request.query_params.get("payment_status")  # paid, partial, unpaid

    assessments = FeeAssessment.objects.filter(status=FeeAssessment.Status.PUBLISHED)
    if school_year_id:
        assessments = assessments.filter(school_year_id=school_year_id)
    if grade_level_id:
        assessments = assessments.filter(grade_level_id=grade_level_id)
    if section_id:
        assessments = assessments.filter(section_id=section_id)
    if category_id:
        assessments = assessments.filter(category_id=category_id)

    report_data = []
    for assessment in assessments.select_related("category", "school_year", "grade_level", "section"):
        student_list = list(
            assessment.get_applicable_students().select_related("user", "section__grade_level")
        )
        if not student_list:
            continue
        # One grouped query per assessment instead of two per student row.
        paid_by_student = _fee_paid_by_student(
            FeePayment.objects.filter(
                assessment=assessment,
                student__in=[student.id for student in student_list],
                status=FeePayment.Status.COMPLETED,
            )
        )

        for student in student_list:
            paid = paid_by_student.get(student.id, Decimal("0"))
            assessed = assessment.amount
            outstanding = assessed - paid
            
            payment_status = "unpaid"
            if paid >= assessed:
                payment_status = "paid"
            elif paid > 0:
                payment_status = "partial"

            if status_filter and payment_status != status_filter:
                continue

            report_data.append({
                "student_id": student.id,
                "student_name": student.user.get_full_name(),
                "lrn": student.lrn or "",
                "section": str(student.section) if student.section else "N/A",
                "category": assessment.category.name,
                "assessed": float(assessed),
                "paid": float(paid),
                "outstanding": float(outstanding),
                "due_date": assessment.due_date,
                "payment_status": payment_status,
            })

    serializer = FeeOutstandingReportSerializer(report_data, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([partial(AdminCan, "reports.view")])
def report_trends(request):
    """
    Reports: monthly collection and enrollment trends, last 12 months.

    One row per calendar month (zero-gap-filled, oldest first) so charts
    always get a continuous axis:
      - collected / payments: completed fee payments by payment month,
        optionally narrowed with ?school_year=<id>;
      - enrollments: student accounts created that month (date_joined).
    """
    from datetime import timedelta
    from django.db.models.functions import TruncMonth

    today = timezone.now().date()
    # Month-start 11 months back, so the 12 iterations below include the
    # current (still partial) month.
    start = today.replace(day=1)
    for _ in range(11):
        start = (start - timedelta(days=1)).replace(day=1)

    payments = FeePayment.objects.filter(
        status=FeePayment.Status.COMPLETED,
        payment_date__gte=start,
    )
    school_year_id = request.query_params.get("school_year")
    if school_year_id:
        payments = payments.filter(assessment__school_year_id=school_year_id)

    # TruncMonth yields a datetime for DateTimeFields (date_joined) and a
    # plain date for DateFields (payment_date); bucket keys are dates.
    def month_key(value):
        return value.date() if hasattr(value, "date") else value

    collected = {
        month_key(row["month"]): row
        for row in payments.annotate(month=TruncMonth("payment_date"))
        .values("month")
        .annotate(total=Sum("amount"), count=Count("id"))
    }
    enrolled = {
        month_key(row["month"]): row["total"]
        for row in User.objects.filter(
            role=User.Role.STUDENT, date_joined__date__gte=start
        )
        .annotate(month=TruncMonth("date_joined"))
        .values("month")
        .annotate(total=Count("id"))
    }

    months = []
    cursor = start
    for _ in range(12):
        row = collected.get(cursor)
        months.append({
            "month": cursor.strftime("%Y-%m"),
            "label": cursor.strftime("%b %Y"),
            "collected": float(row["total"]) if row else 0.0,
            "payments": row["count"] if row else 0,
            "enrollments": enrolled.get(cursor, 0),
        })
        # First of the next calendar month.
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    return Response({"months": months})


@api_view(["GET"])
@permission_classes([partial(AdminCan, "fees.view")])
def fee_dashboard_summary(request):
    """Finance: fee management dashboard summary."""
    from django.db.models import Sum
    from decimal import Decimal

    now = timezone.now()
    active_sy = SchoolYear.objects.filter(is_active=True).first()

    # Total assessed (published assessments only)
    published_assessments = FeeAssessment.objects.filter(status=FeeAssessment.Status.PUBLISHED)
    if active_sy:
        published_assessments = published_assessments.filter(school_year=active_sy)

    scope_cache = {}
    published_list = list(published_assessments)
    total_assessed = _fee_assessed_total(published_list, scope_cache)

    # Total collected
    collected_payments = FeePayment.objects.filter(
        assessment__in=published_assessments,
        status=FeePayment.Status.COMPLETED
    )
    total_collected = collected_payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")

    # Outstanding
    total_outstanding = total_assessed - total_collected

    # Students with balances
    student_ids = set()
    for assessment in published_list:
        student_ids.update(_fee_scope_ids(assessment, scope_cache))

    students = list(StudentProfile.objects.filter(id__in=student_ids).select_related(
        "section__grade_level", "section__school_year"
    ))
    assessed_by_student = _fee_assessed_by_student(published_list, students)
    paid_by_student = _fee_paid_by_student(collected_payments)
    students_with_balance = sum(
        1 for student in students
        if paid_by_student.get(student.id, Decimal("0")) < assessed_by_student[student.id]
    )

    # By category
    category_breakdown = []
    for cat in FeeCategory.objects.filter(is_active=True):
        cat_list = [a for a in published_list if a.category_id == cat.id]
        if not cat_list:
            continue
        cat_assessed = _fee_assessed_total(cat_list, scope_cache)
        cat_collected = FeePayment.objects.filter(
            assessment__in=cat_list, status=FeePayment.Status.COMPLETED
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        category_breakdown.append({
            "category": cat.name,
            "code": cat.code,
            "assessed": float(cat_assessed),
            "collected": float(cat_collected),
            "outstanding": float(cat_assessed - cat_collected),
        })

    # Recent payments
    recent_payments = FeePayment.objects.filter(
        status=FeePayment.Status.COMPLETED
    ).select_related(
        "assessment__category", "student__user", "recorded_by"
    ).order_by('-payment_date', '-created_at')[:10]

    recent_data = [
        {
            "id": p.id,
            "student": p.student.user.get_full_name(),
            "category": p.assessment.category.name,
            "amount": float(p.amount),
            "payment_date": p.payment_date,
            "payment_method": p.payment_method,
            "receipt_number": p.receipt_number,
        }
        for p in recent_payments
    ]

    return Response({
        "total_assessed": float(total_assessed),
        "total_collected": float(total_collected),
        "total_outstanding": float(total_outstanding),
        "students_with_balance": students_with_balance,
        "total_students_assessed": len(student_ids),
        "category_breakdown": category_breakdown,
        "recent_payments": recent_data,
    })


# ---------------------------------------------------------------------------
# Departments, roles & permissions
# ---------------------------------------------------------------------------

class DepartmentPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class DepartmentListCreateView(generics.ListCreateAPIView):
    """
    Admin: the department directory.

    Reading needs `departments.view`; creating a department needs
    `departments.manage`. Deactivating a department is the way to retire it —
    it stops granting its permissions immediately.
    """
    serializer_class = DepartmentSerializer
    pagination_class = DepartmentPagination

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [AdminCan("departments.view")]
        return [AdminCan("departments.manage")]

    def get_queryset(self):
        qs = Department.objects.all()
        search = self.request.query_params.get("search")
        is_active = self.request.query_params.get("is_active")
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(code__icontains=search)
            )
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def perform_create(self, serializer):
        department = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="department.created",
            target_model="Department",
            target_id=str(department.pk),
            description=f"Created department '{department.name}' ({department.code}).",
            ip_address=_client_ip(self.request),
        )


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Admin: edit, rename, activate or deactivate a department.

    A department that still has administrators cannot be deleted — reassign
    them first, or deactivate the department instead.
    """
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [AdminCan("departments.view")]
        return [AdminCan("departments.manage")]

    def perform_update(self, serializer):
        old_active = serializer.instance.is_active
        old_name = serializer.instance.name
        department = serializer.save()

        changes = []
        if old_name != department.name:
            changes.append(f"renamed from '{old_name}'")
        if old_active != department.is_active:
            changes.append(
                "activated" if department.is_active else "deactivated"
            )

        AuditLog.objects.create(
            actor=self.request.user,
            action="department.updated",
            target_model="Department",
            target_id=str(department.pk),
            description=(
                f"Updated department '{department.name}'."
                + (f" Changes: {'; '.join(changes)}." if changes else "")
            ),
            ip_address=_client_ip(self.request),
        )

    def perform_destroy(self, instance):
        assigned = instance.administrators.count()
        if assigned:
            raise ValidationError({"detail": (
                f"'{instance}' still has {assigned} assigned administrator(s). "
                "Reassign them to another department first, or deactivate the "
                "department instead of deleting it."
            )})
        name = instance.name
        instance.delete()
        AuditLog.objects.create(
            actor=self.request.user,
            action="department.deleted",
            target_model="Department",
            target_id="",
            description=f"Deleted department '{name}'.",
            ip_address=_client_ip(self.request),
        )


class DepartmentPermissionsView(APIView):
    """
    The permission matrix for one department.

    GET returns the granted keys; PUT replaces the whole set with the keys in
    the body, so what the screen shows is exactly what the database holds.
    """

    def get_permissions(self):
        return [AdminCan("departments.permissions")]

    def get(self, request, pk):
        department = get_object_or_404(Department, pk=pk)
        return Response({
            "department": {
                "id": department.id,
                "name": department.name,
                "code": department.code,
                "is_active": department.is_active,
            },
            "permissions": sorted(
                department.permission_grants.values_list("permission__key", flat=True)
            ),
        })

    def put(self, request, pk):
        department = get_object_or_404(Department, pk=pk)
        serializer = PermissionMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        keys = serializer.validated_data["permissions"]

        old = set(
            department.permission_grants.values_list("permission__key", flat=True)
        )
        new = set(keys)
        permissions = list(
            PermissionDefinition.objects.filter(key__in=keys)
        )

        with transaction.atomic():
            department.permission_grants.all().delete()
            DepartmentPermission.objects.bulk_create([
                DepartmentPermission(
                    department=department,
                    permission=permission,
                    granted_by=request.user,
                )
                for permission in permissions
            ])

        added = sorted(new - old)
        removed = sorted(old - new)
        summary = []
        if added:
            summary.append("granted " + ", ".join(added))
        if removed:
            summary.append("revoked " + ", ".join(removed))
        AuditLog.objects.create(
            actor=request.user,
            action="permissions.department_updated",
            target_model="Department",
            target_id=str(department.pk),
            description=(
                f"Updated permissions for '{department.name}': "
                + ("; ".join(summary) if summary else "no change") + "."
            ),
            ip_address=_client_ip(request),
        )
        return Response({"permissions": sorted(new)})


class PermissionDefinitionListView(generics.ListAPIView):
    """
    The permission definitions the matrix is built from.

    Read-only for every administrator: the keys are not secret, only *who
    holds them* is. The registry in core/rbac.py is the source of truth.
    """
    serializer_class = PermissionDefinitionSerializer
    queryset = PermissionDefinition.objects.all()
    pagination_class = None

    def get_permissions(self):
        return [IsAdmin()]


class UserPermissionsView(APIView):
    """
    Personal permission grants for one administrator.

    Effective permissions = department grants + these personal grants. Only
    administrators can hold grants; the super administrator flag is managed
    on the account itself, not here.
    """

    def get_permissions(self):
        return [AdminCan("departments.permissions")]

    def _target(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if not target.is_admin:
            raise ValidationError({
                "detail": "Permission grants only apply to administrator accounts."
            })
        return target

    def get(self, request, pk):
        target = self._target(request, pk)
        return Response({
            "user": {
                "id": target.id,
                "username": target.username,
                "full_name": target.get_full_name(),
                "is_super_admin": target.is_super_admin,
            },
            "permissions": sorted(
                target.direct_grants.values_list("permission__key", flat=True)
            ),
            "effective": sorted(target.permission_keys()),
        })

    def put(self, request, pk):
        target = self._target(request, pk)
        serializer = PermissionMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        keys = serializer.validated_data["permissions"]

        old = set(target.direct_grants.values_list("permission__key", flat=True))
        new = set(keys)
        permissions = list(PermissionDefinition.objects.filter(key__in=keys))

        with transaction.atomic():
            target.direct_grants.all().delete()
            UserPermission.objects.bulk_create([
                UserPermission(
                    user=target,
                    permission=permission,
                    granted_by=request.user,
                )
                for permission in permissions
            ])
        target.invalidate_permission_cache()

        added = sorted(new - old)
        removed = sorted(old - new)
        summary = []
        if added:
            summary.append("granted " + ", ".join(added))
        if removed:
            summary.append("revoked " + ", ".join(removed))
        AuditLog.objects.create(
            actor=request.user,
            action="permissions.user_updated",
            target_model="User",
            target_id=str(target.pk),
            description=(
                f"Updated personal permissions for '{target.username}': "
                + ("; ".join(summary) if summary else "no change") + "."
            ),
            ip_address=_client_ip(request),
        )
        return Response({
            "permissions": sorted(new),
            "effective": sorted(target.permission_keys()),
        })


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

class AuditLogPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class AuditLogListView(generics.ListAPIView):
    """
    The audit trail, newest first.

    Read-only, and only for administrators holding `audit.view` (the super
    administrator by default). Rows are written by the backend at the moment
    of the action — nothing here can be edited or deleted through the API.
    """
    serializer_class = AuditLogSerializer
    pagination_class = AuditLogPagination

    def get_permissions(self):
        return [AdminCan("audit.view")]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor")
        action = self.request.query_params.get("action")
        actor = self.request.query_params.get("actor")
        target_model = self.request.query_params.get("target_model")
        target_id = self.request.query_params.get("target_id")
        search = self.request.query_params.get("search")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if action:
            qs = qs.filter(action__icontains=action)
        if actor:
            qs = qs.filter(actor_id=actor)
        if target_model:
            qs = qs.filter(target_model=target_model)
        if target_id:
            qs = qs.filter(target_id=target_id)
        if search:
            qs = qs.filter(
                Q(description__icontains=search) | Q(action__icontains=search)
            )
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        return qs
