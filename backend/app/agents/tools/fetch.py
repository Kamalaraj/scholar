import asyncio
import ipaddress
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura

from app.agents.tools.search import FAKE_HOST
from app.core.config import settings

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 10.0
ALLOWED_CONTENT_TYPES = ("text/html", "application/xhtml+xml", "text/plain")
MAX_TEXT_CHARS = 8000  # what the reader model sees


class FetchBlockedError(Exception):
    """The URL failed the SSRF guard or a size/type limit."""


def _is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


async def assert_public_url(url: str) -> None:
    """Allow only http(s) URLs whose host resolves exclusively to public addresses."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchBlockedError("Only http and https URLs are allowed")
    host = parsed.hostname
    if not host:
        raise FetchBlockedError("URL has no host")
    try:
        literal = ipaddress.ip_address(host)
        addresses = [literal]
    except ValueError:
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(host, None)
        except OSError as exc:
            raise FetchBlockedError("Host could not be resolved") from exc
        addresses = [ipaddress.ip_address(str(info[4][0]).split("%")[0]) for info in infos]
    if not addresses or not all(_is_public(a) for a in addresses):
        raise FetchBlockedError("Host is not a public address")


async def fetch_page(url: str, client: httpx.AsyncClient | None = None) -> str:
    """Fetch a page and return its main text. Every redirect hop is re-checked."""
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False)
    try:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            await assert_public_url(current)
            async with http.stream(
                "GET", current, headers={"User-Agent": "ScholarBot/0.1"}
            ) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise FetchBlockedError("Redirect without a location")
                    current = urljoin(current, location)
                    continue
                response.raise_for_status()
                ctype = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if ctype not in ALLOWED_CONTENT_TYPES:
                    raise FetchBlockedError(f"Content type {ctype or 'unknown'} is not allowed")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise FetchBlockedError("Page is larger than 2 MB")
                html = bytes(body).decode(response.encoding or "utf-8", errors="replace")
                break
        else:
            raise FetchBlockedError("Too many redirects")
    finally:
        if owns_client:
            await http.aclose()
    if ctype == "text/plain":
        return html[:MAX_TEXT_CHARS]
    text = await asyncio.to_thread(trafilatura.extract, html)
    return (text or "")[:MAX_TEXT_CHARS]


def fake_page(url: str) -> str:
    topic = urlparse(url).path.strip("/").replace("/", " #")
    return (
        f"Fixture page on {topic}. It explains the topic in plain terms and gives two examples. "
        "Analysts describe steady progress, with open questions that remain."
    )


async def read_page(url: str) -> str:
    """Page text for the reader; fixtures in fake mode."""
    if settings.search_provider == "fake" and urlparse(url).hostname == FAKE_HOST:
        return fake_page(url)
    return await fetch_page(url)
