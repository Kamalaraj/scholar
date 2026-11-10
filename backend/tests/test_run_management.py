import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.db.models import ResearchRun, RunStatus
from app.db.session import async_session_maker
from app.main import app
from app.services import event_bus, run_executor, run_service
from tests.test_run_flow import _wait_for, graph_enabled  # noqa: F401
from tests.test_stream import _finished_run, parse_sse

Q = {"question": "How do solid-state batteries work?", "depth": "quick"}


async def _create(client: AsyncClient, headers: dict[str, str], question: str | None = None) -> str:
    body = {**Q, **({"question": question} if question else {})}
    res = await client.post("/api/v1/runs", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


async def _events(client: AsyncClient, headers: dict[str, str], run_id: str) -> list[dict]:  # type: ignore[type-arg]
    return parse_sse((await client.get(f"/api/v1/runs/{run_id}/stream", headers=headers)).text)


async def _set_failed(run_id: str, error: str = "boom") -> None:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, uuid.UUID(run_id))
        assert run is not None
        await run_service.transition_run(db, run, RunStatus.FAILED, error=error)


# ---------- search and filters ----------


async def test_search_and_multi_status_filter(client: AsyncClient, user_a: dict[str, str]) -> None:
    tag = uuid.uuid4().hex[:8]
    a = await _create(client, user_a, f"Heat pumps in {tag} cold climates")
    await _create(client, user_a, f"Solar panels near {tag} the equator")
    await _create(client, user_a, f"100% sure_thing {tag} question")

    def ids(res: object) -> list[str]:
        return [r["id"] for r in res.json()["items"]]  # type: ignore[attr-defined]

    found = await client.get(f"/api/v1/runs?q=HEAT PUMPS IN {tag}", headers=user_a)
    assert ids(found) == [a]
    # % and _ are literal characters, not wildcards
    assert len(ids(await client.get("/api/v1/runs?q=100%25 sure_thing", headers=user_a))) == 1
    assert ids(await client.get("/api/v1/runs?q=%25", headers=user_a)) != []  # matches the "%"
    assert ids(await client.get(f"/api/v1/runs?q=nothing-{tag}-matches", headers=user_a)) == []

    many = await client.get(
        "/api/v1/runs?status=pending&status=planning&status=failed", headers=user_a
    )
    assert many.status_code == 200
    assert {r["status"] for r in many.json()["items"]} <= {"pending", "planning", "failed"}
    assert (await client.get("/api/v1/runs?status=nope", headers=user_a)).status_code == 422
    assert (await client.get("/api/v1/runs?q=" + "x" * 201, headers=user_a)).status_code == 422


