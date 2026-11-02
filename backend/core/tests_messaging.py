"""
TRACK — messaging tests.

Run from the backend folder:
    python manage.py test core.tests_messaging

Three layers, deliberately separated:

  * the policy module (`core.messaging`) is tested directly, because that is
    where who-may-talk-to-whom lives;
  * the REST API is tested through real requests, because the views are a thin
    translation layer and a mistake there is a wrong status code for a user;
  * the WebSocket side is driven with Channels' own `WebsocketCommunicator`
    against `config.asgi.application`, so routing, the handshake middleware and
    the consumer are exercised as they are deployed — not as stubs.

Nothing here mocks a user, a message or a permission: every assertion is about
rows written and frames actually received.
"""

import asyncio
import json
import os
import uuid
from datetime import timedelta
from unittest import mock

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.exceptions import DenyConnection
from channels.testing import WebsocketCommunicator
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token

from config.asgi import application

from . import messaging
from . import push as push_delivery
from . import websocket_auth
from .models import (
    Conversation,
    ConversationMember,
    Department,
    Message,
    Notification,
    ParentProfile,
    PushSubscription,
    StudentProfile,
    User,
    UserPresence,
    UserMessagingSettings,
    WebSocketTicket,
)
from .tests import TrackTestCase

WS_PATH = "/api/ws/messaging/"


def extra_user(username, role, first_name="Extra", last_name="User", **kwargs):
    return User.objects.create_user(
        username=username,
        password="pass-Msg1234",
        role=role,
        first_name=first_name,
        last_name=last_name,
        **kwargs,
    )


class MessagingFixture(TrackTestCase):
    """Adds the people the reachability rules need: a classmate, an orphan parent."""

    @classmethod
    def setUpClass(cls):
        # `setUpTestData` is not inherited — the shared fixture is built by the
        # parent's own `setUpClass`, so the extras are added after that call.
        super().setUpClass()
        cls.student3_user = extra_user(
            "t_student3", User.Role.STUDENT, "Nina", "Neighbour"
        )
        cls.student3 = StudentProfile.objects.create(
            user=cls.student3_user, section=cls.section_a, lrn="100000000003"
        )
        cls.parent2 = extra_user("t_parent2", User.Role.PARENT, "Paul", "Parent2")
        cls.parent2_profile = ParentProfile.objects.create(user=cls.parent2)
        cls.parent2_profile.children.add(cls.student2)

    def login(self, user):
        """Session login for accounts the shared fixture's password table lacks."""
        self.client.force_login(user)
        return self.client


# ---------------------------------------------------------------------------
# Reachability
# ---------------------------------------------------------------------------

class ReachabilityTests(MessagingFixture):
    def test_admin_reaches_every_active_account(self):
        for target in (self.teacher1, self.student1_user, self.parent):
            allowed, _ = messaging.can_message(self.admin, target)
            self.assertTrue(allowed, target.username)

    def test_teachers_may_message_each_other(self):
        allowed, _ = messaging.can_message(self.teacher1, self.teacher2)
        self.assertTrue(allowed)

    def test_teacher_reaches_student_only_in_own_section(self):
        allowed, _ = messaging.can_message(self.teacher1, self.student1_user)
        self.assertTrue(allowed)
        allowed, reason = messaging.can_message(self.teacher1, self.student2_user)
        self.assertFalse(allowed)
        self.assertIn("own classes", reason)

    def test_teacher_reaches_parent_only_of_own_section_students(self):
        allowed, _ = messaging.can_message(self.teacher1, self.parent)
        self.assertTrue(allowed)
        allowed, _ = messaging.can_message(self.teacher1, self.parent2)
        self.assertFalse(allowed)

    def test_students_reach_classmates_only(self):
        allowed, _ = messaging.can_message(self.student1_user, self.student3_user)
        self.assertTrue(allowed)
        allowed, reason = messaging.can_message(self.student1_user, self.student2_user)
        self.assertFalse(allowed)
        self.assertIn("same section", reason)

    def test_parent_reaches_own_child_and_not_another_child(self):
        allowed, _ = messaging.can_message(self.parent, self.student1_user)
        self.assertTrue(allowed)
        allowed, reason = messaging.can_message(self.parent, self.student2_user)
        self.assertFalse(allowed)
        self.assertIn("own children", reason)

    def test_parents_cannot_message_each_other(self):
        allowed, reason = messaging.can_message(self.parent, self.parent2)
        self.assertFalse(allowed)
        self.assertIn("cannot message each other", reason)

    def test_student_cannot_message_a_parent_of_a_classmate(self):
        allowed, _ = messaging.can_message(self.student1_user, self.parent2)
        self.assertFalse(allowed)

    def test_nobody_messes_self(self):
        allowed, _ = messaging.can_message(self.teacher1, self.teacher1)
        self.assertFalse(allowed)

    def test_deactivated_account_is_unreachable(self):
        ghost = extra_user("t_ghost", User.Role.STUDENT, "Gone", "Away")
        allowed, _ = messaging.can_message(self.admin, ghost)
        self.assertTrue(allowed)
        ghost.is_active = False
        ghost.save(update_fields=["is_active"])
        allowed, reason = messaging.can_message(self.admin, ghost)
        self.assertFalse(allowed)
        self.assertIn("not active", reason)

    def test_advisor_reaches_their_section(self):
        self.section_b.adviser = self.teacher1
        self.section_b.save(update_fields=["adviser"])
        allowed, _ = messaging.can_message(self.teacher1, self.student2_user)
        self.assertTrue(allowed)


# ---------------------------------------------------------------------------
# Threads and membership
# ---------------------------------------------------------------------------

class ConversationTests(MessagingFixture):
    def test_direct_thread_is_created_once_per_pair(self):
        first, created = messaging.open_direct_conversation(
            self.teacher1, self.student1_user
        )
        self.assertTrue(created)
        second, recreated = messaging.open_direct_conversation(
            self.student1_user, self.teacher1
        )
        self.assertFalse(recreated)
        self.assertEqual(first.id, second.id)
        self.assertEqual(Conversation.objects.filter(kind="direct").count(), 1)

    def test_direct_thread_between_unreachable_people_is_refused(self):
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.open_direct_conversation(self.student1_user, self.student2_user)

    def test_group_creation_requires_staff(self):
        self.assertTrue(messaging.can_create_group(self.teacher1, Conversation.Kind.GROUP))
        self.assertTrue(messaging.can_create_group(self.admin, Conversation.Kind.GROUP))
        self.assertFalse(
            messaging.can_create_group(self.student1_user, Conversation.Kind.GROUP)
        )
        self.assertFalse(messaging.can_create_group(self.parent, Conversation.Kind.GROUP))

    def test_group_membership_is_checked_person_by_person(self):
        conversation = messaging.create_group_conversation(
            self.teacher1,
            Conversation.Kind.GROUP,
            "Quiz bowl",
            member_ids=[self.student1_user.id, self.student3_user.id],
        )
        self.assertEqual(conversation.members.count(), 3)
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.create_group_conversation(
                self.teacher1,
                Conversation.Kind.GROUP,
                "Mixed",
                member_ids=[self.student2_user.id],
            )

    def test_class_thread_membership_is_derived(self):
        conversation = messaging.create_group_conversation(
            self.teacher1, Conversation.Kind.CLASS, "Sampaguita", section=self.section_a
        )
        members = set(conversation.members.values_list("user_id", flat=True))
        self.assertEqual(
            members,
            {self.teacher1.id, self.student1_user.id, self.student3_user.id, self.parent.id},
        )
        self.assertNotIn(self.student2_user.id, members)
        self.assertNotIn(self.teacher2.id, members)

    def test_class_thread_follows_a_section_transfer(self):
        conversation = messaging.create_group_conversation(
            self.teacher1, Conversation.Kind.CLASS, "Sampaguita", section=self.section_a
        )
        self.student2.section = self.section_a
        self.student2.save(update_fields=["section"])
        added, removed = messaging.sync_structural_members(conversation)
        self.assertIn(self.student2_user.id, added)
        self.assertEqual(removed, [])
        # And the reverse: move them back out again.
        self.student2.section = self.section_b
        self.student2.save(update_fields=["section"])
        _added, removed = messaging.sync_structural_members(conversation)
        self.assertIn(self.student2_user.id, removed)

    def test_department_thread_holds_that_departments_administrators(self):
        registrar = Department.objects.create(name="Registrar", code="REGISTRAR-TEST")
        registrar.administrators.add(self.admin, self.teacher1)
        conversation = messaging.create_group_conversation(
            self.admin,
            Conversation.Kind.DEPARTMENT,
            "Registrar",
            department=registrar,
        )
        self.assertEqual(
            set(conversation.members.values_list("user_id", flat=True)),
            {self.admin.id, self.teacher1.id},
        )

    def test_only_members_can_load_a_conversation(self):
        conversation = messaging.open_direct_conversation(
            self.teacher1, self.student1_user
        )[0]
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.get_conversation_for(conversation.id, self.teacher2)
        with self.assertRaises(messaging.MessagingNotFound):
            messaging.get_conversation_for(999999, self.teacher1)

    def test_revoked_member_loses_access_immediately(self):
        conversation = messaging.create_group_conversation(
            self.teacher1,
            Conversation.Kind.GROUP,
            "Field trip",
            member_ids=[self.student1_user.id],
        )
        messaging.get_conversation_for(conversation.id, self.student1_user)
        messaging.remove_member(conversation, self.student1_user)
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.get_conversation_for(conversation.id, self.student1_user)

    def test_admin_broadcast_key_allows_posting_into_a_class_thread(self):
        conversation = messaging.create_group_conversation(
            self.teacher2, Conversation.Kind.CLASS, "Gumamela", section=self.section_b
        )
        self.assertFalse(messaging.is_member(conversation, self.admin))
        messaging.assert_can_post(conversation, self.admin)  # super admin holds the key
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.assert_can_post(conversation, self.parent)

    def test_archived_thread_refuses_posts_but_keeps_history(self):
        conversation = messaging.open_direct_conversation(
            self.teacher1, self.student1_user
        )[0]
        messaging.post_message(conversation, self.teacher1, "Before the archive")
        conversation.is_archived = True
        conversation.save(update_fields=["is_archived"])
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.post_message(conversation, self.teacher1, "After")
        self.assertEqual(conversation.messages.count(), 1)

    def test_structural_threads_are_unique_per_section(self):
        messaging.create_group_conversation(
            self.teacher1, Conversation.Kind.CLASS, "Sampaguita", section=self.section_a
        )
        self.assertEqual(
            Conversation.objects.filter(
                kind=Conversation.Kind.CLASS, section=self.section_a, is_archived=False
            ).count(),
            1,
        )


