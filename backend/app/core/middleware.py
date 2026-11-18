"""Plain ASGI middleware (no BaseHTTPMiddleware, so streaming responses are never buffered)."""

import time
from collections import defaultdict, deque

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

API_PREFIX = "/api/v1"
# The API only returns JSON, text or an event stream, so it can forbid everything else.
API_CSP = "default-src 'none'; frame-ancestors 'none'"


class SecurityHeadersMiddleware:
    """Adds hardening headers to every API response (not to the interactive docs pages)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_api = scope["path"].startswith(API_PREFIX)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers += [
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                ]
                if is_api:
                    headers += [
                        (b"content-security-policy", API_CSP.encode()),
                        (b"x-frame-options", b"DENY"),
                    ]
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


_HITS: dict[str, deque[float]] = defaultdict(deque)


def reset_rate_limits() -> None:
    """Forget all request counts (used by tests)."""
    _HITS.clear()


class IpRateLimitMiddleware:
    """A sliding one-minute request limit per client IP.

    State lives in this process, so with several workers the limit is per worker. Behind a proxy,
    start uvicorn with `--proxy-headers --forwarded-allow-ips=<proxy>` so `scope["client"]` is the
    real client; this class never reads X-Forwarded-For itself (a client could forge it)."""

    EXEMPT = (f"{API_PREFIX}/health",)

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.hits = _HITS

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        limit = settings.ip_rate_limit_per_minute
        if (
            scope["type"] != "http"
            or limit <= 0
            or scope["method"] == "OPTIONS"
            or scope["path"] in self.EXEMPT
        ):
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        ip = client[0] if client else "unknown"
        now = time.monotonic()
        window = self.hits[ip]
        while window and now - window[0] >= 60:
            window.popleft()
        if len(window) >= limit:
            retry_after = max(1, int(60 - (now - window[0])) + 1)
            body = b'{"detail":"Too many requests. Please slow down and try again shortly."}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                        (b"retry-after", str(retry_after).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        window.append(now)
        if len(self.hits) > 10_000:  # drop idle IPs so the table cannot grow without bound
            for key in [k for k, v in self.hits.items() if not v or now - v[-1] >= 60]:
                del self.hits[key]
        await self.app(scope, receive, send)
