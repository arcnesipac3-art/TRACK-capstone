"""
TRACK — Enrollment & Admissions API views.

Two audiences share one URL namespace, split by path:

  * applicant side  — /api/enrollment/applications/my/... : students and
    their linked parents/guardians manage their own applications. Ownership
    always comes from the authenticated session (queryset scoping), never
    from a student id or reference the frontend supplies.
  * staff side      — /api/enrollment/applications/... : administrators
    holding the enrollment.view / enrollment.manage / enrollment.confirm
    permission keys (the Registrar department by default).

Every status move runs through the state machine in core/enrollment.py;
serializers can never smuggle an arbitrary status. Capacity, identity and
confirmation rules are re-validated server-side at the moment they run.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import enrollment as workflow
from .enrollment_serializers import (
    ApplicationDocumentSerializer,
    ApplicationDocumentStaffSerializer,
    AssignSectionSerializer,
    EnrollmentApplicationCreateSerializer,
    EnrollmentApplicationDetailSerializer,
    EnrollmentApplicationListSerializer,
    EnrollmentApplicationStaffDetailSerializer,
    EnrollmentApplicationStaffListSerializer,
    EnrollmentApplicationUpdateSerializer,
    EnrollmentPeriodSerializer,
    EnrollmentRequirementSerializer,
    EnrollmentSerializer,
    LinkStudentSerializer,
    StaffApplicationActionSerializer,
    StaffDocumentActionSerializer,
)
from .models import (
    ApplicationDocument,
    ApplicationStatus,
    Enrollment,
    EnrollmentApplication,
    EnrollmentPeriod,
    EnrollmentRequirement,
)
from .notifications import (
    notify_enrollment_corrections,
    notify_enrollment_decision,
    notify_enrollment_submitted,
)
from .pagination import TrackPagination
from .permissions import AdminCan
from .views import _client_ip


class Conflict(APIException):
    """A concurrent state/capacity change (HTTP 409)."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "The request conflicts with the current state."
    default_code = "conflict"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _is_enrollment_staff(user, key="enrollment.view"):
    return bool(
        user
        and user.is_authenticated
        and user.is_admin
        and user.has_perm_key(key)
    )


def _visible_applications(user):
    """
    Applications the user may manage as applicant/guardian. Ownership is
    derived from the account: the submitting user, the linked student's own
    account, or a parent/guardian with a verified link to that student.
    """
    if not user or not user.is_authenticated:
        return EnrollmentApplication.objects.none()
    scope = Q(applicant=user) | Q(student__user=user)
    if user.is_parent:
        scope |= Q(student__parents__user=user)
    return EnrollmentApplication.objects.filter(scope).distinct()


def _workflow_error(exc):
    """Map the service layer's rule violations onto DRF/HTTP."""
    if isinstance(exc, workflow.EnrollmentConflictError):
        return Conflict(exc.message)
    return ValidationError({"detail": exc.message})


# ---------------------------------------------------------------------------
# Enrollment periods (applicants read open/upcoming; staff configure all)
# ---------------------------------------------------------------------------

class EnrollmentPeriodListCreateView(generics.ListCreateAPIView):
    serializer_class = EnrollmentPeriodSerializer
    pagination_class = TrackPagination

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        from .permissions import AdminCan
        return [AdminCan(write_key="enrollment.manage")]

    def get_queryset(self):
        qs = EnrollmentPeriod.objects.select_related("school_year").annotate(
            application_count=Count("applications", distinct=True),
            requirement_count=Count("document_requirements", distinct=True),
        ).order_by("-school_year__start_date", "-opens_at")
        if not _is_enrollment_staff(self.request.user):
            # Applicants only see windows they could act in; closed history
            # stays staff-only.
            now = timezone.now()
            qs = qs.filter(
                status=EnrollmentPeriod.Status.OPEN, closes_at__gte=now
            )
        school_year = self.request.query_params.get("school_year")
        if school_year:
            qs = qs.filter(school_year_id=school_year)
        status_filter = self.request.query_params.get("status")
        if status_filter and _is_enrollment_staff(self.request.user):
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class EnrollmentPeriodDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EnrollmentPeriodSerializer
    queryset = EnrollmentPeriod.objects.select_related("school_year")

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        from .permissions import AdminCan
        return [AdminCan(write_key="enrollment.manage")]

    def get_object(self):
        obj = super().get_object()
        # Applicants may only inspect periods they could apply to.
        if not _is_enrollment_staff(self.request.user):
            if obj.status != EnrollmentPeriod.Status.OPEN:
                raise DjangoPermissionDenied("This enrollment period is closed.")
        return obj

    def perform_destroy(self, instance):
        if instance.applications.exists():
            raise ValidationError({"detail": (
                "This period already has applications and cannot be deleted. "
                "Close it instead — closing never removes existing applications."
            )})
        instance.delete()


