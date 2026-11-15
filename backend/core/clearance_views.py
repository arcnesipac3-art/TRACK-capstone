"""
TRACK — Digital Clearance API views.

Four audiences, one namespace, split by path the way enrollment splits its
applicant and staff sides:

  * ``/api/clearance/periods/…``, ``/departments/…``, ``/requirements/…``,
    ``/categories/…``, ``/obligation-types/…`` — configuration. Administrator
    only: ``clearance.view`` to read, ``clearance.manage`` to write.
  * ``/api/clearance/queue/…``, ``/items/…`` — the department verification
    portal. ``IsAuthenticated`` at the class, then the workflow is asked whether
    this person belongs to *this* item's department. A queue is never scoped by
    trusting a query parameter that names a department.
  * ``/api/clearance/my/…`` — the learner and guardian portal. Every query is
    built from ``visible_clearances()``, which derives ownership from the
    account, so an id in a URL cannot reach someone else's clearance; it answers
    404 rather than confirming the row exists.
  * ``/api/clearance/records/…``, ``/dashboard/``, ``/reports/`` — monitoring.

Nothing here decides a status on its own: every state change calls into
core/clearance.py, which re-checks the rules inside the transaction that writes.
"""

import csv
import os
from functools import partial

from django.db import transaction
from django.db.models import Count, F, Prefetch, Q
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import (
    APIException,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import clearance as workflow
from .clearance_serializers import (
    ClearanceActivitySerializer,
    ClearanceObligationSerializer,
    ClearancePeriodSerializer,
    ClearanceRequirementSerializer,
    ClearanceStudentCategorySerializer,
    DepartmentClearanceDetailSerializer,
    DepartmentClearanceListSerializer,
    DepartmentDecisionSerializer,
    FinalizeSerializer,
    LearnerActionSerializer,
    LearnerClearanceSerializer,
    ObligationActionSerializer,
    ObligationCreateSerializer,
    ObligationTypeSerializer,
    PeriodDepartmentSerializer,
    ReopenSerializer,
    StudentClearanceDetailSerializer,
    StudentClearanceListSerializer,
    SubmissionReviewSerializer,
)
from .enrollment_views import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_BYTES,
    _content_signature_ok,
)
from .models import (
    CLEARANCE_TYPES,
    ClearanceEvent,
    ClearanceObligation,
    ClearancePeriod,
    ClearanceRequirement,
    ClearanceStatus,
    ClearanceStudentCategory,
    ClearanceSubmission,
    Department,
    DepartmentClearance,
    DepartmentStatus,
    GradeLevel,
    ObligationType,
    PeriodDepartment,
    SchoolYear,
    Section,
    StudentClearance,
    StudentProfile,
)
from .pagination import TrackPagination
from .permissions import AdminCan
from .views import _client_ip


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ClearanceRejected(APIException):
    """The workflow refused an action because of the record's state."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The clearance workflow refused this action."
    default_code = "clearance_rejected"


class ClearanceLocked(APIException):
    """A setup change that would rewrite evidence learners already hold."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This clearance is already configured for learners."
    default_code = "clearance_locked"


def _refuse(exc):
    """Map the service layer's rule violations onto DRF/HTTP and stop."""
    if isinstance(exc, workflow.ClearanceConfigurationError):
        raise ClearanceLocked(str(exc))
    raise ClearanceRejected(str(exc))


def _run(action, *args, **kwargs):
    """Call a workflow function, turning its rule violations into responses."""
    try:
        return action(*args, **kwargs)
    except (workflow.ClearanceWorkflowError, workflow.ClearanceConfigurationError) as exc:
        _refuse(exc)


def _staff(user, key="clearance.view"):
    return bool(
        user and user.is_authenticated and user.is_admin and user.has_perm_key(key)
    )


def _officer_of(user, department_id):
    """Whether this person is personnel of one specific clearance department."""
    return bool(
        user.is_admin
        and user.has_perm_key("clearance.verify")
        and (
            user.is_super_admin
            or Department.objects.filter(
                pk=department_id, administrators=user
            ).exists()
        )
    )


def _require_finalizer(user):
    """
    Refuse the final-approval write before the record is even read.

    A department officer who posts a final clearance has a permission problem
    (403), not a workflow one (400) — the distinction the specification asks for
    when it says unauthorized users must not mark learners cleared.
    """
    if not _staff(user, "clearance.finalize"):
        raise PermissionDenied(
            "Only an office holding 'clearance.finalize' gives final clearance."
        )


# ---------------------------------------------------------------------------
# Configuration — periods
# ---------------------------------------------------------------------------

# AdminCan is configured per endpoint, and DRF instantiates whatever is listed in
# `permission_classes`, so the configuration is a partial (a class awaiting its
# arguments) rather than an instance.
CanConfigure = partial(AdminCan, read_key="clearance.view", write_key="clearance.manage")
CanMonitor = partial(AdminCan, read_key="clearance.view")


