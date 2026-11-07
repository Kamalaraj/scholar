from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.health import router as health_router
from app.api.v1.runs import router as runs_router
from app.api.v1.users import router as users_router
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(title="Scholar API", version="0.1.0")

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
