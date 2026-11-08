"""
TRACK — outbound email.

Mail is a courtesy, never a gate. Every caller writes the record first and
these helpers hand the message to Django's email backend without expecting an
answer, so an unreachable SMTP host can never undo a confirmation. With the
default console backend (development and tests) the message is printed rather
than sent, which is how the link is read locally.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _app_url(path):
    """An absolute link into the web app — the recipient's browser goes to the
    frontend, not to this API, so it cannot be derived from the request."""
    return f"{settings.TRACK_APP_BASE_URL}{path}"


def notification_email_for(application):
    """
    The address a decision about this application should reach.

    The applicant's own email is what the confirmation form asks for and wins;
    the guardian email written on the application is the next best thing; an
    account that submitted the application in the first place already proved
    the address, so its login email is the last fallback.
    """
    from .models import User

    candidates = [application.applicant_email, application.guardian_email]
    if application.applicant_id:
        candidates.append(
            User.objects.filter(pk=application.applicant_id).values_list(
                "email", flat=True
            ).first()
        )
    for candidate in candidates:
        address = (candidate or "").strip()
        if address:
            return address
    return ""


def send_enrollment_confirmation_email(application, enrollment, *, resent=False):
    """
    Tell the family the enrollment is confirmed, with the one link they need
    next: set up the account (newly created identity), or sign in (a student
    record that already had an account).

    `resent=True` is the Registrar's second send of a link the family lost:
    same credential, same link, different subject and first line, so nobody
    reads it as a second decision about the application.

    Returns the recipient when a message was handed to the backend, else None.
    """
    recipient = notification_email_for(application)
    if not recipient:
        logger.info(
            "TRACK: no email address on %s — confirmation notice not sent.",
            application.reference,
        )
        return None

    learner = application.get_full_name() or "Your child"
    section = f"{enrollment.grade_level} — {enrollment.section_name}"
    year = enrollment.school_year.label

    if application.account_claim_token and application.account_claimed_at is None:
        claim_url = _app_url("/enroll/claim?token=" + application.account_claim_token)
        action = (
            f"Next step: set up the TRACK account for {learner}.\n\n"
            f"{claim_url}\n\n"
            "Open that link on any device and choose a username and password. "
            "If a parent or guardian filed this application, the same page "
            "offers their account too. It works once, for this application "
            "only — after that, sign in with the new accounts."
        )
    else:
        action = (
            "Next step: sign in with the existing TRACK account for "
            f"{learner}.\n\n{_app_url('/login')}\n\n"
            "The reference number is no longer needed — the account already "
            "holds this enrollment."
        )

    head = (
        f"The account setup link for {learner} has been reissued. The one "
        "sent earlier no longer works."
        if resent
        else f"{learner} is enrolled."
    )
    subject = (
        f"Setup link resent — {learner} ({application.reference})"
        if resent
        else f"Enrollment confirmed — {learner} ({application.reference})"
    )
    body = (
        f"{head}\n\n"
        f"Section: {section}\n"
        f"School year: {year}\n"
        f"Application reference: {application.reference}\n\n"
        f"{action}\n\n"
        "Track keeps the record of this enrollment, the requirements for the "
        "school year and the classes for the week.\n\n"
        "— The enrollment office\n"
    )

    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001 — a mail server must not break the enrollment
        logger.exception(
            "TRACK: confirmation email could not be sent for %s",
            application.reference,
        )
        return None
    return recipient
