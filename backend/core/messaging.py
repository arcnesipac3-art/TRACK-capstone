"""
TRACK — messaging domain rules.

Everything about *who may talk to whom*, and about the lifecycle of a message,
lives here so the REST views and the WebSocket consumer enforce exactly the
same policy. Two transports with two copies of the rules is how a chat system
ends up with a hole in the quieter one.

Direct threads
--------------
A school messaging system cannot be an open directory: a student must not be
reachable by every account in the building, and parents must not be reachable
by each other. `can_message()` therefore encodes the same supervision graph
the rest of TRACK already uses — the teacher's assigned sections, the student's
section, the parent's linked children — and it is symmetric, so a relationship
either exists in both directions or not at all.

Groups
------
`class` and `department` threads mirror structures the school maintains, so
their membership is *derived* rather than hand-picked: `sync_structural_members`
rebuilds it from the current section roster (or department administrators)
whenever the thread is opened or written to. Membership can therefore never go
stale when a student moves section — no cron job required.

Delivery and read state
-----------------------
Two markers per member (`last_delivered_message`, `last_read_message`) rather
than a receipt row per message: a class thread is ~40 people, and fan-out rows
for every message would cost 40 writes per keystroke-composed message.
"""

import logging
import os
import uuid
from datetime import timedelta

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from .models import (
    MESSAGE_BODY_MAX_LENGTH,
    Conversation,
    ConversationMember,
    Message,
    ParentProfile,
    Section,
    StudentProfile,
    TeacherAssignment,
    User,
    UserPresence,
)
from .realtime import emit_conversation, emit_presence, emit_users

logger = logging.getLogger(__name__)

# A message body is plain text. The limit is enforced here, on the model
# (MaxLengthValidator) and in the serializer, because a WebSocket frame never
# passes through the serializer that the HTTP path uses.
MAX_BODY_LENGTH = MESSAGE_BODY_MAX_LENGTH
MIN_BODY_LENGTH = 1

# Messages a single user may post per window. Generous for a person typing;
# hostile for a script. Override with TRACK_MESSAGE_RATE.
RATE_WINDOW_SECONDS = 60
RATE_LIMIT_PER_WINDOW = int(os.environ.get("TRACK_MESSAGE_RATE", "20"))

# A structural member whose account is deactivated leaves the thread; the
# conversation itself is never deleted, so history survives.


class MessagingError(Exception):
    """Base class; `status` maps to the HTTP code the REST layer returns."""

    status = 400
    code = "messaging_error"

    def __init__(self, message="Messaging request failed.", retry_after=None):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after


class MessagingForbidden(MessagingError):
    status = 403
    code = "forbidden"


class MessagingNotFound(MessagingError):
    status = 404
    code = "not_found"


class MessagingInvalid(MessagingError):
    status = 400
    code = "invalid"


class MessagingRateLimited(MessagingError):
    status = 429
    code = "rate_limited"


# ---------------------------------------------------------------------------
# Reachability (the supervision graph)
# ---------------------------------------------------------------------------

def section_ids_for_teacher(teacher):
    """
    Every section this teacher advises or is assigned to.

    Memoised on the instance because a contacts listing asks once per row;
    the same trick User.permission_keys() uses. Call
    ``invalidate_permission_cache()``-style reset is not needed: a request lives
    long enough that an assignment changing mid-request is not a real case.
    """
    cached = getattr(teacher, "_section_ids_cache", None)
    if cached is not None:
        return cached
    advised = Section.objects.filter(adviser=teacher).values_list("id", flat=True)
    assigned = TeacherAssignment.objects.filter(teacher=teacher).values_list(
        "section_id", flat=True
    )
    ids = set(advised) | set(assigned)
    teacher._section_ids_cache = ids
    return ids


def student_profile_of(user):
    if hasattr(user, "_student_profile_cache"):
        return user._student_profile_cache
    profile = StudentProfile.objects.filter(user=user).first()
    user._student_profile_cache = profile
    return profile


