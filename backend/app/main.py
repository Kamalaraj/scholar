from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.agents.graph import build_graph, make_serde
from app.api.v1.health import router as health_router
from app.api.v1.runs import router as runs_router
from app.api.v1.users import router as users_router
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    conninfo = settings.database_url.replace("+psycopg", "", 1)
    pool = AsyncConnectionPool(
        conninfo,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        open=False,
    )
    await pool.open(wait=True, timeout=15)
    saver = AsyncPostgresSaver(pool, serde=make_serde())  # type: ignore[arg-type]
    await saver.setup()
    app.state.graph = build_graph(saver)
    try:
        yield
    finally:
        await pool.close()


app = FastAPI(title="Scholar API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(runs_router, prefix="/api/v1")