# ---------------------------------------------------------------------------
# Document requirement configuration
# ---------------------------------------------------------------------------

class EnrollmentRequirementListCreateView(generics.ListCreateAPIView):
    serializer_class = EnrollmentRequirementSerializer
    pagination_class = TrackPagination

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        from .permissions import AdminCan
        return [AdminCan(write_key="enrollment.manage")]

    def get_queryset(self):
        qs = EnrollmentRequirement.objects.select_related(
            "period", "period__school_year", "grade_level"
        ).order_by("period__-school_year__start_date", "position", "name")
        period = self.request.query_params.get("period")
        grade_level = self.request.query_params.get("grade_level")
        enrollment_type = self.request.query_params.get("enrollment_type")
        active = self.request.query_params.get("active")
        if period:
            qs = qs.filter(period_id=period)
        if grade_level:
            qs = qs.filter(
                Q(grade_level_id=grade_level) | Q(grade_level__isnull=True)
            )
        if enrollment_type:
            qs = qs.filter(
                Q(enrollment_type=enrollment_type) | Q(enrollment_type="")
            )
        if active in ("true", "false"):
            qs = qs.filter(is_active=(active == "true"))
        return qs


class EnrollmentRequirementDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EnrollmentRequirementSerializer
    queryset = EnrollmentRequirement.objects.select_related("period", "grade_level")

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        from .permissions import AdminCan
        return [AdminCan(write_key="enrollment.manage")]

    def perform_destroy(self, instance):
        # Evidence against a requirement is protected by the FK; a used
        # requirement must be deactivated, never deleted.
        if instance.documents.exists():
            raise ValidationError({"detail": (
                "Applications already reference this requirement. Deactivate it "
                "instead of deleting it — historical evidence is preserved."
            )})
        instance.delete()


# ---------------------------------------------------------------------------
# Applicant side — my applications
# ---------------------------------------------------------------------------

class MyEnrollmentApplicationsView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    """List everything this account may manage; start a new draft application."""

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EnrollmentApplicationCreateSerializer
        return EnrollmentApplicationListSerializer

    def get_queryset(self):
        return _visible_applications(self.request.user).select_related(
            "school_year", "grade_level", "assigned_section", "period"
        ).prefetch_related("documents")

    def create(self, request, *args, **kwargs):
        if request.user.is_admin or request.user.is_teacher:
            raise PermissionDenied(
                "Enrollment applications are submitted by students or their "
                "parents/guardians."
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                application = serializer.save()
        except IntegrityError:
            raise ValidationError(
                "You already have an active application for this school year."
            )
        output = EnrollmentApplicationDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data, status=status.HTTP_201_CREATED)


class MyApplicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    """Read, edit (draft/corrections) or discard (draft only) own application."""

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return EnrollmentApplicationUpdateSerializer
        if _is_enrollment_staff(self.request.user):
            return EnrollmentApplicationStaffDetailSerializer
        return EnrollmentApplicationDetailSerializer

    def get_queryset(self):
        return _visible_applications(self.request.user).select_related(
            "school_year", "grade_level", "assigned_section", "period", "student",
            "reviewer", "section_approved_by",
        ).prefetch_related(
            "documents", "events", "enrollments", "documents__verified_by"
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        application = self.get_object()
        if not application.is_editable_by_applicant:
            raise ValidationError({
                "detail": (
                    "This application can no longer be edited. Only drafts and "
                    "applications awaiting corrections can be changed."
                )
            })
        serializer = self.get_serializer(
            application, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        output = EnrollmentApplicationDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)

    def perform_destroy(self, instance):
        # Only unsent drafts may be discarded; anything that entered review is
        # preserved with its history and must be withdrawn or cancelled instead.
        if instance.status != ApplicationStatus.DRAFT:
            raise ValidationError({"detail": (
                "Only draft applications can be deleted. Submitted applications "
                "must be withdrawn instead."
            )})
        instance.delete()


class MyApplicationSubmitView(APIView):
    permission_classes = [IsAuthenticated]
    """Draft → Submitted, gated on every required document being present."""

    def post(self, request, pk):
        try:
            application = _visible_applications(request.user).get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            with transaction.atomic():
                locked = (
                    EnrollmentApplication.objects.select_for_update()
                    .filter(pk=application.pk).first()
                )
                if not locked.period.is_accepting_applications:
                    raise workflow.EnrollmentWorkflowError(
                        "This enrollment period is no longer accepting new "
                        "submissions. Contact the Registrar for assistance."
                    )
                blockers = workflow.document_blockers(locked)
                if blockers:
                    raise workflow.EnrollmentWorkflowError(
                        "Upload the missing required documents before submitting: "
                        + ", ".join(blockers) + "."
                    )
                workflow.transition(
                    locked,
                    ApplicationStatus.SUBMITTED,
                    request.user,
                    action="submitted",
                    note="Application submitted for review.",
                    ip_address=_client_ip(request),
                )
                transaction.on_commit(
                    lambda app=locked: notify_enrollment_submitted(app)
                )
        except (workflow.EnrollmentWorkflowError, workflow.EnrollmentConflictError) as exc:
            raise _workflow_error(exc)
        output = EnrollmentApplicationDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)


class MyApplicationResubmitView(APIView):
    permission_classes = [IsAuthenticated]
    """Incomplete → Resubmitted after the applicant fixed the documents."""

    def post(self, request, pk):
        try:
            application = _visible_applications(request.user).get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            with transaction.atomic():
                locked = (
                    EnrollmentApplication.objects.select_for_update()
                    .filter(pk=application.pk).first()
                )
                blockers = workflow.document_blockers(locked)
                if blockers:
                    raise workflow.EnrollmentWorkflowError(
                        "Replace the missing or returned documents before "
                        "resubmitting: " + ", ".join(blockers) + "."
                    )
                workflow.transition(
                    locked,
                    ApplicationStatus.RESUBMITTED,
                    request.user,
                    action="resubmitted",
                    note="Corrections completed; application resubmitted.",
                    ip_address=_client_ip(request),
                )
        except (workflow.EnrollmentWorkflowError, workflow.EnrollmentConflictError) as exc:
            raise _workflow_error(exc)
        output = EnrollmentApplicationDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)


class MyApplicationWithdrawView(APIView):
    permission_classes = [IsAuthenticated]
    """Applicant-initiated withdrawal while the application is still live."""

    def post(self, request, pk):
        try:
            application = _visible_applications(request.user).get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            with transaction.atomic():
                locked = (
                    EnrollmentApplication.objects.select_for_update()
                    .filter(pk=application.pk).first()
                )
                workflow.transition(
                    locked,
                    ApplicationStatus.WITHDRAWN,
                    request.user,
                    action="withdrawn",
                    note="Withdrawn by the applicant.",
                    ip_address=_client_ip(request),
                )
                transaction.on_commit(
                    lambda app=locked: notify_enrollment_decision(app)
                )
        except (workflow.EnrollmentWorkflowError, workflow.EnrollmentConflictError) as exc:
            raise _workflow_error(exc)
        output = EnrollmentApplicationDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)


# ---------------------------------------------------------------------------
# Document upload & download
# ---------------------------------------------------------------------------

ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024  # 10 MB


def _content_signature_ok(header: bytes, extension: str) -> bool:
    """Best-effort magic-byte check so an executable can't hide behind a
    renamed extension."""
    if extension == ".pdf":
        return header.startswith(b"%PDF")
    if extension in (".jpg", ".jpeg"):
        return header.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return header.startswith(b"\x89PNG")
    if extension == ".webp":
        return header[:4] == b"RIFF" and header[8:12] == b"WEBP"
    if extension == ".docx":
        return header.startswith(b"PK\x03\x04")
    if extension == ".doc":
        return header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    return False


class MyApplicationDocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    """Upload or replace one document slot (multipart, field name `file`)."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk, document_pk):
        try:
            application = _visible_applications(request.user).get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not application.is_editable_by_applicant:
            raise ValidationError({"detail": (
                "Documents can only be uploaded while the application is a "
                "draft or awaiting corrections. Ask the Registrar to return "
                "the application first."
            )})
        try:
            document = application.documents.get(pk=document_pk)
        except ApplicationDocument.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose a file to upload."})
        import os
        safe_name = os.path.basename(upload.name or "document")
        extension = os.path.splitext(safe_name)[1].lower()
        if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
            raise ValidationError({"file": (
                "Unsupported file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX."
            )})
        if upload.size and upload.size > MAX_DOCUMENT_BYTES:
            raise ValidationError({"file": "The file is too large (10 MB maximum)."})
        header = upload.read(16)
        upload.seek(0)
        if not _content_signature_ok(header, extension):
            raise ValidationError({"file": (
                "The file content does not match its extension and was rejected."
            )})

        with transaction.atomic():
            document.file = upload
            document.original_filename = safe_name[:255]
            document.status = ApplicationDocument.Status.SUBMITTED
            document.submitted_at = timezone.now()
            document.review_note = ""
            document.save()
            workflow.log_application_event(
                application,
                request.user,
                "document_uploaded",
                note=f"{document.name} uploaded.",
                internal_note=f"Replaced by {safe_name} ({upload.size} bytes).",
            )
        return Response(
            ApplicationDocumentSerializer(document, context={"request": request}).data
        )


def _document_owner_or_staff(user, application):
    if _is_enrollment_staff(user, "enrollment.view"):
        return True
    return _visible_applications(user).filter(pk=application.pk).exists()


class ApplicationDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]
    """Short-lived authorized download — files are never exposed through the
    public media URL; access re-checks ownership/staff permission per request."""

    def get(self, request, pk, document_pk):
        try:
            application = EnrollmentApplication.objects.get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not _document_owner_or_staff(request.user, application):
            # 404, not 403: never confirm the existence of someone else's record.
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            document = application.documents.get(pk=document_pk)
        except ApplicationDocument.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not document.file:
            raise ValidationError({"detail": "No file has been uploaded for this document yet."})
        import os
        safe_name = os.path.basename(document.original_filename or document.file.name)
        return FileResponse(
            document.file.open("rb"),
            as_attachment=True,
            filename=safe_name,
        )


# ---------------------------------------------------------------------------
# Staff side — application queue & workspace
# ---------------------------------------------------------------------------

class StaffApplicationPagination(TrackPagination):
    page_size = 25


class StaffApplicationListView(generics.ListAPIView):
    serializer_class = EnrollmentApplicationStaffListSerializer
    pagination_class = StaffApplicationPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not _is_enrollment_staff(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.view' permission.")
        qs = EnrollmentApplication.objects.select_related(
            "school_year", "grade_level", "assigned_section", "applicant", "student", "period"
        ).annotate(
            outstanding_documents=Count(
                "documents",
                filter=Q(documents__is_required=True)
                & Q(documents__status__in=[
                    ApplicationDocument.Status.NOT_SUBMITTED,
                    ApplicationDocument.Status.RETURNED,
                ]),
                distinct=True,
            )
        ).order_by("-created_at")

        params = self.request.query_params
        for field in ("school_year", "grade_level", "enrollment_type", "status", "period"):
            value = params.get(field)
            if value:
                qs = qs.filter(**{field: value})
        submitted_from = params.get("submitted_from")
        if submitted_from:
            qs = qs.filter(submitted_at__date__gte=submitted_from)
        submitted_to = params.get("submitted_to")
        if submitted_to:
            qs = qs.filter(submitted_at__date__lte=submitted_to)
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(applicant_name__icontains=search)
                | Q(lrn__icontains=search)
                | Q(applicant__username__icontains=search)
            )
        ordering = params.get("ordering")
        if ordering in ("-submitted_at", "submitted_at", "-created_at", "created_at"):
            qs = qs.order_by(ordering)
        return qs


class StaffApplicationDetailView(generics.RetrieveAPIView):
    serializer_class = EnrollmentApplicationStaffDetailSerializer
    permission_classes = [IsAuthenticated]
    queryset = EnrollmentApplication.objects.select_related(
        "school_year", "grade_level", "assigned_section", "period", "applicant",
        "student", "student__user", "reviewer", "section_approved_by",
    ).prefetch_related(
        "documents", "documents__verified_by", "events", "enrollments",
    )

    def get_object(self):
        if not _is_enrollment_staff(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.view' permission.")
        return super().get_object()


class StaffApplicationActionView(APIView):
    """Review actions: start_review / request_corrections / accept / reject /
    waitlist / cancel — each validated against the state machine."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_enrollment_staff(request.user, "enrollment.manage"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.manage' permission.")
        serializer = StaffApplicationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        note = serializer.validated_data.get("note", "").strip()
        internal_note = serializer.validated_data.get("internal_note", "").strip()
        reason = serializer.validated_data.get("reason", "").strip()

        targets = {
            "start_review": ApplicationStatus.UNDER_REVIEW,
            "request_corrections": ApplicationStatus.INCOMPLETE,
            "accept": ApplicationStatus.ACCEPTED,
            "reject": ApplicationStatus.REJECTED,
            "waitlist": ApplicationStatus.WAITLISTED,
            "cancel": ApplicationStatus.CANCELLED,
        }
        notifications = {
            ApplicationStatus.INCOMPLETE: notify_enrollment_corrections,
            ApplicationStatus.ACCEPTED: notify_enrollment_decision,
            ApplicationStatus.REJECTED: notify_enrollment_decision,
            ApplicationStatus.WAITLISTED: notify_enrollment_decision,
            ApplicationStatus.CANCELLED: notify_enrollment_decision,
        }

        try:
            with transaction.atomic():
                application = (
                    EnrollmentApplication.objects.select_for_update()
                    .select_related("period")
                    .get(pk=pk)
                )
                if (
                    action == "waitlist"
                    and not application.period.allow_waitlist
                ):
                    raise workflow.EnrollmentWorkflowError(
                        "Waitlisting is not enabled for this enrollment period."
                    )
                target = targets[action]
                # The state machine decides first: an illegal transition is an
                # illegal transition regardless of document state.
                workflow.transition_target("staff", application.status, target)
                if action == "accept":
                    blockers = workflow.verification_blockers(application)
                    if blockers:
                        raise workflow.EnrollmentWorkflowError(
                            "Required documents must be verified (or waived) "
                            "before accepting: " + ", ".join(blockers) + "."
                        )
                workflow.transition(
                    application,
                    target,
                    request.user,
                    action=action,
                    note=note or "",
                    internal_note=internal_note or reason,
                    ip_address=_client_ip(request),
                    extra_fields={"decision_reason": reason} if reason else None,
                )
                notify = notifications.get(target)
                if notify is not None:
                    if target == ApplicationStatus.INCOMPLETE:
                        transaction.on_commit(
                            lambda app=application: notify(app, note=note)
                        )
                    else:
                        transaction.on_commit(
                            lambda app=application: notify(app)
                        )
                workflow._audit(
                    request.user,
                    f"enrollment.{action}",
                    application,
                    f"{action.replace('_', ' ').title()} — {application.reference}.",
                    _client_ip(request),
                )
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except (workflow.EnrollmentWorkflowError, workflow.EnrollmentConflictError) as exc:
            raise _workflow_error(exc)
        output = EnrollmentApplicationStaffDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)


