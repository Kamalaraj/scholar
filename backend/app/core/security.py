import time
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.algorithms import RSAAlgorithm
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import User
from app.db.session import get_db

JWKS_TTL_SECONDS = 3600
JWKS_MIN_REFETCH_SECONDS = 30

_bearer = HTTPBearer(auto_error=False)


class JWKSCache:
    """Caches Clerk's JWKS with a TTL and refetches once on an unknown `kid`."""

    def __init__(self) -> None:
        self._keys: dict[str, Any] = {}
        self._fetched_at = 0.0

    def clear(self) -> None:
        self._keys = {}
        self._fetched_at = 0.0

    async def _fetch(self) -> None:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(settings.clerk_jwks_url)
            response.raise_for_status()
        self._keys = {k["kid"]: k for k in response.json()["keys"]}
        self._fetched_at = time.monotonic()

    async def get_key(self, kid: str) -> Any:
        age = time.monotonic() - self._fetched_at
        if age > JWKS_TTL_SECONDS or (kid not in self._keys and age > JWKS_MIN_REFETCH_SECONDS):
            await self._fetch()
        jwk = self._keys.get(kid)
        if jwk is None:
            raise jwt.InvalidTokenError("unknown kid")
        return RSAAlgorithm.from_jwk(jwk)


jwks_cache = JWKSCache()


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def verify_token(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not header.get("kid"):
            raise jwt.InvalidTokenError("bad header")
        key = await jwks_cache.get_key(header["kid"])
        claims: dict[str, Any] = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["exp", "nbf", "iss", "sub"]},
        )
    except (jwt.PyJWTError, httpx.HTTPError, KeyError, ValueError) as exc:
        raise _unauthorized() from exc

    allowed = {p.strip() for p in settings.clerk_authorized_parties.split(",") if p.strip()}
    azp = claims.get("azp")
    if not allowed or azp not in allowed:
        raise _unauthorized()
    return claims


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise _unauthorized()
    claims = await verify_token(credentials.credentials)
    email = claims.get("email")
    stmt = (
        insert(User)
        .values(clerk_user_id=claims["sub"], email=email)
        .on_conflict_do_update(
            index_elements=[User.clerk_user_id],
            set_={"email": email} if email else {"clerk_user_id": claims["sub"]},
        )
        .returning(User)
    )
    user: User = (await db.execute(stmt)).scalar_one()
    await db.commit()
    return user
