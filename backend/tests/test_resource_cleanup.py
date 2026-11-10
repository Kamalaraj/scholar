"""AUDIT_PLAN 3.8: finished runs and closed streams leave nothing behind in the process."""

import asyncio
import os
import subprocess
import uuid

import pytest
from httpx import AsyncClient

from app.services import event_bus, run_executor
from tests.test_run_flow import _wait_for, graph_enabled  # noqa: F401
from tests.test_stream import _events_of

# The audit runs 50 (CLEANUP_RUNS=50); the everyday suite keeps it short.
RUNS = int(os.environ.get("CLEANUP_RUNS", "15"))


def rss_mb() -> float:
    out = subprocess.run(
        ["ps", "-o", "rss=", "-p", str(os.getpid())], capture_output=True, text=True
    )
    return int(out.stdout.strip()) / 1024


async def _one_run(client: AsyncClient, headers: dict[str, str]) -> str:
    run_id = (
        await client.post(
            "/api/v1/runs", json={"question": "How do solid-state batteries work?"}, headers=headers
        )
    ).json()["id"]
    await _wait_for(client, headers, run_id, "awaiting_approval")
    await client.post(f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=headers)
    await _wait_for(client, headers, run_id, "completed")
    await _events_of(client, headers, run_id)  # open and finish one stream per run
    return str(run_id)


@pytest.mark.usefixtures("graph_enabled")
async def test_runs_leave_no_tasks_channels_or_subscribers(
    client: AsyncClient, user_a: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    finished: list[uuid.UUID] = []
    await _one_run(client, user_a)  # warm up imports, pools and caches
    await asyncio.sleep(0.2)
    before = rss_mb()
    for _ in range(RUNS):
        finished.append(uuid.UUID(await _one_run(client, user_a)))
    await asyncio.sleep(0.3)
    after = rss_mb()

    assert run_executor._tasks == {}, "background tasks were not cleaned up"
    assert not [rid for rid in finished if rid in event_bus._channels], (
        "finished runs kept their event channel"
    )
    assert all(not c.subscribers for c in event_bus._channels.values()), "stream subscribers leaked"
    with capsys.disabled():
        print(
            f"\nRSS {before:.0f} MB -> {after:.0f} MB after {RUNS} runs ({after - before:+.0f} MB)"
        )
    assert after - before < 60, f"memory grew by more than 60 MB over {RUNS} runs"


async def test_channels_of_abandoned_runs_are_bounded(user_a: dict[str, str]) -> None:
    """Runs that never finish (left awaiting approval) must not pile up in memory."""
    from app.db.models import Depth, ResearchRun, RunStatus, User
    from app.db.session import async_session_maker

    cap = event_bus.MAX_IDLE_CHANNELS
    async with async_session_maker() as db:
        user = User(clerk_user_id=f"evict_{uuid.uuid4().hex}", email="e@example.com")
        db.add(user)
        await db.flush()
        runs = [
            ResearchRun(
                user_id=user.id,
                question="An abandoned question",
                depth=Depth.QUICK,
                status=RunStatus.PLANNING,
            )
            for _ in range(cap + 60)
        ]
        db.add_all(runs)
        await db.commit()
        ids = [r.id for r in runs]
    for rid in ids:
        await event_bus.emit(rid, "status", {"status": "planning"})
    assert len(event_bus._channels) <= cap
    # An evicted run keeps numbering correctly: the counter is rebuilt from the database.
    await event_bus.emit(ids[0], "status", {"status": "awaiting_approval"})
    assert [e.seq for e in await event_bus.replay(ids[0], 0)] == [1, 2]