class ClearancePeriodListCreateView(generics.ListCreateAPIView):
    """Clearance periods. Reads need clearance.view, writes clearance.manage."""

    serializer_class = ClearancePeriodSerializer
    permission_classes = [CanConfigure]
    pagination_class = TrackPagination

    def get_queryset(self):
        queryset = ClearancePeriod.objects.select_related(
            "school_year", "created_by"
        ).prefetch_related("grade_levels", "departments", "categories")
        params = self.request.query_params
        if params.get("school_year"):
            queryset = queryset.filter(school_year_id=params["school_year"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("clearance_type"):
            queryset = queryset.filter(clearance_type=params["clearance_type"])
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period = serializer.save()
        workflow.audit(
            request.user, "clearance.period.created", period,
            f"Created clearance period ‘{period.name}’.",
            ip_address=_client_ip(request),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ClearancePeriodDetailView(generics.RetrieveUpdateDestroyAPIView):
    """One period. Its status is not writable here — see the action endpoint."""

    serializer_class = ClearancePeriodSerializer
    permission_classes = [CanConfigure]

    def get_queryset(self):
        return ClearancePeriod.objects.select_related("school_year", "created_by")

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        period = serializer.save()
        workflow.audit(
            request.user, "clearance.period.updated", period,
            f"Updated clearance period ‘{period.name}’.",
            ip_address=_client_ip(request),
        )
        if period.status == ClearancePeriod.Status.ACTIVE:
            # A widened population must not quietly leave learners out of a
            # running period; provisioning is idempotent so this is safe to repeat.
            workflow.provision_period(period, actor=None)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        period = self.get_object()
        if period.clearances.exists():
            raise ClearanceLocked(
                "Learners already hold clearance records for this period. "
                "Archive it instead of deleting, so the decisions stay on record."
            )
        workflow.audit(
            request.user, "clearance.period.deleted", period,
            f"Deleted empty clearance period ‘{period.name}’.",
            ip_address=_client_ip(request),
        )
        period.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClearancePeriodActionView(APIView):
    """
    ``POST /api/clearance/periods/<id>/<action>/`` — activate, deactivate,
    reopen, archive or re-provision.

    Activation does the real work: it provisions a record and a department queue
    for every learner in the population and tells them. Nothing about a period
    changes state through PATCH, so a period cannot become live without its
    queues existing.
    """

    permission_classes = [CanConfigure]

    ACTIONS = ("activate", "deactivate", "reopen", "archive", "provision")

    def post(self, request, pk, action):
        if action not in self.ACTIONS:
            raise NotFound("Unknown clearance action.")
        period = generics.get_object_or_404(
            ClearancePeriod.objects.select_related("school_year"), pk=pk
        )
        ip = _client_ip(request)

        if action == "activate":
            return self._activate(request, period, ip)
        if action == "provision":
            if period.status != ClearancePeriod.Status.ACTIVE:
                raise ClearanceRejected(
                    "Only an active period provisions learners."
                )
            counts = workflow.provision_period(period, actor=request.user, ip_address=ip)
            return Response(counts)
        if action == "deactivate":
            period.status = ClearancePeriod.Status.CLOSED
            period.save(update_fields=["status", "updated_at"])
        elif action == "reopen":
            if not period.departments.filter(is_active=True).exists():
                raise ClearanceRejected(
                    "This period has no active clearance department to reopen."
                )
            period.status = ClearancePeriod.Status.ACTIVE
            period.save(update_fields=["status", "updated_at"])
        else:  # archive
            outstanding = period.clearances.exclude(
                overall_status=ClearanceStatus.CLEARED
            ).count()
            if outstanding and not request.data.get("confirm_unfinished"):
                # Not a refusal — a term really can end unfinished — but it has
                # to be an informed decision, so the screen asks once.
                raise ClearanceRejected(
                    f"{outstanding} learner(s) in this period are not cleared yet. "
                    "Archive anyway only if the term is over."
                )
            period.status = ClearancePeriod.Status.ARCHIVED
            period.save(update_fields=["status", "updated_at"])

        workflow.audit(
            request.user, f"clearance.period.{action}", period,
            f"{action.capitalize()}d clearance period ‘{period.name}’.",
            ip_address=ip,
        )
        return Response({"status": period.status})

    def _activate(self, request, period, ip):
        if not period.departments.filter(
            is_active=True, department__is_active=True
        ).exists():
            raise ClearanceRejected(
                "Add at least one clearance department before activating this "
                "period."
            )
        was_running = period.clearances.exists()
        period.status = ClearancePeriod.Status.ACTIVE
        fields = ["status", "updated_at"]
        if not was_running:
            # The first activation is the one worth dating; a re-activation after
            # a closure keeps the date the clearance originally started.
            period.activated_at = timezone.now()
            fields.append("activated_at")
        period.save(update_fields=fields)
        counts = workflow.provision_period(
            period, actor=request.user, ip_address=ip
        )
        workflow.audit(
            request.user, "clearance.period.activated", period,
            f"Activated clearance period ‘{period.name}’ with "
            f"{counts['records']} new learner record(s).",
            ip_address=ip,
        )
        return Response({"status": period.status, **counts})


class ClearancePeriodPopulationView(APIView):
    """
    ``GET`` the learners a period covers and who already holds a record;
    ``POST`` one learner into a running period.

    The read is what the setup screen shows *before* anyone activates, so the
    administrator sizes the job instead of guessing at it.
    """

    permission_classes = [CanConfigure]

    def get(self, request, pk):
        period = generics.get_object_or_404(ClearancePeriod, pk=pk)
        records = {record.student_id: record for record in period.clearances.all()}
        covered = (
            workflow.target_students(period)
            .select_related("user", "section", "section__grade_level")
            .prefetch_related("clearance_categories")
        )
        rows = []
        for student in covered:
            record = records.get(student.pk)
            grade = record.grade_level if record and record.grade_level_id else None
            rows.append({
                "student": student.pk,
                "learner": student.user.get_full_name() or student.user.username,
                "lrn": student.lrn,
                "grade_level": str(grade) if grade else str(_grade_of(student)),
                "section": record.section_name if record else _section_of(student),
                "categories": [
                    category.name for category in student.clearance_categories.all()
                ],
                "record": record.pk if record else None,
                "overall_status": record.overall_status if record else None,
            })
        covered_ids = [row["student"] for row in rows]
        return Response({
            "total": len(rows),
            "provisioned": sum(1 for row in rows if row["record"]),
            # Learners who were in scope when the period ran and no longer are
            # (withdrawn, moved grade). They keep their record — the report says
            # so rather than hiding them.
            "out_of_population": period.clearances.exclude(
                student_id__in=covered_ids
            ).count(),
            "learners": rows,
        })

    def post(self, request, pk):
        period = generics.get_object_or_404(ClearancePeriod, pk=pk)
        body = LearnerActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            student = StudentProfile.objects.get(pk=body.validated_data["student"])
        except StudentProfile.DoesNotExist:
            raise ValidationError({"student": "No such learner record."})
        # Adding a learner who is already in the queue is how a double-click and
        # a genuine new enrolment look to each other, so the answer says which:
        # 201 opens a record, 200 reports the one the learner already held.
        already_holds_one = StudentClearance.objects.filter(
            period=period, student=student
        ).exists()
        record = _run(
            workflow.provision_student, period, student,
            actor=request.user, ip_address=_client_ip(request),
        )
        return Response(
            StudentClearanceListSerializer(record, context={"request": request}).data,
            status=status.HTTP_200_OK if already_holds_one else status.HTTP_201_CREATED,
        )


def _grade_of(student):
    return workflow.grade_level_of(student) or ""


def _section_of(student):
    return workflow.section_name_of(student)


# ---------------------------------------------------------------------------
# Configuration — departments, requirements, categories, obligation kinds
# ---------------------------------------------------------------------------

class PeriodDepartmentListCreateView(generics.ListCreateAPIView):
    """The departments one period asks to sign off, in the order learners see."""

    serializer_class = PeriodDepartmentSerializer
    permission_classes = [CanConfigure]

    def get_queryset(self):
        generics.get_object_or_404(ClearancePeriod, pk=self.kwargs["period"])
        return PeriodDepartment.objects.filter(
            period_id=self.kwargs["period"]
        ).select_related(
            "department", "period", "responsible_person"
        ).prefetch_related("department__administrators", "requirements")

    def get_serializer_context(self):
        # The URL owns the period; the serializer needs it to refuse a department
        # that already takes part in this period.
        context = super().get_serializer_context()
        context["period"] = generics.get_object_or_404(
            ClearancePeriod, pk=self.kwargs["period"]
        )
        return context

    def perform_create(self, serializer):
        period = self.get_serializer_context()["period"]
        if not serializer.validated_data.get("position"):
            serializer.validated_data["position"] = period.departments.count() * 10
        period_department = serializer.save(period=period)
        workflow.audit(
            self.request.user, "clearance.department.added", period,
            f"Added {period_department.department.name} to clearance period "
            f"‘{period.name}’.",
            ip_address=_client_ip(self.request),
        )
        if period.status == ClearancePeriod.Status.ACTIVE:
            # A department added to a running period joins the queues that
            # already exist, so nobody provisioned earlier is silently skipped.
            workflow.provision_period(period, actor=None)


class PeriodDepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PeriodDepartmentSerializer
    permission_classes = [CanConfigure]
    queryset = PeriodDepartment.objects.select_related(
        "department", "period", "responsible_person"
    ).prefetch_related("department__administrators", "requirements")

    def perform_update(self, serializer):
        period_department = serializer.save()
        workflow.audit(
            self.request.user, "clearance.department.updated",
            period_department.period,
            f"Updated {period_department.department.name} in clearance period "
            f"‘{period_department.period.name}’.",
            ip_address=_client_ip(self.request),
        )

    def perform_destroy(self, instance):
        try:
            workflow.assert_department_removable(instance)
        except workflow.ClearanceConfigurationError as exc:
            _refuse(exc)
        period = instance.period
        instance.delete()
        workflow.audit(
            self.request.user, "clearance.department.removed", period,
            f"Removed a department from clearance period ‘{period.name}’.",
            ip_address=_client_ip(self.request),
        )


class ClearanceRequirementListCreateView(generics.ListCreateAPIView):
    """One department's checklist for one period."""

    serializer_class = ClearanceRequirementSerializer
    permission_classes = [CanConfigure]

    def get_queryset(self):
        queryset = ClearanceRequirement.objects.select_related(
            "period_department__department", "period_department__period"
        )
        if self.kwargs.get("period_department"):
            generics.get_object_or_404(
                PeriodDepartment, pk=self.kwargs["period_department"]
            )
            queryset = queryset.filter(
                period_department_id=self.kwargs["period_department"]
            )
        elif self.request.query_params.get("period"):
            queryset = queryset.filter(
                period_department__period_id=self.request.query_params["period"]
            )
        return queryset.order_by("period_department__position", "position", "name")

    def perform_create(self, serializer):
        period_department = generics.get_object_or_404(
            PeriodDepartment, pk=self.kwargs["period_department"]
        )
        try:
            workflow.assert_configuration_editable(period_department)
        except workflow.ClearanceConfigurationError as exc:
            _refuse(exc)
        if not serializer.validated_data.get("position"):
            serializer.validated_data["position"] = (
                period_department.requirements.count() * 10
            )
        requirement = serializer.save(period_department=period_department)
        workflow.audit(
            self.request.user, "clearance.requirement.created",
            period_department.period,
            f"Added requirement ‘{requirement.name}’ to "
            f"{period_department.department.name}.",
            ip_address=_client_ip(self.request),
        )


class ClearanceRequirementDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ClearanceRequirementSerializer
    permission_classes = [CanConfigure]
    queryset = ClearanceRequirement.objects.select_related(
        "period_department__department", "period_department__period"
    )

    def perform_update(self, serializer):
        instance = serializer.instance
        # Only the flags that change what the learner owes are frozen once work
        # exists; reordering or fixing a typo never does.
        frozen = {"name", "is_required", "needs_review", "allows_upload"}
        touched = frozen & set(self.request.data.keys())
        if touched and instance.submissions.exists():
            raise ClearanceLocked(
                "Learners are already working to this requirement, so its terms "
                "are fixed for the period. Deactivate it, or raise a further "
                "obligation against the affected learners."
            )
        requirement = serializer.save()
        workflow.audit(
            self.request.user, "clearance.requirement.updated",
            requirement.period_department.period,
            f"Updated requirement ‘{requirement.name}’.",
            ip_address=_client_ip(self.request),
        )

    def perform_destroy(self, instance):
        if instance.submissions.exists():
            raise ClearanceLocked(
                "This requirement already has submissions attached. Deactivate "
                "it instead of deleting it."
            )
        instance.delete()


class ClearanceStudentCategoryListView(generics.ListCreateAPIView):
    """The learner labels the school uses to decide who a period covers."""

    serializer_class = ClearanceStudentCategorySerializer
    permission_classes = [CanConfigure]
    queryset = ClearanceStudentCategory.objects.prefetch_related("learners").all()

    def perform_create(self, serializer):
        category = serializer.save()
        workflow.audit(
            self.request.user, "clearance.category.created", category,
            f"Created learner category ‘{category.name}’.",
            ip_address=_client_ip(self.request),
        )


class ClearanceStudentCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ClearanceStudentCategorySerializer
    permission_classes = [CanConfigure]
    queryset = ClearanceStudentCategory.objects.prefetch_related("learners").all()

    def perform_update(self, serializer):
        category = serializer.save()
        workflow.audit(
            self.request.user, "clearance.category.updated", category,
            f"Updated learner category ‘{category.name}’ "
            f"({category.learners.count()} learner(s)).",
            ip_address=_client_ip(self.request),
        )
        # Moving a learner into a category can pull them into a running period.
        for period in category.clearance_periods.filter(
            status=ClearancePeriod.Status.ACTIVE
        ):
            workflow.provision_period(period, actor=None)

    def perform_destroy(self, instance):
        if instance.clearance_periods.exists():
            raise ClearanceLocked(
                "Clearance periods are still scoped to this category. Remove it "
                "from those periods first, or deactivate it."
            )
        instance.delete()


class ObligationTypeListView(generics.ListCreateAPIView):
    serializer_class = ObligationTypeSerializer
    permission_classes = [CanConfigure]

    def get_queryset(self):
        queryset = ObligationType.objects.select_related("department")
        department = self.request.query_params.get("department")
        if department:
            queryset = queryset.filter(department_id=department)
        return queryset

    def perform_create(self, serializer):
        obligation_type = serializer.save()
        workflow.audit(
            self.request.user, "clearance.obligation_type.created",
            obligation_type.department,
            f"Created obligation kind ‘{obligation_type.name}’ for "
            f"{obligation_type.department.name}.",
            ip_address=_client_ip(self.request),
        )


class ObligationTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ObligationTypeSerializer
    permission_classes = [CanConfigure]
    queryset = ObligationType.objects.select_related("department").all()

    def perform_destroy(self, instance):
        if instance.obligations.exists():
            raise ClearanceLocked(
                "Obligations already recorded from this kind keep their own "
                "wording. Deactivate the kind instead of deleting it."
            )
        instance.delete()


class ClearanceOptionsView(APIView):
    """
    The lists a clearance screen needs, in one round trip.

    The department list is the existing Department registry — which is what keeps
    clearance departments configurable rather than a list written into the code.
    Personnel come along so the setup screen can show who actually staffs each
    office before it is added to a period.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "departments": [
                {
                    "id": department.pk,
                    "name": department.name,
                    "code": department.code,
                    "personnel": [
                        {
                            "id": person.pk,
                            "name": person.get_full_name() or person.username,
                        }
                        for person in department.administrators.filter(
                            is_active=True
                        ).order_by("last_name", "first_name")
                    ],
                    "can_verify": _officer_of(user, department.pk),
                }
                for department in Department.objects.filter(is_active=True)
            ],
            "grade_levels": [
                {"id": grade.pk, "name": grade.name, "order": grade.order}
                for grade in GradeLevel.objects.all()
            ],
            "school_years": [
                {"id": year.pk, "label": year.label, "is_active": year.is_active}
                for year in SchoolYear.objects.all()
            ],
            "categories": [
                {
                    "id": category.pk,
                    "name": category.name,
                    "code": category.code,
                    "learners": category.learners.count(),
                }
                for category in ClearanceStudentCategory.objects.filter(
                    is_active=True
                )
            ],
            "clearance_types": [
                {"value": value, "label": label}
                for value, label in CLEARANCE_TYPES
            ],
            "period_statuses": [
                {"value": value, "label": label}
                for value, label in ClearancePeriod.Status.choices
            ],
            "overall_statuses": [
                {"value": value, "label": label}
                for value, label in ClearanceStatus.choices
            ],
            "department_statuses": [
                {"value": value, "label": label}
                for value, label in DepartmentStatus.choices
            ],
            "obligation_types": [
                {
                    "id": kind.pk,
                    "department": kind.department_id,
                    "department_name": kind.department.name,
                    "name": kind.name,
                    "description": kind.description,
                    "is_blocking": kind.is_blocking,
                }
                for kind in ObligationType.objects.filter(
                    is_active=True
                ).select_related("department")
            ],
            "upload": {
                "allowed_extensions": sorted(ALLOWED_DOCUMENT_EXTENSIONS),
                "max_bytes": MAX_DOCUMENT_BYTES,
            },
        })


# ---------------------------------------------------------------------------
# Monitoring & reports
# ---------------------------------------------------------------------------

def _section_name(section_id):
    """
    The section label as the clearance rows recorded it.

    A record keeps the section *name* instead of a live link, because a learner
    re-sectioned part-way through the year still belongs to the section the
    clearance was raised for — so a section filter resolves the chosen section
    to its name and matches that snapshot, exactly like the report column does.
    """
    if not str(section_id).isdigit():
        raise ValidationError({"section": "Choose a section."})
    name = (
        Section.objects.filter(pk=int(section_id))
        .values_list("name", flat=True)
        .first()
    )
    if name is None:
        raise ValidationError({"section": "No such section."})
    return name


def _filtered_records(request):
    """
    The learner records a monitoring screen may see, with every filter applied.

    ``department`` filters to the learners that office holds, which is how the
    dashboard's department row drills into its own queue without the caller
    naming an internal id.
    """
    records = workflow.visible_clearances(request.user)
    params = request.query_params
    if params.get("period"):
        records = records.filter(period_id=params["period"])
    if params.get("school_year"):
        records = records.filter(period__school_year_id=params["school_year"])
    if params.get("status"):
        records = records.filter(overall_status=params["status"])
    if params.get("grade_level"):
        records = records.filter(grade_level_id=params["grade_level"])
    if params.get("section"):
        records = records.filter(section_name=_section_name(params["section"]))
    if params.get("clearance_type"):
        records = records.filter(period__clearance_type=params["clearance_type"])
    if params.get("department"):
        records = records.filter(
            departments__department_id=params["department"]
        ).distinct()
    if params.get("department_status"):
        records = records.filter(
            departments__status=params["department_status"]
        ).distinct()
    if params.get("obligations") == "open":
        records = records.filter(
            departments__obligations__status=ClearanceObligation.Status.OPEN
        ).distinct()
    search = (params.get("search") or "").strip()
    if search:
        records = records.filter(
            Q(student__user__first_name__icontains=search)
            | Q(student__user__last_name__icontains=search)
            | Q(student__user__username__icontains=search)
            | Q(student__lrn__icontains=search)
            | Q(reference__icontains=search)
        )
    return records.select_related(
        "period__school_year", "student__user", "grade_level"
    )


class StudentClearanceListView(generics.ListAPIView):
    """The monitoring table: every learner in scope, one row each."""

    serializer_class = StudentClearanceListSerializer
    permission_classes = [CanMonitor]
    pagination_class = TrackPagination

    def get_queryset(self):
        return _filtered_records(self.request).order_by(
            "student__user__last_name", "student__user__first_name"
        )


class StudentClearanceDetailView(generics.RetrieveAPIView):
    """One learner's whole clearance, including the final-approval blockers."""

    serializer_class = StudentClearanceDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            workflow.visible_clearances(self.request.user)
            .select_related(
                "period__school_year", "student__user", "grade_level", "cleared_by"
            )
            .prefetch_related(
                "departments__period_department__department",
                Prefetch(
                    "departments__obligations",
                    queryset=ClearanceObligation.objects.order_by("-created_at"),
                ),
                "events__actor",
            )
        )

    def get_object(self):
        if not _staff(self.request.user):
            # A learner or guardian reads their own through /my/; this shape
            # carries staff-only notes and officer names. Refused before the
            # lookup, so the answer is about the caller, not about the row.
            raise PermissionDenied("This clearance record is not yours.")
        return generics.get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])


