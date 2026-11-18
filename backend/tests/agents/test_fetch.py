import httpx
import pytest

from app.agents.tools import fetch
from app.agents.tools.fetch import FetchBlockedError, assert_public_url, fetch_page


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "file:///etc/passwd",
        "ftp://example.com/",
    ],
)
async def test_blocks_private_and_non_http(url: str) -> None:
    with pytest.raises(FetchBlockedError):
        await assert_public_url(url)


async def test_blocks_host_resolving_to_private(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_getaddrinfo(*_a: object, **_k: object) -> list[tuple]:  # type: ignore[type-arg]
        return [(2, 1, 6, "", ("10.1.2.3", 0))]

    loop = __import__("asyncio").get_running_loop()
    monkeypatch.setattr(loop, "getaddrinfo", fake_getaddrinfo)
    with pytest.raises(FetchBlockedError):
        await assert_public_url("http://rebind.example.com/")


@pytest.fixture
def public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    async def ok(url: str) -> None:
        host = httpx.URL(url).host
        if host in {"127.0.0.1", "169.254.169.254"}:
            raise FetchBlockedError("blocked")

    monkeypatch.setattr(fetch, "assert_public_url", ok)


def _client(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler, follow_redirects=False)


async def test_extracts_text(public_dns: None) -> None:
    html = "<html><body><article><p>" + "Real article text. " * 30 + "</p></article></body></html>"
    transport = httpx.MockTransport(
        lambda r: httpx.Response(200, text=html, headers={"content-type": "text/html"})
    )
    async with _client(transport) as c:
        assert "Real article text" in await fetch_page("https://ok.example/a", c)


async def test_redirect_to_internal_address_is_blocked(public_dns: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "ok.example":
            return httpx.Response(302, headers={"location": "http://169.254.169.254/latest"})
        return httpx.Response(200, text="secret", headers={"content-type": "text/plain"})

    async with _client(httpx.MockTransport(handler)) as c:
        with pytest.raises(FetchBlockedError):
            await fetch_page("https://ok.example/start", c)


async def test_too_many_redirects(public_dns: None) -> None:
    transport = httpx.MockTransport(
        lambda r: httpx.Response(302, headers={"location": "https://ok.example/loop"})
    )
    async with _client(transport) as c:
        with pytest.raises(FetchBlockedError, match="redirects"):
            await fetch_page("https://ok.example/loop", c)


async def test_body_over_2mb_is_rejected(public_dns: None) -> None:
    big = "x" * (2 * 1024 * 1024 + 10)
    transport = httpx.MockTransport(
        lambda r: httpx.Response(200, text=big, headers={"content-type": "text/html"})
    )
    async with _client(transport) as c:
        with pytest.raises(FetchBlockedError, match="2 MB"):
            await fetch_page("https://ok.example/big", c)


async def test_non_text_content_type_is_rejected(public_dns: None) -> None:
    transport = httpx.MockTransport(
        lambda r: httpx.Response(200, content=b"%PDF", headers={"content-type": "application/pdf"})
    )
    async with _client(transport) as c:
        with pytest.raises(FetchBlockedError, match="not allowed"):
            await fetch_page("https://ok.example/x.pdf", c)
