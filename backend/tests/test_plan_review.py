import pytest
from httpx import AsyncClient

from tests.test_run_flow import _wait_for, graph_enabled  # noqa: F401
from tests.test_stream import parse_sse

Q = {"question": "How do solid-state batteries work?", "depth": "quick"}


async def _awaiting(client: AsyncClient, headers: dict[str, str]) -> str:
    run_id = (await client.post("/api/v1/runs", json=Q, headers=headers)).json()["id"]
    await _wait_for(client, headers, run_id, "awaiting_approval")
    return str(run_id)


async def _events(client: AsyncClient, headers: dict[str, str], run_id: str) -> list[dict]:  # type: ignore[type-arg]
    return parse_sse((await client.get(f"/api/v1/runs/{run_id}/stream", headers=headers)).text)


@pytest.mark.usefixtures("graph_enabled")
async def test_replan_sends_feedback_and_pauses_again(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = await _awaiting(client, user_a)
    first = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()["plan"]
    resp = await client.post(
        f"/api/v1/runs/{run_id}/plan",
        json={"action": "replan", "feedback": "focus on Europe"},
        headers=user_a,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "planning"

    second = (await _wait_for(client, user_a, run_id, "awaiting_approval"))["plan"]
    assert len(second) == len(first)
    assert all("(revised)" in p["text"] for p in second)  # the fake planner echoes feedback
    assert not any("(revised)" in p["text"] for p in first)

    # The graph is paused again: it can be approved, and runs to completion.
    ok = await client.post(
        f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=user_a
    )
    assert ok.status_code == 200
    done = await _wait_for(client, user_a, run_id, "completed")
    assert [p["text"] for p in done["plan"]] == [p["text"] for p in second]

    plans = [e for e in await _events(client, user_a, run_id) if e["type"] == "plan_ready"]
    assert len(plans) == 2


@pytest.mark.usefixtures("graph_enabled")
async def test_edited_items_are_what_the_agents_search(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = await _awaiting(client, user_a)
    edited = [{"text": "Edited angle number one"}, {"text": "Edited angle number two"}]
    await client.post(
        f"/api/v1/runs/{run_id}/plan", json={"action": "approve", "items": edited}, headers=user_a
    )
    await _wait_for(client, user_a, run_id, "completed")
    events = await _events(client, user_a, run_id)
    searched = sorted(
        e["payload"]["query"]
        for e in events
        if e["type"] == "tool_call" and e["payload"]["tool"] == "search"
    )
    assert searched == ["Edited angle number one", "Edited angle number two"]
    approved = [e for e in events if e["type"] == "plan_approved"]
    assert [i["text"] for i in approved[0]["payload"]["items"]] == [e["text"] for e in edited]
    lanes = {
        e["payload"]["index"]
        for e in events
        if e["type"] == "node_start" and e["payload"]["node"] == "research"
    }
    assert lanes == {0, 1}


@pytest.mark.usefixtures("graph_enabled")
async def test_replan_validation_and_state_rules(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    run_id = await _awaiting(client, user_a)
    url = f"/api/v1/runs/{run_id}/plan"
    for body in (
        {"action": "replan"},
        {"action": "replan", "feedback": "  "},
        {"action": "replan", "feedback": "x" * 501},
        {"action": "approve", "items": [{"text": "x" * 301}]},
    ):
        assert (await client.post(url, json=body, headers=user_a)).status_code == 422
    assert (
        await client.post(url, json={"action": "replan", "feedback": "more depth"}, headers=user_b)
    ).status_code == 404
    # Re-planning twice in a row: the second call races a run that is already planning.
    assert (
        await client.post(url, json={"action": "replan", "feedback": "more depth"}, headers=user_a)
    ).status_code == 200
    again = await client.post(url, json={"action": "replan", "feedback": "more"}, headers=user_a)
    assert again.status_code == 409
    await _wait_for(client, user_a, run_id, "awaiting_approval")


@pytest.mark.usefixtures("graph_enabled")
async def test_replans_are_capped_per_run(client: AsyncClient, user_a: dict[str, str]) -> None:
    from app.services.run_service import MAX_REPLANS

    run_id = await _awaiting(client, user_a)
    url = f"/api/v1/runs/{run_id}/plan"
    for _ in range(MAX_REPLANS):
        ok = await client.post(
            url, json={"action": "replan", "feedback": "another try"}, headers=user_a
        )
        assert ok.status_code == 200
        await _wait_for(client, user_a, run_id, "awaiting_approval")
    over = await client.post(url, json={"action": "replan", "feedback": "one more"}, headers=user_a)
    assert over.status_code == 429
    assert "approve" in over.json()["detail"].lower()
    # The run is still usable: it can be approved.
    assert (await client.post(url, json={"action": "approve"}, headers=user_a)).status_code == 200
    await _wait_for(client, user_a, run_id, "completed")
