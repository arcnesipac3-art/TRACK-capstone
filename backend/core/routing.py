"""
TRACK — WebSocket URL routing.

The path sits under ``/api/`` on purpose: the Vite dev server already proxies
``/api/*`` to Django, so a browser connects to the same origin as the REST API
and the upgrade passes through the same proxy with ``ws: true`` enabled. No
second host, no CORS preflight for sockets, no extra port to open in a CSP.
"""

from django.urls import re_path

from .messaging_consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r"^api/ws/messaging/$", ChatConsumer.as_asgi(), name="ws_messaging"),
]