# ---------------------------------------------------------------------------
# Posting, markers, unread
# ---------------------------------------------------------------------------

class MessageTests(MessagingFixture):
    def setUp(self):
        super().setUp()
        self.thread = messaging.open_direct_conversation(
            self.teacher1, self.student1_user
        )[0]

    def test_seq_is_monotonic_per_conversation(self):
        other = messaging.open_direct_conversation(
            self.teacher1, self.student3_user
        )[0]
        for text in ("one", "two", "three"):
            messaging.post_message(self.thread, self.teacher1, text)
        for text in ("a", "b"):
            messaging.post_message(other, self.teacher1, text)
        self.assertEqual(
            [m.seq for m in self.thread.messages.order_by("seq")], [1, 2, 3]
        )
        self.assertEqual([m.seq for m in other.messages.order_by("seq")], [1, 2])

    def test_body_is_normalised_and_bounded(self):
        message, _ = messaging.post_message(
            self.thread, self.teacher1, "  hello  \r\nworld   "
        )
        # Ends trimmed and line endings unified, interior spacing left alone: a
        # student pasting a list or an indent should not have it mangled.
        self.assertEqual(message.body, "hello  \nworld")
        for bad in ("", "   ", None):
            with self.assertRaises(messaging.MessagingInvalid):
                messaging.post_message(self.thread, self.teacher1, bad)
        with self.assertRaises(messaging.MessagingInvalid):
            messaging.post_message(self.thread, self.teacher1, "x" * (messaging.MAX_BODY_LENGTH + 1))

    def test_non_member_cannot_post(self):
        with self.assertRaises(messaging.MessagingForbidden):
            messaging.post_message(self.thread, self.student2_user, "let me in")

    def test_client_reference_makes_a_retry_idempotent(self):
        reference = str(uuid.uuid4())
        first, created = messaging.post_message(
            self.thread, self.teacher1, "retried send", client_reference=reference
        )
        self.assertTrue(created)
        second, recreated = messaging.post_message(
            self.thread, self.teacher1, "retried send", client_reference=reference
        )
        self.assertFalse(recreated)
        self.assertEqual(first.id, second.id)
        self.assertEqual(self.thread.messages.count(), 1)

    def test_client_reference_must_be_a_uuid(self):
        with self.assertRaises(messaging.MessagingInvalid):
            messaging.post_message(
                self.thread, self.teacher1, "hi", client_reference="not-a-uuid"
            )

    def test_rate_limit_blocks_a_flood(self):
        with mock.patch.object(messaging, "RATE_LIMIT_PER_WINDOW", 2):
            messaging.post_message(self.thread, self.teacher1, "1")
            messaging.post_message(self.thread, self.teacher1, "2")
            with self.assertRaises(messaging.MessagingRateLimited) as caught:
                messaging.post_message(self.thread, self.teacher1, "3")
            self.assertEqual(caught.exception.status, 429)
            self.assertEqual(caught.exception.retry_after, messaging.RATE_WINDOW_SECONDS)

    def test_unread_counts_ignore_my_own_messages(self):
        messaging.post_message(self.thread, self.teacher1, "homework posted")
        messaging.post_message(self.thread, self.teacher1, "reminder")
        member = messaging.membership(self.thread, self.student1_user)
        self.assertEqual(member.unread_count(), 2)
        self.assertEqual(messaging.unread_total(self.student1_user), 2)
        self.assertEqual(messaging.unread_total(self.teacher1), 0)

    def test_delivery_marker_moves_forward_only(self):
        for text in ("a", "b", "c"):
            messaging.post_message(self.thread, self.teacher1, text)
        self.assertTrue(messaging.mark_delivered(self.thread, self.student1_user))
        member = messaging.membership(self.thread, self.student1_user)
        self.assertEqual(member.last_delivered_message.seq, 3)
        # An older marker arriving late (a reload of a stale tab) must not regress.
        self.assertFalse(messaging.mark_delivered(self.thread, self.student1_user, upto_seq=1))
        self.assertEqual(
            messaging.membership(self.thread, self.student1_user).last_delivered_message.seq, 3
        )

    def test_read_marker_clears_unread_and_bell_items(self):
        messaging.post_message(self.thread, self.teacher1, "see me")
        self.assertEqual(Notification.objects.filter(recipient=self.student1_user).count(), 1)
        messaging.mark_read(self.thread, self.student1_user)
        self.assertEqual(messaging.unread_total(self.student1_user), 0)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.student1_user, is_read=False
            ).count(),
            0,
        )

    def test_reading_my_own_message_does_not_emit_a_receipt(self):
        messaging.post_message(self.thread, self.teacher1, "note to self")
        before = ConversationMember.objects.filter(
            conversation=self.thread, user=self.student1_user
        ).values_list("last_read_message_id", flat=True)[0]
        messaging.mark_read(self.thread, self.teacher1)
        after = ConversationMember.objects.filter(
            conversation=self.thread, user=self.student1_user
        ).values_list("last_read_message_id", flat=True)[0]
        self.assertEqual(before, after)

    def test_member_status_reports_the_newest_message(self):
        group = messaging.create_group_conversation(
            self.teacher1,
            Conversation.Kind.GROUP,
            "Parents help",
            member_ids=[self.student1_user.id, self.student3_user.id],
        )
        messaging.post_message(group, self.teacher1, "who is coming?")
        status = messaging.member_status(group)
        self.assertEqual(status, {"delivered": 0, "read": 0, "total": 2, "of_newest": 1})
        messaging.mark_delivered(group, self.student1_user)
        messaging.mark_read(group, self.student3_user)
        status = messaging.member_status(group)
        self.assertEqual((status["delivered"], status["read"]), (2, 1))

    def test_live_view_marker_expires(self):
        messaging.set_viewing(self.thread, self.student1_user, active=True)
        self.assertTrue(messaging.is_viewing(self.thread, self.student1_user.id))
        ConversationMember.objects.filter(
            conversation=self.thread, user=self.student1_user
        ).update(viewing_since=timezone.now() - timedelta(seconds=120))
        self.assertFalse(messaging.is_viewing(self.thread, self.student1_user.id))
        messaging.set_viewing(self.thread, self.student1_user, active=False)
        self.assertFalse(messaging.is_viewing(self.thread, self.student1_user.id))


