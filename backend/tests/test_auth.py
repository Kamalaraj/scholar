import json
import time
from collections.abc import AsyncGenerator, Callable
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from jwt.algorithms import RSAAlgorithm

from app.core.config import settings
from app.core.security import get_current_user, jwks_cache
from app.main import app

ISSUER = "https://clerk.test"
AZP = "http://localhost:3000"
KID = "test-key-1"

_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_other_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwk(private: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    jwk = json.loads(RSAAlgorithm.to_jwk(private.public_key()))
    jwk["kid"] = kid
    return jwk


MakeToken = Callable[..., str]


@pytest.fixture(autouse=True)
def clerk_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "clerk_issuer", ISSUER)
    monkeypatch.setattr(settings, "clerk_authorized_parties", AZP)
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://clerk.test/.well-known/jwks.json")
    jwks_cache.clear()
    jwks_cache._keys = {KID: _jwk(_private, KID)}
    jwks_cache._fetched_at = time.monotonic()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def make_token() -> MakeToken:
    def _make(
        sub: str = "user_a",
        key: rsa.RSAPrivateKey = _private,
        kid: str = KID,
        alg: str = "RS256",
        **overrides: Any,
    ) -> str:
        now = int(time.time())
        claims: dict[str, Any] = {
            "sub": sub,
            "iss": ISSUER,
            "azp": AZP,
            "iat": now,
            "nbf": now - 5,
            "exp": now + 300,
            "email": f"{sub}@example.com",
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})

    return _make


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_me_without_token_is_401(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_me_with_valid_token_upserts_user(client: AsyncClient, make_token: MakeToken) -> None:
    first = await client.get("/api/v1/me", headers=_auth(make_token(sub="user_valid")))
    second = await client.get("/api/v1/me", headers=_auth(make_token(sub="user_valid")))
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
    response = await client.get("/api/v1/me", headers=_auth(make_token(**overrides)))
    assert response.status_code == 401


async def test_forged_signature_is_401(client: AsyncClient, make_token: MakeToken) -> None:
    token = make_token(key=_other_private)
    assert (await client.get("/api/v1/me", headers=_auth(token))).status_code == 401


async def test_alg_none_is_401(client: AsyncClient) -> None:
    now = int(time.time())
    token = jwt.encode(
        {"sub": "x", "iss": ISSUER, "azp": AZP, "nbf": now, "exp": now + 60},
        key=None,
        algorithm="none",
        headers={"kid": KID},
    )
    assert (await client.get("/api/v1/me", headers=_auth(token))).status_code == 401


async def test_garbage_token_is_401(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me", headers=_auth("not-a-jwt"))).status_code == 401


async def test_jwks_rotation_refetches_on_unknown_kid(
    client: AsyncClient, make_token: MakeToken, monkeypatch: pytest.MonkeyPatch
) -> None:
    new_kid = "rotated-key"
    calls = 0

    async def fake_fetch(self: Any) -> None:
        nonlocal calls
        calls += 1
        self._keys = {new_kid: _jwk(_other_private, new_kid)}
        self._fetched_at = time.monotonic()

    monkeypatch.setattr(type(jwks_cache), "_fetch", fake_fetch)
    jwks_cache._fetched_at = time.monotonic() - 120  # older than the min refetch interval
    token = make_token(key=_other_private, kid=new_kid, sub="user_rotated")
    response = await client.get("/api/v1/me", headers=_auth(token))
    assert response.status_code == 200
    assert calls == 1


def test_every_route_except_health_requires_auth() -> None:
    public = {"/api/v1/health", "/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
    unprotected = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or route.path in public:
            continue
        deps = {d.call for d in route.dependant.dependencies}
        if get_current_user not in deps:
            unprotected.append(route.path)
    assert unprotected == []
