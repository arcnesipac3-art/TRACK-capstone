"""
TRACK — messaging serializers.

Presence is resolved in bulk by the view and handed through `context`, because
"who is online" is one query per response, not one per row: a conversation list
of 50 threads with a per-row lookup is 50 queries for data that is already in
one table.
"""

from rest_framework import serializers

from . import messaging
from .models import Conversation, ConversationMember, Message, User


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "conversation", "seq", "sender", "sender_name", "sender_role",
            "body", "client_reference", "created_at",
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        if obj.sender_id is None:
            return "Removed user"
        return obj.sender.get_full_name() or obj.sender.username

    def get_sender_role(self, obj):
        return obj.sender.role if obj.sender_id else ""


class ConversationMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    full_name = serializers.SerializerMethodField()
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    user_role = serializers.CharField(source="user.role", read_only=True)
    online = serializers.SerializerMethodField()
    last_read_seq = serializers.IntegerField(
        source="last_read_message.seq", read_only=True, default=None
    )
    # A screen that shows "Delivered" before it shows "Read" needs this marker
    # in the same payload as the read one; without it the first paint of a
    # thread can only guess, and a wrong tick is worse than no tick.
    last_delivered_seq = serializers.IntegerField(
        source="last_delivered_message.seq", read_only=True, default=None
    )
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMember
        fields = [
            "user_id", "full_name", "role", "role_label", "user_role",
            "online", "last_read_seq", "last_delivered_seq", "unread_count",
            "joined_at",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_online(self, obj):
        return obj.user_id in self.context.get("online_ids", set())

    def get_unread_count(self, obj):
        # Only meaningful in the detail view of a thread the caller owns;
        # a member row for someone else would leak their private unread state,
        # so the count is exposed for the requesting user alone.
        if obj.user_id != self.context.get("request_user_id"):
            return None
        return obj.unread_count()


class ConversationSummarySerializer(serializers.ModelSerializer):
    """One row of the conversation list."""

    id = serializers.IntegerField(source="conversation.id", read_only=True)
    display_name = serializers.SerializerMethodField()
    kind = serializers.CharField(source="conversation.kind", read_only=True)
    kind_label = serializers.CharField(source="conversation.get_kind_display", read_only=True)
    is_archived = serializers.BooleanField(source="conversation.is_archived", read_only=True)
    updated_at = serializers.DateTimeField(source="conversation.updated_at", read_only=True)
    section = serializers.IntegerField(
        source="conversation.section_id", read_only=True, default=None
    )
    department = serializers.IntegerField(
        source="conversation.department_id", read_only=True, default=None
    )
    member_count = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    partner = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMember
        fields = [
            "id", "display_name", "kind", "kind_label", "is_archived",
            "updated_at", "section", "department", "member_count",
            "unread_count", "last_message", "partner",
        ]
        read_only_fields = fields

    def get_display_name(self, obj):
        conversation = obj.conversation
        if conversation.kind == Conversation.Kind.DIRECT:
            other = self._partner(obj)
            if other is not None:
                return other.get_full_name() or other.username
        return conversation.display_name

    def _partner(self, obj):
        """The other person in a direct thread, from the view's one-query map."""
        return self.context.get("partners", {}).get(obj.conversation_id)

    def get_member_count(self, obj):
        return obj.conversation.members.count()

    def get_unread_count(self, obj):
        # One indexed range count per row. A thread list is bounded by the page
        # size, so this stays a small number of cheap queries rather than a
        # join that would have to carry every member's marker.
        return obj.unread_count()

    def get_last_message(self, obj):
        rows = getattr(obj.conversation, "recent_messages", None)
        if rows is None:
            rows = obj.conversation.messages.select_related("sender").order_by("-seq")[:1]
        message = rows[0] if rows else None
        return MessageSerializer(message).data if message else None

    def get_partner(self, obj):
        if obj.conversation.kind != Conversation.Kind.DIRECT:
            return None
        other = self._partner(obj)
        if other is None:
            return None
        return {
            "id": other.id,
            "full_name": other.get_full_name() or other.username,
            "role": other.role,
            "online": other.id in self.context.get("online_ids", set()),
        }


class ConversationDetailSerializer(serializers.ModelSerializer):
    """A single thread: who is in it, and how far each of them has read."""

    display_name = serializers.SerializerMethodField()
    kind_label = serializers.SerializerMethodField()
    can_manage_members = serializers.SerializerMethodField()
    can_post = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "kind", "kind_label", "display_name", "title", "section",
            "department", "is_archived", "created_at", "updated_at",
            "can_manage_members", "can_post", "members", "status",
            "unread_count",
        ]
        read_only_fields = fields

    def get_display_name(self, obj):
        return obj.display_name

    def get_kind_label(self, obj):
        return obj.get_kind_display()

    def _user(self):
        return self.context["request_user"]

    def get_can_manage_members(self, obj):
        return messaging.can_manage_members(self._user(), obj)

    def get_can_post(self, obj):
        try:
            messaging.assert_can_post(obj, self._user())
        except messaging.MessagingError:
            return False
        return True

    def get_members(self, obj):
        rows = obj.members.select_related(
            "user", "last_read_message", "last_delivered_message"
        ).all()
        return ConversationMemberSerializer(
            rows, many=True, context=self.context
        ).data

    def get_status(self, obj):
        return messaging.member_status(obj)

    def get_unread_count(self, obj):
        member = messaging.membership(obj, self._user())
        return member.unread_count() if member else 0


