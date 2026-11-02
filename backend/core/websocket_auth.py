"""
TRACK — WebSocket handshake authentication.

A browser cannot set an ``Authorization`` header on a WebSocket, so the two
standard workarounds are the session cookie (ambient credentials: any page can
open the socket, which is a CSRF problem) or the API token in the query string
(tokens end up in access logs, browser history and proxies). TRACK does neither.

The client instead trades its token for a single-use, 30-second ticket over
normal authenticated HTTPS (`POST /api/messaging/ws-ticket/`), and the socket
presents only that ticket. It is bound to one user, dies on first use, and
expires within seconds — so a leaked value in a log line is worthless, and a
page cannot open a socket to someone else's session.

A raw DRF token is still accepted from the query string for non-browser
clients, because that is the same credential the Expo app already sends in a
header on every request. Resolution goes through DRF's own
``TokenAuthentication`` rather than a hand-rolled lookup, so token hashing and
the active-account check stay DRF's rules and not a copy of them.
"""

import logging
import secrets
from datetime import timedelta
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.exceptions import DenyConnection
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import WebSocketTicket

logger = logging.getLogger(__name__)

TICKET_TTL_SECONDS = 30

# Origins allowed to open a socket. In development the browser connects to the
# Vite dev server (which proxies the upgrade to Django), so its origin is not
# in ALLOWED_HOSTS — the CORS allow-list is the correct set of browsers here.
# Extend with TRACK_WS_ALLOWED_ORIGINS (comma-separated) for another host.
def _allowed_origins():
    origins = {
        origin.strip()
        for origin in (getattr(settings, "TRACK_WS_ALLOWED_ORIGINS", "") or "").split(",")
        if origin.strip()
    }
    origins.update(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
    origins.update(getattr(settings, "CSRF_TRUSTED_ORIGINS", []))
    return origins


def origin_is_allowed(origin):
    """
    True when this browser origin may connect.

    A missing Origin header is allowed: native apps (the Expo client) and
    non-browser tooling do not send one, and they carry a real credential.
    Browsers always send it, so a browser can only connect from a configured
    origin.
    """
    if origin is None or origin == "":
        return True
    if origin == "null":
        return False
    return origin in _allowed_origins()


def issue_ticket(user):
    """Create a single-use handshake ticket for an authenticated user."""
    now = timezone.now()
    # Tickets are short-lived by design, so pruning on issue keeps the table
    # from growing on a busy reconnect.
    WebSocketTicket.objects.filter(expires_at__lt=now - timedelta(hours=1)).delete()
    ticket = WebSocketTicket.objects.create(
        user=user,
        token=secrets.token_urlsafe(32),
        expires_at=now + timedelta(seconds=TICKET_TTL_SECONDS),
    )
    return ticket


def _user_from_ticket(raw):
    ticket = (
        WebSocketTicket.objects.select_related("user")
        .filter(token=raw, used_at__isnull=True)
        .first()
    )
    if ticket is None:
        return None
    if ticket.expires_at < timezone.now():
        return None
    # Consume before returning: a replay of the same ticket must not work, even
    # if the first handshake then failed.
    WebSocketTicket.objects.filter(pk=ticket.pk, used_at__isnull=True).update(
        used_at=timezone.now()
    )
    user = ticket.user
    return user if user.is_active else None


class _AuthorizationShim:
    """
    The minimum object DRF's ``TokenAuthentication`` reads.

    It goes through `request.headers` (lower-cased lookup), so both that and the
    classic `META` spelling are provided — delegating to DRF is the point, and
    DRF's rules are what these two attributes feed.
    """

    def __init__(self, value):
        self.headers = {"authorization": value}
        self.META = {"HTTP_AUTHORIZATION": value}


def _user_from_token(raw):
    if not raw:
        return None
    try:
        result = TokenAuthentication().authenticate(_AuthorizationShim(f"Token {raw}"))
    except AuthenticationFailed as error:
        # A malformed or unknown token is a refusal, not a server error: the
        # socket closes 4401 like any other unauthenticated handshake.
        logger.info("TRACK: rejected WebSocket token handshake — %s", error)
        return None
    if not result:
        return None
    user, _auth = result
    return user


def resolve_user(scope):
    """
    The user for this handshake, or ``AnonymousUser``.

    Reads `?ticket=` first, then `?token=`. Nothing here trusts a client-supplied
    user id, a cookie, or any claim made inside a frame — the identity is fixed
    at handshake and every later action is authorized against it.
    """
    # ASGI 3 (uvicorn, daphne, Channels' own test communicator) puts the query in
    # `query_string`; `url_query` is the ASGI 2 spelling. Read either so the
    # handshake does not silently fall back to anonymous on one of them.
    query = scope.get("query_string")
    if query is None:
        query = scope.get("url_query", b"")
    if isinstance(query, bytes):
        query = query.decode("latin-1")
    params = parse_qs(query)
    ticket = params.get("ticket", [None])[0]
    if ticket:
        return _user_from_ticket(ticket) or AnonymousUser()
    token = params.get("token", [None])[0]
    if token:
        return _user_from_token(token) or AnonymousUser()
    return AnonymousUser()


class MessagingAuthMiddleware:
    """Attach ``scope['user']`` from the handshake credential; reject foreign origins."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "websocket":
            return await self.inner(scope, receive, send)

        headers = {
            k.decode("latin-1").lower(): v.decode("latin-1")
            for k, v in scope.get("headers", [])
        }
        origin = headers.get("origin")
        if not origin_is_allowed(origin):
            logger.warning("TRACK: refused WebSocket handshake from origin %s", origin)
            raise DenyConnection("Origin is not allowed to open a socket.")

        scope["user"] = await sync_to_async(resolve_user)(scope)
        return await self.inner(scope, receive, send)