class StaffDocumentActionView(APIView):
    """Verify / return / waive one application document."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, document_pk):
        if not _is_enrollment_staff(request.user, "enrollment.manage"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.manage' permission.")
        serializer = StaffDocumentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        note = serializer.validated_data.get("note", "").strip()

        try:
            with transaction.atomic():
                application = EnrollmentApplication.objects.select_for_update().get(pk=pk)
                document = application.documents.select_for_update().get(pk=document_pk)
                if action == "verify":
                    if not document.file:
                        raise workflow.EnrollmentWorkflowError(
                            "There is no uploaded file to verify for this document."
                        )
                    document.status = ApplicationDocument.Status.VERIFIED
                    document.verified_by = request.user
                    document.verified_at = timezone.now()
                    if note:
                        document.review_note = note
                elif action == "return":
                    document.status = ApplicationDocument.Status.RETURNED
                    document.review_note = note
                else:  # waive
                    document.status = ApplicationDocument.Status.WAIVED
                    document.verified_by = request.user
                    document.verified_at = timezone.now()
                    document.review_note = note or "Waived by the Registrar."
                document.save()
                workflow.log_application_event(
                    application,
                    request.user,
                    f"document_{action}",
                    note=f"{document.name}: {document.get_status_display()}."
                    + (f" {note}" if note else ""),
                    internal_note=f"Document #{document.pk} {action}ed.",
                )
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ApplicationDocument.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except workflow.EnrollmentWorkflowError as exc:
            raise _workflow_error(exc)
        return Response(
            ApplicationDocumentStaffSerializer(document, context={"request": request}).data
        )


class StaffSectionRecommendationsView(APIView):
    """Eligible sections for the application's grade with live capacity."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not _is_enrollment_staff(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.view' permission.")
        try:
            application = EnrollmentApplication.objects.select_related(
                "school_year", "grade_level"
            ).get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        rows = workflow.section_recommendations(
            application.school_year, application.grade_level
        )
        return Response({
            "application": application.pk,
            "grade_level": application.grade_level.name,
            "school_year": application.school_year.label,
            "recommendations": [
                {
                    "section_id": row["section"].pk,
                    "name": row["section"].name,
                    "grade_level": row["section"].grade_level.name,
                    "adviser": (
                        row["section"].adviser.get_full_name()
                        if row["section"].adviser_id else None
                    ),
                    "capacity": row["capacity"],
                    "assigned": row["assigned"],
                    "available": row["available"],
                    "currently_assigned": (
                        application.assigned_section_id == row["section"].pk
                    ),
                }
                for row in rows
            ],
        })


