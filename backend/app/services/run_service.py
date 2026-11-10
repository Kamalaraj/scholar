import base64
import json
import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, Select, delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Depth, PlanItem, Report, ResearchRun, RunEvent, RunStatus, Source
from app.schemas.run import PlanItemIn, PlanItemOut, ReportOut, RunDetail, SourceOut
from app.services import event_bus

# Each re-plan is a strong-model call, so a run only gets a few.
MAX_REPLANS = 5

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


class TooManyReplansError(Exception):
    pass


class DailyLimitError(Exception):
    """The user already started their daily allowance of runs; `reset_at` is when it renews."""

    def __init__(self, limit: int, reset_at: datetime) -> None:
        super().__init__(f"Daily limit of {limit} runs reached")
        self.limit = limit
        self.reset_at = reset_at


class RunNotRetryableError(Exception):
    pass


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
    await event_bus.emit(run.id, "status", {"status": target.value})
    if target is RunStatus.CANCELLED:
        await event_bus.emit(run.id, "run_cancelled")
    elif target is RunStatus.COMPLETED:
        await event_bus.emit(run.id, "run_completed")
    elif target is RunStatus.FAILED:
        await event_bus.emit(run.id, "run_failed", {"error": run.error})
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


def _day_start(now: datetime) -> datetime:
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


async def check_daily_limit(
    db: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> None:
    """Allow `settings.daily_run_limit` new runs per user per UTC day (resets at 00:00 UTC)."""
    start = _day_start(now or datetime.now(UTC))
    started = await db.scalar(
        select(func.count(ResearchRun.id)).where(
            ResearchRun.user_id == user_id, ResearchRun.created_at >= start
        )
    )
    if (started or 0) >= settings.daily_run_limit:
        raise DailyLimitError(settings.daily_run_limit, start + timedelta(days=1))


async def create_run(
    db: AsyncSession, user_id: uuid.UUID, question: str, depth: Depth
) -> tuple[ResearchRun, int]:
    await check_daily_limit(db, user_id)
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
    statuses: Sequence[RunStatus] | None = None,
    search: str | None = None,
) -> tuple[list[tuple[ResearchRun, int]], str | None]:
    stmt = _runs_select().where(ResearchRun.user_id == user_id)
    if statuses:
        stmt = stmt.where(ResearchRun.status.in_(statuses))
    if search and search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(ResearchRun.question.ilike(f"%{escaped}%", escape="\\"))
    if cursor is not None:
        created_at, run_id = decode_cursor(cursor)
        stmt = stmt.where(
            tuple_(ResearchRun.created_at, ResearchRun.id) < tuple_(created_at, run_id)
        )
    stmt = stmt.order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc()).limit(limit + 1)
    rows = [(r[0], r[1]) for r in (await db.execute(stmt)).all()]
    next_cursor = encode_cursor(rows[limit - 1][0]) if len(rows) > limit else None
    return rows[:limit], next_cursor


async def cancel_run(db: AsyncSession, run: ResearchRun) -> ResearchRun:
    """Mark a run that has not finished as cancelled (the caller stops its background task)."""
    return await transition_run(db, run, RunStatus.CANCELLED)


async def create_retry(
    db: AsyncSession, user_id: uuid.UUID, run_id: uuid.UUID
) -> tuple[ResearchRun, list[tuple[str, str | None]]] | None:
    """Start a new run with the same question, depth and plan as a failed or cancelled one.

    None means the run is not the user's (404). The new run still waits for the user's approval."""
    found = await get_run(db, user_id, run_id)
    if found is None:
        return None
    old = found[0]
    if old.status not in (RunStatus.FAILED, RunStatus.CANCELLED):
        raise RunNotRetryableError("Only failed or cancelled runs can be retried")
    plan = [(p.text, p.reason) for p in await list_plan_items(db, old.id)]
    new, _ = await create_run(db, user_id, old.question, old.depth)
    return new, plan


async def delete_run(db: AsyncSession, run: ResearchRun) -> None:
    if run.status in ACTIVE_STATUSES:
        raise RunNotDeletableError("Cancel the run before deleting it")
    await db.delete(run)
    await db.commit()


async def list_plan_items(db: AsyncSession, run_id: uuid.UUID) -> list[PlanItem]:
    stmt = select(PlanItem).where(PlanItem.run_id == run_id).order_by(PlanItem.position)
    return list((await db.execute(stmt)).scalars())


