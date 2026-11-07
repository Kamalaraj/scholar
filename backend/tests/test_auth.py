import time
from typing import Any

import jwt
import pytest
from fastapi.routing import APIRoute
from httpx import AsyncClient

from app.core.security import get_current_user, jwks_cache
from app.main import app
from tests.conftest import MakeToken
from tests.helpers import AZP, ISSUER, KID, OTHER_PRIVATE_KEY, auth_header, jwk


async def test_me_without_token_is_401(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_me_with_valid_token_upserts_user(client: AsyncClient, make_token: MakeToken) -> None:
    first = await client.get("/api/v1/me", headers=auth_header(make_token(sub="user_valid")))
    second = await client.get("/api/v1/me", headers=auth_header(make_token(sub="user_valid")))
    assert first.status_code == 200
    assert first.json()["clerk_user_id"] == "user_valid"
    assert first.json()["email"] == "user_valid@example.com"
    assert second.json()["id"] == first.json()["id"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": int(time.time()) - 60},
        {"nbf": int(time.time()) + 600},
        {"iss": "https://evil.test"},
        {"azp": "https://evil.test"},
        {"azp": None},
        {"nbf": None},
    ],
    ids=["expired", "not-yet-valid", "wrong-issuer", "wrong-azp", "missing-azp", "missing-nbf"],
)
async def test_bad_claims_are_401(
    client: AsyncClient, make_token: MakeToken, overrides: dict[str, Any]
) -> None:
    response = await client.get("/api/v1/me", headers=auth_header(make_token(**overrides)))
    assert response.status_code == 401


async def test_forged_signature_is_401(client: AsyncClient, make_token: MakeToken) -> None:
    token = make_token(key=OTHER_PRIVATE_KEY)
    assert (await client.get("/api/v1/me", headers=auth_header(token))).status_code == 401


async def test_alg_none_is_401(client: AsyncClient) -> None:
    now = int(time.time())
    token = jwt.encode(
        {"sub": "x", "iss": ISSUER, "azp": AZP, "nbf": now, "exp": now + 60},
        key=None,
        algorithm="none",
        headers={"kid": KID},
    )
    assert (await client.get("/api/v1/me", headers=auth_header(token))).status_code == 401


async def test_garbage_token_is_401(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me", headers=auth_header("not-a-jwt"))).status_code == 401


async def test_jwks_rotation_refetches_on_unknown_kid(
    client: AsyncClient, make_token: MakeToken, monkeypatch: pytest.MonkeyPatch
) -> None:
    new_kid = "rotated-key"
    calls = 0

    async def fake_fetch(self: Any) -> None:
        nonlocal calls
        calls += 1
        self._keys = {new_kid: jwk(OTHER_PRIVATE_KEY, new_kid)}
        self._fetched_at = time.monotonic()

    monkeypatch.setattr(type(jwks_cache), "_fetch", fake_fetch)
    jwks_cache._fetched_at = time.monotonic() - 120  # older than the min refetch interval
    token = make_token(key=OTHER_PRIVATE_KEY, kid=new_kid, sub="user_rotated")
    response = await client.get("/api/v1/me", headers=auth_header(token))
    assert response.status_code == 200
    assert calls == 1


def test_every_route_except_health_requiresauth_header() -> None:
    public = {"/api/v1/health", "/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
    unprotected = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or route.path in public:
            continue
        deps = {d.call for d in route.dependant.dependencies}
        if get_current_user not in deps:
            unprotected.append(route.path)
    assert unprotected == []
