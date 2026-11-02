"""
TRACK — the WebSocket consumer for messaging.

One socket per signed-in client. It is a notification channel and a second
transport for sending, not a source of truth: every frame that mutates state
goes through the same `core.messaging` helpers the REST API uses, so a client
cannot do anything over the socket that it could not do over HTTPS — and, more
importantly, cannot do anything *more*.

Authorization model
-------------------
1. Identity is fixed at the handshake (core/websocket_auth.py) — no frame can
   claim to be somebody else.
2. `subscribe` re-checks membership before the connection joins a conversation
   group, and every later action re-checks it against the database. Being in a
   group is never proof of continuing permission: a member removed while
   connected has their events dropped and their writes refused.
3. Events arriving from a *conversation* group are only forwarded when this
   connection explicitly subscribed to that conversation id. Personal and
   presence events are addressed by group name and always forwarded.

Protocol
--------
Client → server (JSON):
    {"action": "subscribe",   "conversation_id": 1}
    {"action": "unsubscribe", "conversation_id": 1}
    {"action": "send",        "conversation_id": 1, "body": "…",
                              "client_reference": "<uuid>", "request_id": "c1"}
    {"action": "typing",      "conversation_id": 1, "is_typing": true}
    {"action": "read",        "conversation_id": 1, "upto_seq": 42}
    {"action": "delivered",   "conversation_id": 1, "upto_seq": 42}
    {"action": "sync",        "conversation_id": 1, "since_seq": 40}
    {"action": "presence.ping"}

Server → client:
    {"event": "connected", "user_id": 7, "unread": 3}
    {"event": "subscribed", "conversation_id": 1, "seq": 42}
    {"event": "message.new", "conversation_id": 1, "message": {…}}
    {"event": "message.sent", "request_id": "c1", "message": {…}, "duplicate": false}
    {"event": "typing.update", "conversation_id": 1, "user_id": 8, "is_typing": true}
    {"event": "message.delivered" | "message.read", "conversation_id": 1,
                              "user_id": 8, "seq": 42}
    {"event": "messages.sync", "conversation_id": 1, "messages": […]}
    {"event": "inbox.message" | "conversation.added" | "conversation.read"
              | "notification.new" | "unread", …}
    {"event": "presence", "user_id": 8, "online": true}
    {"event": "error", "code": "forbidden", "message": "…", "request_id": "c1"}
"""

import json
import logging
import time

from asgiref.sync import async_to_sync
from channels.exceptions import StopConsumer
from channels.generic.websocket import WebsocketConsumer
from django.utils import timezone

from . import messaging
from .models import Message
from .realtime import (
    PRESENCE_GROUP,
    conversation_group,
    user_group,
)

logger = logging.getLogger(__name__)

# A frame bigger than this is not a message, it is somebody probing the server.
MAX_FRAME_BYTES = 32 * 1024

# How often one connection may announce typing. Announcements are cheap, but a
# client that fires on every keystroke would multiply by every member.
TYPING_MIN_INTERVAL_SECONDS = 1.0

# Rows returned by one `sync` catch-up frame.
SYNC_PAGE_SIZE = 200


