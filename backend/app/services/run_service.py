import base64
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Select, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Depth, ResearchRun, RunStatus, Source

TERMINAL_STATUSES = frozenset({RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED})
# Runs the background graph is actively working on: they must be cancelled before deletion.
ACTIVE_STATUSES = frozenset({RunStatus.PLANNING, RunStatus.RESEARCHING, RunStatus.WRITING})

ALLOWED_TRANSITIONS: dict[RunStatus, frozenset[RunStatus]] = {
    RunStatus.PENDING: frozenset({RunStatus.PLANNING, RunStatus.CANCELLED, RunStatus.FAILED}),
    RunStatus.PLANNING: frozenset(
        {RunStatus.AWAITING_APPROVAL, RunStatus.CANCELLED, RunStatus.FAILED}
    ),
    # PLANNING again is a re-plan requested by the user.
    RunStatus.AWAITING_APPROVAL: frozenset(
        {RunStatus.PLANNING, RunStatus.RESEARCHING, RunStatus.CANCELLED, RunStatus.FAILED}
    ),
    RunStatus.RESEARCHING: frozenset({RunStatus.WRITING, RunStatus.CANCELLED, RunStatus.FAILED}),
    RunStatus.WRITING: frozenset({RunStatus.COMPLETED, RunStatus.CANCELLED, RunStatus.FAILED}),
    RunStatus.COMPLETED: frozenset(),
    RunStatus.FAILED: frozenset(),
    RunStatus.CANCELLED: frozenset(),
}


class InvalidTransitionError(Exception):
    def __init__(self, current: RunStatus, target: RunStatus) -> None:
        super().__init__(f"Cannot move a run from {current.value} to {target.value}")
        self.current = current
        self.target = target


class InvalidCursorError(ValueError):
    pass


class RunNotDeletableError(Exception):
    pass


def can_transition(current: RunStatus, target: RunStatus) -> bool:
    return target in ALLOWED_TRANSITIONS[current]


async def transition_run(
    db: AsyncSession, run: ResearchRun, target: RunStatus, error: str | None = None
) -> ResearchRun:
    """The single place where a run's status changes."""
    if not can_transition(run.status, target):
        raise InvalidTransitionError(run.status, target)
    run.status = target
    if target is RunStatus.FAILED:
        run.error = error
    if target in TERMINAL_STATUSES:
        run.completed_at = datetime.now(UTC)
    await db.commit()
    return run


def _source_count() -> ColumnElement[int]:
    return (
        select(func.count(Source.id))
        .where(Source.run_id == ResearchRun.id)
        .correlate(ResearchRun)
        .scalar_subquery()
    )


def _runs_select() -> Select[ResearchRun, int]:
    return select(ResearchRun, _source_count().label("source_count"))


async def create_run(
    db: AsyncSession, user_id: uuid.UUID, question: str, depth: Depth
) -> tuple[ResearchRun, int]:
    run = ResearchRun(user_id=user_id, question=question.strip(), depth=depth)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run, 0


async def get_run(
    db: AsyncSession, user_id: uuid.UUID, run_id: uuid.UUID
) -> tuple[ResearchRun, int] | None:
    """Fetch a run only if it belongs to the user; None means 404."""
    stmt = _runs_select().where(ResearchRun.id == run_id, ResearchRun.user_id == user_id)
    row = (await db.execute(stmt)).first()
    return (row[0], row[1]) if row else None


def encode_cursor(run: ResearchRun) -> str:
    raw = json.dumps({"c": run.created_at.isoformat(), "i": str(run.id)})
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return datetime.fromisoformat(data["c"]), uuid.UUID(data["i"])
    except (ValueError, KeyError, TypeError) as exc:
        raise InvalidCursorError("Invalid cursor") from exc


async def list_runs(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int,
    cursor: str | None = None,
    status: RunStatus | None = None,
) -> tuple[list[tuple[ResearchRun, int]], str | None]:
    stmt = _runs_select().where(ResearchRun.user_id == user_id)
    if status is not None:
        stmt = stmt.where(ResearchRun.status == status)
    if cursor is not None:
        created_at, run_id = decode_cursor(cursor)
        stmt = stmt.where(
            tuple_(ResearchRun.created_at, ResearchRun.id) < tuple_(created_at, run_id)
        )
    stmt = stmt.order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc()).limit(limit + 1)
    rows = [(r[0], r[1]) for r in (await db.execute(stmt)).all()]
    next_cursor = encode_cursor(rows[limit - 1][0]) if len(rows) > limit else None
    return rows[:limit], next_cursor


async def delete_run(db: AsyncSession, run: ResearchRun) -> None:
    if run.status in ACTIVE_STATUSES:
        raise RunNotDeletableError("Cancel the run before deleting it")
    await db.delete(run)
    await db.commit()
