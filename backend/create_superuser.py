"""
Run this script once to create the initial admin account:
  python create_superuser.py

Credentials: admin / track2026
Change the password immediately after your first login.
"""

import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from core.models import User

username = "admin"
password = "track2026"
email = "admin@knhs.edu.ph"

if User.objects.filter(username=username).exists():
    print(f"Superuser '{username}' already exists.")
else:
    User.objects.create_superuser(
        username=username,
        password=password,
        email=email,
        first_name="TRACK",
        last_name="Admin",
        role=User.Role.ADMIN,
    )
    print(f"Superuser '{username}' created. Password: {password}")
    print("IMPORTANT: Change this password after your first login.")