class ChatConsumer(WebsocketConsumer):
    def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            # 4401: closed before accept, so no browser retries in a loop with
            # an unauthenticated socket that looks connected.
            self.close(code=4401)
            return

        self.user = user
        self.conversations_open = set()
        self.last_typing_at = 0.0

        async_to_sync(self.channel_layer.group_add)(
            user_group(user.id), self.channel_name
        )
        async_to_sync(self.channel_layer.group_add)(
            PRESENCE_GROUP, self.channel_name
        )
        self.accept()

        messaging.presence_connect(user)
        self.send(text_data=json.dumps({
            "event": "connected",
            "user_id": user.id,
            "unread": messaging.unread_total(user),
            "server_time": timezone.now().isoformat(),
        }))

    def disconnect(self, code):
        user = getattr(self, "user", None)
        if user is None:
            return
        # Mark the threads this socket was looking at as no longer viewed, so a
        # message arriving after the tab closes is allowed to notify.
        for conversation_id in list(self.conversations_open):
            conversation = messaging.Conversation.objects.filter(
                pk=conversation_id
            ).first()
            if conversation is not None:
                messaging.set_viewing(conversation, user, active=False)
        messaging.presence_disconnect(user)
        async_to_sync(self.channel_layer.group_discard)(
            user_group(user.id), self.channel_name
        )
        async_to_sync(self.channel_layer.group_discard)(
            PRESENCE_GROUP, self.channel_name
        )

    # -- inbound ----------------------------------------------------------

    def receive(self, text_data=None, bytes_data=None):
        if bytes_data is not None or not text_data:
            self._send_error("invalid", "Frames must be UTF-8 JSON text.")
            return
        if len(text_data.encode("utf-8")) > MAX_FRAME_BYTES:
            self._send_error("too_large", "That frame is too large.")
            return
        try:
            frame = json.loads(text_data)
        except (ValueError, TypeError):
            self._send_error("invalid", "That frame is not valid JSON.")
            return
        if not isinstance(frame, dict):
            self._send_error("invalid", "Frames must be a JSON object.")
            return

        action = frame.get("action")
        handler = {
            "subscribe": self._action_subscribe,
            "unsubscribe": self._action_unsubscribe,
            "send": self._action_send,
            "typing": self._action_typing,
            "read": self._action_read,
            "delivered": self._action_delivered,
            "sync": self._action_sync,
            "presence.ping": self._action_presence_ping,
        }.get(action)

        if handler is None:
            self._send_error("unknown_action", f"Unknown action: {action!r}",
                             request_id=frame.get("request_id"))
            return

        try:
            handler(frame)
        except messaging.MessagingError as error:
            # Authorization and validation failures are per-action, not fatal:
            # one bad frame must not tear down the socket a user is chatting on.
            self._send_error(
                error.code,
                error.message,
                request_id=frame.get("request_id"),
                retry_after=error.retry_after,
            )

    def _action_subscribe(self, frame):
        conversation_id = self._conversation_id(frame)
        conversation = messaging.get_conversation_for(conversation_id, self.user)
        group = conversation_group(conversation.id)
        if conversation.id not in self.conversations_open:
            async_to_sync(self.channel_layer.group_add)(group, self.channel_name)
            self.conversations_open.add(conversation.id)

        # Opening a thread is an implicit delivery acknowledgement, and starts
        # the live-view suppression window.
        messaging.mark_delivered(conversation, self.user)
        messaging.set_viewing(conversation, self.user, active=True)
        newest = conversation.messages.order_by("-seq").values_list("seq", flat=True).first()
        self._send({
            "event": "subscribed",
            "conversation_id": conversation.id,
            "seq": newest or 0,
            "unread": messaging.unread_total(self.user),
        })

    def _action_unsubscribe(self, frame):
        conversation_id = self._conversation_id(frame)
        conversation = messaging.get_conversation_for(conversation_id, self.user)
        if conversation.id in self.conversations_open:
            async_to_sync(self.channel_layer.group_discard)(
                conversation_group(conversation.id), self.channel_name
            )
            self.conversations_open.discard(conversation.id)
            messaging.set_viewing(conversation, self.user, active=False)
        self._send({"event": "unsubscribed", "conversation_id": conversation.id})

    def _action_send(self, frame):
        conversation_id = self._conversation_id(frame)
        # get_conversation_for is the membership gate; assert_can_post inside
        # post_message re-reads the conversation under lock, so an archived
        # thread or a revoked membership cannot be raced.
        conversation = messaging.get_conversation_for(conversation_id, self.user)
        message, created = messaging.post_message(
            conversation,
            self.user,
            frame.get("body"),
            client_reference=frame.get("client_reference"),
        )
        self._send({
            "event": "message.sent",
            "request_id": frame.get("request_id"),
            "conversation_id": conversation.id,
            "duplicate": not created,
            "message": messaging.serialize_message(message, for_user_id=self.user.id),
        })

    def _action_typing(self, frame):
        conversation_id = self._conversation_id(frame)
        messaging.get_conversation_for(conversation_id, self.user)
        is_typing = bool(frame.get("is_typing"))
        now = time.monotonic()
        # Only "still typing" is throttled. Stopping is the one transition the
        # other side cannot infer on its own — dropping it leaves the UI showing
        # "typing…" until its local timeout expires.
        if is_typing and now - self.last_typing_at < TYPING_MIN_INTERVAL_SECONDS:
            return  # silently coalesce: typing is advisory, and the client retries
        self.last_typing_at = now
        messaging.emit_conversation(
            conversation_id,
            "typing.update",
            user_id=self.user.id,
            name=self.user.get_full_name() or self.user.username,
            is_typing=is_typing,
        )

    def _action_read(self, frame):
        conversation_id = self._conversation_id(frame)
        conversation = messaging.get_conversation_for(conversation_id, self.user)
        messaging.mark_read(conversation, self.user, upto_seq=self._seq(frame))
        self._send({
            "event": "read.ack",
            "conversation_id": conversation.id,
            "unread": messaging.unread_total(self.user),
        })

    def _action_delivered(self, frame):
        conversation_id = self._conversation_id(frame)
        conversation = messaging.get_conversation_for(conversation_id, self.user)
        messaging.mark_delivered(conversation, self.user, upto_seq=self._seq(frame))
        self._send({"event": "delivered.ack", "conversation_id": conversation.id})

    def _action_sync(self, frame):
        """
        Catch up after a reconnect.

        The client keeps the highest `seq` it rendered; asking for everything
        above it means a socket that dropped mid-conversation reconciles with
        one frame instead of re-reading the whole thread — and, with the
        client_reference on each row, without duplicating what it already has.
        """
        conversation_id = self._conversation_id(frame)
        conversation = messaging.get_conversation_for(conversation_id, self.user)
        since = frame.get("since_seq") or 0
        rows = (
            Message.objects.filter(conversation=conversation, seq__gt=int(since))
            .select_related("sender")
            .order_by("seq")[:SYNC_PAGE_SIZE]
        )
        self._send({
            "event": "messages.sync",
            "conversation_id": conversation.id,
            "since_seq": int(since),
            "messages": [
                messaging.serialize_message(row, for_user_id=self.user.id)
                for row in rows
            ],
        })

    def _action_presence_ping(self, frame):
        """
        Keep-alive. Refreshes presence *and* the live-view markers.

        A client that has a thread open sends this every ~25 seconds, which is
        what keeps "do not notify someone who is already reading" true for a
        conversation that stays open for an hour.
        """
        messaging.presence_heartbeat(self.user)
        if self.conversations_open:
            for conversation in messaging.Conversation.objects.filter(
                pk__in=self.conversations_open
            ):
                messaging.set_viewing(conversation, self.user, active=True)
        self._send({"event": "pong", "server_time": timezone.now().isoformat()})

    # -- outbound (channel layer) -----------------------------------------

    def conversation_event(self, event):
        """
        A thread event from a conversation group.

        Forwarded only when this connection subscribed to that conversation.
        That is the second half of the authorization story: even if some future
        code path published to the wrong group, a socket that never proved
        membership never sees the content.
        """
        conversation_id = event.get("conversation_id")
        if conversation_id is None:
            return
        if int(conversation_id) not in self.conversations_open:
            return
        # A membership revoked mid-session stops here as well as on write.
        conversation = messaging.Conversation.objects.filter(
            pk=conversation_id
        ).first()
        if conversation is None or not messaging.is_member(conversation, self.user):
            self.conversations_open.discard(int(conversation_id))
            return
        payload = {k: v for k, v in event.items() if k != "type"}
        self.send(text_data=json.dumps(payload))

    def inbox_event(self, event):
        """An event addressed to this user personally — badge, inbox, bell."""
        payload = {k: v for k, v in event.items() if k != "type"}
        self.send(text_data=json.dumps(payload))

    def presence_event(self, event):
        payload = {k: v for k, v in event.items() if k != "type"}
        self.send(text_data=json.dumps(payload))

    # -- helpers -----------------------------------------------------------

    def _conversation_id(self, frame):
        raw = frame.get("conversation_id")
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise messaging.MessagingInvalid("conversation_id must be an integer.")

    def _seq(self, frame):
        raw = frame.get("upto_seq")
        if raw in (None, ""):
            return None
        try:
            return max(int(raw), 0)
        except (TypeError, ValueError):
            raise messaging.MessagingInvalid("upto_seq must be an integer.")

    def _send(self, payload):
        self.send(text_data=json.dumps(payload))

    def _send_error(self, code, message, request_id=None, retry_after=None):
        payload = {"event": "error", "code": code, "message": message}
        if request_id is not None:
            payload["request_id"] = request_id
        if retry_after is not None:
            payload["retry_after"] = retry_after
        try:
            self.send(text_data=json.dumps(payload))
        except StopConsumer:
            raise
        except Exception:  # noqa: BLE001 - nothing to report to a dead socket
            logger.debug("TRACK: could not report a socket error", exc_info=True)