class StudentClearanceFinalizeView(APIView):
    """
    The Registrar's decision on one learner.

    ``GET`` reports the blockers, ``POST`` clears and ``DELETE`` withdraws. The
    checks re-run inside the transaction that writes the outcome, so a queue that
    moved while this page sat open is caught rather than approved over.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        record = self._record(request, pk)
        blockers = workflow.final_approval_blockers(record)
        return Response({
            "blockers": blockers,
            "can_finalize": (
                request.user.is_admin
                and request.user.has_perm_key("clearance.finalize")
                and not blockers
            ),
        })

    def post(self, request, pk):
        _require_finalizer(request.user)
        record = self._record(request, pk)
        body = FinalizeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        cleared = _run(
            workflow.finalize_clearance, record, request.user,
            note=body.validated_data.get("note", ""),
            ip_address=_client_ip(request),
        )
        return Response(
            StudentClearanceDetailSerializer(
                cleared, context={"request": request}
            ).data
        )

    def delete(self, request, pk):
        _require_finalizer(request.user)
        record = self._record(request, pk)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Record why the clearance is withdrawn."})
        withdrawn = _run(
            workflow.revoke_clearance, record, request.user,
            reason=reason, ip_address=_client_ip(request),
        )
        return Response(
            StudentClearanceDetailSerializer(
                withdrawn, context={"request": request}
            ).data
        )

    @staticmethod
    def _record(request, pk):
        # Blockers name other departments' decisions and officer notes, so the
        # read is guarded the same way the write is — a learner who wonders why
        # they are not cleared yet asks through /my/, not through this endpoint.
        if not _staff(request.user, "clearance.view"):
            raise PermissionDenied("You may not view clearance records.")
        try:
            return StudentClearance.objects.select_related(
                "period", "student__user"
            ).get(pk=pk)
        except StudentClearance.DoesNotExist:
            raise NotFound("Clearance record not found.")


class ClearanceDashboardView(APIView):
    """
    The monitoring figures for one period, plus the deadline watch.

    A period is required: averaging two terms into one completion percentage is
    how the number stops meaning anything. The filters narrow the learner table
    under the figures, not the figures themselves — the department rows and the
    completion count always describe the whole period, so a screen never reports
    "40% complete" for a filtered 12 rows.
    """

    permission_classes = [CanMonitor]

    def get(self, request):
        period_id = request.query_params.get("period")
        if not period_id:
            raise ValidationError({"period": "Choose a clearance period."})
        period = generics.get_object_or_404(
            ClearancePeriod.objects.select_related("school_year"), pk=period_id
        )
        figures = workflow.period_dashboard(period)
        watch = request.query_params.get("within_days")
        figures["deadline_watch"] = workflow.deadline_watch(
            period, within_days=int(watch) if watch and watch.isdigit() else 7
        )
        records = _filtered_records(request).filter(period=period)
        figures["filtered_total"] = records.count()
        figures["by_section"] = [
            {
                "section": row["section_name"] or "—",
                "total": row["total"],
                "cleared": row["cleared"],
            }
            for row in records.values("section_name").annotate(
                total=Count("id"),
                cleared=Count(
                    "id", filter=Q(overall_status=ClearanceStatus.CLEARED)
                ),
            ).order_by("-total")[:40]
        ]
        figures["by_grade_level"] = [
            {
                "grade_level": row["grade_level__name"] or "—",
                "total": row["total"],
                "cleared": row["cleared"],
            }
            for row in records.values("grade_level__name").annotate(
                total=Count("id"),
                cleared=Count(
                    "id", filter=Q(overall_status=ClearanceStatus.CLEARED)
                ),
            ).order_by("grade_level__name")
        ]
        figures["period"] = ClearancePeriodSerializer(
            period, context={"request": request}
        ).data
        return Response(figures)


class ClearanceReportView(APIView):
    """
    The reportable rows, in one shape for the screen and one for the export.

    ``clearance.view`` reads it; the CSV form costs ``clearance.export``, and the
    download is itself audited — an export leaving the system should be provable
    to have left it.
    """

    permission_classes = [IsAuthenticated]

    COLUMNS = [
        ("learner", "Learner"),
        ("lrn", "LRN"),
        ("grade_level", "Grade level"),
        ("section", "Section"),
        ("period", "Clearance period"),
        ("school_year", "School year"),
        ("clearance_type", "Type"),
        ("status", "Overall status"),
        ("progress", "Progress %"),
        ("settled_departments", "Departments settled"),
        ("total_departments", "Departments assigned"),
        ("outstanding_obligations", "Outstanding obligations"),
        ("waived_obligations", "Waived obligations"),
        ("reference", "Clearance reference"),
        ("cleared_at", "Date cleared"),
        ("cleared_by", "Cleared by"),
    ]

    def get(self, request):
        if not _staff(request.user):
            raise PermissionDenied("You may not view clearance reports.")
        # `?format=` belongs to DRF's content negotiation — a request for
        # 'format=csv' is answered with a 404 before any view runs, because no
        # renderer claims that media type. The export switch is therefore its
        # own parameter.
        wants_csv = (request.query_params.get("export") or "").lower() == "csv"
        if wants_csv and not request.user.has_perm_key("clearance.export"):
            raise PermissionDenied("You do not have the 'clearance.export' permission.")

        rows = list(self._rows(request))
        if not wants_csv:
            return Response({"total": len(rows), "rows": rows})

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            'attachment; filename="clearance-report.csv"'
        )
        writer = csv.writer(response)
        writer.writerow([label for _, label in self.COLUMNS])
        for row in rows:
            writer.writerow([row.get(key, "") for key, _ in self.COLUMNS])
        workflow.audit(
            request.user, "clearance.report.exported", ClearancePeriod,
            f"Exported {len(rows)} clearance report row(s).",
            ip_address=_client_ip(request),
        )
        return response

    def _rows(self, request):
        records = (
            _filtered_records(request)
            .prefetch_related(
                "departments__period_department",
                Prefetch(
                    "departments__obligations",
                    queryset=ClearanceObligation.objects.only("status"),
                ),
            )
            .order_by("student__user__last_name", "student__user__first_name")[:5000]
        )
        rows = []
        for record in records:
            items = list(record.departments.all())
            required = [i for i in items if i.period_department.is_required] or items
            obligations = [o for i in items for o in i.obligations.all()]
            rows.append({
                "learner": (
                    record.student.user.get_full_name()
                    or record.student.user.username
                ),
                "lrn": record.student.lrn,
                "grade_level": str(record.grade_level or ""),
                "section": record.section_name,
                "period": record.period.name,
                "school_year": record.period.school_year.label,
                "clearance_type": record.period.type_label,
                "status": record.get_overall_status_display(),
                "progress": workflow.progress_percent(record),
                "settled_departments": sum(1 for i in required if i.is_settled),
                "total_departments": len(required),
                "outstanding_obligations": sum(
                    1 for o in obligations
                    if o.status == ClearanceObligation.Status.OPEN
                ),
                "waived_obligations": sum(
                    1 for o in obligations
                    if o.status == ClearanceObligation.Status.WAIVED
                ),
                "reference": record.reference,
                "cleared_at": (
                    timezone.localtime(record.cleared_at).strftime("%Y-%m-%d")
                    if record.cleared_at else ""
                ),
                "cleared_by": (
                    record.cleared_by.get_full_name()
                    or record.cleared_by.username
                ) if record.cleared_by else "",
            })
        return rows


class ClearanceObligationListView(APIView):
    """
    Every obligation across the periods the requester can see, newest first.

    The school's answer to "who is holding what back" — including the closed
    ones, because a waiver is a decision somebody should be able to find again.
    """

    permission_classes = [CanMonitor]

    def get(self, request):
        obligations = ClearanceObligation.objects.filter(
            department_clearance__student_clearance__in=(
                workflow.visible_clearances(request.user)
            )
        ).select_related(
            "department_clearance__department",
            "department_clearance__student_clearance__student__user",
            "department_clearance__student_clearance__period",
        )
        params = request.query_params
        if params.get("period"):
            obligations = obligations.filter(
                department_clearance__student_clearance__period_id=params["period"]
            )
        if params.get("department"):
            obligations = obligations.filter(
                department_clearance__department_id=params["department"]
            )
        if params.get("status"):
            obligations = obligations.filter(status=params["status"])
        obligations = list(obligations.order_by("-created_at")[:500])
        return Response({
            "total": len(obligations),
            "obligations": ClearanceObligationSerializer(
                obligations, many=True, context={"request": request}
            ).data,
        })


class ClearanceActivityView(APIView):
    """Recent clearance events across the school, for the context column."""

    permission_classes = [CanMonitor]

    def get(self, request):
        events = ClearanceEvent.objects.filter(
            student_clearance__in=workflow.visible_clearances(request.user)
        ).select_related(
            "department_clearance__department",
            "student_clearance__student__user",
            "actor",
        )
        if request.query_params.get("period"):
            events = events.filter(
                student_clearance__period_id=request.query_params["period"]
            )
        return Response(
            ClearanceActivitySerializer(
                events.order_by("-created_at")[:40], many=True
            ).data
        )


# ---------------------------------------------------------------------------
# Department verification portal
# ---------------------------------------------------------------------------

def _item_or_404(pk):
    try:
        return DepartmentClearance.objects.select_related(
            "department", "period_department__period",
            "period_department__department", "student_clearance__student__user",
        ).get(pk=pk)
    except DepartmentClearance.DoesNotExist:
        raise NotFound("Clearance item not found.")


def _require_officer(request, item):
    """
    Gate an officer action on the department that owns the item.

    Checked here rather than left to the workflow so that the answer distinguishes
    'you are not department personnel' (403) from 'this is not your office's
    learner' (404, the same answer as no such item) from 'the record's state
    refuses that' (400). The workflow re-checks all of it inside the write.
    """
    user = request.user
    if not (user.is_admin and user.has_perm_key("clearance.verify")):
        raise PermissionDenied("You may not act on a clearance queue.")
    if not _officer_of(user, item.department_id):
        raise NotFound("Clearance item not found.")


class DepartmentQueueListView(generics.ListAPIView):
    """
    The officer's own queue: their departments' items, nothing else.

    The department is never taken from the query string as the scope — the scope
    is which departments this person belongs to. A ``department`` parameter can
    only narrow within that, so changing it cannot open another office's list.
    """

    serializer_class = DepartmentClearanceListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = TrackPagination

    def get_queryset(self):
        user = self.request.user
        if not (user.is_admin and user.has_perm_key("clearance.verify")):
            return DepartmentClearance.objects.none()
        queryset = DepartmentClearance.objects.filter(
            period_department__department__administrators=user,
            period_department__is_active=True,
            period_department__department__is_active=True,
            period_department__period__status=ClearancePeriod.Status.ACTIVE,
        ).select_related(
            "department", "period_department",
            "student_clearance__student__user", "student_clearance__grade_level",
        ).annotate(
            open_obligations=Count(
                "obligations",
                filter=Q(obligations__status=ClearanceObligation.Status.OPEN),
                distinct=True,
            ),
            awaiting_review=Count(
                "submissions",
                filter=Q(
                    submissions__is_required=True,
                    submissions__status=ClearanceSubmission.Status.SUBMITTED,
                ),
                distinct=True,
            ),
        )
        params = self.request.query_params
        for key, field in (
            ("period", "period_department__period_id"),
            ("status", "status"),
            ("department", "department_id"),
            ("grade_level", "student_clearance__grade_level_id"),
        ):
            if params.get(key):
                queryset = queryset.filter(**{field: params[key]})
        if params.get("section"):
            queryset = queryset.filter(
                student_clearance__section_name=_section_name(params["section"])
            )
        search = (params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(student_clearance__student__user__first_name__icontains=search)
                | Q(student_clearance__student__user__last_name__icontains=search)
                | Q(student_clearance__student__lrn__icontains=search)
            )
        if params.get("order") == "name":
            return queryset.order_by(
                "student_clearance__student__user__last_name",
                "student_clearance__student__user__first_name",
            )
        return queryset.order_by("status", "-updated_at")


class DepartmentQueueSummaryView(APIView):
    """Counters for the officer's own queue, grouped per period and office."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if not (user.is_admin and user.has_perm_key("clearance.verify")):
            return Response({"total": 0, "awaiting": 0, "obligations": 0, "groups": []})
        items = DepartmentClearance.objects.filter(
            period_department__department__administrators=user,
            period_department__is_active=True,
            period_department__period__status=ClearancePeriod.Status.ACTIVE,
        )
        groups = items.values(
            "department",
            period=F("period_department__period_id"),
            period_name=F("period_department__period__name"),
            department_name=F("department__name"),
        ).annotate(
            total=Count("id"),
            awaiting=Count("id", filter=Q(status__in=[
                DepartmentStatus.SUBMITTED, DepartmentStatus.UNDER_REVIEW])),
            corrections=Count("id", filter=Q(
                status=DepartmentStatus.NEEDS_CORRECTION)),
            approved=Count("id", filter=Q(status=DepartmentStatus.APPROVED)),
            rejected=Count("id", filter=Q(status=DepartmentStatus.REJECTED)),
        ).order_by("period_name", "department_name")
        return Response({
            "total": items.count(),
            "awaiting": items.filter(status__in=[
                DepartmentStatus.SUBMITTED, DepartmentStatus.UNDER_REVIEW,
            ]).count(),
            "obligations": ClearanceObligation.objects.filter(
                department_clearance__in=items,
                status=ClearanceObligation.Status.OPEN,
            ).count(),
            "groups": list(groups),
        })


