"""
TRACK — messaging REST API.

The socket carries live events; this API carries everything a client needs when
it is not connected, and it is also the fallback transport for sending. Both
go through the same `core.messaging` helpers, so the two can never disagree
about who may see what.

Unauthorised access is refused in one place per request: `get_conversation_for`
loads a thread *and* proves membership. No view in this file reads messages,
members or markers without passing through it first.
"""

import logging

from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import messaging, push as push_delivery
from .messaging_serializers import (
    ContactSerializer,
    ConversationCreateSerializer,
    ConversationDetailSerializer,
    ConversationMemberSerializer,
    ConversationSummarySerializer,
    MemberActionSerializer,
    MessageSendSerializer,
    MessageSerializer,
    MessagingSettingsSerializer,
    PushSubscriptionSerializer,
    ReadMarkerSerializer,
)
from .models import (
    Conversation,
    ConversationMember,
    Department,
    Message,
    PushSubscription,
    Section,
    StudentProfile,
    TeacherAssignment,
    User,
)
from .websocket_auth import TICKET_TTL_SECONDS, issue_ticket

logger = logging.getLogger(__name__)

MAX_PAGE = 200
DEFAULT_PAGE = 50


def _teachers_of_sections(section_ids):
    """Advisers plus subject teachers of these sections — the staff on a thread."""
    if not section_ids:
        return set()
    ids = set(
        Section.objects.filter(id__in=section_ids).values_list("adviser_id", flat=True)
    ) - {None}
    ids |= set(
        TeacherAssignment.objects.filter(section_id__in=section_ids).values_list(
            "teacher_id", flat=True
        )
    )
    return ids


class MessagingThrottle(ScopedRateThrottle):
    scope = "messaging"


class MessagingAPIView(APIView):
    """
    Authenticated view that turns domain errors into HTTP answers.

    `core.messaging` raises typed errors because the WebSocket consumer has no
    status codes to return; here they become 400/403/404/429 with a readable
    message, so the UI never has to guess why a send failed.

    The translation happens in `handle_exception`, not in a `dispatch`
    try/except: going through DRF keeps the response finalisation (a bare
    `Response` returned from `dispatch` has no renderer and blows up on render),
    the error-template headers, and the rollback of anything the failed request
    had already written.
    """

    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, messaging.MessagingError):
            detail = {"message": exc.message, "code": exc.code}
            if exc.retry_after:
                detail["retry_after"] = exc.retry_after
            domain_error = APIException(detail)
            domain_error.status_code = exc.status
            if exc.retry_after:
                domain_error.wait = exc.retry_after
            exc = domain_error
        return super().handle_exception(exc)

    def base_context(self, request):
        return {"request_user": request.user, "request_user_id": request.user.id}


# ---------------------------------------------------------------------------
# Conversation list / create
# ---------------------------------------------------------------------------

