"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

TRACK serves HTTP through WSGI in production (gunicorn + WhiteNoise) and ASGI
here is the entry point for one thing: the messaging WebSocket. Run it with
``uvicorn config.asgi:application`` — see README → "Real-time messaging".

The Channels imports sit below ``get_asgi_application()`` deliberately: Django
apps must be loaded before anything touches the ORM, and core.routing imports a
consumer that imports models.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from core.routing import websocket_urlpatterns  # noqa: E402
from core.websocket_auth import MessagingAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": MessagingAuthMiddleware(
        URLRouter(websocket_urlpatterns)
    ),
})