class DepartmentClearanceDetailView(generics.RetrieveAPIView):
    """One learner at one department, from the officer's side."""

    serializer_class = DepartmentClearanceDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DepartmentClearance.objects.select_related(
            "department", "period_department__period", "period_department",
            "student_clearance__student__user", "student_clearance__grade_level",
            "student_clearance__period",
        ).prefetch_related(
            Prefetch(
                "submissions",
                queryset=ClearanceSubmission.objects.select_related(
                    "requirement", "reviewed_by"
                ),
            ),
            Prefetch(
                "obligations",
                queryset=ClearanceObligation.objects.select_related(
                    "obligation_type", "resolved_by", "waived_by"
                ).order_by("-created_at"),
            ),
            Prefetch(
                "events",
                queryset=ClearanceEvent.objects.select_related("actor").order_by(
                    "created_at", "id"
                ),
            ),
        )

    def get_object(self):
        item = generics.get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        user = self.request.user
        # Reading one office's item belongs to that office's personnel; whoever
        # configures the clearance may look anywhere. School-wide figures come
        # from /records/ and /dashboard/, which ask 'clearance.view' instead.
        if _staff(user, "clearance.manage"):
            return item
        if not _officer_of(user, item.department_id):
            # 404, not 403: another office's queue is not a thing an unrelated
            # account gets to learn exists.
            raise NotFound("Clearance item not found.")
        return item


