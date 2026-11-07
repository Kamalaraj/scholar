import os

os.environ.setdefault("LLM_PROVIDER", "fake")
os.environ.setdefault("SEARCH_PROVIDER", "fake")

import time  # noqa: E402
import uuid  # noqa: E402
from collections.abc import AsyncGenerator, Callable  # noqa: E402
from typing import Any  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import jwks_cache  # noqa: E402
from app.main import app  # noqa: E402
from tests.helpers import AZP, ISSUER, KID, PRIVATE_KEY, jwk  # noqa: E402

MakeToken = Callable[..., str]


@pytest.fixture(autouse=True)
def clerk_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "clerk_issuer", ISSUER)
    monkeypatch.setattr(settings, "clerk_authorized_parties", AZP)
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://clerk.test/.well-known/jwks.json")
    jwks_cache.clear()
    jwks_cache._keys = {KID: jwk(PRIVATE_KEY, KID)}
    jwks_cache._fetched_at = time.monotonic()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def make_token() -> MakeToken:
    def _make(
        sub: str = "user_a",
        key: rsa.RSAPrivateKey = PRIVATE_KEY,
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


@pytest.fixture
def user_a(make_token: MakeToken) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=f'user_a_{uuid.uuid4().hex}')}"}


@pytest.fixture
def user_b(make_token: MakeToken) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=f'user_b_{uuid.uuid4().hex}')}"}
