import asyncio
import json
from typing import Any

import pytest
from httpx import AsyncClient

from tests.test_run_flow import _wait_for, graph_enabled  # noqa: F401


def parse_sse(text: str) -> list[dict[str, Any]]:
    events = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.split("\n") if ": " in line)
        if "data" in fields:
            events.append(
                {"id": int(fields["id"]), "event": fields["event"], **json.loads(fields["data"])}
            )
    return events


async def _finished_run(client: AsyncClient, headers: dict[str, str]) -> str:
    created = await client.post(
        "/api/v1/runs",
        json={"question": "How do solid-state batteries work?", "depth": "quick"},
        headers=headers,
    )
    run_id = created.json()["id"]
    await _wait_for(client, headers, run_id, "awaiting_approval")
    await client.post(f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=headers)
    await _wait_for(client, headers, run_id, "completed")
    return str(run_id)


@pytest.mark.usefixtures("graph_enabled")
async def test_stream_replays_every_event_once_in_order(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = await _finished_run(client, user_a)
    res = await client.get(f"/api/v1/runs/{run_id}/stream", headers=user_a)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["x-accel-buffering"] == "no"
    events = parse_sse(res.text)
    seqs = [e["seq"] for e in events]
    assert seqs == list(range(1, len(seqs) + 1))
    assert [e["id"] for e in events] == seqs
    types = [e["type"] for e in events]
    assert "plan_ready" in types and "source_found" in types and "tool_call" in types
    assert types[-1] == "run_completed"
    statuses = [e["payload"]["status"] for e in events if e["type"] == "status"]
    assert statuses == ["planning", "awaiting_approval", "researching", "writing", "completed"]
    started = [
        e for e in events if e["type"] == "node_start" and e["payload"]["node"] == "research"
    ]
    assert sorted(e["payload"]["index"] for e in started) == [0, 1, 2]


@pytest.mark.usefixtures("graph_enabled")
async def test_stream_resumes_after_seq_without_duplicates(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = await _finished_run(client, user_a)
    everything = parse_sse((await client.get(f"/api/v1/runs/{run_id}/stream", headers=user_a)).text)
    cut = everything[4]["seq"]
    rest = parse_sse(
        (await client.get(f"/api/v1/runs/{run_id}/stream?after_seq={cut}", headers=user_a)).text
    )
    assert [e["seq"] for e in rest] == [e["seq"] for e in everything if e["seq"] > cut]


@pytest.mark.usefixtures("graph_enabled")
async def test_stream_follows_a_live_run(client: AsyncClient, user_a: dict[str, str]) -> None:
    created = await client.post(
        "/api/v1/runs",
        json={"question": "How do solid-state batteries work?", "depth": "quick"},
        headers=user_a,
    )
    run_id = created.json()["id"]

    async def approve_when_ready() -> None:
        await _wait_for(client, user_a, run_id, "awaiting_approval")
        await client.post(f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=user_a)

    approver = asyncio.create_task(approve_when_ready())
    res = await asyncio.wait_for(client.get(f"/api/v1/runs/{run_id}/stream", headers=user_a), 20)
    await approver
    events = parse_sse(res.text)
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    assert events[-1]["type"] == "run_completed"


@pytest.mark.usefixtures("graph_enabled")
async def test_stream_requires_auth_and_ownership(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    run_id = await _finished_run(client, user_a)
    assert (await client.get(f"/api/v1/runs/{run_id}/stream")).status_code == 401
    assert (await client.get(f"/api/v1/runs/{run_id}/stream", headers=user_b)).status_code == 404
