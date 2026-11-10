"""Runs the research graph in background asyncio tasks and mirrors progress into the database."""

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from sqlalchemy import select

from app.agents.budget import BudgetExceededError, TokenBudget, current_budget
from app.agents.state import SubQuestion
from app.agents.types import ResearchGraph as Graph
from app.core.config import settings
from app.db.models import ResearchRun, RunStatus
from app.db.session import async_session_maker
from app.services import event_bus, run_service

log = logging.getLogger(__name__)

RESTART_PLANNING_REASON = (
    "The server restarted while the plan was being drafted. Retry to start again."
)
RESTART_LOST_REASON = (
    "The server restarted and this run could not be resumed. Retry to start again."
)

RESTART_STALE_REASON = "This run never started. Retry to start again."
PENDING_GRACE = timedelta(minutes=10)

_tasks: dict[uuid.UUID, asyncio.Task[None]] = {}


def _config(run_id: uuid.UUID) -> RunnableConfig:
    return {
        "configurable": {"thread_id": str(run_id)},
        "max_concurrency": settings.max_research_concurrency,
    }


def _launch(run_id: uuid.UUID, coro: Any) -> None:
    task = asyncio.create_task(coro, name=f"run-{run_id}")
    _tasks[run_id] = task
    task.add_done_callback(lambda _t: _tasks.pop(run_id, None))


def start_planning(
    graph: Graph, run_id: uuid.UUID, plan: list[tuple[str, str | None]] | None = None
) -> None:
    """Draft a plan, or (for a retry) pause for approval with the plan the user already had."""
    _launch(run_id, _guarded(run_id, _plan(graph, run_id, plan)))


def start_replan(graph: Graph, run_id: uuid.UUID, feedback: str) -> None:
    _launch(run_id, _guarded(run_id, _replan(graph, run_id, feedback)))


def start_research(graph: Graph, run_id: uuid.UUID, items: list[tuple[str, str | None]]) -> None:
    _launch(run_id, _guarded(run_id, _research(graph, run_id, items)))


async def cancel_task(run_id: uuid.UUID) -> None:
    """Stop a run's background task (and with it any in-flight search, fetch or model call)."""
    task = _tasks.get(run_id)
    if task is None or task.done():
        return
    task.cancel()
    await asyncio.wait({task}, timeout=5)  # never raises; the task re-raises CancelledError


async def _guarded(run_id: uuid.UUID, work: Any) -> None:
    """Budget + wall-clock limit around one graph segment; any failure marks the run failed."""
    current_budget.set(TokenBudget(settings.run_token_budget))
    try:
        async with asyncio.timeout(settings.run_timeout_seconds):
            await work
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        error_id = uuid.uuid4().hex[:8]
        log.exception(
            "run failed",
            extra={
                "run_id": str(run_id),
                "user_id": str(await _owner_of(run_id)),
                "error_id": error_id,
            },
        )
        if isinstance(exc, BudgetExceededError):
            reason = str(exc)
        elif isinstance(exc, TimeoutError):
            reason = f"The run took longer than {settings.run_timeout_seconds // 60} minutes."
        else:
            reason = "Something went wrong while researching."
        await _fail(run_id, f"{reason} (error id {error_id})")


async def _owner_of(run_id: uuid.UUID) -> uuid.UUID | None:
    async with async_session_maker() as db:
        return await db.scalar(select(ResearchRun.user_id).where(ResearchRun.id == run_id))


async def _fail(run_id: uuid.UUID, reason: str) -> None:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is not None and run_service.can_transition(run.status, RunStatus.FAILED):
            await run_service.transition_run(db, run, RunStatus.FAILED, error=reason)


_NODES = frozenset({"planner", "research", "searcher", "reader", "writer"})


