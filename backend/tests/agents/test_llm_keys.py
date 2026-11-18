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


class _KeyedModel(llm.FakeChatModel):
    """Stands in for ChatGroq: fails like Groq does for keys starting with 'bad'."""

    key: str = ""

    def _answer(self, messages):  # type: ignore[no-untyped-def]
        if self.key.startswith("bad"):
            raise RuntimeError(f"Error code: 401 - Invalid API Key ({self.key})")
        from langchain_core.messages import AIMessage

        return AIMessage(content=self.key)


@pytest.fixture
def keyed_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        llm, "_groq_model", lambda kind, api_key, max_retries: _KeyedModel(key=api_key)
    )


@pytest.mark.usefixtures("keyed_models")
async def test_invalid_key_falls_back_to_the_next_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "bad-primary")
    monkeypatch.setattr(settings, "groq_api_keys", "good-fallback")
    for _ in range(2):  # whichever key leads, the call ends on the good one
        reply = await llm.get_llm("strong").ainvoke("hi")
        assert reply.content == "good-fallback"


@pytest.mark.usefixtures("keyed_models")
async def test_fallback_also_works_when_streaming(monkeypatch: pytest.MonkeyPatch) -> None:
    # The run executor drives the graph with astream_events, which streams chat models.
    monkeypatch.setattr(settings, "groq_api_key", "bad-primary")
    monkeypatch.setattr(settings, "groq_api_keys", "good-fallback")
    for _ in range(2):
        chunks = [c async for c in llm.get_llm("fast").astream("hi")]
        assert "".join(str(c.content) for c in chunks) == "good-fallback"


@pytest.mark.usefixtures("keyed_models")
async def test_all_keys_bad_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "bad-1")
    monkeypatch.setattr(settings, "groq_api_keys", "bad-2")
    with pytest.raises(RuntimeError, match="Invalid API Key"):
        await llm.get_llm("fast").ainvoke("hi")


def test_keys_pasted_with_quotes_or_spaces_are_cleaned(monkeypatch: pytest.MonkeyPatch) -> None:
    # Host dashboards keep quotes literally, which Groq rejects as an invalid key.
    monkeypatch.setattr(settings, "groq_api_key", ' "k0"\n')
    monkeypatch.setattr(settings, "groq_api_keys", "'k1', \"k2\" ")
    assert settings.groq_keys == ["k0", "k1", "k2"]
