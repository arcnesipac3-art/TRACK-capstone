"""
TRACK — data-privacy API.

Five endpoints, all scoped from `request.user`:

    GET   /api/account/export/                 my complete record, as JSON
    GET   /api/account/data-requests/          the requests I have filed
    POST  /api/account/data-requests/          file one
    GET   /api/account/data-requests/queue/    the enrollment office's queue
    POST  /api/account/data-requests/<id>/answer/  the office's written answer

The export takes no parameters on purpose: a document that could ask for
another person's records would undo the right it exists to serve. The queue
and the answer are the only staff-side surfaces, and both go through the same
enrollment permission key the Registrar's other screens use.
"""

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .enrollment_views import _client_ip, _is_enrollment_staff
from .models import AuditLog, DataRequest, Notification
from .privacy import build_export

#: A request the office can act on says what is wanted. Anything shorter is a
#: complaint with no subject, and the honest answer to that is "explain it".
DETAIL_MIN_LENGTH = 15


class DataRequestSerializer(serializers.ModelSerializer):
    """What the requester sees: their own ask and the school's written answer."""

    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = DataRequest
        fields = [
            "id",
            "kind",
            "kind_display",
            "detail",
            "status",
            "status_display",
            "response_note",
            "handled_at",
            "created_at",
        ]
        # status/handled_* are the office's, never the requester's: a person
        # cannot answer their own request by PATCHing it.
        read_only_fields = [
            "id",
            "status",
            "status_display",
            "response_note",
            "handled_at",
            "created_at",
        ]


class DataRequestStaffSerializer(DataRequestSerializer):
    """The queue row: the same fields plus who asked."""

    requester_username = serializers.CharField(
        source="requester.username", read_only=True, default=None
    )
    requester_name = serializers.SerializerMethodField()

    class Meta(DataRequestSerializer.Meta):
        fields = DataRequestSerializer.Meta.fields + [
            "requester_username",
            "requester_name",
            "requester_email",
        ]

    def get_requester_name(self, obj):
        if obj.requester is None:
            return None
        return obj.requester.get_full_name() or obj.requester.username


class DataRequestAnswerSerializer(serializers.ModelSerializer):
    """The office's answer. The note is required because the Privacy Notice
    promises the requester a written reason, not a status flip."""

    class Meta:
        model = DataRequest
        fields = ["status", "response_note"]

    def validate_status(self, value):
        if value not in (DataRequest.Status.ANSWERED, DataRequest.Status.REFUSED):
            raise serializers.ValidationError(
                "An answer is either 'answered' or 'refused'."
            )
        return value

    def validate_response_note(self, value):
        if len(value.strip()) < DETAIL_MIN_LENGTH:
            raise serializers.ValidationError(
                f"Write the answer the requester will read — at least "
                f"{DETAIL_MIN_LENGTH} characters, including which records the "
                "school must keep and why."
            )
        return value.strip()


def _request_error():
    return Response(
        {"detail": "This data request does not exist or is not yours."},
        status=status.HTTP_404_NOT_FOUND,
    )


class MyDataExportView(APIView):
    """The complete machine-readable copy of one account's records."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_export(request.user))


class MyDataRequestView(APIView):
    """File a correction / objection / erasure request and read its answer."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = DataRequest.objects.filter(requester=request.user).order_by(
            "-created_at"
        )
        return Response(DataRequestSerializer(rows, many=True).data)

    def post(self, request):
        serializer = DataRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data["kind"]
        detail = serializer.validated_data["detail"].strip()
        if len(detail) < DETAIL_MIN_LENGTH:
            return Response(
                {
                    "detail": [
                        f"Say what you are asking for in at least "
                        f"{DETAIL_MIN_LENGTH} characters, so the office can "
                        "act on it."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = DataRequest.objects.create(
            requester=request.user,
            # The address the office writes to, snapshotted now: an erasure
            # request may leave the account itself gone.
            requester_email=request.user.email,
            kind=kind,
            detail=detail,
        )
        AuditLog.objects.create(
            actor=request.user,
            action="privacy.data_request_filed",
            target_model="DataRequest",
            target_id=str(row.pk),
            description=(
                f"{request.user.get_full_name()} filed a "
                f"{row.get_kind_display().lower()} request."
            ),
            ip_address=_client_ip(request),
        )
        return Response(
            DataRequestSerializer(row).data, status=status.HTTP_201_CREATED
        )


class StaffDataRequestQueueView(APIView):
    """The enrollment office's queue, open requests first."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_enrollment_staff(request.user, "enrollment.view"):
            return Response(
                {"detail": "Only the enrollment office can read this queue."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = DataRequest.objects.select_related("requester").order_by(
            "status", "-created_at"
        )
        return Response(DataRequestStaffSerializer(rows, many=True).data)


class StaffDataRequestAnswerView(APIView):
    """Record the office's written answer and raise it in the requester's app."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_enrollment_staff(request.user, "enrollment.manage"):
            return Response(
                {"detail": "Only the enrollment office can answer a request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        row = DataRequest.objects.filter(pk=pk).select_related("requester").first()
        if row is None:
            return _request_error()
        serializer = DataRequestAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row.status = serializer.validated_data["status"]
        row.response_note = serializer.validated_data["response_note"]
        row.handled_by = request.user
        row.handled_at = timezone.now()
        row.save(update_fields=["status", "response_note", "handled_by", "handled_at", "updated_at"])

        if row.requester is not None:
            Notification.objects.create(
                recipient=row.requester,
                notif_type=Notification.NotifType.DATA_REQUEST_ANSWERED,
                title="Your data request was answered",
                body=row.response_note,
            )
        AuditLog.objects.create(
            actor=request.user,
            action=f"privacy.data_request_{row.status}",
            target_model="DataRequest",
            target_id=str(row.pk),
            description=(
                f"{request.user.get_full_name()} marked request {row.pk} "
                f"{row.get_status_display().lower()}."
            ),
            ip_address=_client_ip(request),
        )
        return Response(DataRequestStaffSerializer(row).data)
