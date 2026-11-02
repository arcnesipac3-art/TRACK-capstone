"""
Generate a VAPID key pair for browser push.

Web Push is inert until the deployment has its own identity: a push service
only accepts a subscription request signed with a VAPID key whose public half
was handed to the browser. This prints the pair to paste into the environment;
nothing here is committed, and re-running it invalidates every existing
subscription (browsers must resubscribe with the new public key).

    python backend/manage.py generate_vapid_keys
"""

from django.core.management.base import BaseCommand

from core.push import generate_key_pair


class Command(BaseCommand):
    help = "Print a fresh VAPID key pair for TRACK's browser push delivery."

    def handle(self, *args, **options):
        public_key, private_pem = generate_key_pair()
        self.stdout.write(self.style.SUCCESS("Add these to backend/.env (never commit them):\n"))
        self.stdout.write(f"VAPID_PUBLIC_KEY={public_key}\n")
        self.stdout.write("VAPID_PRIVATE_KEY<<PEM")
        self.stdout.write(private_pem.strip())
        self.stdout.write("PEM")
        self.stdout.write("\nVAPID_SUBJECT=mailto:admin@your-school.example\n")
        self.stdout.write(
            "\nThe private key is multi-line. If your platform cannot hold a "
            "newline in an env var, save it as vapid_private.pem and set "
            "VAPID_PRIVATE_KEY to that path.\n"
        )
