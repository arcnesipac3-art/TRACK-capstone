"""
TRACK — browser push delivery (Web Push / VAPID).

Push is the transport for the one thing the socket cannot do: reach a user who
is not looking at TRACK. It is therefore deliberately narrow.

Gating, in order, and every rule is enforced server-side:
  1. the deployment has VAPID credentials (``VAPID_PUBLIC_KEY`` /
     ``VAPID_PRIVATE_KEY``) — without them nothing is sent and no key is
     advertised, so the UI never offers a button that cannot work;
  2. the user turned push on (``UserMessagingSettings.notify_push`` — off by
     default, because a school app that buzzes for every chat message is a
     feature nobody keeps);
  3. the user is not already looking at that conversation (the socket keeps a
     live-view marker fresh while they are — see messaging.set_viewing);
  4. delivery failures retire a subscription instead of retrying it forever:
     a 404/410 from the push service means the endpoint is gone.

The payload is a sender name and a truncated preview, encrypted to the
subscription's own p256dh key, so the push vendor relays opaque bytes and cannot
read a conversation. It is the same two lines the in-app bell item already
stores, which keeps the lock screen no more revealing than a glance at the
notification tray; the full thread is always fetched over the authenticated API
when the notification is opened.
"""

import base64
import json
import logging
import os

from .models import PushSubscription

logger = logging.getLogger(__name__)

# A subscription the push service no longer recognises is not worth another
# handshake; five strikes is enough for transient 5xx to be forgiven.
MAX_FAILURES = 5
DEAD_ENDPOINT_STATUS = (404, 410)


def _env(name, default=""):
    return os.environ.get(name, default).strip()


def vapid_keys_configured():
    return bool(_env("VAPID_PUBLIC_KEY") and _env("VAPID_PRIVATE_KEY"))


def vapid_public_key():
    """The key the browser needs to subscribe, or None when push is off."""
    return _env("VAPID_PUBLIC_KEY") if vapid_keys_configured() else None


def vapid_subject():
    return _env("VAPID_SUBJECT", "mailto:admin@knhs.local")


def send_push(user, title, body="", *, tag="", url=""):
    """
    Deliver one notification to every live subscription of `user`.

    Returns the number of endpoints that accepted it. Never raises: push is a
    courtesy and the caller is in the middle of writing a record that matters.
    """
    if not vapid_keys_configured():
        return 0
    settings_row = getattr(user, "messaging_settings", None)
    if settings_row is None:
        from .messaging import settings_for

        settings_row = settings_for(user)
    if not settings_row.notify_push:
        return 0

    subscriptions = list(PushSubscription.objects.filter(user=user))
    if not subscriptions:
        return 0

    payload = json.dumps(
        {"title": title, "body": body, "tag": tag, "url": url}
    )
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:  # pragma: no cover - dependency is documented, not optional in prod
        logger.warning("TRACK: pywebpush is not installed; push delivery skipped")
        return 0

    delivered = 0
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                },
                data=payload,
                vapid_private_key=_env("VAPID_PRIVATE_KEY"),
                vapid_claims={"sub": vapid_subject()},
                ttl=60 * 30,
                timeout=5,
            )
        except WebPushException as error:
            _retire_or_count(subscription, error)
            continue
        except Exception:  # noqa: BLE001 - a push vendor outage must not break sending
            logger.exception("TRACK: push delivery raised unexpectedly")
            _count_failure(subscription)
            continue
        delivered += 1
        subscription.failures = 0
        subscription.save(update_fields=["failures"])
    return delivered


def _retire_or_count(subscription, error):
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    if status in DEAD_ENDPOINT_STATUS:
        logger.info("TRACK: dropping dead push subscription %s", subscription.pk)
        subscription.delete()
        return
    _count_failure(subscription)


def _count_failure(subscription):
    subscription.failures += 1
    if subscription.failures >= MAX_FAILURES:
        subscription.delete()
        return
    subscription.save(update_fields=["failures"])


def register_subscription(user, endpoint, p256dh, auth):
    """Store (or refresh) one browser endpoint for this user."""
    subscription, created = PushSubscription.objects.get_or_create(
        endpoint=endpoint,
        defaults={"user": user, "p256dh": p256dh, "auth": auth},
    )
    if not created:
        # A different user subscribing with the same endpoint means the browser
        # moved accounts; ownership follows the newest subscriber.
        subscription.user = user
        subscription.p256dh = p256dh
        subscription.auth = auth
        subscription.failures = 0
        subscription.save(update_fields=["user", "p256dh", "auth", "failures"])
    return subscription


def unregister_subscription(user, endpoint):
    deleted, _ = PushSubscription.objects.filter(user=user, endpoint=endpoint).delete()
    return bool(deleted)


def generate_key_pair():
    """
    A fresh VAPID key pair as (public_key_b64url, private_key_pem).

    Used by `manage.py generate_vapid_keys`; the values belong in the
    environment, never in the database and never committed.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("ascii")
    raw_public = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = base64.urlsafe_b64encode(raw_public).decode("ascii").rstrip("=")
    return public_b64, pem


def push_status():
    """What the frontend needs to know before offering a subscribe button."""
    return {
        "configured": vapid_keys_configured(),
        "public_key": vapid_public_key(),
    }
