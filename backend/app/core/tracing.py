import logging
import os

from app.core.config import settings

log = logging.getLogger(__name__)


def configure_tracing() -> bool:
    """Turn on LangSmith tracing when LANGSMITH_TRACING=true and a key is set.

    LangChain reads its settings from the process environment, but our settings may come from the
    `.env` file only, so they are exported here. Returns whether tracing is on."""
    if not (settings.langsmith_tracing and settings.langsmith_api_key):
        if settings.langsmith_tracing:
            log.warning(
                "LANGSMITH_TRACING is set but LANGSMITH_API_KEY is empty; tracing stays off"
            )
        return False
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    log.info("LangSmith tracing is on")
    return True
