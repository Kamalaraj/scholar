from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.session import engine

router = APIRouter(tags=["health"])


async def _check_db(db_engine: AsyncEngine) -> str:
    try:
        async with db_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "error"


@router.get("/health")
async def health() -> dict[str, str]:
    db_status = await _check_db(engine)
    return {"status": "ok", "db": db_status}