def parent_child_profile_ids(parent):
    cached = getattr(parent, "_child_ids_cache", None)
    if cached is not None:
        return cached
    profile = ParentProfile.objects.filter(user=parent).first()
    ids = set() if profile is None else set(
        profile.children.values_list("id", flat=True)
    )
    parent._child_ids_cache = ids
    return ids


def _teacher_reaches_student(teacher, student_profile):
    if student_profile is None or student_profile.section_id is None:
        return False
    return student_profile.section_id in section_ids_for_teacher(teacher)


def _parent_reaches_student(parent, student_profile):
    return student_profile is not None and student_profile.id in parent_child_profile_ids(
        parent
    )


def _one_with_role(user, target, role):
    """Which of the two participants holds this role."""
    return user if user.role == role else target


def can_message(user, target):
    """
    May these two people open a direct thread?

    Returns ``(allowed, reason)``. The reason is what the API and the UI show
    when a person is not reachable — a silent "no" teaches users nothing.
    """
    if user.id == target.id:
        return False, "You cannot message yourself."
    if not (user.is_active and target.is_active):
        return False, "That account is not active."

    roles = {user.role, target.role}
    admin = User.Role.ADMIN
    teacher = User.Role.TEACHER
    student = User.Role.STUDENT
    parent = User.Role.PARENT

    # Staff-to-anyone and staff-to-staff. Administrators already hold the
    # directory; teachers may reach each other for coordination.
    if admin in roles:
        return True, ""
    if roles == {teacher}:
        return True, ""

    # Normalise: from here each branch only needs "the teacher in this pair".
    if roles == {teacher, student}:
        teacher_user = _one_with_role(user, target, teacher)
        student_user = _one_with_role(user, target, student)
        profile = student_profile_of(student_user)
        ok = _teacher_reaches_student(teacher_user, profile)
        return (
            ok,
            "" if ok else "Teachers may only message students in their own classes.",
        )

    if roles == {teacher, parent}:
        teacher_user = _one_with_role(user, target, teacher)
        parent_user = _one_with_role(user, target, parent)
        child_ids = parent_child_profile_ids(parent_user)
        sections = section_ids_for_teacher(teacher_user)
        ok = StudentProfile.objects.filter(
            id__in=child_ids, section_id__in=sections
        ).exists()
        return (
            ok,
            ""
            if ok
            else "Teachers may only message the parents of students in their own classes.",
        )

    if roles == {student}:
        pa = student_profile_of(user)
        pb = student_profile_of(target)
        ok = (
            pa is not None
            and pb is not None
            and pa.section_id is not None
            and pa.section_id == pb.section_id
        )
        return (
            ok,
            "" if ok else "Students may only message classmates in the same section.",
        )

    if roles == {student, parent}:
        student_user = _one_with_role(user, target, student)
        parent_user = _one_with_role(user, target, parent)
        ok = _parent_reaches_student(parent_user, student_profile_of(student_user))
        return (
            ok,
            "" if ok else "Parents may only message their own children.",
        )

    if roles == {parent}:
        return False, "Parent accounts cannot message each other directly."

    return False, "These accounts cannot message each other."


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

def membership(conversation, user):
    return ConversationMember.objects.filter(
        conversation=conversation, user=user
    ).first()


def is_member(conversation, user):
    return membership(conversation, user) is not None


def get_conversation_for(conversation_id, user):
    """
    Load a conversation *and* prove the caller belongs to it.

    Every read and write path funnels through here. This is the single check
    that makes "prevent users from reading conversations they do not belong
    to" true for both HTTP and WebSocket.
    """
    conversation = Conversation.objects.filter(pk=conversation_id).first()
    if conversation is None:
        raise MessagingNotFound("That conversation does not exist.")
    if not is_member(conversation, user):
        raise MessagingForbidden("You are not a member of this conversation.")
    return conversation


def assert_can_post(conversation, user):
    if conversation.is_archived:
        raise MessagingForbidden("This conversation is archived.")
    if is_member(conversation, user):
        return
    # Staff oversight: an administrator holding the broadcast key may speak in
    # a class or department thread without being enrolled in it.
    if (
        conversation.kind in (Conversation.Kind.CLASS, Conversation.Kind.DEPARTMENT)
        and user.is_admin
        and user.has_perm_key("messaging.broadcast")
    ):
        return
    raise MessagingForbidden("You are not a member of this conversation.")


