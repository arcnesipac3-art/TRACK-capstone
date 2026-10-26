"""
TRACK — public (account-less) enrollment access.

A student without an account can apply through the public portal. Their
application row has no `applicant` user; instead the row itself carries a
non-guessable `guest_token` (see EnrollmentApplication.save). The token is
presented as an ``Authorization: Guest <token>`` header and authenticates the
request as *that application* — never as a user, and never as any other
application.

Design rules:

  * TokenAuthentication and SessionAuthentication still run first, so a
    signed-in account always wins over a guest token.
  * A guest actor is an AnonymousUser carrying one extra attribute,
    `guest_application`; every ownership check in the views reads that
    attribute through `_visible_applications()`, so scoping stays in one place.
  * Invalid or unknown tokens fail with 401 (AuthenticationFailed) instead of
    silently degrading to "anonymous", so a typo'd token is never mistaken
    for permission to browse someone else's portal.
"""

from django.contrib.auth.models import AnonymousUser
from rest_framework.authentication import (
    SessionAuthentication,
    TokenAuthentication,
    get_authorization_header,
)
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission, IsAuthenticated

from .models import EnrollmentApplication

GUEST_KEYWORD = b"guest"


class GuestApplicationAuthentication:
    """
    ``Authorization: Guest <token>`` → the application that owns the token.

    The returned principal is an AnonymousUser with `guest_application`
    attached; `request.auth` is the raw token. Absent/mismatched headers
    return None so the other authenticators get their turn.
    """

    keyword = GUEST_KEYWORD

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.keyword:
            return None
        if len(auth) != 2:
            raise AuthenticationFailed("Invalid guest token header.")
        try:
            token = auth[1].decode("utf-8")
        except UnicodeDecodeError:
            raise AuthenticationFailed("Invalid guest token header.")
        application = EnrollmentApplication.objects.filter(guest_token=token).first()
        if application is None:
            raise AuthenticationFailed(
                "Your application access token is not valid. Use your "
                "application reference to look it up again."
            )
        guest = AnonymousUser()
        guest.guest_application = application
        return guest, token

    def authenticate_header(self, request):
        return "Guest"


#: Applicant-side views use this tuple: account auth first (a signed-in user
#: is always themselves), guest token last.
GUEST_AUTHENTICATION_CLASSES = [
    TokenAuthentication,
    SessionAuthentication,
    GuestApplicationAuthentication,
]


class IsAuthenticatedOrGuest(BasePermission):
    """The applicant side is open to signed-in accounts AND to the owner of a
    valid guest token; everything else stays 401."""

    def has_permission(self, request, view):
        user = request.user
        if user is not None and user.is_authenticated:
            return True
        return bool(getattr(user, "guest_application", None))

    def has_object_permission(self, request, view, obj):
        # Object scoping is enforced by _visible_applications() querysets.
        return True


__all__ = [
    "GUEST_AUTHENTICATION_CLASSES",
    "GuestApplicationAuthentication",
    "IsAuthenticated",
    "IsAuthenticatedOrGuest",
]
