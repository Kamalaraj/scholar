import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.core.security import get_current_user
from app.db.models import ResearchRun, User
from app.db.session import async_session_maker, get_db
from app.services import event_bus, run_service

router = APIRouter(prefix="/runs", tags=["stream"])

HEARTBEAT_SECONDS = 15
IDLE_CHECK_SECONDS = 5.0


def _sse(event: event_bus.RunEventOut) -> ServerSentEvent:
    return ServerSentEvent(data=event.model_dump_json(), event=event.type, id=str(event.seq))


async def _is_terminal(run_id: uuid.UUID) -> bool:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, run_id)
        return run is None or run.status in run_service.TERMINAL_STATUSES


async def _follow(
    request: Request, run_id: uuid.UUID, after_seq: int
) -> AsyncIterator[ServerSentEvent]:
    """Replay stored events after `after_seq`, then follow live ones until the run ends."""
    queue = event_bus.subscribe(run_id)  # subscribe first so nothing is missed during replay
    last = after_seq
    try:
        while True:
            for event in await event_bus.replay(run_id, last):
                last = event.seq
                yield _sse(event)
                if event.type in event_bus.TERMINAL_EVENTS:
                    return
            # Drain the queue; anything already replayed is skipped by seq.
            try:
                while True:
                    event = await asyncio.wait_for(queue.get(), IDLE_CHECK_SECONDS)
                    if event.seq <= last:
                        continue
                    if event.seq != last + 1:
                        break  # gap (should not happen): go back to the database
                    last = event.seq
                    yield _sse(event)
                    if event.type in event_bus.TERMINAL_EVENTS:
                        return
            except TimeoutError:
                if await request.is_disconnected():
                    return
                if await _is_terminal(run_id):
                    # Flush whatever was stored right before the run ended, then stop.
                    for event in await event_bus.replay(run_id, last):
                        yield _sse(event)
                    return
    finally:
        event_bus.unsubscribe(run_id, queue)


@router.get("/{run_id}/stream")
async def stream_run(
    run_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    after_seq: Annotated[int, Query(ge=0)] = 0,
) -> EventSourceResponse:
    if await run_service.get_run(db, user.id, run_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return EventSourceResponse(
        _follow(request, run_id, after_seq),
        ping=HEARTBEAT_SECONDS,
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