class PresenceTests(MessagingFixture):
    def test_connection_count_drives_online_state(self):
        self.assertEqual(messaging.online_ids([self.teacher1.id]), set())
        messaging.presence_connect(self.teacher1)
        self.assertEqual(messaging.online_ids([self.teacher1.id]), {self.teacher1.id})
        row = UserPresence.objects.get(user=self.teacher1)
        self.assertEqual(row.open_connections, 1)
        # Two tabs, one person.
        messaging.presence_connect(self.teacher1)
        self.assertTrue(UserPresence.objects.get(user=self.teacher1).online)
        messaging.presence_disconnect(self.teacher1)
        self.assertTrue(UserPresence.objects.get(user=self.teacher1).online)
        messaging.presence_disconnect(self.teacher1)
        self.assertEqual(messaging.online_ids([self.teacher1.id]), set())
        self.assertIsNotNone(UserPresence.objects.get(user=self.teacher1).last_seen_at)

    def test_stale_row_is_not_reported_online(self):
        messaging.presence_connect(self.teacher2)
        UserPresence.objects.filter(user=self.teacher2).update(
            updated_at=timezone.now() - timedelta(seconds=UserPresence.STALE_SECONDS + 30)
        )
        self.assertEqual(messaging.online_ids([self.teacher2.id]), set())


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

