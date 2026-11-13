import pytest

from app.core.config import settings
from app.core.tracing import langfuse_callbacks, langfuse_metadata


def test_langfuse_is_off_without_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langfuse_public_key", "")
    monkeypatch.setattr(settings, "langfuse_secret_key", "")
    assert langfuse_callbacks("run", "user") == []


def test_langfuse_handler_created_with_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langfuse_public_key", "pk-lf-test")
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk-lf-test")
    assert len(langfuse_callbacks("run", "user")) == 1
    assert langfuse_metadata("run-1", "u1")["langfuse_session_id"] == "run-1"