def add_member(conversation, user, role=ConversationMember.Role.MEMBER):
    obj, created = ConversationMember.objects.get_or_create(
        conversation=conversation, user=user, defaults={"role": role}
    )
    if created:
        emit_conversation(
            conversation.id,
            "member.joined",
            user_id=user.id,
            name=user.get_full_name() or user.username,
        )
        emit_users(
            [user.id],
            "conversation.added",
            conversation_id=conversation.id,
        )
    return obj, created


def remove_member(conversation, user):
    obj = membership(conversation, user)
    if obj is None:
        return False
    obj.delete()
    emit_conversation(
        conversation.id,
        "member.left",
        user_id=user.id,
    )
    return True


def can_manage_members(user, conversation):
    """
    Who may add or remove people in a thread.

    * an owner/admin of the group;
    * the creator of an ad-hoc group;
    * a teacher for the class they teach (class threads);
    * any administrator holding `messaging.manage`.
    Direct threads have no membership to manage beyond who was resolved at
    creation, so this returns False for them.
    """
    if conversation.kind == Conversation.Kind.DIRECT:
        return False
    if user.is_admin and user.has_perm_key("messaging.manage"):
        return True
    obj = membership(conversation, user)
    if obj is not None and obj.role in (
        ConversationMember.Role.OWNER,
        ConversationMember.Role.ADMIN,
    ):
        return True
    if conversation.kind == Conversation.Kind.CLASS and user.is_teacher:
        return conversation.section_id in section_ids_for_teacher(user)
    return False


def sync_structural_members(conversation):
    """
    Rebuild membership for a class/department thread from current records.

    Runs on read as well as on write, so a section that gained or lost a
    student is reflected the next time anyone opens the thread — without a
    scheduled job and without a stale allow-list lingering after a transfer.
    Returns the ids of members that were added or removed.
    """
    if conversation.kind == Conversation.Kind.CLASS:
        if conversation.section_id is None:
            return [], []
        section = conversation.section
        wanted = set(
            User.objects.filter(
                student_profile__section=section, student_profile__user__is_active=True
            ).values_list("id", flat=True)
        )
        wanted |= set(
            User.objects.filter(
                assignments__section=section, is_active=True
            ).values_list("id", flat=True)
        )
        wanted |= set(
            User.objects.filter(
                parent_profile__children__section=section, is_active=True
            ).values_list("id", flat=True)
        )
        if section.adviser_id:
            wanted.add(section.adviser_id)
        # Administrators who oversee the class may read it, but they are not
        # silently enrolled: staff observe through their own directory.
    elif conversation.kind == Conversation.Kind.DEPARTMENT:
        wanted = set(
            conversation.department.administrators.filter(is_active=True).values_list(
                "id", flat=True
            )
        )
    else:
        return [], []

    current = set(conversation.members.values_list("user_id", flat=True))
    added = wanted - current
    removed = current - wanted
    for uid in added:
        ConversationMember.objects.create(
            conversation=conversation, user_id=uid
        )
    if removed:
        conversation.members.filter(user_id__in=removed).delete()
    return sorted(added), sorted(removed)


# ---------------------------------------------------------------------------
# Conversation creation
# ---------------------------------------------------------------------------

def open_direct_conversation(user, target):
    """
    Return the one direct thread these two people share, creating it on demand.

    Idempotent by construction: `Conversation.direct_key` is unique, so two
    clients racing to start the same chat cannot produce two threads.
    """
    allowed, reason = can_message(user, target)
    if not allowed:
        raise MessagingForbidden(reason)

    key = Conversation.build_direct_key([user.id, target.id])
    conversation = Conversation.objects.filter(direct_key=key).first()
    if conversation is not None:
        for participant in (user, target):
            add_member(conversation, participant)
        return conversation, False

    with transaction.atomic():
        # Re-check inside the transaction: the race we are guarding is two
        # simultaneous "start chat" clicks, not a sequential double submit.
        conversation = Conversation.objects.filter(direct_key=key).first()
        if conversation is not None:
            for participant in (user, target):
                add_member(conversation, participant)
            return conversation, False
        conversation = Conversation.objects.create(
            kind=Conversation.Kind.DIRECT,
            direct_key=key,
            created_by=user,
        )
        add_member(conversation, user, ConversationMember.Role.OWNER)
        add_member(conversation, target, ConversationMember.Role.MEMBER)
    return conversation, True