class DepartmentDecisionView(APIView):
    """POST an officer's decision on one learner's department item."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = _item_or_404(pk)
        _require_officer(request, item)
        body = DepartmentDecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = _run(
            workflow.record_decision, item, body.validated_data["status"],
            request.user,
            note=body.validated_data.get("note", ""),
            internal_note=body.validated_data.get("internal_note", ""),
            ip_address=_client_ip(request),
        )
        return Response(
            DepartmentClearanceDetailSerializer(
                updated, context={"request": request}
            ).data
        )


class DepartmentReopenView(APIView):
    """Take a settled sign-off back into review."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = _item_or_404(pk)
        _require_officer(request, item)
        body = ReopenSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reopened = _run(
            workflow.reopen_department, item, request.user,
            note=body.validated_data["note"], ip_address=_client_ip(request),
        )
        return Response(
            DepartmentClearanceDetailSerializer(
                reopened, context={"request": request}
            ).data
        )


class DepartmentReviewStartView(APIView):
    """Say 'I am looking at this one', so two officers do not both start it."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item = _item_or_404(pk)
        _require_officer(request, item)
        claimed = _run(workflow.claim_for_review, item, request.user)
        return Response(
            DepartmentClearanceDetailSerializer(
                claimed, context={"request": request}
            ).data
        )


class DepartmentSubmissionReviewView(APIView):
    """Accept or return one document an officer is reviewing."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, submission_pk):
        item = _item_or_404(pk)
        _require_officer(request, item)
        submission = generics.get_object_or_404(
            ClearanceSubmission.objects.select_related(
                "requirement", "department_clearance"
            ),
            pk=submission_pk,
            department_clearance=item,
        )
        body = SubmissionReviewSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _run(
            workflow.review_submission, submission,
            body.validated_data["decision"], request.user,
            note=body.validated_data.get("note", ""),
            ip_address=_client_ip(request),
        )
        item.refresh_from_db()
        return Response(
            DepartmentClearanceDetailSerializer(
                item, context={"request": request}
            ).data
        )