class ContactSerializer(serializers.ModelSerializer):
    """A person the caller is allowed to start a direct thread with."""

    full_name = serializers.SerializerMethodField()
    detail = serializers.SerializerMethodField()
    online = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "role", "detail", "online"]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_detail(self, obj):
        if obj.role == User.Role.STUDENT:
            profile = messaging.student_profile_of(obj)
            return str(profile.section) if profile and profile.section_id else ""
        if obj.role == User.Role.TEACHER:
            sections = messaging.section_ids_for_teacher(obj)
            return f"{len(sections)} class(es)" if sections else ""
        if obj.role == User.Role.ADMIN:
            names = list(obj.departments.values_list("name", flat=True)[:3])
            return ", ".join(names)
        return ""

    def get_online(self, obj):
        return obj.id in self.context.get("online_ids", set())


class MessageSendSerializer(serializers.Serializer):
    body = serializers.CharField(
        max_length=messaging.MAX_BODY_LENGTH, allow_blank=False, trim_whitespace=True
    )
    client_reference = serializers.UUIDField(required=False, allow_null=True)

    def validate_body(self, value):
        # clean_body is the shared rule; the serializer exists so a bad request
        # answers 400 with field errors instead of 403 from the domain layer.
        return messaging.clean_body(value)


class ReadMarkerSerializer(serializers.Serializer):
    upto_seq = serializers.IntegerField(required=False, min_value=0, allow_null=True)


class MemberActionSerializer(serializers.Serializer):
    user_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False
    )
    user_id = serializers.IntegerField(required=False, min_value=1)

    def validated_ids(self):
        ids = set(self.validated_data.get("user_ids") or [])
        if self.validated_data.get("user_id"):
            ids.add(self.validated_data["user_id"])
        return ids


class ConversationCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Conversation.Kind.choices)
    target_user_id = serializers.IntegerField(required=False, min_value=1)
    title = serializers.CharField(
        max_length=120, required=False, allow_blank=True, trim_whitespace=True
    )
    section_id = serializers.IntegerField(required=False, min_value=1, allow_null=True)
    department_id = serializers.IntegerField(
        required=False, min_value=1, allow_null=True
    )
    member_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, default=list
    )

    def validate(self, attrs):
        if attrs["kind"] == Conversation.Kind.DIRECT and not attrs.get("target_user_id"):
            raise serializers.ValidationError(
                {"target_user_id": "A direct conversation needs a recipient."}
            )
        if attrs["kind"] != Conversation.Kind.DIRECT and not attrs.get("title"):
            raise serializers.ValidationError(
                {"title": "Give the conversation a name."}
            )
        if attrs["kind"] == Conversation.Kind.CLASS and not attrs.get("section_id"):
            raise serializers.ValidationError(
                {"section_id": "Pick the class this conversation is for."}
            )
        if (
            attrs["kind"] == Conversation.Kind.DEPARTMENT
            and not attrs.get("department_id")
        ):
            raise serializers.ValidationError(
                {"department_id": "Pick the department this conversation is for."}
            )
        return attrs


class PushSubscriptionSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=2000)
    keys = serializers.DictField(
        child=serializers.CharField(max_length=200), allow_empty=False
    )

    def validate_endpoint(self, value):
        if not value.startswith(("https://", "http://localhost")):
            raise serializers.ValidationError(
                "A push endpoint must be an HTTPS URL."
            )
        return value

    def validated_keys(self):
        keys = self.validated_data.get("keys") or {}
        try:
            return keys["p256dh"], keys["auth"]
        except KeyError:
            raise serializers.ValidationError(
                {"keys": "Both `p256dh` and `auth` are required."}
            )


class MessagingSettingsSerializer(serializers.Serializer):
    notify_in_app = serializers.BooleanField(required=False)
    notify_push = serializers.BooleanField(required=False)