class ConversationListView(MessagingAPIView):
    """`GET /api/messaging/conversations/` — the left-hand column."""

    def get(self, request):
        rows = list(
            messaging.conversations_for(request.user, search=request.query_params.get("q"))
        )
        # One query for the newest messages of the whole page, instead of one
        # per row: the list is the first thing a user waits for on open.
        conversation_ids = [row.conversation_id for row in rows]
        recent = Prefetch(
            "messages",
            queryset=Message.objects.select_related("sender").order_by("-seq")[:1],
            to_attr="recent_messages",
        )
        prefetch_map = {
            conversation.pk: conversation
            for conversation in Conversation.objects.filter(
                pk__in=conversation_ids
            ).prefetch_related(recent)
        }
        for row in rows:
            row.conversation = prefetch_map.get(row.conversation_id, row.conversation)

        partners = {}
        direct_ids = [
            row.conversation_id
            for row in rows
            if row.conversation.kind == Conversation.Kind.DIRECT
        ]
        if direct_ids:
            for other in ConversationMember.objects.filter(
                conversation_id__in=direct_ids
            ).exclude(user=request.user).select_related("user"):
                partners[other.conversation_id] = other.user

        context = {
            **self.base_context(request),
            "partners": partners,
            "online_ids": messaging.online_ids(
                [partner.id for partner in partners.values()]
            ),
        }
        serializer = ConversationSummarySerializer(rows, many=True, context=context)
        return Response({
            "results": serializer.data,
            "unread_total": messaging.unread_total(request.user),
        })

    def post(self, request):
        payload = ConversationCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        if data["kind"] == Conversation.Kind.DIRECT:
            target = User.objects.filter(pk=data["target_user_id"], is_active=True).first()
            if target is None:
                return Response(
                    {"message": "That account does not exist.", "code": "not_found"},
                    status=404,
                )
            conversation, created = messaging.open_direct_conversation(request.user, target)
        else:
            section = None
            department = None
            if data["kind"] == Conversation.Kind.CLASS:
                section = Section.objects.filter(pk=data["section_id"]).first()
            elif data["kind"] == Conversation.Kind.DEPARTMENT:
                department = Department.objects.filter(pk=data["department_id"]).first()
            conversation = messaging.create_group_conversation(
                request.user,
                data["kind"],
                data.get("title", ""),
                member_ids=data.get("member_ids") or [],
                section=section,
                department=department,
            )
            created = True

        context = self.base_context(request)
        context["online_ids"] = set()
        return Response(
            ConversationDetailSerializer(conversation, context=context).data,
            status=201 if created else 200,
        )