class DepartmentObligationView(APIView):
    """List or raise the obligations recorded against one learner at one office."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        item = _item_or_404(pk)
        self._authorize(request, item)
        return Response(self._serialize(request, item))

    def post(self, request, pk):
        item = _item_or_404(pk)
        _require_officer(request, item)
        body = ObligationCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _run(
            workflow.create_obligation, item,
            actor=request.user, ip_address=_client_ip(request),
            **body.validated_data,
        )
        return Response(self._serialize(request, item), status.HTTP_201_CREATED)

    @staticmethod
    def _authorize(request, item):
        if _staff(request.user):
            return
        if not _officer_of(request.user, item.department_id):
            raise NotFound("Clearance item not found.")

    @staticmethod
    def _serialize(request, item):
        return ClearanceObligationSerializer(
            item.obligations.select_related(
                "obligation_type", "resolved_by", "waived_by",
                "department_clearance__department",
                "department_clearance__student_clearance__student__user",
            ).order_by("-created_at"),
            many=True, context={"request": request},
        ).data


class ClearanceObligationActionView(APIView):
    """
    Resolve, waive, reopen or edit one obligation.

    Each is an explicit action carrying its own reason: an obligation cannot be
    waived without the reason and the officer recorded against it, because a
    waiver nobody can account for is the audit failure this feature exists to
    prevent.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            obligation = ClearanceObligation.objects.select_related(
                "department_clearance__department",
                "department_clearance__period_department__period",
                "department_clearance__student_clearance",
            ).get(pk=pk)
        except ClearanceObligation.DoesNotExist:
            raise NotFound("Obligation not found.")

        body = ObligationActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _require_officer(request, obligation.department_clearance)
        data = body.validated_data
        action = data["action"]
        note = (data.get("note") or "").strip()
        ip = _client_ip(request)

        if action == "update":
            fields = {
                key: data[key]
                for key in ("title", "detail", "amount", "is_blocking")
                if key in data
            }
            _run(
                workflow.update_obligation, obligation,
                actor=request.user, ip_address=ip, **fields,
            )
        else:
            handler = {
                "resolve": workflow.resolve_obligation,
                "waive": workflow.waive_obligation,
                "reopen": workflow.reopen_obligation,
            }[action]
            _run(handler, obligation, request.user, ip_address=ip,
                 **({"reason": note} if action == "waive" else {"note": note}))

        obligation.refresh_from_db()
        return Response(
            ClearanceObligationSerializer(
                obligation, context={"request": request}
            ).data
        )


