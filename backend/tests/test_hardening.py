import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.middleware import reset_rate_limits


async def test_api_responses_carry_security_headers(client: AsyncClient) -> None:
    res = await client.get("/api/v1/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert res.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]
    docs = await client.get("/docs")  # the interactive docs need scripts, so no API-only CSP
    assert "content-security-policy" not in docs.headers
    assert docs.headers["x-content-type-options"] == "nosniff"


async def test_per_ip_limit_returns_429_but_never_blocks_health(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ip_rate_limit_per_minute", 3)
    reset_rate_limits()
    for _ in range(3):
        assert (await client.get("/api/v1/me")).status_code == 401  # counted, then refused by auth
    blocked = await client.get("/api/v1/me")
    assert blocked.status_code == 429
    assert blocked.json() == {
        "detail": "Too many requests. Please slow down and try again shortly."
    }
    assert 1 <= int(blocked.headers["retry-after"]) <= 61
    assert blocked.headers["x-content-type-options"] == "nosniff"
    for _ in range(5):  # health checks from the host must keep working
        assert (await client.get("/api/v1/health")).status_code == 200
    reset_rate_limits()
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_limit_can_be_turned_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ip_rate_limit_per_minute", 0)
    for _ in range(10):
        assert (await client.get("/api/v1/me")).status_code == 401


async def test_usage_counts_todays_runs(client: AsyncClient, user_a: dict[str, str]) -> None:
    empty = (await client.get("/api/v1/me/usage", headers=user_a)).json()
    assert empty["used"] == 0 and empty["limit"] == settings.daily_run_limit
    await client.post("/api/v1/runs", json={"question": "How do heat pumps work?"}, headers=user_a)
    after = (await client.get("/api/v1/me/usage", headers=user_a)).json()
    assert after["used"] == 1
    assert after["resets_at"].endswith("00:00:00Z") or "T00:00:00" in after["resets_at"]
    assert (await client.get("/api/v1/me/usage")).status_code == 401
