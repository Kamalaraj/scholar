"""Runs the research graph in background asyncio tasks and mirrors progress into the database."""

import asyncio
import logging
import uuid
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.types import Command

from app.agents.budget import BudgetExceededError, TokenBudget, current_budget
from app.agents.types import ResearchGraph as Graph
from app.core.config import settings
from app.db.models import ResearchRun, RunStatus
from app.db.session import async_session_maker
from app.services import run_service

log = logging.getLogger(__name__)

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


def start_planning(graph: Graph, run_id: uuid.UUID) -> None:
    _launch(run_id, _guarded(run_id, _plan(graph, run_id)))


def start_research(graph: Graph, run_id: uuid.UUID, items: list[tuple[str, str | None]]) -> None:
    _launch(run_id, _guarded(run_id, _research(graph, run_id, items)))


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
        log.exception("run failed", extra={"run_id": str(run_id), "error_id": error_id})
        if isinstance(exc, BudgetExceededError):
            reason = str(exc)
        elif isinstance(exc, TimeoutError):
            reason = f"The run took longer than {settings.run_timeout_seconds // 60} minutes."
        else:
            reason = "Something went wrong while researching."
        await _fail(run_id, f"{reason} (error id {error_id})")


async def _fail(run_id: uuid.UUID, reason: str) -> None:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is not None and run_service.can_transition(run.status, RunStatus.FAILED):
            await run_service.transition_run(db, run, RunStatus.FAILED, error=reason)


async def _plan(graph: Graph, run_id: uuid.UUID) -> None:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is None:
            return
        await run_service.transition_run(db, run, RunStatus.PLANNING)
        config = _config(run_id)
        await graph.ainvoke({"question": run.question, "depth": run.depth.value}, config)
        state = await graph.aget_state(config)
        await run_service.replace_plan_items(
            db, run_id, [(q.text, q.reason) for q in state.values["plan"]]
        )
        await run_service.transition_run(db, run, RunStatus.AWAITING_APPROVAL)


async def _research(graph: Graph, run_id: uuid.UUID, items: list[tuple[str, str | None]]) -> None:
    config = _config(run_id)
    resume = [{"text": text, "reason": reason} for text, reason in items]
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        if run is None:
            return
        done = 0
        async for update in graph.astream(Command(resume=resume), config, stream_mode="updates"):
            if "research" in update:
                done += 1
            reached_writer = done >= len(items) or "writer" in update
            if reached_writer and run.status is RunStatus.RESEARCHING:
                await run_service.transition_run(db, run, RunStatus.WRITING)
        values = (await graph.aget_state(config)).values
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
        await run_service.transition_run(db, run, RunStatus.COMPLETED)