def can_create_group(user, kind, section=None, department=None):
    if kind == Conversation.Kind.DEPARTMENT:
        return bool(
            user.is_admin
            and user.has_perm_key("messaging.manage")
            and department is not None
        )
    if kind == Conversation.Kind.CLASS:
        if user.is_admin and user.has_perm_key("messaging.manage"):
            return section is not None
        return bool(section is not None and user.is_teacher
                    and section.id in section_ids_for_teacher(user))
    # Ad-hoc group
    if user.is_admin and user.has_perm_key("messaging.manage"):
        return True
    return user.is_teacher


def create_group_conversation(
    user, kind, title, member_ids=(), section=None, department=None
):
    if not can_create_group(user, kind, section=section, department=department):
        raise MessagingForbidden("You are not allowed to create that conversation.")
    if kind == Conversation.Kind.CLASS and section is None:
        raise MessagingInvalid("A class conversation needs a section.")
    if kind == Conversation.Kind.DEPARTMENT and department is None:
        raise MessagingInvalid("A department conversation needs a department.")
    if not title.strip():
        raise MessagingInvalid("A group conversation needs a name.")

    with transaction.atomic():
        conversation = Conversation.objects.create(
            kind=kind,
            title=title.strip(),
            section=section,
            department=department,
            created_by=user,
        )
        add_member(
            conversation, user, ConversationMember.Role.OWNER
        )
        if kind in (Conversation.Kind.CLASS, Conversation.Kind.DEPARTMENT):
            sync_structural_members(conversation)
            # The creator keeps owner rights even if they are not part of the
            # structure they just opened a thread for.
            ConversationMember.objects.filter(
                conversation=conversation, user=user
            ).update(role=ConversationMember.Role.OWNER)
        else:
            for target in User.objects.filter(
                id__in=set(member_ids) - {user.id}, is_active=True
            ):
                allowed, reason = can_message(user, target)
                if not allowed:
                    raise MessagingForbidden(
                        f"{target.get_full_name() or target.username}: {reason}"
                    )
                add_member(conversation, target)
    return conversation


# ---------------------------------------------------------------------------
# Posting
# ---------------------------------------------------------------------------

def clean_body(body):
    text = (body or "").replace("\r\n", "\n").strip()
    if len(text) < MIN_BODY_LENGTH:
        raise MessagingInvalid("A message cannot be empty.")
    if len(text) > MAX_BODY_LENGTH:
        raise MessagingInvalid(
            f"A message may not exceed {MAX_BODY_LENGTH} characters."
        )
    if "\x00" in text:
        raise MessagingInvalid("A message contains an unsupported character.")
    return text


def check_rate_limit(user):
    """
    Sliding-ish window per user.

    Cache-based, so it is shared across workers the moment a real cache
    backend is configured (LocMemCache in development is per-process, which is
    the same trade-off the login throttle already makes — see
    docs/KNOWN_LIMITATIONS.md L-003).
    """
    key = f"track:msg-rate:{user.id}:{int(timezone.now().timestamp() // RATE_WINDOW_SECONDS)}"
    added = cache.add(key, 1, timeout=RATE_WINDOW_SECONDS * 2)
    if added:
        return
    current = cache.get(key) or 0
    if current >= RATE_LIMIT_PER_WINDOW:
        raise MessagingRateLimited(
            "You are sending too quickly. Wait a moment and try again.",
            retry_after=RATE_WINDOW_SECONDS,
        )
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=RATE_WINDOW_SECONDS * 2)


