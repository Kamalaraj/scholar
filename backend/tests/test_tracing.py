import os

import pytest

from app.core.config import settings
from app.core.tracing import configure_tracing


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("LANGSMITH_TRACING", "LANGSMITH_API_KEY", "LANGCHAIN_TRACING_V2"):
        monkeypatch.delenv(name, raising=False)


def test_tracing_is_off_unless_asked_for(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langsmith_tracing", False)
    monkeypatch.setattr(settings, "langsmith_api_key", "ls-key")
    assert configure_tracing() is False
    assert "LANGSMITH_TRACING" not in os.environ and "LANGSMITH_API_KEY" not in os.environ


def test_settings_from_the_env_file_reach_langchain(monkeypatch: pytest.MonkeyPatch) -> None:
    """LangChain reads os.environ; values that only lived in the .env file must be exported."""
    monkeypatch.setattr(settings, "langsmith_tracing", True)
    monkeypatch.setattr(settings, "langsmith_api_key", "ls-key")
    assert configure_tracing() is True
    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_API_KEY"] == "ls-key"


def test_tracing_without_a_key_stays_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langsmith_tracing", True)
    monkeypatch.setattr(settings, "langsmith_api_key", "")
    assert configure_tracing() is False
    assert "LANGSMITH_TRACING" not in os.environ
