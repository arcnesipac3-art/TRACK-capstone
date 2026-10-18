"""
TRACK — deadline and overdue notifications.

Notification types that depend on the clock cannot fire from a view, because
nothing happens in the database when a deadline quietly passes. This command
is the scheduled half of that: run it periodically (hourly or daily) and it
writes the reminders.

Both halves are idempotent — the (recipient, type, requirement) triple is the
dedupe key — so running it twice in a row writes nothing the second time.

    python manage.py notify_deadlines               # reminders + overdue
    python manage.py notify_deadlines --days 3      # look 3 days ahead
    python manage.py notify_deadlines --overdue-only
"""

from django.core.management.base import BaseCommand

from core.notifications import mark_overdue_requirements, send_deadline_reminders


class Command(BaseCommand):
    help = (
        "Send deadline-approaching reminders and flag overdue work. "
        "Safe to run repeatedly; already-sent notifications are skipped."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=2,
            help="How many days ahead to warn about upcoming deadlines (default: 2).",
        )
        parser.add_argument(
            "--overdue-only",
            action="store_true",
            help="Only flag overdue work; skip upcoming reminders.",
        )
        parser.add_argument(
            "--reminders-only",
            action="store_true",
            help="Only send upcoming reminders; skip the overdue pass.",
        )

    def handle(self, *args, **options):
        days = options["days"]
        wrote = 0

        if not options["overdue_only"]:
            reminders = send_deadline_reminders(within_days=days)
            wrote += reminders
            self.stdout.write(
                f"Deadline reminders (next {days} day{'s' if days != 1 else ''}): "
                f"{reminders} new."
            )

        if not options["reminders_only"]:
            overdue = mark_overdue_requirements()
            wrote += overdue
            self.stdout.write(f"Overdue notices: {overdue} new.")

        self.stdout.write(self.style.SUCCESS(f"Done. {wrote} notification(s) written."))