def post_message(conversation, sender, body, client_reference=None):
    """
    Persist one message and tell everyone live where it belongs.

    Returns ``(message, created)``. ``created`` is False when the caller's
    `client_reference` matches a message already stored — the retry after a
    dropped socket — in which case nothing is written and nothing is broadcast,
    so a duplicate send cannot double-deliver.

    `seq` is allocated under a lock on the conversation row. On SQLite the
    SELECT … FOR UPDATE is a no-op, so the unique (conversation, seq)
    constraint is the real guard; a collision is retried.
    """
    text = clean_body(body)
    assert_can_post(conversation, sender)
    check_rate_limit(sender)

    reference = _normalise_reference(client_reference)
    if reference is not None:
        existing = Message.objects.filter(
            conversation=conversation, client_reference=reference
        ).first()
        if existing is not None:
            return existing, False

    for attempt in range(3):
        try:
            with transaction.atomic():
                locked = (
                    Conversation.objects.select_for_update()
                    .filter(pk=conversation.pk)
                    .first()
                )
                if locked is None:
                    raise MessagingNotFound("That conversation does not exist.")
                if locked.is_archived:
                    raise MessagingForbidden("This conversation is archived.")
                last_seq = (
                    Message.objects.filter(conversation=locked)
                    .order_by("-seq")
                    .values_list("seq", flat=True)
                    .first()
                    or 0
                )
                message = Message.objects.create(
                    conversation=locked,
                    sender=sender,
                    body=text,
                    seq=last_seq + 1,
                    client_reference=reference,
                )
                Conversation.objects.filter(pk=locked.pk).update(
                    updated_at=timezone.now()
                )
        except IntegrityError:
            if reference is not None:
                stored = Message.objects.filter(
                    conversation=conversation, client_reference=reference
                ).first()
                if stored is not None:
                    return stored, False
            if attempt == 2:
                raise
            continue

        deliver_new_message(locked, message, sender)
        return message, True

    raise MessagingError("The message could not be stored. Try again.")


def _normalise_reference(client_reference):
    if client_reference in (None, ""):
        return None
    try:
        return str(uuid.UUID(str(client_reference)))
    except (ValueError, AttributeError, TypeError):
        raise MessagingInvalid("client_reference must be a UUID.")


def deliver_new_message(conversation, message, sender):
    """Broadcast the new message and fan out notifications for it."""
    payload = serialize_message(message, for_user_id=sender.id)
    emit_conversation(
        conversation.id,
        "message.new",
        message=payload,
        sender_name=sender.get_full_name() or sender.username,
    )
    recipient_ids = [
        uid
        for uid in conversation.members.exclude(user=sender).values_list(
            "user_id", flat=True
        )
    ]
    if recipient_ids:
        # `inbox.message` (not `message.new`) on purpose: the conversation
        # group already carries the thread copy, and an open thread must not
        # append the same message twice. The inbox event is what updates the
        # conversation list and the unread badge.
        emit_users(
            recipient_ids,
            "inbox.message",
            exclude_user_id=sender.id,
            conversation_id=conversation.id,
            message=payload,
        )
        # Imported here because notifications.py imports models and this module
        # is imported by the notification helpers' callers.
        from .notifications import notify_message_received

        try:
            notify_message_received(conversation, message, recipient_ids)
        except Exception:  # noqa: BLE001 - the message is already stored
            # A bell that is on fire must not turn into a lost message or a
            # failed send: the row and the live events above are the delivery,
            # the notification is a courtesy on top of it.
            logger.exception(
                "TRACK: notification fan-out failed for message %s", message.pk
            )


# ---------------------------------------------------------------------------
# Delivery / read / live-view markers
# ---------------------------------------------------------------------------

def _marker_message(conversation, upto_seq):
    return (
        Message.objects.filter(conversation=conversation, seq__lte=upto_seq)
        .order_by("-seq")
        .first()
    )