# ---------------------------------------------------------------------------
# Document download — one rule per side, asked of the record
# ---------------------------------------------------------------------------

def _serve(submission, as_inline=False):
    """
    Stream one stored document.

    Files are never reachable through the public media URL: every request re-asks
    who is calling. A missing file is reported as unavailable rather than
    raising, because a record whose bytes went missing is still a record.
    """
    if not submission.file:
        raise ValidationError({"detail": "No file has been uploaded for this item."})
    safe_name = os.path.basename(submission.original_filename or submission.file.name)
    try:
        handle = submission.file.open("rb")
    except FileNotFoundError:
        raise ValidationError({"detail": "The stored file is no longer available."})
    return FileResponse(
        handle, as_attachment=not as_inline, filename=safe_name
    )


class StaffSubmissionDownloadView(APIView):
    """Officer-side file access: an officer's own department's submissions."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, submission_pk):
        submission = generics.get_object_or_404(
            ClearanceSubmission.objects.select_related(
                "department_clearance__period_department__department",
                "department_clearance__student_clearance",
            ),
            pk=submission_pk,
            department_clearance_id=pk,
        )
        item = submission.department_clearance
        user = request.user
        # The same rule as the queue item page: whoever configures the
        # clearance may open any office's file, everyone else only their own.
        # 'clearance.view' is not enough here — it is the key that reads
        # school-wide *counts*, and a paper document is not a count.
        allowed = _staff(user, "clearance.manage") or _officer_of(user, item.department_id)
        if not allowed:
            raise NotFound("Document not found.")
        return _serve(submission, as_inline=request.query_params.get("inline") == "1")


# ---------------------------------------------------------------------------
# Learner / guardian portal
# ---------------------------------------------------------------------------

def _own_record(request, pk):
    """
    Resolve a clearance record from the account, never from the URL alone.

    Someone else's clearance answers 404 — the same answer as no clearance at
    all — so the endpoint cannot be used to confirm that a given learner is
    being cleared.
    """
    if not workflow.visible_clearances(request.user).filter(pk=pk).exists():
        raise NotFound("Clearance record not found.")
    return StudentClearance.objects.select_related(
        "period__school_year", "student__user", "grade_level"
    ).prefetch_related(
        "departments__period_department__department",
        "departments__period_department__responsible_person",
        Prefetch(
            "departments__submissions",
            queryset=ClearanceSubmission.objects.select_related("requirement"),
        ),
        Prefetch(
            "departments__obligations",
            queryset=ClearanceObligation.objects.order_by("-created_at"),
        ),
    ).get(pk=pk)


class MyClearanceListView(APIView):
    """Every clearance the signed-in learner (or guardian) is entitled to see."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = (
            workflow.visible_clearances(request.user)
            .exclude(period__status=ClearancePeriod.Status.DRAFT)
            .select_related("period__school_year", "student__user")
            .prefetch_related("departments__period_department")
            .distinct()
        )
        return Response({"results": [
            {
                "id": record.pk,
                "period": record.period_id,
                "period_name": record.period.name,
                "period_status": record.period.status,
                "school_year": record.period.school_year.label,
                "type_label": record.period.type_label,
                "learner": (
                    record.student.user.get_full_name()
                    or record.student.user.username
                ),
                "is_self": record.student.user_id == request.user.pk,
                "overall_status": record.overall_status,
                "status_label": record.get_overall_status_display(),
                "progress": workflow.progress_percent(record),
                "settled": sum(1 for item in record.departments.all() if item.is_settled),
                "total": record.departments.count(),
                "closes_at": record.period.closes_at,
                "reference": record.reference,
                "cleared": record.overall_status == ClearanceStatus.CLEARED,
            }
            for record in records
        ]})