class ConversationDetailView(MessagingAPIView):
    """`GET /api/messaging/conversations/<id>/` — thread header, members, receipts."""

    def get(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        if conversation.kind in (Conversation.Kind.CLASS, Conversation.Kind.DEPARTMENT):
            messaging.sync_structural_members(conversation)
            conversation = messaging.get_conversation_for(pk, request.user)

        member_ids = set(
            conversation.members.values_list("user_id", flat=True)
        )
        context = {
            **self.base_context(request),
            "online_ids": messaging.online_ids(member_ids),
        }
        return Response(ConversationDetailSerializer(conversation, context=context).data)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def _seq_param(request, name):
    """The integer value of a `seq` cursor, or None when it was not sent."""
    raw = request.query_params.get(name)
    return None if raw in (None, "") else int(raw)


class MessageListView(MessagingAPIView):
    """
    History for one thread.

    Paging is by `seq` rather than by page number: a chat that grows while you
    scroll makes offset paging skip or repeat messages. `since_seq` is the
    reconnect case — "everything you missed after the last one I kept".
    """

    def get(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        if conversation.kind in (Conversation.Kind.CLASS, Conversation.Kind.DEPARTMENT):
            messaging.sync_structural_members(conversation)

        try:
            limit = min(max(int(request.query_params.get("limit", DEFAULT_PAGE)), 1), MAX_PAGE)
            # Same rule as `limit`: a cursor typed by a hand (or a stray query
            # string) is a client error, not a server error.
            since = _seq_param(request, "since_seq")
            before = _seq_param(request, "before_seq")
        except ValueError:
            return Response(
                {"message": "limit, since_seq and before_seq must be integers.", "code": "invalid"},
                status=400,
            )

        qs = conversation.messages.select_related("sender")
        if since is not None:
            rows = list(qs.filter(seq__gt=since).order_by("seq")[:limit])
            has_more = len(rows) == limit
        else:
            if before is not None:
                qs = qs.filter(seq__lt=before)
            rows = list(qs.order_by("-seq")[:limit])[::-1]
            has_more = len(rows) == limit

        member = messaging.membership(conversation, request.user)
        return Response({
            "conversation_id": conversation.id,
            "messages": MessageSerializer(rows, many=True).data,
            "oldest_seq": rows[0].seq if rows else None,
            "newest_seq": rows[-1].seq if rows else None,
            "has_more": has_more,
            "last_read_seq": (
                member.last_read_message.seq if member and member.last_read_message_id else None
            ),
        })

    def get_throttles(self):
        # Only the write half of this endpoint is rate limited: a user scrolling
        # back through history is reading, not sending.
        if self.request.method == "POST":
            return [MessagingThrottle()]
        return []

    def post(self, request, pk):
        """
        Send over HTTPS.

        The same helper the socket calls, so a message posted here produces the
        identical live event for everyone else watching the thread — a client
        whose socket is down still reaches the other person instantly.
        """
        conversation = messaging.get_conversation_for(pk, request.user)
        payload = MessageSendSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        message, created = messaging.post_message(
            conversation,
            request.user,
            payload.validated_data["body"],
            client_reference=payload.validated_data.get("client_reference"),
        )
        return Response(
            {
                "message": MessageSerializer(message).data,
                "duplicate": not created,
            },
            status=201 if created else 200,
        )


class ReadMarkerView(MessagingAPIView):
    def post(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        payload = ReadMarkerSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        messaging.mark_read(
            conversation, request.user, upto_seq=payload.validated_data.get("upto_seq")
        )
        return Response({"unread_total": messaging.unread_total(request.user)})


class DeliveredMarkerView(MessagingAPIView):
    def post(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        payload = ReadMarkerSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        messaging.mark_delivered(
            conversation, request.user, upto_seq=payload.validated_data.get("upto_seq")
        )
        return Response({"delivered": True})


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

class ConversationMembersView(MessagingAPIView):
    """`GET|POST|DELETE /api/messaging/conversations/<id>/members/`"""

    def get(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        if conversation.kind in (Conversation.Kind.CLASS, Conversation.Kind.DEPARTMENT):
            messaging.sync_structural_members(conversation)
        rows = conversation.members.select_related(
            "user", "last_read_message"
        ).all()
        context = {
            **self.base_context(request),
            "online_ids": messaging.online_ids(
                set(conversation.members.values_list("user_id", flat=True))
            ),
        }
        return Response(ConversationMemberSerializer(rows, many=True, context=context).data)

    def post(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        if conversation.kind == Conversation.Kind.DIRECT:
            # The structural answer comes first: this request cannot be honoured
            # for anybody, so "impossible" is more useful than "not allowed".
            return Response(
                {
                    "message": "A direct conversation has exactly two participants.",
                    "code": "invalid",
                },
                status=400,
            )
        if not messaging.can_manage_members(request.user, conversation):
            return Response(
                {"message": "You cannot add participants here.", "code": "forbidden"},
                status=403,
            )
        payload = MemberActionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        added = []
        rejected = []
        for target in User.objects.filter(
            id__in=payload.validated_ids(), is_active=True
        ).exclude(id=conversation.created_by_id):
            if messaging.is_member(conversation, target):
                continue
            allowed, reason = messaging.can_message(request.user, target)
            if not allowed and not (
                request.user.is_admin
                and request.user.has_perm_key("messaging.manage")
            ):
                rejected.append(
                    {"user_id": target.id, "reason": reason}
                )
                continue
            messaging.add_member(conversation, target)
            added.append(target.id)
        return Response({"added": added, "rejected": rejected}, status=200)

    def delete(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        payload = MemberActionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        targets = payload.validated_ids()

        # Leaving is allowed for yourself even without management rights.
        if request.user.id in targets and len(targets) == 1:
            messaging.remove_member(conversation, request.user)
            return Response({"removed": [request.user.id]})

        if not messaging.can_manage_members(request.user, conversation):
            return Response(
                {"message": "You cannot remove participants here.", "code": "forbidden"},
                status=403,
            )
        removed = []
        for user_id in targets:
            member = conversation.members.filter(user_id=user_id).first()
            if member is None or member.role == ConversationMember.Role.OWNER:
                continue
            messaging.remove_member(conversation, member.user)
            removed.append(user_id)
        return Response({"removed": removed})


class ConversationSyncView(MessagingAPIView):
    """`POST /api/messaging/conversations/<id>/sync-members/` — re-derive a structural thread."""

    def post(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        if not messaging.can_manage_members(request.user, conversation):
            return Response(
                {"message": "You cannot resync this conversation.", "code": "forbidden"},
                status=403,
            )
        added, removed = messaging.sync_structural_members(conversation)
        return Response({"added": added, "removed": removed})


class ConversationArchiveView(MessagingAPIView):
    def post(self, request, pk):
        conversation = messaging.get_conversation_for(pk, request.user)
        may_manage = (
            request.user.is_admin and request.user.has_perm_key("messaging.manage")
        ) or messaging.can_manage_members(request.user, conversation)
        if not may_manage:
            return Response(
                {"message": "You cannot archive this conversation.", "code": "forbidden"},
                status=403,
            )
        archived = bool(request.data.get("is_archived", True))
        conversation.is_archived = archived
        conversation.save(update_fields=["is_archived", "updated_at"])
        messaging.emit_conversation(conversation.id, "conversation.updated")
        return Response({"is_archived": archived})


# ---------------------------------------------------------------------------
# Directory, options, summary
# ---------------------------------------------------------------------------

class ContactsView(MessagingAPIView):
    """
    People this account may start a direct thread with.

    The candidate set is built from the same relations the policy checks —
    section rosters for a student, assigned sections for a teacher, linked
    children for a parent, the whole active directory for an administrator —
    and `can_message` still vetoes every row. A frontend that filtered here
    itself would be a permission the server does not have.
    """

    def get(self, request):
        user = request.user
        base = User.objects.filter(is_active=True).exclude(id=user.id)

        if user.is_admin:
            candidates = base
        elif user.is_teacher:
            sections = messaging.section_ids_for_teacher(user)
            candidates = base.filter(
                Q(role=User.Role.TEACHER)
                # Staff coordination: `can_message` lets a teacher reach an
                # administrator, so the list has to offer one.
                | Q(role=User.Role.ADMIN)
                | Q(role=User.Role.STUDENT, student_profile__section_id__in=sections)
                | Q(role=User.Role.PARENT, parent_profile__children__section_id__in=sections)
            ).distinct()
        elif user.is_student:
            profile = messaging.student_profile_of(user)
            if profile is None or profile.section_id is None:
                candidates = base.none()
            else:
                candidates = base.filter(
                    Q(role=User.Role.STUDENT, student_profile__section=profile.section)
                    | Q(id__in=_teachers_of_sections({profile.section_id}))
                    | Q(role=User.Role.PARENT, parent_profile__children=profile)
                ).distinct()
        else:  # parent
            child_profiles = StudentProfile.objects.filter(
                id__in=messaging.parent_child_profile_ids(user)
            )
            section_ids = set(
                child_profiles.values_list("section_id", flat=True)
            ) - {None}
            candidates = base.filter(
                Q(id__in=child_profiles.values_list("user_id", flat=True))
                | Q(role=User.Role.TEACHER, id__in=_teachers_of_sections(section_ids))
            ).distinct()

        term = (request.query_params.get("q") or "").strip()
        if term:
            candidates = candidates.filter(
                Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
                | Q(username__icontains=term)
            )
        role_filter = (request.query_params.get("role") or "").strip()
        if role_filter in dict(User.Role.choices):
            candidates = candidates.filter(role=role_filter)

        rows = []
        for candidate in candidates.select_related(
            "student_profile", "parent_profile"
        )[:400]:
            allowed, _reason = messaging.can_message(user, candidate)
            if allowed:
                rows.append(candidate)
            if len(rows) >= 100:
                break

        context = {
            "online_ids": messaging.online_ids([row.id for row in rows]),
        }
        return Response(ContactSerializer(rows[:100], many=True, context=context).data)


class MessagingOptionsView(MessagingAPIView):
    """What the "new conversation" dialog may offer — derived server-side."""

    def get(self, request):
        user = request.user
        sections = []
        if user.is_admin and user.has_perm_key("messaging.manage"):
            section_rows = Section.objects.select_related("grade_level", "school_year")
        elif user.is_teacher:
            section_ids = messaging.section_ids_for_teacher(user)
            section_rows = Section.objects.filter(
                id__in=section_ids
            ).select_related("grade_level", "school_year")
        else:
            section_rows = Section.objects.none()

        for section in section_rows[:200]:
            sections.append({"id": section.id, "name": str(section)})

        departments = []
        if user.is_admin and user.has_perm_key("messaging.manage"):
            departments = [
                {"id": row.id, "name": row.name}
                for row in Department.objects.filter(is_active=True).order_by("name")[:100]
            ]

        return Response({
            "can_create_group": messaging.can_create_group(user, Conversation.Kind.GROUP),
            "sections": sections,
            "departments": departments,
            "vapid_public_key": push_delivery.vapid_public_key(),
        })


class MessagingSummaryView(MessagingAPIView):
    """Cheap numbers for the sidebar badge and the topbar."""

    def get(self, request):
        memberships = ConversationMember.objects.filter(
            user=request.user, conversation__is_archived=False
        ).select_related("last_read_message")
        return Response({
            "conversations": memberships.count(),
            "unread_total": messaging.unread_total(request.user),
            "online": len(messaging.online_ids(
                memberships.values_list("user_id", flat=True)
            )),
        })


# ---------------------------------------------------------------------------
# Handshake credential
# ---------------------------------------------------------------------------

class WebSocketTicketView(MessagingAPIView):
    """
    `POST /api/messaging/ws-ticket/` — the credential the socket handshake uses.

    The client already holds a token for the REST API; this exchanges it for a
    value that is worthless once used or after 30 seconds, so the long-lived
    token never appears in a URL, a proxy log or browser history.
    """

    throttle_classes = [MessagingThrottle]

    def post(self, request):
        ticket = issue_ticket(request.user)
        return Response({
            "ticket": ticket.token,
            "expires_in": TICKET_TTL_SECONDS,
            "websocket_path": "/api/ws/messaging/",
            "server_time": timezone.now().isoformat(),
        })


# ---------------------------------------------------------------------------
# Preferences and push
# ---------------------------------------------------------------------------

class MessagingSettingsView(MessagingAPIView):
    def get(self, request):
        row = messaging.settings_for(request.user)
        return Response({
            "notify_in_app": row.notify_in_app,
            "notify_push": row.notify_push,
            "push_available": push_delivery.vapid_keys_configured(),
            "push_subscriptions": PushSubscription.objects.filter(
                user=request.user
            ).count(),
        })

    def put(self, request):
        payload = MessagingSettingsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        row = messaging.settings_for(request.user)
        for field, value in payload.validated_data.items():
            setattr(row, field, value)
        row.save()
        return self.get(request)

    patch = put


class PushSubscriptionView(MessagingAPIView):
    """Register / drop a browser push endpoint for the signed-in user."""

    def post(self, request):
        if not push_delivery.vapid_keys_configured():
            return Response(
                {
                    "message": "Push is not configured on this server.",
                    "code": "unavailable",
                },
                status=503,
            )
        payload = PushSubscriptionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        p256dh, auth = payload.validated_keys()
        push_delivery.register_subscription(
            request.user, payload.validated_data["endpoint"], p256dh, auth
        )
        return Response({"subscribed": True}, status=201)

    def delete(self, request):
        endpoint = request.data.get("endpoint") or request.query_params.get("endpoint")
        if not endpoint:
            return Response(
                {"message": "endpoint is required.", "code": "invalid"}, status=400
            )
        removed = push_delivery.unregister_subscription(request.user, endpoint)
        return Response({"unsubscribed": not removed, "removed": removed})