class StaffAssignSectionView(APIView):
    """Approve the final section assignment (capacity re-checked under lock)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_enrollment_staff(request.user, "enrollment.manage"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.manage' permission.")
        serializer = AssignSectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        section = serializer.validated_data["section"]
        try:
            application = EnrollmentApplication.objects.select_related(
                "period", "school_year", "grade_level"
            ).get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            workflow.assign_section(
                application, section, request.user, ip_address=_client_ip(request)
            )
        except (workflow.EnrollmentWorkflowError, workflow.EnrollmentConflictError) as exc:
            raise _workflow_error(exc)
        output = EnrollmentApplicationStaffDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)


class StaffLinkStudentView(APIView):
    """Manually link a reviewed student identity (staff decision on uncertain
    matches — nothing ever auto-merges)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_enrollment_staff(request.user, "enrollment.manage"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.manage' permission.")
        serializer = LinkStudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.validated_data["student"]
        try:
            with transaction.atomic():
                application = EnrollmentApplication.objects.select_for_update().get(pk=pk)
                if application.student_id:
                    raise workflow.EnrollmentWorkflowError(
                        "This application is already linked to a student record. "
                        "Unlinking is not supported — create a corrected "
                        "application if the link is wrong."
                    )
                if application.status not in workflow.STAFF_REVIEWABLE:
                    raise workflow.EnrollmentWorkflowError(
                        "The student can only be linked while the application "
                        "is under review."
                    )
                application.student = profile
                application.save(update_fields=["student", "updated_at"])
                workflow.log_application_event(
                    application,
                    request.user,
                    "student_linked",
                    note="Matched to an existing student record by the Registrar.",
                    internal_note=f"Manually linked to StudentProfile {profile.pk}.",
                )
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except workflow.EnrollmentWorkflowError as exc:
            raise _workflow_error(exc)
        output = EnrollmentApplicationStaffDetailSerializer(
            application, context={"request": request}
        )
        return Response(output.data)


class StaffConfirmEnrollmentView(APIView):
    """The Registrar's atomic final confirmation (idempotent on retry)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_enrollment_staff(request.user, "enrollment.confirm"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "You do not have the 'enrollment.confirm' permission. Only the "
                "Registrar can confirm enrollments."
            )
        try:
            application = EnrollmentApplication.objects.get(pk=pk)
        except EnrollmentApplication.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            enrollment, created = workflow.confirm_enrollment(
                application, request.user, ip_address=_client_ip(request)
            )
        except (workflow.EnrollmentWorkflowError, workflow.EnrollmentConflictError) as exc:
            raise _workflow_error(exc)
        return Response(
            {
                "enrollment": EnrollmentSerializer(
                    enrollment, context={"request": request}
                ).data,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Enrollments, dashboards & reports
# ---------------------------------------------------------------------------

class EnrollmentListView(generics.ListAPIView):
    serializer_class = EnrollmentSerializer
    pagination_class = StaffApplicationPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not _is_enrollment_staff(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.view' permission.")
        qs = Enrollment.objects.select_related(
            "student", "student__user", "school_year", "grade_level",
            "section", "confirmed_by", "application",
        ).order_by(
            "-school_year__start_date", "grade_level__order", "student__user__last_name"
        )
        params = self.request.query_params
        for field in ("school_year", "grade_level", "section", "status"):
            value = params.get(field)
            if value:
                qs = qs.filter(**{field: value})
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(student__user__first_name__icontains=search)
                | Q(student__user__last_name__icontains=search)
                | Q(student__lrn__icontains=search)
            )
        return qs


class MyEnrollmentsView(generics.ListAPIView):
    """Confirmed enrollments for the student's own profile or a parent's
    linked children."""

    serializer_class = EnrollmentSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_parent and hasattr(user, "parent_profile"):
            return Enrollment.objects.filter(
                student__in=user.parent_profile.children.all()
            ).select_related(
                "student", "student__user", "school_year", "grade_level", "section"
            )
        if hasattr(user, "student_profile"):
            return Enrollment.objects.filter(student=user.student_profile).select_related(
                "student", "student__user", "school_year", "grade_level", "section"
            )
        return Enrollment.objects.none()


class EnrollmentDashboardView(APIView):
    """Real registrar dashboard figures — an error surfaces as an error, never
    as fabricated zeros."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_enrollment_staff(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.view' permission.")
        school_year = request.query_params.get("school_year")
        sy = None
        if school_year:
            from .models import SchoolYear
            try:
                sy = SchoolYear.objects.get(pk=school_year)
            except SchoolYear.DoesNotExist:
                raise ValidationError({"school_year": "School year not found."})
        payload = workflow.dashboard_stats(sy)
        payload["open_periods"] = EnrollmentPeriod.objects.filter(
            status=EnrollmentPeriod.Status.OPEN
        ).count()
        if sy is not None:
            from .models import Section
            payload["sections"] = [
                {
                    "section_id": row["section"].pk,
                    "section": row["section"].name,
                    "grade_level": row["section"].grade_level.name,
                    "capacity": row["capacity"],
                    "assigned": row["assigned"],
                    "available": row["available"],
                }
                for row in (
                    workflow.section_slot_row(section, sy)
                    for section in Section.objects.filter(
                        school_year=sy
                    ).select_related("grade_level").order_by(
                        "grade_level__order", "name"
                    )
                )
            ]
        return Response(payload)


class EnrollmentReportView(APIView):
    """Status/grade/type breakdown plus section occupancy for one school year."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_enrollment_staff(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have the 'enrollment.view' permission.")
        from .models import SchoolYear
        school_year = request.query_params.get("school_year")
        if not school_year:
            raise ValidationError({"school_year": "Select a school year."})
        try:
            sy = SchoolYear.objects.get(pk=school_year)
        except SchoolYear.DoesNotExist:
            raise ValidationError({"school_year": "School year not found."})
        payload = workflow.school_year_report(sy)
        payload["school_year"] = {
            "id": sy.pk,
            "label": sy.label,
            "is_active": sy.is_active,
        }
        return Response(payload)
