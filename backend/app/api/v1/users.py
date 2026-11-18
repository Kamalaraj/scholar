from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.user import UsageOut, UserOut
from app.services import run_service

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.get("/me/usage", response_model=UsageOut)
async def usage(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UsageOut:
    used, limit, resets_at = await run_service.daily_usage(db, user.id)
    return UsageOut(used=used, limit=limit, resets_at=resets_at)