async def _stream(
    graph: Graph,
    run_id: uuid.UUID,
    graph_input: Any,
    on_writer: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """Run the graph, turning LangGraph events into app events."""
    async for ev in graph.astream_events(graph_input, _config(run_id), version="v2"):
        kind, name = ev["event"], ev["name"]
        if kind == "on_custom_event":
            await event_bus.emit(run_id, name, dict(ev["data"]))
            continue
        if name not in _NODES or ev["metadata"].get("langgraph_node") != name:
            continue
        if kind == "on_chain_start":
            payload: dict[str, Any] = {"node": name}
            data = ev["data"].get("input")
            if isinstance(data, dict) and "index" in data:
                payload["index"] = data["index"]
            if name == "writer" and on_writer is not None:
                await on_writer()
            await event_bus.emit(run_id, "node_start", payload)
        elif kind == "on_chain_end":
            payload = {"node": name}
            data = ev["data"].get("input")
            if isinstance(data, dict) and "index" in data:
                payload["index"] = data["index"]
            await event_bus.emit(run_id, "node_end", payload)


async def _publish_plan(graph: Graph, run_id: uuid.UUID, run: ResearchRun, db: Any) -> None:
    """Store the planner's latest plan, announce it and wait for the user."""
    state = await graph.aget_state(_config(run_id))
    items = [(q.text, q.reason) for q in state.values["plan"]]
    await run_service.replace_plan_items(db, run_id, items)
    await event_bus.emit(
        run_id, "plan_ready", {"items": [{"text": t, "reason": r} for t, r in items]}
    )
    await run_service.transition_run(db, run, RunStatus.AWAITING_APPROVAL)


async def _plan(
    graph: Graph, run_id: uuid.UUID, prefilled: list[tuple[str, str | None]] | None
) -> None:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is None:
            return
        await run_service.transition_run(db, run, RunStatus.PLANNING)
        initial: dict[str, Any] = {"question": run.question, "depth": run.depth.value}
        if prefilled:
            initial["plan"] = [SubQuestion(text=t, reason=r) for t, r in prefilled]
        await _stream(graph, run_id, initial)
        await _publish_plan(graph, run_id, run, db)


async def _replan(graph: Graph, run_id: uuid.UUID, feedback: str) -> None:
    """The run is already `planning` (set by the request); redraft with the user's feedback."""
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is None:
            return
        await _stream(graph, run_id, Command(resume={"replan": feedback}))
        await _publish_plan(graph, run_id, run, db)


async def _research(graph: Graph, run_id: uuid.UUID, items: list[tuple[str, str | None]]) -> None:
    resume = [{"text": text, "reason": reason} for text, reason in items]
    await _execute(graph, run_id, Command(resume=resume))


async def _resume(graph: Graph, run_id: uuid.UUID) -> None:
    """Continue a run from its last checkpoint after the server restarted."""
    await event_bus.emit(run_id, "run_resumed", {})
    await _execute(graph, run_id, None)


async def _execute(graph: Graph, run_id: uuid.UUID, graph_input: Any) -> None:
    """Run research and writing to the end, then store the report and complete the run."""
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is None:
            return

        async def to_writing() -> None:
            if run.status is RunStatus.RESEARCHING:
                await run_service.transition_run(db, run, RunStatus.WRITING)

        await _stream(graph, run_id, graph_input, on_writer=to_writing)
        await _complete(graph, run_id, run, db)


async def _complete(graph: Graph, run_id: uuid.UUID, run: ResearchRun, db: Any) -> None:
    values = (await graph.aget_state(_config(run_id))).values
    await run_service.save_result(
        db,
        run_id,
        [
            (s.citation_num or 0, s.url, s.title, s.domain, s.quote)
            for s in values["numbered_sources"]
        ],
        values["report_markdown"],
        values["key_findings"],
    )
    if run.status is RunStatus.RESEARCHING:
        await run_service.transition_run(db, run, RunStatus.WRITING)
    await run_service.transition_run(db, run, RunStatus.COMPLETED)


async def recover_inflight_runs(graph: Graph, only: set[uuid.UUID] | None = None) -> None:
    """On startup, pick up runs the previous process left in flight.

    Pending runs start planning. Researching and writing runs resume from their checkpoint; if
    there is nothing to resume they are marked failed with a reason. Runs that were still
    planning cannot be resumed (the draft is not checkpointed), so the user is asked to retry.
    Assumes a single backend process: a second one would resume the same runs. `only` limits
    recovery to those runs (used by tests that share a database)."""
    async with async_session_maker() as db:
        stmt = select(ResearchRun).where(
            ResearchRun.status.in_(
                [RunStatus.PENDING, RunStatus.PLANNING, RunStatus.RESEARCHING, RunStatus.WRITING]
            )
        )
        if only is not None:
            stmt = stmt.where(ResearchRun.id.in_(only))
        runs = list(await db.scalars(stmt))
    for run in runs:
        if run.id in _tasks:
            continue
        extra = {"run_id": str(run.id), "user_id": str(run.user_id)}
        if run.status is RunStatus.PENDING:
            if datetime.now(UTC) - run.created_at > PENDING_GRACE:
                await _fail(run.id, RESTART_STALE_REASON)  # too old to start now, spending tokens
            else:
                log.info("starting a run that never began", extra=extra)
                start_planning(graph, run.id)
        elif run.status is RunStatus.PLANNING:
            await _fail(run.id, RESTART_PLANNING_REASON)
        else:
            state = await graph.aget_state(_config(run.id))
            if "human_review" in state.next:
                # Approval was saved but the graph never resumed: research the approved plan.
                async with async_session_maker() as db:
                    approved = [
                        (p.text, p.reason) for p in await run_service.list_plan_items(db, run.id)
                    ]
                log.info("starting research that never began", extra=extra)
                start_research(graph, run.id, approved)
            elif state.next:
                log.info("resuming run from checkpoint", extra=extra)
                _launch(run.id, _guarded(run.id, _resume(graph, run.id)))
            elif state.values.get("report_markdown"):
                _launch(run.id, _guarded(run.id, _finish_saved(graph, run.id)))
            else:
                await _fail(run.id, RESTART_LOST_REASON)


async def _finish_saved(graph: Graph, run_id: uuid.UUID) -> None:
    """The graph finished before the restart but the report was never stored."""
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is not None:
            await _complete(graph, run_id, run, db)