class MyClearanceDetailView(APIView):
    """One learner's clearance: checklist, statuses, feedback and history."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        record = _own_record(request, pk)
        payload = LearnerClearanceSerializer(
            record, context={"request": request}
        ).data
        events = ClearanceEvent.objects.filter(
            student_clearance=record
        ).exclude(note="").select_related("department_clearance__department")
        payload["history"] = [
            {
                "id": event.pk,
                "action": event.action,
                "note": event.note,
                "department": (
                    event.department_clearance.department.name
                    if event.department_clearance_id else ""
                ),
                "created_at": event.created_at,
            }
            for event in events.order_by("-created_at")[:60]
        ]
        return Response(payload)


class MyClearanceUploadView(APIView):
    """
    Upload or replace one required document (multipart field ``file``).

    A guardian may file for a learner they are linked to — capture happens on
    whichever device is in the house. Type, size and magic bytes are checked
    exactly as an enrollment document's are, and a resubmission bumps the
    revision instead of quietly overwriting what an officer already saw.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk, submission_pk):
        record = _own_record(request, pk)
        submission = generics.get_object_or_404(
            ClearanceSubmission.objects.select_related(
                "requirement",
                "department_clearance__period_department__period",
                "department_clearance__department",
                "department_clearance__student_clearance",
            ),
            pk=submission_pk,
            department_clearance__student_clearance=record,
        )
        if not submission.requirement.allows_upload:
            raise ValidationError({"file": (
                "This item is settled at the office, not with an upload."
            )})
        if record.period.status != ClearancePeriod.Status.ACTIVE:
            raise ValidationError({"detail": (
                "This clearance period is not open for submissions."
            )})
        if record.overall_status == ClearanceStatus.CLEARED:
            raise ValidationError({"detail": "This clearance is already complete."})

        item = submission.department_clearance
        if item.is_final:
            raise ValidationError({"detail": (
                f"{item.department.name} has already recorded its decision. Ask "
                "them to re-open the item if something needs changing."
            )})

        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose a file to upload."})
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
            was_correction = item.status == DepartmentStatus.NEEDS_CORRECTION
            submission.file = upload
            submission.original_filename = safe_name[:255]
            submission.status = ClearanceSubmission.Status.SUBMITTED
            submission.submitted_at = timezone.now()
            submission.review_note = ""
            submission.revision = (submission.revision or 0) + 1
            submission.save()
            workflow.log_event(
                record, item, request.user, "document_submitted",
                note=f"{submission.name} submitted for {item.department.name}.",
                internal_note=(
                    f"{safe_name} ({upload.size} bytes), revision "
                    f"{submission.revision}."
                ),
            )
            outstanding = item.submissions.filter(
                is_required=True,
                status__in=[
                    ClearanceSubmission.Status.NOT_SUBMITTED,
                    ClearanceSubmission.Status.RETURNED,
                ],
            ).exists()
            if not outstanding and item.status in (
                DepartmentStatus.NOT_STARTED,
                DepartmentStatus.PENDING_SUBMISSION,
                DepartmentStatus.NEEDS_CORRECTION,
            ):
                from_status = item.status
                item.status = DepartmentStatus.SUBMITTED
                item.save(update_fields=["status", "updated_at"])
                workflow.derive_overall(record)
                workflow.log_event(
                    record, item, request.user, "department_submitted",
                    from_status=from_status, to_status=item.status,
                    note=(
                        f"Everything {item.department.name} asked for is in, "
                        "awaiting their sign-off."
                    ),
                )
            if was_correction:
                workflow.audit(
                    request.user, "clearance.document.resubmitted", record,
                    f"{record.student} resubmitted {submission.name} for "
                    f"{item.department.name}.",
                    ip_address=_client_ip(request),
                )

        return Response(
            LearnerClearanceSerializer(record, context={"request": request}).data
        )


class MySubmissionDownloadView(APIView):
    """The learner's own document, inline for the viewer or as a download."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, submission_pk):
        record = _own_record(request, pk)
        submission = generics.get_object_or_404(
            ClearanceSubmission,
            pk=submission_pk,
            department_clearance__student_clearance=record,
        )
        return _serve(submission, as_inline=request.query_params.get("inline") == "1")


class MyClearanceCertificateView(APIView):
    """
    The certificate as a PDF.

    Only a cleared record produces a file. The reference and the decision are
    read from the row rather than recomputed, so re-asking next term still
    produces the document the Registrar actually signed.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        record = _own_record(request, pk)
        if record.overall_status != ClearanceStatus.CLEARED or not record.reference:
            raise ValidationError({"detail": (
                "A certificate is issued once the Registrar has approved the "
                "clearance."
            )})
        from .clearance_pdf import build_certificate_pdf

        response = HttpResponse(
            build_certificate_pdf(record), content_type="application/pdf"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="clearance-{record.reference}.pdf"'
        )
        return response


class ClearanceCertificateLookupView(APIView):
    """
    Verify a reference number against the record it was issued from.

    Limited on purpose: the school's front desk needs to answer "is this
    genuine?" with a yes/no plus the period, not with the learner's document
    list or their obligations.
    """

    permission_classes = [CanMonitor]

    def get(self, request):
        reference = (request.query_params.get("reference") or "").strip().upper()
        if not reference:
            raise ValidationError({"reference": "Enter a clearance reference."})
        record = StudentClearance.objects.filter(reference=reference).select_related(
            "period", "student__user", "cleared_by"
        ).first()
        if record is None:
            return Response({"valid": False})
        return Response({
            "valid": True,
            "cleared_at": record.cleared_at,
            "withdrawn": record.overall_status != ClearanceStatus.CLEARED,
            "learner": record.student.user.get_full_name() or record.student.user.username,
            "period": record.period.name,
            "school_year": record.period.school_year.label,
            "approved_by": (
                record.cleared_by.get_full_name() or record.cleared_by.username
            ) if record.cleared_by else "",
        })
