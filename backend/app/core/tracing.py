import os
from typing import Any

from app.core.config import settings


def langfuse_enabled() -> bool:
    return bool(settings.langfuse_public_key and settings.langfuse_secret_key)


def langfuse_callbacks(run_id: str, user_id: str | None) -> list[Any]:
    """Langfuse callback handlers for one graph run, or [] when Langfuse is not configured.

    The run id becomes the Langfuse session so a run's plan, research and report group together."""
    if not langfuse_enabled():
        return []
    os.environ["LANGFUSE_PUBLIC_KEY"] = settings.langfuse_public_key
    os.environ["LANGFUSE_SECRET_KEY"] = settings.langfuse_secret_key
    os.environ["LANGFUSE_BASE_URL"] = settings.langfuse_base_url
    os.environ["LANGFUSE_TRACING_ENVIRONMENT"] = settings.langfuse_tracing_environment
    if settings.langfuse_release:
        os.environ["LANGFUSE_RELEASE"] = settings.langfuse_release
    from langfuse.langchain import CallbackHandler

    return [CallbackHandler()]


def langfuse_metadata(run_id: str, user_id: str | None) -> dict[str, Any]:
    meta: dict[str, Any] = {"langfuse_session_id": run_id, "langfuse_tags": ["scholar"]}
    if user_id:
        meta["langfuse_user_id"] = user_id
    return meta


def flush_langfuse() -> None:
    if langfuse_enabled():
        from langfuse import get_client

        get_client().flush()