def mark_delivered(conversation, user, upto_seq=None):
    """
    Acknowledge that a client received a message.

    Only moves forward — a client that resends an older marker after a reload
    must never make a delivered thread look undelivered again.
    """
    obj = membership(conversation, user)
    if obj is None:
        return False
    target = (
        _marker_message(conversation, upto_seq)
        if upto_seq
        else conversation.messages.order_by("-seq").first()
    )
    if target is None:
        return False
    if obj.last_delivered_message_id and (
        obj.last_delivered_message.seq >= target.seq
    ):
        return False
    obj.last_delivered_message = target
    obj.save(update_fields=["last_delivered_message"])
    _emit_marker(conversation, obj, "message.delivered", target.seq)
    return True


def mark_read(conversation, user, upto_seq=None):
    obj = membership(conversation, user)
    if obj is None:
        return False
    target = (
        _marker_message(conversation, upto_seq)
        if upto_seq
        else conversation.messages.order_by("-seq").first()
    )
    if target is None:
        return False
    moved = not (
        obj.last_read_message_id and obj.last_read_message.seq >= target.seq
    )
    obj.last_read_message = target
    if (
        obj.last_delivered_message_id is None
        or obj.last_delivered_message.seq < target.seq
    ):
        obj.last_delivered_message = target
    obj.save(
        update_fields=["last_read_message", "last_delivered_message"]
    )
    if moved:
        _emit_marker(conversation, obj, "message.read", target.seq)
        other_ids = conversation.members.exclude(user=user).values_list(
            "user_id", flat=True
        )
        emit_users(
            list(other_ids),
            "conversation.read",
            exclude_user_id=user.id,
            conversation_id=conversation.id,
            seq=target.seq,
            by_user_id=user.id,
        )
        _clear_bell_for(conversation, user)
    return True


def _clear_bell_for(conversation, user):
    """
    Reading a thread retires the bell items it produced.

    Otherwise the conversation is both "read" in the thread and still shouting
    from the notification tray, and the two counts never agree again.
    """
    from .models import Notification

    updated = Notification.objects.filter(
        recipient=user,
        notif_type=Notification.NotifType.MESSAGE_RECEIVED,
        message__conversation=conversation,
        is_read=False,
    ).update(is_read=True)
    if updated:
        emit_users(
            [user.id],
            "notifications.conversation_read",
            conversation_id=conversation.id,
            cleared=updated,
        )
    return updated


def _emit_marker(conversation, member, event, seq):
    emit_conversation(
        conversation.id,
        event,
        user_id=member.user_id,
        seq=seq,
    )


def set_viewing(conversation, user, active):
    """
    Record that a member is looking at this thread right now.

    This is what makes "no push while you are reading" work: the flag is set by
    the consumer when the client opens the thread, refreshed by its heartbeat,
    and cleared on close or when it goes stale.
    """
    obj = membership(conversation, user)
    if obj is None:
        return
    ConversationMember.objects.filter(pk=obj.pk).update(
        viewing_since=timezone.now() if active else None
    )


def is_viewing(conversation, user_id, within_seconds=45):
    stamp = conversation.members.filter(
        user_id=user_id
    ).values_list("viewing_since", flat=True).first()
    if stamp is None:
        return False
    return (timezone.now() - stamp) <= timedelta(seconds=within_seconds)


def member_status(conversation):
    """
    Delivery/read state of the newest message, per member.

    One pass over the members is enough: a member has seen everything up to
    their marker, so `seq <= marker.seq` answers "delivered" and "read" for any
    message without a receipts table.
    """
    newest = conversation.messages.order_by("-seq").first()
    if newest is None:
        return {"delivered": 0, "read": 0, "total": 0, "of_newest": None}
    delivered = read = total = 0
    for obj in conversation.members.select_related(
        "last_delivered_message", "last_read_message"
    ):
        if obj.user_id == newest.sender_id:
            continue
        total += 1
        marker = obj.last_delivered_message
        if marker is not None and marker.seq >= newest.seq:
            delivered += 1
        read_marker = obj.last_read_message
        if read_marker is not None and read_marker.seq >= newest.seq:
            read += 1
    return {"delivered": delivered, "read": read, "total": total, "of_newest": newest.seq}


# ---------------------------------------------------------------------------
# Listing and unread totals
# ---------------------------------------------------------------------------