async def test_search_never_returns_another_users_runs(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    tag = uuid.uuid4().hex[:8]
    await _create(client, user_a, f"Private question about {tag} tides")
    assert (await client.get(f"/api/v1/runs?q={tag}", headers=user_b)).json()["items"] == []


# ---------- cancel ----------


@pytest.mark.usefixtures("graph_enabled")
async def test_cancel_during_research_stops_the_run(
    client: AsyncClient, user_a: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fake_step_delay_ms", 400)
    run_id = await _create(client, user_a)
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    await client.post(f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=user_a)
    await asyncio.sleep(0.3)

    res = await client.post(f"/api/v1/runs/{run_id}/cancel", headers=user_a)
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert res.json()["completed_at"] is not None
    assert uuid.UUID(run_id) not in run_executor._tasks  # the background task is gone

    before = await _events(client, user_a, run_id)
    assert before[-1]["type"] == "run_cancelled"
    await asyncio.sleep(1.2)  # long enough for any leaked branch to emit something
    after = await _events(client, user_a, run_id)
    assert [e["seq"] for e in after] == [e["seq"] for e in before]
    detail = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()
    assert detail["status"] == "cancelled" and detail["report"] is None

    # Cancelled runs can be deleted; finished ones cannot be cancelled again.
    assert (await client.post(f"/api/v1/runs/{run_id}/cancel", headers=user_a)).status_code == 409
    assert (await client.delete(f"/api/v1/runs/{run_id}", headers=user_a)).status_code == 204


@pytest.mark.usefixtures("graph_enabled")
async def test_cancel_rules(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    waiting = await _create(client, user_a)
    await _wait_for(client, user_a, waiting, "awaiting_approval")
    assert (await client.post(f"/api/v1/runs/{waiting}/cancel", headers=user_b)).status_code == 404
    assert (await client.post(f"/api/v1/runs/{waiting}/cancel")).status_code == 401
    assert (await client.post(f"/api/v1/runs/{waiting}/cancel", headers=user_a)).status_code == 200
    # Approving a cancelled plan is refused.
    approve = await client.post(
        f"/api/v1/runs/{waiting}/plan", json={"action": "approve"}, headers=user_a
    )
    assert approve.status_code == 409

    done = await _finished_run(client, user_a)
    assert (await client.post(f"/api/v1/runs/{done}/cancel", headers=user_a)).status_code == 409


# ---------- retry ----------


@pytest.mark.usefixtures("graph_enabled")
async def test_retry_reuses_question_and_plan_without_planning_again(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    run_id = await _create(client, user_a)
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    edited = [{"text": "My own edited angle"}, {"text": "A second custom angle"}]
    await client.post(
        f"/api/v1/runs/{run_id}/plan", json={"action": "approve", "items": edited}, headers=user_a
    )
    await _wait_for(client, user_a, run_id, "completed")
    # Completed runs are not retryable.
    assert (await client.post(f"/api/v1/runs/{run_id}/retry", headers=user_a)).status_code == 409
    await _set_failed_from_cancel(client, user_a, run_id)

    retry = await client.post(f"/api/v1/runs/{run_id}/retry", headers=user_a)
    assert retry.status_code == 201
    new_id = retry.json()["id"]
    assert new_id != run_id and retry.json()["question"] == Q["question"]
    waiting = await _wait_for(client, user_a, new_id, "awaiting_approval")
    assert [p["text"] for p in waiting["plan"]] == [e["text"] for e in edited]
    # The planner never ran for the retry; it paused straight at review.
    stored = await event_bus.replay(uuid.UUID(new_id), 0)  # (the live stream stays open here)
    nodes = [e.payload["node"] for e in stored if e.type == "node_start"]
    assert "planner" not in nodes and "plan_ready" in [e.type for e in stored]
    ok = await client.post(
        f"/api/v1/runs/{new_id}/plan", json={"action": "approve"}, headers=user_a
    )
    assert ok.status_code == 200
    done = await _wait_for(client, user_a, new_id, "completed")
    assert [p["text"] for p in done["plan"]] == [e["text"] for e in edited]
    assert done["report"] is not None


async def _set_failed_from_cancel(
    client: AsyncClient, headers: dict[str, str], run_id: str
) -> None:
    """Completed runs cannot fail; make a failed copy of the same state for the retry test."""
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, uuid.UUID(run_id))
        assert run is not None
        run.status = RunStatus.FAILED
        run.error = "boom"
        await db.commit()


@pytest.mark.usefixtures("graph_enabled")
async def test_retry_of_failed_and_cancelled_runs_and_ownership(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    failed = await _create(client, user_a)
    await _wait_for(client, user_a, failed, "awaiting_approval")
    await _set_failed(failed)
    assert (await client.post(f"/api/v1/runs/{failed}/retry", headers=user_b)).status_code == 404
    assert (await client.post(f"/api/v1/runs/{failed}/retry")).status_code == 401
    again = await client.post(f"/api/v1/runs/{failed}/retry", headers=user_a)
    assert again.status_code == 201
    waiting = await _wait_for(client, user_a, again.json()["id"], "awaiting_approval")
    assert len(waiting["plan"]) == 3  # the plan the failed run had

    cancelled = await _create(client, user_a)
    await _wait_for(client, user_a, cancelled, "awaiting_approval")
    await client.post(f"/api/v1/runs/{cancelled}/cancel", headers=user_a)
    assert (await client.post(f"/api/v1/runs/{cancelled}/retry", headers=user_a)).status_code == 201

    live = await _create(client, user_a)
    await _wait_for(client, user_a, live, "awaiting_approval")
    assert (await client.post(f"/api/v1/runs/{live}/retry", headers=user_a)).status_code == 409


# ---------- daily limit ----------


async def test_daily_limit_blocks_new_runs_with_a_reset_time(
    client: AsyncClient,
    user_a: dict[str, str],
    user_b: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "daily_run_limit", 2)
    await _create(client, user_a)
    await _create(client, user_a)
    blocked = await client.post("/api/v1/runs", json=Q, headers=user_a)
    assert blocked.status_code == 429
    assert "2 reports" in blocked.json()["detail"]
    reset = datetime.fromisoformat(blocked.headers["x-ratelimit-reset"])
    assert reset.hour == 0 and reset.minute == 0
    assert 0 < int(blocked.headers["retry-after"]) <= 86_400
    assert reset > datetime.now(UTC)
    # Another user has their own allowance; failed attempts do not create runs.
    assert (await client.post("/api/v1/runs", json=Q, headers=user_b)).status_code == 201
    listed = await client.get("/api/v1/runs", headers=user_a)
    assert len(listed.json()["items"]) == 2


@pytest.mark.usefixtures("graph_enabled")
async def test_retry_counts_against_the_daily_limit(
    client: AsyncClient, user_a: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    run_id = await _create(client, user_a)
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    await _set_failed(run_id)
    monkeypatch.setattr(settings, "daily_run_limit", 1)
    assert (await client.post(f"/api/v1/runs/{run_id}/retry", headers=user_a)).status_code == 429


async def test_limit_resets_at_the_next_utc_day() -> None:
    from app.db.models import User

    async with async_session_maker() as db:
        user = User(clerk_user_id=f"limit_{uuid.uuid4().hex}", email="l@example.com")
        db.add(user)
        await db.commit()
        old = settings.daily_run_limit
        settings.daily_run_limit = 1
        try:
            await run_service.create_run(
                db, user.id, "A question for the limit", run_service.Depth.QUICK
            )
            with pytest.raises(run_service.DailyLimitError):
                await run_service.check_daily_limit(db, user.id)
            tomorrow = datetime.now(UTC) + timedelta(days=1)
            await run_service.check_daily_limit(db, user.id, now=tomorrow)
        finally:
            settings.daily_run_limit = old


# ---------- recovery after a restart ----------


@pytest.mark.usefixtures("graph_enabled")
async def test_restart_resumes_research_from_the_checkpoint(
    client: AsyncClient, user_a: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fake_step_delay_ms", 300)
    run_id = await _create(client, user_a)
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    await client.post(f"/api/v1/runs/{run_id}/plan", json={"action": "approve"}, headers=user_a)
    await asyncio.sleep(0.5)
    # Simulate the process dying: the task stops without marking the run failed.
    run_executor._tasks[uuid.UUID(run_id)].cancel()
    await asyncio.sleep(0.2)
    status = (await client.get(f"/api/v1/runs/{run_id}", headers=user_a)).json()["status"]
    assert status in ("researching", "writing")

    monkeypatch.setattr(settings, "fake_step_delay_ms", 0)
    await run_executor.recover_inflight_runs(app.state.graph, only={uuid.UUID(run_id)})
    done = await _wait_for(client, user_a, run_id, "completed")
    assert done["report"] is not None and len(done["sources"]) >= 3
    types = [e["type"] for e in await _events(client, user_a, run_id)]
    assert "run_resumed" in types and types[-1] == "run_completed"
    seqs = [e["seq"] for e in await _events(client, user_a, run_id)]
    assert seqs == list(range(1, len(seqs) + 1))


async def _insert_run(
    user_id: uuid.UUID, status: RunStatus, age: timedelta = timedelta(0)
) -> uuid.UUID:
    """A run row with no graph checkpoint, as if the process died before the graph began."""
    async with async_session_maker() as db:
        run = ResearchRun(
            user_id=user_id,
            question="A question the server forgot about",
            depth=run_service.Depth.QUICK,
            status=status,
            created_at=datetime.now(UTC) - age,
        )
        db.add(run)
        await db.commit()
        return run.id


@pytest.mark.usefixtures("graph_enabled")
async def test_restart_marks_unresumable_runs_failed_with_a_reason(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    seed = await _create(client, user_a)
    async with async_session_maker() as db:
        owner = await db.get(ResearchRun, uuid.UUID(seed))
        assert owner is not None
        user_id = owner.user_id
    lost = await _insert_run(user_id, RunStatus.RESEARCHING)  # no checkpoint to resume from
    planning = await _insert_run(user_id, RunStatus.PLANNING)
    stale = await _insert_run(user_id, RunStatus.PENDING, age=timedelta(hours=1))

    ids = {lost, planning, stale}
    await run_executor.recover_inflight_runs(app.state.graph, only=ids)
    async with async_session_maker() as db:
        rows = {
            r.id: r for r in await db.scalars(select(ResearchRun).where(ResearchRun.id.in_(ids)))
        }
    assert rows[lost].error == run_executor.RESTART_LOST_REASON
    assert rows[planning].error == run_executor.RESTART_PLANNING_REASON
    assert rows[stale].error == run_executor.RESTART_STALE_REASON
    assert all(r.status is RunStatus.FAILED for r in rows.values())
    events = await _events(client, user_a, str(lost))
    assert events[-1]["type"] == "run_failed" and "restarted" in events[-1]["payload"]["error"]


@pytest.mark.usefixtures("graph_enabled")
async def test_restart_between_approval_and_research_starts_research(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    """Approval was saved (status researching) but the server died before the graph resumed."""
    run_id = await _create(client, user_a)
    await _wait_for(client, user_a, run_id, "awaiting_approval")
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, uuid.UUID(run_id))
        assert run is not None
        await run_service.approve_plan(
            db, run, [run_service.PlanItemIn(text="The one approved angle")]
        )  # no start_research: the process "died" here
    await run_executor.recover_inflight_runs(app.state.graph, only={uuid.UUID(run_id)})
    done = await _wait_for(client, user_a, run_id, "completed")
    assert [p["text"] for p in done["plan"]] == ["The one approved angle"]
    assert done["report"] is not None
