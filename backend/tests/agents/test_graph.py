import uuid

import pytest
from langgraph.types import Command

from app.agents.nodes.writer import strip_invalid_citations


def _config() -> dict:  # type: ignore[type-arg]
    return {"configurable": {"thread_id": str(uuid.uuid4())}, "max_concurrency": 3}


async def test_plan_pause_resume_and_cited_report(graph) -> None:  # type: ignore[no-untyped-def]
    config = _config()
    await graph.ainvoke(
        {"question": "How do solid-state batteries work?", "depth": "quick"}, config
    )

    state = await graph.aget_state(config)
    assert state.next == ("human_review",)  # paused for approval
    assert len(state.values["plan"]) == 3

    await graph.ainvoke(Command(resume=[q.model_dump() for q in state.values["plan"]]), config)
    final = (await graph.aget_state(config)).values

    sources = final["numbered_sources"]
    assert len(sources) >= 3
    assert [s.citation_num for s in sources] == list(range(1, len(sources) + 1))
    import re

    cited = {int(n) for n in re.findall(r"\[(\d+)\]", final["report_markdown"])}
    assert cited and cited <= {s.citation_num for s in sources}
    assert 1 <= len(final["key_findings"]) <= 5


async def test_deep_plan_has_six_and_edits_are_used(graph) -> None:  # type: ignore[no-untyped-def]
    config = _config()
    await graph.ainvoke(
        {"question": "What drives housing prices in Europe?", "depth": "deep"}, config
    )
    assert len((await graph.aget_state(config)).values["plan"]) == 6

    edited = [{"text": "Only this one edited question"}]
    await graph.ainvoke(Command(resume=edited), config)
    final = (await graph.aget_state(config)).values
    assert [q.text for q in final["plan"]] == ["Only this one edited question"]
    assert {f.sub_question_index for f in final["findings"]} == {0}


async def test_feedback_changes_plan(graph) -> None:  # type: ignore[no-untyped-def]
    config = _config()
    await graph.ainvoke(
        {"question": "Impact of tariffs on trade", "depth": "quick", "feedback": "focus on Europe"},
        config,
    )
    plan = (await graph.aget_state(config)).values["plan"]
    assert all("(revised)" in q.text for q in plan)


def test_invalid_citations_are_dropped() -> None:
    text = "Fact one [1]. Fact two [7]. Fact three [2]."
    assert strip_invalid_citations(text, {1, 2}) == "Fact one [1]. Fact two. Fact three [2]."


async def test_fake_step_delay_applies_when_streaming(monkeypatch: pytest.MonkeyPatch) -> None:
    """astream_events streams chat models; the scripted delay must still slow each step."""
    import time

    from app.agents.llm import get_llm
    from app.core.config import settings

    monkeypatch.setattr(settings, "fake_step_delay_ms", 200)
    started = time.monotonic()
    async for _ in get_llm("fast").astream(
        "[task:reader] <untrusted_web_content>Hi.</untrusted_web_content>"
    ):
        pass
    assert time.monotonic() - started >= 0.2
