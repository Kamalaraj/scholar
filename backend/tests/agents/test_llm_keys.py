import pytest
from langchain_core.runnables.fallbacks import RunnableWithFallbacks

from app.agents import llm
from app.core.config import settings


@pytest.fixture(autouse=True)
def groq_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "openrouter_api_key", "")


def test_key_list_merges_single_and_multiple(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "k0")
    monkeypatch.setattr(settings, "groq_api_keys", " k1, k2 ,,k0")
    assert settings.groq_keys == ["k0", "k1", "k2"]


def test_single_key_has_no_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "k0")
    monkeypatch.setattr(settings, "groq_api_keys", "")
    assert not isinstance(llm.get_llm("fast"), RunnableWithFallbacks)


def test_multiple_keys_rotate_and_fall_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "groq_api_keys", "k1,k2,k3")
    firsts = []
    for _ in range(3):
        model = llm.get_llm("fast")
        assert isinstance(model, RunnableWithFallbacks)
        assert len(model.fallbacks) == 2
        assert model.exceptions_to_handle == (Exception,)
        firsts.append(model.runnable.groq_api_key.get_secret_value())  # type: ignore[attr-defined]
    assert sorted(firsts) == ["k1", "k2", "k3"]  # each key leads once


def test_no_key_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "groq_api_keys", "")
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        llm.get_llm("fast")


def test_openrouter_is_the_last_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "k0")
    monkeypatch.setattr(settings, "groq_api_keys", "")
    monkeypatch.setattr(settings, "openrouter_api_key", "o0")
    model = llm.get_llm("fast")
    assert isinstance(model, RunnableWithFallbacks)
    assert [type(m).__name__ for m in model.fallbacks] == ["ChatOpenAI"]


def test_openrouter_only_works_without_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "groq_api_keys", "")
    monkeypatch.setattr(settings, "openrouter_api_key", "o0")
    assert type(llm.get_llm("strong")).__name__ == "ChatOpenAI"
