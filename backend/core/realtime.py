"""
TRACK — channel-layer plumbing shared by the REST and WebSocket sides.

A message sent over HTTP and a message sent over the socket must produce the
same live event; otherwise the two transports drift and a client that happens
to be connected sees something a client that posts through the API does not.
So every write path calls into here rather than reaching for the channel layer
itself.

Group naming (one conversation, one personal inbox per user):
  * ``conv.<id>``  — everything about one thread: new messages, typing,
                     delivery and read markers, members joining or leaving.
  * ``user.<id>``  — events addressed to a person, not a thread: the unread
                     badge, a thread someone added them to, a bell notification.
  * ``presence``   — every connected client, for online/offline transitions.

Broadcasting is best-effort by design, mirroring core/notifications.py: the
row is already committed, so a channel-layer hiccup must not turn a delivered
message into a 500. Failures are logged and swallowed.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

CONVERSATION_GROUP = "conv.{conversation_id}"
USER_GROUP = "user.{user_id}"
PRESENCE_GROUP = "track.presence"


def conversation_group(conversation_id):
    return CONVERSATION_GROUP.format(conversation_id=conversation_id)


def user_group(user_id):
    return USER_GROUP.format(user_id=user_id)


def layer_send(group, payload):
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return False
        async_to_sync(channel_layer.group_send)(group, payload)
        return True
    except Exception:  # noqa: BLE001 - realtime delivery is a courtesy, not a transaction
        logger.exception("TRACK: realtime broadcast failed for group %s", group)
        return False


def emit_conversation(conversation_id, event, **data):
    """
    Publish ``{event, conversation_id, ...data}`` to everyone watching one thread.

    The id is stamped here rather than passed by every caller: it is the same
    value used to pick the group, and repeating it is how a call site ends up
    announcing a thread other than the one it broadcast to.
    """
    return layer_send(
        conversation_group(conversation_id),
        {"type": "conversation.event", "event": event,
         "conversation_id": conversation_id, **data},
    )


def emit_users(user_ids, event, exclude_user_id=None, **data):
    """
    Publish an event to the personal groups of the given users.

    ``exclude_user_id`` skips the sender: nobody needs their own message
    bounced back to them as an incoming event.
    """
    payload = {"type": "inbox.event", "event": event, **data}
    targets = {int(uid) for uid in user_ids if uid is not None}
    if exclude_user_id is not None:
        targets.discard(int(exclude_user_id))
    return all(layer_send(user_group(uid), payload) for uid in targets)


def emit_presence(payload):
    """Broadcast an online/offline transition to every connected client."""
    return layer_send(PRESENCE_GROUP, {"type": "presence.event", **payload})