def settings_for(user):
    """The caller's messaging preferences, created with the shipped defaults."""
    from .models import UserMessagingSettings

    obj, _ = UserMessagingSettings.objects.get_or_create(user=user)
    return obj


def conversations_for(user, search=None):
    """
    The member rows that make up this user's conversation list.

    `search` matches on thread name, on the other people in a direct thread,
    and on message text — the three things a person actually types when
    looking for a chat.
    """
    qs = ConversationMember.objects.filter(
        user=user, conversation__is_archived=False
    ).select_related("conversation", "last_read_message")

    if search and search.strip():
        term = search.strip()
        matched = (
            set(
                Conversation.objects.filter(title__icontains=term).values_list(
                    "id", flat=True
                )
            )
            | set(
                Message.objects.filter(body__icontains=term)
                .values_list("conversation_id", flat=True)
            )
            | set(
                ConversationMember.objects.filter(
                    Q(user__first_name__icontains=term)
                    | Q(user__last_name__icontains=term)
                    | Q(user__username__icontains=term)
                )
                .values_list("conversation_id", flat=True)
            )
        )
        qs = qs.filter(conversation_id__in=matched)

    return qs.order_by("-conversation__updated_at")


def unread_total(user):
    total = 0
    for obj in ConversationMember.objects.filter(
        user=user, conversation__is_archived=False
    ).select_related("last_read_message"):
        total += obj.unread_count()
    return total


# ---------------------------------------------------------------------------
# Presence
# ---------------------------------------------------------------------------

def presence_connect(user):
    obj, _ = UserPresence.objects.get_or_create(user=user)
    UserPresence.objects.filter(pk=obj.pk).update(
        online=True, open_connections=F("open_connections") + 1, last_seen_at=None
    )
    return _presence_event(user, True)


def presence_disconnect(user):
    obj = UserPresence.objects.filter(user=user).first()
    if obj is None:
        return _presence_event(user, False)
    remaining = max(obj.open_connections - 1, 0)
    obj.open_connections = remaining
    obj.online = remaining > 0
    if remaining == 0:
        obj.last_seen_at = timezone.now()
    obj.save(update_fields=["open_connections", "online", "last_seen_at"])
    return _presence_event(user, obj.online)


def presence_heartbeat(user):
    """
    Refresh the staleness window for a live connection.

    A client that reconnects every few minutes keeps `updated_at` honest, so a
    process that died without running its disconnect handler stops counting as
    "online" once the window passes instead of forever.
    """
    UserPresence.objects.filter(user=user).update(online=True, last_seen_at=None)
    return True


def _presence_event(user, online):
    emit_presence({"event": "presence", "user_id": user.id, "online": online})
    return online


def online_ids(user_ids):
    """
    Which of these users are connected right now.

    The staleness window matters: `open_connections` is only decremented by a
    disconnect handler that actually ran, so a row from a killed worker would
    otherwise report someone as online forever.
    """
    cutoff = timezone.now() - timedelta(seconds=UserPresence.STALE_SECONDS)
    return set(
        UserPresence.objects.filter(
            user_id__in=list(user_ids),
            online=True,
            open_connections__gt=0,
            updated_at__gte=cutoff,
        ).values_list("user_id", flat=True)
    )


# ---------------------------------------------------------------------------
# Serialization helper shared with the consumer
# ---------------------------------------------------------------------------

def serialize_message(message, for_user_id=None):
    """
    The wire shape of a message.

    Kept here, next to the writer, because the consumer and the REST views must
    hand a client the same object — a field present on one transport and absent
    on the other is a bug the UI only shows up for half the users.
    """
    return {
        "id": message.id,
        "conversation": message.conversation_id,
        "seq": message.seq,
        "sender": message.sender_id,
        "sender_name": (
            message.sender.get_full_name() or message.sender.username
            if message.sender_id
            else "Removed user"
        ),
        "body": message.body,
        "created_at": timezone.localtime(message.created_at).isoformat(),
        "client_reference": str(message.client_reference)
        if message.client_reference
        else None,
    }