async def get_run_detail(
    db: AsyncSession, user_id: uuid.UUID, run_id: uuid.UUID
) -> RunDetail | None:
    found = await get_run(db, user_id, run_id)
    if found is None:
        return None
    run, count = found
    sources = (
        await db.execute(
            select(Source).where(Source.run_id == run_id).order_by(Source.citation_num)
        )
    ).scalars()
    report = (await db.execute(select(Report).where(Report.run_id == run_id))).scalar_one_or_none()
    detail = RunDetail.model_validate(run)
    detail.source_count = count
    detail.plan = [PlanItemOut.model_validate(p) for p in await list_plan_items(db, run_id)]
    detail.sources = [SourceOut.model_validate(s) for s in sources]
    detail.report = ReportOut.model_validate(report) if report else None
    return detail


async def replace_plan_items(
    db: AsyncSession, run_id: uuid.UUID, items: list[tuple[str, str | None]]
) -> None:
    await db.execute(delete(PlanItem).where(PlanItem.run_id == run_id))
    db.add_all(
        PlanItem(run_id=run_id, position=i, text=text, reason=reason)
        for i, (text, reason) in enumerate(items)
    )
    await db.commit()


async def approve_plan(
    db: AsyncSession, run: ResearchRun, items: list[PlanItemIn] | None
) -> list[tuple[str, str | None]]:
    """Move to researching (only from awaiting_approval) and store the approved plan."""
    if run.status is not RunStatus.AWAITING_APPROVAL:
        raise InvalidTransitionError(run.status, RunStatus.RESEARCHING)
    if items is None:
        approved = [(p.text, p.reason) for p in await list_plan_items(db, run.id)]
    else:
        approved = [(i.text, i.reason) for i in items]
    await replace_plan_items(db, run.id, approved)
    await event_bus.emit(
        run.id, "plan_approved", {"items": [{"text": t, "reason": r} for t, r in approved]}
    )
    await transition_run(db, run, RunStatus.RESEARCHING)
    return approved


async def begin_replan(db: AsyncSession, run: ResearchRun) -> None:
    """Move back to planning (only from awaiting_approval) while the planner redrafts."""
    if run.status is not RunStatus.AWAITING_APPROVAL:
        raise InvalidTransitionError(run.status, RunStatus.PLANNING)
    drafted = await db.scalar(
        select(func.count(RunEvent.id)).where(
            RunEvent.run_id == run.id, RunEvent.type == "plan_ready"
        )
    )
    if (drafted or 0) - 1 >= MAX_REPLANS:
        raise TooManyReplansError
    await transition_run(db, run, RunStatus.PLANNING)


async def save_result(
    db: AsyncSession,
    run_id: uuid.UUID,
    sources: list[tuple[int, str, str, str, str | None]],
    markdown: str,
    key_findings: list[str],
) -> None:
    """Store the collected sources and the report for a finished run."""
    await db.execute(delete(Source).where(Source.run_id == run_id))
    await db.execute(delete(Report).where(Report.run_id == run_id))
    db.add_all(
        Source(run_id=run_id, citation_num=n, url=url, title=title, domain=domain, quote=quote)
        for n, url, title, domain, quote in sources
    )
    db.add(Report(run_id=run_id, markdown=markdown, key_findings=key_findings))
    await db.commit()


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:50].strip("-")
    return slug or "report"


def source_line(num: int, title: str, url: str, domain: str) -> str:
    """One numbered line of the exported Sources list.

    Titles come from untrusted web pages, so they are flattened to one line and escaped; a url
    that is not http(s) is shown as plain text with no link."""
    safe_title = re.sub(r"\s+", " ", title).strip().replace("\\", "\\\\")
    safe_title = safe_title.replace("[", "\\[").replace("]", "\\]")
    if not re.match(r"https?://", url, re.IGNORECASE):
        return f"{num}. {safe_title} ({domain})"
    safe_url = re.sub(r"\s", "", url).replace("(", "%28").replace(")", "%29")
    return f"{num}. [{safe_title}]({safe_url}) ({domain})"


async def build_report_markdown(
    db: AsyncSession, user_id: uuid.UUID, run_id: uuid.UUID
) -> tuple[str, str] | None:
    """The report as one Markdown document (title, key findings, body, sources) plus a filename.

    None when the run is not the user's or has no report yet (both are a 404 for the caller)."""
    detail = await get_run_detail(db, user_id, run_id)
    if detail is None or detail.report is None:
        return None
    parts = [f"# {detail.question}", ""]
    parts.append(
        f"*{detail.depth.value.capitalize()} research, {len(detail.sources)} sources, "
        f"{(detail.completed_at or detail.created_at).date().isoformat()}*"
    )
    if detail.report.key_findings:
        parts += ["", "## Key findings", ""] + [f"- {k}" for k in detail.report.key_findings]
    parts += ["", detail.report.markdown.strip(), "", "## Sources", ""]
    for s in detail.sources:
        parts.append(source_line(s.citation_num, s.title, s.url, s.domain))
    return "\n".join(parts) + "\n", f"{_slug(detail.question)}.md"