class MessagingApiTests(MessagingFixture):
    def test_endpoints_require_authentication(self):
        for path in (
            "/api/messaging/conversations/",
            "/api/messaging/contacts/",
            "/api/messaging/summary/",
            "/api/messaging/settings/",
        ):
            response = self.client.get(path)
            self.assertIn(response.status_code, (401, 403), path)

    def test_start_direct_thread_and_see_it_in_the_list(self):
        self.login(self.teacher1)
        response = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        )
        self.assertEqual(response.status_code, 201, response.content)
        conversation_id = response.json()["id"]

        again = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        )
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(again.json()["id"], conversation_id)

        listed = self.client.get("/api/messaging/conversations/").json()
        row = listed["results"][0]
        self.assertEqual(row["id"], conversation_id)
        self.assertEqual(row["partner"]["full_name"], "Sara Student")
        self.assertIsNone(row["last_message"])

    def test_start_thread_with_unreachable_person_is_refused(self):
        self.login(self.student1_user)
        response = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student2_user.id},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "forbidden")

    def test_send_read_and_paginate_over_http(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        ).json()["id"]

        for index in range(1, 6):
            response = self.client.post(
                f"/api/messaging/conversations/{conversation_id}/messages/",
                {"body": f"message {index}"},
            )
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(response.json()["message"]["seq"], index)

        page = self.client.get(
            f"/api/messaging/conversations/{conversation_id}/messages/", {"limit": 2}
        ).json()
        self.assertEqual([m["body"] for m in page["messages"]], ["message 4", "message 5"])
        self.assertTrue(page["has_more"])
        self.assertEqual(page["oldest_seq"], 4)

        earlier = self.client.get(
            f"/api/messaging/conversations/{conversation_id}/messages/",
            {"limit": 2, "before_seq": page["oldest_seq"]},
        ).json()
        self.assertEqual([m["body"] for m in earlier["messages"]], ["message 2", "message 3"])

        resumed = self.client.get(
            f"/api/messaging/conversations/{conversation_id}/messages/",
            {"since_seq": 3},
        ).json()
        self.assertEqual([m["seq"] for m in resumed["messages"]], [4, 5])

        # A cursor is caller input, so a bad one is a 400 rather than the
        # unhandled int() TypeError it used to be.
        for cursor in ({"since_seq": "abc"}, {"before_seq": "1;drop"}, {"limit": "many"}):
            refused = self.client.get(
                f"/api/messaging/conversations/{conversation_id}/messages/", cursor
            )
            self.assertEqual(refused.status_code, 400, cursor)

    def test_duplicate_client_reference_over_http(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        ).json()["id"]
        reference = str(uuid.uuid4())
        url = f"/api/messaging/conversations/{conversation_id}/messages/"
        first = self.client.post(url, {"body": "retry me", "client_reference": reference})
        second = self.client.post(url, {"body": "retry me", "client_reference": reference})
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(first.json()["message"]["id"], second.json()["message"]["id"])
        self.assertEqual(Message.objects.filter(conversation_id=conversation_id).count(), 1)

    def test_message_validation_answers_400(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        ).json()["id"]
        url = f"/api/messaging/conversations/{conversation_id}/messages/"
        self.assertEqual(self.client.post(url, {"body": "   "}).status_code, 400)
        self.assertEqual(
            self.client.post(url, {"body": "x" * (messaging.MAX_BODY_LENGTH + 1)}).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(url, {"body": "hi", "client_reference": "nope"}).status_code, 400
        )

    def test_outsider_cannot_read_a_thread_by_guessing_its_id(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        ).json()["id"]
        self.login(self.teacher2)
        for path in (
            f"/api/messaging/conversations/{conversation_id}/",
            f"/api/messaging/conversations/{conversation_id}/messages/",
            f"/api/messaging/conversations/{conversation_id}/members/",
        ):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 403, path)
            self.assertEqual(response.json()["code"], "forbidden", path)
        posting = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/messages/", {"body": "hello?"}
        )
        self.assertEqual(posting.status_code, 403)

    def test_unread_and_read_markers_over_http(self):
        self.login(self.student1_user)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.teacher1.id},
        ).json()["id"]
        self.login(self.teacher1)
        self.client.post(
            f"/api/messaging/conversations/{conversation_id}/messages/", {"body": "hi"}
        )
        self.assertEqual(
            self.client.get("/api/messaging/summary/").json()["unread_total"], 0
        )

        self.login(self.student1_user)
        summary = self.client.get("/api/messaging/summary/").json()
        self.assertEqual(summary["unread_total"], 1)
        row = self.client.get("/api/messaging/conversations/").json()["results"][0]
        self.assertEqual(row["unread_count"], 1)

        read = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/read/", {}
        )
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.json()["unread_total"], 0)

        delivered = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/delivered/", {"upto_seq": 1}
        )
        self.assertEqual(delivered.status_code, 200)

    def test_thread_detail_exposes_members_and_receipts(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "group", "title": "Debate team",
             "member_ids": [self.student1_user.id]},
        ).json()["id"]
        self.client.post(
            f"/api/messaging/conversations/{conversation_id}/messages/", {"body": "practice?"}
        )
        detail = self.client.get(
            f"/api/messaging/conversations/{conversation_id}/"
        ).json()
        self.assertTrue(detail["can_post"])
        self.assertTrue(detail["can_manage_members"])
        self.assertEqual(detail["status"]["total"], 1)
        self.assertEqual(len(detail["members"]), 2)

        self.login(self.student1_user)
        student_view = self.client.get(f"/api/messaging/conversations/{conversation_id}/").json()
        self.assertFalse(student_view["can_manage_members"])
        by_id = {m["user_id"]: m for m in student_view["members"]}
        self.assertEqual(by_id[self.student1_user.id]["unread_count"], 1)
        # Another member's private unread state is not exposed.
        self.assertIsNone(by_id[self.teacher1.id]["unread_count"])

    def test_member_rows_carry_read_and_delivered_markers(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "group", "title": "Quiz squad",
             "member_ids": [self.student1_user.id]},
        ).json()["id"]
        for text in ("one", "two"):
            self.client.post(
                f"/api/messaging/conversations/{conversation_id}/messages/", {"body": text}
            )

        self.login(self.student1_user)

        def member_rows():
            detail = self.client.get(f"/api/messaging/conversations/{conversation_id}/").json()
            return {row["user_id"]: row for row in detail["members"]}

        before = member_rows()
        self.assertIsNone(before[self.student1_user.id]["last_delivered_seq"])
        self.assertIsNone(before[self.teacher1.id]["last_delivered_seq"])

        self.client.post(
            f"/api/messaging/conversations/{conversation_id}/delivered/", {"upto_seq": 1}
        )
        after_delivery = member_rows()
        self.assertEqual(after_delivery[self.student1_user.id]["last_delivered_seq"], 1)
        self.assertIsNone(after_delivery[self.student1_user.id]["last_read_seq"])

        # Reading implies having received, so one marker moving forward moves
        # both — and a screen may then show "Read" without waiting for a tick.
        self.client.post(
            f"/api/messaging/conversations/{conversation_id}/read/", {"upto_seq": 2}
        )
        after_read = member_rows()
        self.assertEqual(after_read[self.student1_user.id]["last_delivered_seq"], 2)
        self.assertEqual(after_read[self.student1_user.id]["last_read_seq"], 2)

    def test_member_management_follows_role_rules(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "group", "title": "Chess club",
             "member_ids": [self.student1_user.id]},
        ).json()["id"]
        added = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/members/",
            {"user_ids": [self.student3_user.id, self.student2_user.id]},
        )
        self.assertEqual(added.status_code, 200)
        self.assertEqual(added.json()["added"], [self.student3_user.id])
        self.assertEqual(added.json()["rejected"][0]["user_id"], self.student2_user.id)

        self.login(self.student1_user)
        refused = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/members/",
            {"user_ids": [self.student2_user.id]},
        )
        self.assertEqual(refused.status_code, 403)
        # …but a member may always leave.
        left = self.client.delete(
            f"/api/messaging/conversations/{conversation_id}/members/",
            {"user_id": self.student1_user.id},
        )
        self.assertEqual(left.status_code, 200)
        self.assertEqual(left.json()["removed"], [self.student1_user.id])

    def test_cannot_add_participants_to_a_direct_thread(self):
        self.login(self.admin)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        ).json()["id"]
        response = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/members/",
            {"user_ids": [self.teacher2.id]},
        )
        self.assertEqual(response.status_code, 400)

    def test_class_and_department_threads_are_created_from_structure(self):
        self.login(self.teacher1)
        allowed = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "class", "title": "Sampaguita", "section_id": self.section_a.id},
        )
        self.assertEqual(allowed.status_code, 201, allowed.content)
        self.assertEqual(len(allowed.json()["members"]), 4)

        wrong_class = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "class", "title": "Gumamela", "section_id": self.section_b.id},
        )
        self.assertEqual(wrong_class.status_code, 403)

        self.login(self.student1_user)
        refused = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "class", "title": "Sampaguita", "section_id": self.section_a.id},
        )
        self.assertEqual(refused.status_code, 403)

        self.login(self.admin)
        registrar = Department.objects.create(name="Registrar", code="REGISTRAR-API")
        registrar.administrators.add(self.admin)
        department_thread = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "department", "title": "Registrar", "department_id": registrar.id},
        )
        self.assertEqual(department_thread.status_code, 201, department_thread.content)
        self.assertEqual(len(department_thread.json()["members"]), 1)

    def test_options_offers_only_what_the_role_may_do(self):
        self.login(self.teacher1)
        with mock.patch.object(push_delivery, "vapid_public_key", return_value=None):
            payload = self.client.get("/api/messaging/options/").json()
        self.assertTrue(payload["can_create_group"])
        self.assertEqual([s["id"] for s in payload["sections"]], [self.section_a.id])
        self.assertEqual(payload["departments"], [])
        self.assertIsNone(payload["vapid_public_key"])

        self.login(self.student1_user)
        payload = self.client.get("/api/messaging/options/").json()
        self.assertFalse(payload["can_create_group"])

        self.login(self.admin)
        payload = self.client.get("/api/messaging/options/").json()
        self.assertGreaterEqual(len(payload["departments"]), 1)
        # A teacher may not pick a class they do not teach.
        self.login(self.teacher2)
        payload = self.client.get("/api/messaging/options/").json()
        self.assertEqual([s["id"] for s in payload["sections"]], [self.section_b.id])

    def test_contacts_are_the_reachable_people(self):
        self.login(self.teacher1)
        ids = {row["id"] for row in self.client.get("/api/messaging/contacts/").json()}
        self.assertEqual(
            ids,
            {
                self.teacher2.id,
                self.student1_user.id,
                self.student3_user.id,
                self.parent.id,
                self.admin.id,
            },
        )

        self.login(self.student1_user)
        ids = {row["id"] for row in self.client.get("/api/messaging/contacts/").json()}
        self.assertEqual(
            ids, {self.student3_user.id, self.teacher1.id, self.parent.id}
        )

        self.login(self.parent)
        ids = {row["id"] for row in self.client.get("/api/messaging/contacts/").json()}
        self.assertEqual(ids, {self.student1_user.id, self.teacher1.id})

    def test_search_matches_thread_people_and_text(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "group", "title": "Science fair",
             "member_ids": [self.student1_user.id]},
        ).json()["id"]
        self.client.post(
            f"/api/messaging/conversations/{conversation_id}/messages/",
            {"body": "bring volcano materials"},
        )
        for term in ("science", "Sara", "volcano"):
            results = self.client.get(
                "/api/messaging/conversations/", {"q": term}
            ).json()["results"]
            self.assertEqual([r["id"] for r in results], [conversation_id], term)
        none = self.client.get("/api/messaging/conversations/", {"q": "marching band"}).json()
        self.assertEqual(none["results"], [])

    def test_archive_stops_posting_for_everyone(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "group", "title": "Yearbook",
             "member_ids": [self.student1_user.id]},
        ).json()["id"]
        archived = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/archive/",
            {"is_archived": True},
        )
        self.assertEqual(archived.json(), {"is_archived": True})
        refused = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/messages/", {"body": "one more"}
        )
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(
            self.client.get("/api/messaging/conversations/").json()["results"], []
        )
        self.login(self.student1_user)
        # The thread is archived, not deleted: a member can still read history.
        reopened = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/archive/",
            {"is_archived": False},
        )
        self.assertEqual(reopened.status_code, 403)  # only managers may reopen

    def test_member_can_resync_a_class_thread(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "class", "title": "Sampaguita", "section_id": self.section_a.id},
        ).json()["id"]
        self.student2.section = self.section_a
        self.student2.save(update_fields=["section"])
        response = self.client.post(
            f"/api/messaging/conversations/{conversation_id}/sync-members/"
        )
        # The moved student joins, and so does that student's parent — a class
        # thread carries the supervision graph, not only the roster.
        self.assertEqual(
            response.json()["added"],
            sorted([self.student2_user.id, self.parent2.id]),
        )
        self.login(self.student1_user)
        self.assertEqual(
            self.client.post(
                f"/api/messaging/conversations/{conversation_id}/sync-members/"
            ).status_code,
            403,
        )

    def test_message_rate_limit_answers_429(self):
        self.login(self.teacher1)
        conversation_id = self.client.post(
            "/api/messaging/conversations/",
            {"kind": "direct", "target_user_id": self.student1_user.id},
        ).json()["id"]
        url = f"/api/messaging/conversations/{conversation_id}/messages/"
        with mock.patch.object(messaging, "RATE_LIMIT_PER_WINDOW", 2):
            self.assertEqual(self.client.post(url, {"body": "1"}).status_code, 201)
            self.assertEqual(self.client.post(url, {"body": "2"}).status_code, 201)
            response = self.client.post(url, {"body": "3"})
            self.assertEqual(response.status_code, 429, response.content)
            self.assertEqual(response.json()["code"], "rate_limited")

    def test_ticket_endpoint_issues_a_credential(self):
        self.login(self.teacher1)
        payload = self.client.post("/api/messaging/ws-ticket/").json()
        self.assertIn("ticket", payload)
        self.assertEqual(payload["expires_in"], websocket_auth.TICKET_TTL_SECONDS)
        self.assertEqual(payload["websocket_path"], WS_PATH)
        row = WebSocketTicket.objects.get(token=payload["ticket"])
        self.assertEqual(row.user_id, self.teacher1.id)

    def test_preferences_are_private_and_gate_notifications(self):
        self.login(self.student1_user)
        with mock.patch.object(push_delivery, "vapid_keys_configured", return_value=False):
            defaults = self.client.get("/api/messaging/settings/").json()
        self.assertTrue(defaults["notify_in_app"])
        self.assertFalse(defaults["notify_push"])
        self.assertFalse(defaults["push_available"])

        updated = self.client.put(
            "/api/messaging/settings/", {"notify_in_app": False}
        ).json()
        self.assertFalse(updated["notify_in_app"])
        self.assertEqual(
            UserMessagingSettings.objects.get(user=self.student1_user).notify_in_app, False
        )

    def test_push_subscription_endpoint_rules(self):
        self.login(self.teacher1)
        url = "/api/messaging/push/subscriptions/"
        body = {"endpoint": "https://push.example/x", "keys": {"p256dh": "a", "auth": "b"}}
        with mock.patch.object(push_delivery, "vapid_keys_configured", return_value=False):
            unavailable = self.client.post(url, body, format="json")
            self.assertEqual(unavailable.status_code, 503)
            self.assertFalse(
                self.client.get("/api/messaging/settings/").json()["push_available"]
            )

        with mock.patch.object(push_delivery, "vapid_keys_configured", return_value=True):
            bad_endpoint = self.client.post(
                url,
                {"endpoint": "http://push.example/x", "keys": {"p256dh": "a", "auth": "b"}},
                format="json",
            )
            self.assertEqual(bad_endpoint.status_code, 400)
            missing_keys = self.client.post(
                url, {"endpoint": "https://push.example/x"}, format="json"
            )
            self.assertEqual(missing_keys.status_code, 400)
            ok = self.client.post(url, body, format="json")
            self.assertEqual(ok.status_code, 201, ok.content)
            self.assertEqual(PushSubscription.objects.filter(user=self.teacher1).count(), 1)
            self.assertTrue(self.client.get("/api/messaging/settings/").json()["push_available"])
            dropped = self.client.delete(url, {"endpoint": "https://push.example/x"})
            self.assertEqual(dropped.json()["removed"], 1)
            self.assertEqual(PushSubscription.objects.count(), 0)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class MessageNotificationTests(MessagingFixture):
    def test_one_bell_item_per_recipient_with_a_link_back(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        message = messaging.post_message(thread, self.teacher1, "did you submit?")[0]
        row = Notification.objects.get(recipient=self.student1_user)
        self.assertEqual(row.notif_type, Notification.NotifType.MESSAGE_RECEIVED)
        self.assertEqual(row.message_id, message.id)
        self.assertEqual(row.title, "Tina Teacher")
        self.assertIn("did you submit", row.body)

    def test_group_bell_item_names_the_thread(self):
        group = messaging.create_group_conversation(
            self.teacher1,
            Conversation.Kind.GROUP,
            "Robotics",
            member_ids=[self.student1_user.id],
        )
        messaging.post_message(group, self.teacher1, "meeting moved")
        self.assertEqual(
            Notification.objects.get(recipient=self.student1_user).title,
            "Tina Teacher: Robotics",
        )

    def test_the_sender_is_never_notified(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        messaging.post_message(thread, self.teacher1, "hello")
        self.assertEqual(Notification.objects.filter(recipient=self.teacher1).count(), 0)

    def test_reading_in_another_thread_leaves_this_one_unread(self):
        first = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        second = messaging.open_direct_conversation(self.teacher1, self.student3_user)[0]
        messaging.post_message(first, self.teacher1, "one")
        messaging.post_message(second, self.teacher1, "two")
        messaging.mark_read(first, self.student1_user)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.student1_user, is_read=False
            ).count(),
            0,
        )
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.student3_user, is_read=False
            ).count(),
            1,
        )

    def test_a_member_who_is_reading_the_thread_is_not_disturbed(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        messaging.set_viewing(thread, self.student1_user, active=True)
        messaging.post_message(thread, self.teacher1, "you can see this already")
        self.assertEqual(Notification.objects.filter(recipient=self.student1_user).count(), 0)
        # The message itself is still stored and still counted as unread.
        self.assertEqual(thread.messages.count(), 1)
        self.assertEqual(messaging.unread_total(self.student1_user), 1)

    def test_in_app_notifications_can_be_turned_off(self):
        settings_row = messaging.settings_for(self.student1_user)
        settings_row.notify_in_app = False
        settings_row.save(update_fields=["notify_in_app"])
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        messaging.post_message(thread, self.teacher1, "quiet mode")
        self.assertEqual(Notification.objects.filter(recipient=self.student1_user).count(), 0)

    def test_push_is_off_by_default_and_only_carries_a_preview(self):
        sent = []
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        with mock.patch.object(
            push_delivery, "send_push",
            side_effect=lambda *a, **k: sent.append((a, k)),
        ):
            messaging.post_message(thread, self.teacher1, "hello")
            self.assertEqual(sent, [])

            settings_row = messaging.settings_for(self.student1_user)
            settings_row.notify_push = True
            settings_row.save(update_fields=["notify_push"])
            messaging.post_message(thread, self.teacher1, "hello again")
            self.assertEqual(len(sent), 1)
            args, kwargs = sent[0]
            self.assertEqual(args[0], self.student1_user)
            self.assertEqual(kwargs["url"], f"/messages/?conversation={thread.id}")

    def test_the_bell_serializes_a_message_row(self):
        """
        Regression: the bell 500-ed for anyone with a message notification.

        `Notification.message` is a foreign key, but the serializer declared it
        as an IntegerField bound to the field name, so DRF called `int()` on the
        Message row while rendering the *whole list* — one message broke every
        other item that user had.
        """
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        message = messaging.post_message(thread, self.teacher1, "did you submit?")[0]
        self.login(self.student1_user)

        response = self.client.get("/api/notifications/?page_size=100")
        self.assertEqual(response.status_code, 200)
        row = next(
            item for item in json.loads(response.content)["results"]
            if item["notif_type"] == "message_received"
        )
        self.assertEqual(row["message"], message.id)
        self.assertEqual(row["conversation"], thread.id)

    def test_a_non_message_notification_has_no_thread_pointers(self):
        """The two new keys are null for the older bell types, not absent."""
        Notification.objects.create(
            recipient=self.student1_user,
            notif_type=Notification.NotifType.ANNOUNCEMENT,
            title="Notice about the work Immersion site",
            body="Reporting schedule moved to Friday.",
        )
        self.login(self.student1_user)
        response = self.client.get("/api/notifications/?page_size=100")
        self.assertEqual(response.status_code, 200)
        row = next(
            item for item in json.loads(response.content)["results"]
            if item["title"] == "Notice about the work Immersion site"
        )
        self.assertIsNone(row["message"])
        self.assertIsNone(row["conversation"])

    def test_a_failed_notification_does_not_lose_the_message(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        with mock.patch(
            "core.notifications.notify_message_received",
            side_effect=RuntimeError("bell is on fire"),
        ):
            message, created = messaging.post_message(thread, self.teacher1, "still stored")
        self.assertTrue(created)
        self.assertEqual(thread.messages.count(), 1)
        self.assertEqual(message.body, "still stored")


class PushDeliveryTests(MessagingFixture):
    def test_send_is_skipped_without_vapid_keys(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertFalse(push_delivery.vapid_keys_configured())
            self.assertEqual(
                push_delivery.send_push(self.teacher1, "title", "body"), 0
            )

    def test_payload_carries_no_message_text(self):
        calls = []

        def fake_webpush(**kwargs):
            calls.append(kwargs)

        with mock.patch.dict(
            os.environ, {"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"}
        ):
            settings_row = messaging.settings_for(self.teacher1)
            settings_row.notify_push = True
            settings_row.save(update_fields=["notify_push"])
            push_delivery.register_subscription(
                self.teacher1, "https://push.example/one", "key", "secret"
            )
            with mock.patch("pywebpush.webpush", fake_webpush):
                delivered = push_delivery.send_push(
                    self.teacher1,
                    "Tina Teacher",
                    "a preview",
                    tag="track-conversation-1",
                    url="/messages/?conversation=1",
                )
        self.assertEqual(delivered, 1)
        payload = json.loads(calls[0]["data"])
        self.assertEqual(payload["tag"], "track-conversation-1")
        self.assertEqual(calls[0]["subscription_info"]["keys"]["auth"], "secret")

    def test_dead_endpoint_is_retired_and_transient_failures_are_counted(self):
        from pywebpush import WebPushException

        with mock.patch.dict(
            os.environ, {"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"}
        ):
            settings_row = messaging.settings_for(self.teacher1)
            settings_row.notify_push = True
            settings_row.save(update_fields=["notify_push"])

            subscription = push_delivery.register_subscription(
                self.teacher1, "https://push.example/dead", "key", "secret"
            )

            def gone(**kwargs):
                raise WebPushException(
                    "gone", response=mock.Mock(status_code=410)
                )

            with mock.patch("pywebpush.webpush", gone):
                push_delivery.send_push(self.teacher1, "title")
            self.assertFalse(PushSubscription.objects.filter(pk=subscription.pk).exists())

            subscription = push_delivery.register_subscription(
                self.teacher1, "https://push.example/flaky", "key", "secret"
            )

            def busy(**kwargs):
                raise WebPushException("busy", response=mock.Mock(status_code=500))

            with mock.patch("pywebpush.webpush", busy):
                for _ in range(push_delivery.MAX_FAILURES):
                    push_delivery.send_push(self.teacher1, "title")
            self.assertFalse(PushSubscription.objects.filter(pk=subscription.pk).exists())

    def test_same_endpoint_moves_to_the_newest_subscriber(self):
        first = push_delivery.register_subscription(
            self.teacher1, "https://push.example/shared", "k1", "s1"
        )
        second = push_delivery.register_subscription(
            self.student1_user, "https://push.example/shared", "k2", "s2"
        )
        self.assertEqual(first.pk, second.pk)
        second.refresh_from_db()
        self.assertEqual(second.user_id, self.student1_user.id)
        self.assertEqual(second.p256dh, "k2")


# ---------------------------------------------------------------------------
# Handshake credentials
# ---------------------------------------------------------------------------

class WebSocketAuthTests(MessagingFixture):
    def test_ticket_is_single_use(self):
        ticket = websocket_auth.issue_ticket(self.teacher1)
        user = websocket_auth._user_from_ticket(ticket.token)
        self.assertEqual(user, self.teacher1)
        self.assertIsNone(websocket_auth._user_from_ticket(ticket.token))

    def test_ticket_expires(self):
        ticket = websocket_auth.issue_ticket(self.teacher1)
        WebSocketTicket.objects.filter(pk=ticket.pk).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertIsNone(websocket_auth._user_from_ticket(ticket.token))

    def test_ticket_of_a_deactivated_account_is_refused(self):
        ticket = websocket_auth.issue_ticket(self.teacher1)
        self.teacher1.is_active = False
        self.teacher1.save(update_fields=["is_active"])
        self.assertIsNone(websocket_auth._user_from_ticket(ticket.token))

    def test_unknown_ticket_is_anonymous(self):
        self.assertIsNone(websocket_auth._user_from_ticket("nothing-here"))

    def test_query_parsing_prefers_the_ticket_then_the_token(self):
        ticket = websocket_auth.issue_ticket(self.teacher1)
        scope = {"query_string": f"ticket={ticket.token}".encode()}
        self.assertEqual(websocket_auth.resolve_user(scope), self.teacher1)

        token = Token.objects.create(user=self.student1_user)
        scope = {"query_string": f"token={token.key}".encode()}
        self.assertEqual(websocket_auth.resolve_user(scope), self.student1_user)

        # The legacy ASGI 2 key still works, and a junk value is anonymous.
        scope = {"url_query": b"ticket=nope"}
        self.assertFalse(websocket_auth.resolve_user(scope).is_authenticated)
        scope = {"query_string": b""}
        self.assertFalse(websocket_auth.resolve_user(scope).is_authenticated)

    def test_a_ticket_cannot_be_used_as_a_token(self):
        ticket = websocket_auth.issue_ticket(self.teacher1)
        scope = {"query_string": f"token={ticket.token}".encode()}
        self.assertFalse(websocket_auth.resolve_user(scope).is_authenticated)

    def test_origin_rules(self):
        self.assertTrue(websocket_auth.origin_is_allowed(None))
        self.assertTrue(websocket_auth.origin_is_allowed(""))
        self.assertFalse(websocket_auth.origin_is_allowed("null"))
        for allowed in websocket_auth._allowed_origins():
            self.assertTrue(websocket_auth.origin_is_allowed(allowed))
        self.assertFalse(websocket_auth.origin_is_allowed("https://evil.example"))

    def test_extra_origins_are_read_from_the_environment(self):
        with override_settings(TRACK_WS_ALLOWED_ORIGINS="https://other.example"):
            self.assertTrue(websocket_auth.origin_is_allowed("https://other.example"))
            self.assertFalse(websocket_auth.origin_is_allowed("https://nope.example"))
        self.assertFalse(websocket_auth.origin_is_allowed("https://other.example"))

    def test_consumer_closes_an_unauthenticated_handshake(self):
        connected, detail = async_to_sync(self._handshake)()
        self.assertFalse(connected)
        self.assertEqual(detail, 4401)

    def test_foreign_origin_is_refused(self):
        outcome = async_to_sync(self._handshake)(
            headers=[(b"origin", b"https://evil.example")]
        )
        self.assertIn(outcome, (False, "denied"))

    async def _handshake(self, headers=None):
        communicator = WebsocketCommunicator(application, WS_PATH, headers=headers or [])
        try:
            connected, detail = await communicator.connect(timeout=2)
        except DenyConnection:
            return "denied"
        if connected:
            await communicator.disconnect()
        return (connected, detail)


# ---------------------------------------------------------------------------
# The socket
# ---------------------------------------------------------------------------

class MessagingSocketTests(MessagingFixture):
    """
    Real handshakes against `config.asgi.application` — routing, the auth
    middleware and the consumer, exactly as deployed.

    Every scenario is a single coroutine driven on one event loop with all its
    sockets open at the same time, because "two simultaneous users" is the case
    that has to work. Nothing is stubbed: the frames asserted below are the
    frames the consumer actually sent.
    """

    def open_socket(self, user, token=False):
        """The path a client would dial: a ticket for browsers, a token for native."""
        if token:
            key, _ = Token.objects.get_or_create(user=user)
            return f"{WS_PATH}?token={key.key}"
        return f"{WS_PATH}?ticket={websocket_auth.issue_ticket(user).token}"

    def run_scenario(self, scenario):
        """
        Drive one coroutine with every socket it opens alive at the same time.

        The scenario's failure is what gets reported, always. Teardown errors are
        swallowed on purpose, including the ones that are not ``Exception``:
        ``asgiref``'s timeout helper cancels the *current task* when a read expires,
        so a lingering ``CancelledError`` can surface on the very next await — which
        would otherwise replace the real assertion in the report.
        """
        self._open = []

        async def wrapper():
            try:
                await scenario()
            finally:
                await self._close_sockets()

        async_to_sync(wrapper)()

    async def _close_sockets(self):
        for communicator in self._open:
            try:
                await communicator.disconnect(timeout=2)
            except BaseException:  # noqa: BLE001 - tidy-up never outranks the failure
                pass

    async def _orm(self, call, *args, **kwargs):
        """One synchronous ORM/domain call, run off the loop a scenario lives on."""
        return await database_sync_to_async(call)(*args, **kwargs)

    async def _read(self, communicator, timeout):
        """
        One frame, or ``None`` on a timeout — with the task left clean.

        A read that expires leaves a cancellation queued against this task;
        ``uncancel()`` withdraws it so the next await is not interrupted by the
        ghost of a timeout that already happened.
        """
        try:
            return await communicator.receive_output(timeout)
        except (TimeoutError, asyncio.TimeoutError):
            task = asyncio.current_task()
            if task is not None and hasattr(task, "uncancel"):
                task.uncancel()
            return None

    async def _connect(self, user, token=False):
        """
        Open one socket and return the communicator.

        The handshake frame it consumed on the way is kept as `.handshake` so a
        test can assert on it without juggling two objects per participant.
        """
        # Ticket minting and token lookup are ORM calls: this coroutine runs on
        # the event loop, so they go through the same wrapper the consumer uses.
        path = await database_sync_to_async(self.open_socket)(user, token)
        communicator = WebsocketCommunicator(application, path)
        connected, detail = await communicator.connect(timeout=3)
        self.assertTrue(connected, detail)
        self._open.append(communicator)
        communicator.handshake = await self._expect(communicator, "connected")
        return communicator

    async def _expect(self, communicator, event, within=12, timeout=3, **matches):
        """
        Read frames until `event` arrives — and, when given, until it carries
        these fields. Order is not asserted; a presence announcement from
        somebody else is a legitimate frame to sit through, not a failure.
        """
        seen = []
        for _ in range(within):
            message = await self._read(communicator, timeout)
            if message is None:
                break
            if message["type"] == "websocket.close":
                break
            if message["type"] != "websocket.send":
                continue
            payload = json.loads(message.get("text") or "{}")
            seen.append(payload.get("event"))
            if payload.get("event") != event:
                continue
            if all(payload.get(key) == value for key, value in matches.items()):
                return payload
        self.fail(f"never saw {event!r} {matches or ''}; frames received: {seen}")

    async def _expect_silence(self, communicator, for_seconds=0.3, ignore=("presence",)):
        """
        Assert nothing *meaningful* arrives.

        Presence is broadcast to every connected socket by design, so it is
        ignored here; what must not arrive is a thread event, an inbox event or
        a notification.

        This polls the queue instead of calling `receive_output`: that helper
        cancels the consumer task when its read expires, so listening for
        nothing that way would destroy the very socket being watched.
        """
        queue = communicator.output_queue
        deadline = asyncio.get_running_loop().time() + for_seconds
        while True:
            while not queue.empty():
                message = queue.get_nowait()
                if message["type"] == "websocket.send":
                    payload = json.loads(message.get("text") or "{}")
                    if payload.get("event") in ignore:
                        continue
                    self.fail(
                        f"received {payload.get('event')!r} "
                        "on a socket that should be blind"
                    )
                if message["type"] == "websocket.close":
                    self.fail("the socket was closed while it should have stayed quiet")
            if asyncio.get_running_loop().time() >= deadline:
                return
            await asyncio.sleep(0.02)

    async def _frame(self, communicator, frame):
        await communicator.send_json_to(frame)

    async def _subscribe(self, communicator, conversation_id):
        await self._frame(communicator, {"action": "subscribe", "conversation_id": conversation_id})
        return await self._expect(communicator, "subscribed")

    async def _post(self, communicator, conversation_id, body, **extra):
        await self._frame(
            communicator,
            {"action": "send", "conversation_id": conversation_id, "body": body, **extra},
        )

    # -- delivery -----------------------------------------------------------

    def test_two_people_exchange_messages_live(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            teacher = await self._connect(self.teacher1)
            student = await self._connect(self.student1_user)
            self.assertEqual(teacher.handshake["user_id"], self.teacher1.id)
            await self._subscribe(teacher, thread.id)
            await self._subscribe(student, thread.id)

            reference = str(uuid.uuid4())
            await self._post(
                teacher,
                thread.id,
                "can you hand it in today?",
                client_reference=reference,
                request_id="t1",
            )
            sent = await self._expect(teacher, "message.sent")
            self.assertEqual(sent["request_id"], "t1")
            self.assertFalse(sent["duplicate"])
            self.assertEqual(sent["message"]["seq"], 1)

            incoming = await self._expect(student, "message.new")
            self.assertEqual(incoming["message"]["body"], "can you hand it in today?")
            self.assertEqual(incoming["message"]["sender_name"], "Tina Teacher")
            await self._expect(student, "inbox.message")

            await self._post(student, thread.id, "yes, after class")
            reply = await self._expect(student, "message.sent")
            self.assertEqual(reply["message"]["seq"], 2)
            await self._expect(teacher, "message.new")

        self.run_scenario(scenario)
        self.assertEqual(
            [m.body for m in thread.messages.order_by("seq")],
            ["can you hand it in today?", "yes, after class"],
        )

    def test_three_people_in_a_class_thread_all_receive_one_copy(self):
        thread = messaging.create_group_conversation(
            self.teacher1, Conversation.Kind.CLASS, "Sampaguita", section=self.section_a
        )

        async def scenario():
            people = (self.teacher1, self.student1_user, self.student3_user)
            sockets = []
            for person in people:
                sockets.append(await self._connect(person))
            for socket in sockets:
                await self._subscribe(socket, thread.id)

            await self._post(sockets[0], thread.id, "class cancelled tomorrow")
            for socket in sockets:
                event = await self._expect(socket, "message.new")
                self.assertEqual(event["message"]["body"], "class cancelled tomorrow")
            # The students' list rows come from `inbox.message`, and the thread
            # copy from `message.new` — two different events, never two copies
            # of the same message in the open thread.
            for socket in sockets[1:]:
                await self._expect(socket, "inbox.message")

        self.run_scenario(scenario)
        self.assertEqual(thread.messages.count(), 1)

    def test_a_message_posted_over_http_arrives_live(self):
        """
        The claim that matters for a flaky client: the REST send and the socket
        send must produce the identical live event.
        """
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            await database_sync_to_async(self.login)(self.teacher1)
            communicator = await self._connect(self.student1_user)
            await self._subscribe(communicator, thread.id)
            # The test client is synchronous, so it runs in the same thread
            # Channels uses for consumer handlers — which is where the channel
            # layer hop to this loop happens.
            response = await database_sync_to_async(self.client.post)(
                f"/api/messaging/conversations/{thread.id}/messages/",
                {"body": "sent from the REST API"},
            )
            self.assertEqual(response.status_code, 201, response.content)
            event = await self._expect(communicator, "message.new")
            self.assertEqual(event["message"]["body"], "sent from the REST API")

        self.run_scenario(scenario)
        self.assertEqual(thread.messages.count(), 1)

    # -- typing, receipts, presence -----------------------------------------

    def test_typing_indicator_is_forwarded_and_coalesced(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            teacher = await self._connect(self.teacher1)
            student = await self._connect(self.student1_user)
            await self._subscribe(teacher, thread.id)
            await self._subscribe(student, thread.id)

            await self._frame(
                student, {"action": "typing", "conversation_id": thread.id, "is_typing": True}
            )
            event = await self._expect(teacher, "typing.update")
            self.assertTrue(event["is_typing"])
            self.assertEqual(event["name"], "Sara Student")

            # A second keystroke-level announcement inside the window is dropped.
            await self._frame(
                student, {"action": "typing", "conversation_id": thread.id, "is_typing": True}
            )
            await self._expect_silence(teacher, for_seconds=0.2)

            await self._frame(
                student, {"action": "typing", "conversation_id": thread.id, "is_typing": False}
            )
            stopped = await self._expect(teacher, "typing.update")
            self.assertFalse(stopped["is_typing"])

        self.run_scenario(scenario)

    def test_read_receipt_reaches_the_sender(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        messaging.post_message(thread, self.teacher1, "any questions?")

        async def scenario():
            teacher = await self._connect(self.teacher1)
            student = await self._connect(self.student1_user)
            await self._subscribe(teacher, thread.id)
            await self._subscribe(student, thread.id)

            await self._frame(
                student, {"action": "read", "conversation_id": thread.id, "upto_seq": 1}
            )
            ack = await self._expect(student, "read.ack")
            self.assertEqual(ack["unread"], 0)
            receipt = await self._expect(teacher, "message.read")
            self.assertEqual(receipt["user_id"], self.student1_user.id)
            self.assertEqual(receipt["seq"], 1)
            await self._expect(teacher, "conversation.read")
            self.assertEqual(
                await self._orm(messaging.member_status, thread),
                {"delivered": 1, "read": 1, "total": 1, "of_newest": 1},
            )

        self.run_scenario(scenario)

    def test_presence_flips_with_connections(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            teacher = await self._connect(self.teacher1)

            student = await self._connect(self.student1_user)
            arrival = await self._expect(
                teacher, "presence", user_id=student.handshake["user_id"], online=True
            )
            self.assertEqual(arrival["user_id"], self.student1_user.id)
            self.assertEqual(
                await database_sync_to_async(messaging.online_ids)([self.student1_user.id]),
                {self.student1_user.id},
            )

            # Opening a thread suppresses notifications for it while it is open.
            await self._subscribe(student, thread.id)
            member = await database_sync_to_async(messaging.membership)(thread, self.student1_user)
            self.assertIsNotNone(member.viewing_since)

            await student.disconnect(timeout=3)
            self._open.remove(student)
            departure = await self._expect(
                teacher, "presence", user_id=self.student1_user.id, online=False
            )
            self.assertFalse(departure["online"])

        self.run_scenario(scenario)

    def test_heartbeat_keeps_a_long_lived_thread_suppressed(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            student = await self._connect(self.student1_user)
            await self._subscribe(student, thread.id)

            def age_the_marker():
                ConversationMember.objects.filter(
                    conversation=thread, user=self.student1_user
                ).update(viewing_since=timezone.now() - timedelta(seconds=120))

            await self._orm(age_the_marker)
            await self._frame(student, {"action": "presence.ping"})
            await self._expect(student, "pong")
            self.assertTrue(
                await self._orm(messaging.is_viewing, thread, self.student1_user.id)
            )

        self.run_scenario(scenario)

    # -- reliability --------------------------------------------------------

    def test_reconnect_resumes_exactly_the_missed_messages(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        for text in ("one", "two", "three"):
            messaging.post_message(thread, self.teacher1, text)

        async def scenario():
            student = await self._connect(self.student1_user)
            subscribed = await self._subscribe(student, thread.id)
            self.assertEqual(subscribed["seq"], 3)

            await self._frame(
                student, {"action": "sync", "conversation_id": thread.id, "since_seq": 1}
            )
            caught_up = await self._expect(student, "messages.sync")
            self.assertEqual([m["seq"] for m in caught_up["messages"]], [2, 3])

            # The socket drops; while it is gone two more arrive.
            await student.disconnect(timeout=3)
            self._open.remove(student)
            for text in ("four", "five"):
                await database_sync_to_async(messaging.post_message)(thread, self.teacher1, text)

            reconnected = await self._connect(self.student1_user)
            await self._subscribe(reconnected, thread.id)
            await self._frame(
                reconnected, {"action": "sync", "conversation_id": thread.id, "since_seq": 3}
            )
            resumed = await self._expect(reconnected, "messages.sync")
            self.assertEqual([m["body"] for m in resumed["messages"]], ["four", "five"])

        self.run_scenario(scenario)
        self.assertEqual(thread.messages.count(), 5)

    def test_a_retry_over_the_socket_does_not_double_deliver(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]
        reference = str(uuid.uuid4())

        async def scenario():
            teacher = await self._connect(self.teacher1)
            student = await self._connect(self.student1_user)
            await self._subscribe(teacher, thread.id)
            await self._subscribe(student, thread.id)

            await self._post(
                teacher, thread.id, "lost the first response", client_reference=reference,
                request_id="first",
            )
            await self._expect(teacher, "message.sent")
            await self._expect(student, "message.new")
            # The list-row event from that first send is still in flight; the
            # silence below is about the retry, so drain it first.
            await self._expect(student, "inbox.message")

            await self._post(
                teacher, thread.id, "lost the first response", client_reference=reference,
                request_id="retry",
            )
            retry = await self._expect(teacher, "message.sent")
            self.assertTrue(retry["duplicate"])
            self.assertEqual(retry["request_id"], "retry")
            await self._expect_silence(student)

        self.run_scenario(scenario)
        self.assertEqual(thread.messages.count(), 1)

    def test_bad_frames_are_answered_without_dropping_the_socket(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            teacher = await self._connect(self.teacher1)

            await teacher.send_to(text_data="{not json at all")
            self.assertEqual((await self._expect(teacher, "error"))["code"], "invalid")

            await teacher.send_to(text_data="[1, 2, 3]")
            self.assertEqual((await self._expect(teacher, "error"))["code"], "invalid")

            await self._frame(teacher, {"action": "teleport"})
            self.assertEqual((await self._expect(teacher, "error"))["code"], "unknown_action")

            await self._post(teacher, thread.id, "   ")
            error = await self._expect(teacher, "error")
            self.assertEqual(error["code"], "invalid")
            self.assertIsNotNone(error.get("message"))

            await self._frame(teacher, {"action": "subscribe", "conversation_id": "abc"})
            self.assertEqual((await self._expect(teacher, "error"))["code"], "invalid")

            await self._frame(teacher, {"action": "read", "conversation_id": thread.id,
                                        "upto_seq": "wrong"})
            self.assertEqual((await self._expect(teacher, "error"))["code"], "invalid")

            # A binary frame is refused too, and the socket is still usable.
            await teacher.send_to(bytes_data=b"\x00\x01")
            self.assertEqual((await self._expect(teacher, "error"))["code"], "invalid")

            # Still alive: good frames work.
            await self._subscribe(teacher, thread.id)
            await self._post(teacher, thread.id, "the socket survived")
            await self._expect(teacher, "message.sent")

        self.run_scenario(scenario)
        self.assertEqual(thread.messages.count(), 1)

    def test_oversized_frame_is_refused(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            teacher = await self._connect(self.teacher1)
            await self._subscribe(teacher, thread.id)
            await self._frame(teacher, {"body": "x" * 40_000, "junk": "y" * 8_000})
            self.assertEqual((await self._expect(teacher, "error"))["code"], "too_large")
            await self._post(teacher, thread.id, "still fine")
            await self._expect(teacher, "message.sent")

        self.run_scenario(scenario)

    def test_socket_rate_limit_bounces_a_flood(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            teacher = await self._connect(self.teacher1)
            await self._subscribe(teacher, thread.id)
            with mock.patch.object(messaging, "RATE_LIMIT_PER_WINDOW", 2):
                await self._post(teacher, thread.id, "1", request_id="a")
                await self._expect(teacher, "message.sent")
                await self._post(teacher, thread.id, "2", request_id="b")
                await self._expect(teacher, "message.sent")
                await self._post(teacher, thread.id, "3", request_id="c")
                error = await self._expect(teacher, "error")
                self.assertEqual(error["code"], "rate_limited")
                self.assertEqual(error["request_id"], "c")
                self.assertEqual(error["retry_after"], messaging.RATE_WINDOW_SECONDS)

        self.run_scenario(scenario)
        self.assertEqual(thread.messages.count(), 2)

    # -- authorization ------------------------------------------------------

    def test_anonymous_handshake_is_refused(self):
        async def scenario():
            communicator = WebsocketCommunicator(application, WS_PATH)
            connected, detail = await communicator.connect(timeout=3)
            self.assertFalse(connected)
            self.assertEqual(detail, 4401)

        async_to_sync(scenario)()

    def test_a_stranger_cannot_subscribe_to_a_thread(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            stranger = await self._connect(self.teacher2)
            await self._frame(stranger, {"action": "subscribe", "conversation_id": thread.id})
            error = await self._expect(stranger, "error")
            self.assertEqual(error["code"], "forbidden")

            await self._post(stranger, thread.id, "am I in this group?")
            self.assertEqual((await self._expect(stranger, "error"))["code"], "forbidden")

            # …and the real members' traffic never reaches them.
            student = await self._connect(self.student1_user)
            await self._subscribe(student, thread.id)
            await database_sync_to_async(messaging.post_message)(thread, self.teacher1, "hi")
            await self._expect(student, "message.new")
            await self._expect_silence(stranger)

        self.run_scenario(scenario)

    def test_membership_revoked_mid_session_goes_dark(self):
        group = messaging.create_group_conversation(
            self.teacher1,
            Conversation.Kind.GROUP,
            "Study hall",
            member_ids=[self.student1_user.id],
        )

        async def scenario():
            student = await self._connect(self.student1_user)
            await self._subscribe(student, group.id)
            teacher = await self._connect(self.teacher1)
            await self._subscribe(teacher, group.id)

            await database_sync_to_async(messaging.remove_member)(group, self.student1_user)
            await self._post(teacher, group.id, "anyone here?")
            await self._expect(teacher, "message.sent")
            await self._expect_silence(student)

            # A revoked member cannot keep writing either.
            await self._post(student, group.id, "let me back in")
            self.assertEqual((await self._expect(student, "error"))["code"], "forbidden")

        self.run_scenario(scenario)
        self.assertFalse(messaging.is_member(group, self.student1_user))

    def test_a_non_member_cannot_reach_a_thread_group_by_name(self):
        """
        Group names are guessable (`conv.<id>`), so the consumer's own gate is
        what protects a socket: a frame published straight at the group must
        still be dropped for anyone who never proved membership.
        """
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            stranger = await self._connect(self.teacher2)
            await database_sync_to_async(messaging.emit_conversation)(
                thread.id, "message.new", message={"body": "sneak"}
            )
            await self._expect_silence(stranger)

            member = await self._connect(self.student1_user)
            await self._subscribe(member, thread.id)
            await database_sync_to_async(messaging.emit_conversation)(
                thread.id, "message.new", message={"body": "legit"}
            )
            event = await self._expect(member, "message.new")
            self.assertEqual(event["message"]["body"], "legit")

        self.run_scenario(scenario)

    def test_native_client_may_dial_with_its_api_token(self):
        thread = messaging.open_direct_conversation(self.teacher1, self.student1_user)[0]

        async def scenario():
            student = await self._connect(self.student1_user, token=True)
            subscribed = await self._subscribe(student, thread.id)
            self.assertEqual(subscribed["conversation_id"], thread.id)

        self.run_scenario(scenario)

    def test_forged_credentials_never_open_a_socket(self):
        async def scenario():
            for path in (
                WS_PATH,
                f"{WS_PATH}?ticket=not-a-real-ticket",
                f"{WS_PATH}?token=not-a-real-token",
                f"{WS_PATH}?ticket=&token=",
                f"{WS_PATH}?user_id=1",
            ):
                communicator = WebsocketCommunicator(application, path)
                connected, detail = await communicator.connect(timeout=3)
                self.assertFalse(connected, (path, detail))
                self.assertEqual(detail, 4401, path)

        async_to_sync(scenario)()

    def test_a_used_ticket_cannot_open_a_second_socket(self):
        path = self.open_socket(self.teacher1)

        async def scenario():
            first = WebsocketCommunicator(application, path)
            connected, _ = await first.connect(timeout=3)
            self.assertTrue(connected)
            self._open.append(first)

            second = WebsocketCommunicator(application, path)
            refused, detail = await second.connect(timeout=3)
            self.assertFalse(refused)
            self.assertEqual(detail, 4401)

            # The first socket keeps working — consuming a ticket is not a
            # logout, and one client's retry must not drop another's session.
            await self._frame(first, {"action": "presence.ping"})
            await self._expect(first, "pong")

        self.run_scenario(scenario)

