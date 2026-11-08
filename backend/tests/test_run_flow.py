import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import AsyncClient
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.graph import build_graph, make_serde
from app.main import app


@pytest.fixture
async def graph_enabled() -> AsyncGenerator[None, None]:
    app.state.graph = build_graph(InMemorySaver(serde=make_serde()))
    yield
    del app.state.graph


async def _wait_for(client: AsyncClient, headers: dict[str, str], run_id: str, status: str) -> Any:
    for _ in range(100):
        data = (await client.get(f"/api/v1/runs/{run_id}", headers=headers)).json()
        if data["status"] == status:
            return data
        assert data["status"] != "failed", data["error"]
        await asyncio.sleep(0.05)
    raise AssertionError(f"run never reached {status}")


@pytest.mark.usefixtures("graph_enabled")
async def test_full_flow_in_fake_mode(client: AsyncClient, user_a: dict[str, str]) -> None:
    created = await client.post(
        "/api/v1/runs",
        json={"question": "How do solid-state batteries work?", "depth": "quick"},
        headers=user_a,
    )
    run_id = created.json()["id"]
    waiting = await _wait_for(client, user_a, run_id, "awaiting_approval")
    assert len(waiting["plan"]) == 3

    approved = await client.post(
        f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=user_a
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "researching"

    done = await _wait_for(client, user_a, run_id, "completed")
    assert len(done["sources"]) >= 3
    assert done["source_count"] == len(done["sources"])
    assert done["report"]["markdown"] and done["report"]["key_findings"]
    numbers = {s["citation_num"] for s in done["sources"]}
    import re

    assert {int(n) for n in re.findall(r"\[(\d+)\]", done["report"]["markdown"])} <= numbers


@pytest.mark.usefixtures("graph_enabled")
async def test_edited_plan_is_what_gets_researched(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = (
        await client.post(
            "/api/v1/runs", json={"question": "What is quantum computing?"}, headers=user_a
        )
    ).json()["id"]
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    edited = [{"text": "Only my own edited question"}]
    resp = await client.post(
        f"/api/v1/runs/{run_id}/plan", json={"action": "approve", "items": edited}, headers=user_a
    )
    assert resp.status_code == 200
    done = await _wait_for(client, user_a, run_id, "completed")
    assert [p["text"] for p in done["plan"]] == ["Only my own edited question"]


@pytest.mark.usefixtures("graph_enabled")
async def test_plan_validation_status_and_ownership(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    run_id = (
        await client.post(
            "/api/v1/runs", json={"question": "What is quantum computing?"}, headers=user_a
        )
    ).json()["id"]
    url = f"/api/v1/runs/{run_id}/plan"
    # Not awaiting approval yet (or racing): either way a bad body is a 422
    assert (
        await client.post(url, json={"action": "approve", "items": []}, headers=user_a)
    ).status_code == 422
    too_short = {"action": "approve", "items": [{"text": "abc"}]}
    assert (await client.post(url, json=too_short, headers=user_a)).status_code == 422
    nine = {"action": "approve", "items": [{"text": f"Question number {i}"} for i in range(9)]}
    assert (await client.post(url, json=nine, headers=user_a)).status_code == 422

    assert (await client.post(url, json={"action": "approve"}, headers=user_b)).status_code == 404

    await _wait_for(client, user_a, run_id, "awaiting_approval")
    assert (await client.post(url, json={"action": "approve"}, headers=user_a)).status_code == 200
    again = await client.post(url, json={"action": "approve"}, headers=user_a)
    assert again.status_code == 409
    await _wait_for(client, user_a, run_id, "completed")


@pytest.mark.usefixtures("graph_enabled")
async def test_run_fails_cleanly_when_over_budget(
    client: AsyncClient, user_a: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "run_token_budget", 10)
    run_id = (
        await client.post(
            "/api/v1/runs", json={"question": "What is quantum computing?"}, headers=user_a
        )
    ).json()["id"]
    for _ in range(100):
        data = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()
        if data["status"] == "failed":
            assert "token budget" in data["error"] and "error id" in data["error"]
            return
        await asyncio.sleep(0.05)
    raise AssertionError("run did not fail")


async def test_plan_endpoint_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/runs/00000000-0000-0000-0000-000000000000/plan", json={"action": "approve"}
    )
    assert resp.status_code == 401
