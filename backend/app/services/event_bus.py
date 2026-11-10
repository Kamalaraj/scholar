"""Run events: persisted to `run_events` with a per-run `seq`, then fanned out to live subscribers.

Events are written to Postgres first and published second, so a client that replays from the
database after subscribing never misses an event; duplicates are dropped by `seq`.
"""

import asyncio
import uuid
from collections import OrderedDict
from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import func, select

from app.db.models import RunEvent
from app.db.session import async_session_maker

# Event types sent to the browser.
EVENT_TYPES = frozenset(
    {
        "status",
        "node_start",
        "node_end",
        "plan_ready",
        "plan_approved",
        "tool_call",
        "source_found",
        "run_completed",
        "run_failed",
        "run_cancelled",
        "run_resumed",
    }
)
TERMINAL_EVENTS = frozenset({"run_completed", "run_failed", "run_cancelled"})


class RunEventOut(BaseModel):
    seq: int
    type: str
    payload: dict[str, Any]
    created_at: datetime


class _RunChannel:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.next_seq: int | None = None
        self.subscribers: set[asyncio.Queue[RunEventOut]] = set()


# Channels of runs that never reach a terminal event (abandoned at the plan review) would stay
# forever, so idle ones are evicted past this many. The seq counter is rebuilt from the database.
MAX_IDLE_CHANNELS = 256

_channels: OrderedDict[uuid.UUID, _RunChannel] = OrderedDict()


def _channel(run_id: uuid.UUID) -> _RunChannel:
    channel = _channels.setdefault(run_id, _RunChannel())
    _channels.move_to_end(run_id)  # most recently used last, so eviction takes the oldest
    return channel


def _evict_idle() -> None:
    """Drop the oldest channels nobody is using, until the table is back under the cap."""
    if len(_channels) <= MAX_IDLE_CHANNELS:
        return
    for run_id in list(_channels):
        if len(_channels) <= MAX_IDLE_CHANNELS:
            break
        channel = _channels[run_id]
        if not channel.subscribers and not channel.lock.locked():
            del _channels[run_id]


def _release_if_idle(run_id: uuid.UUID) -> None:
    channel = _channels.get(run_id)
    if channel is not None and not channel.subscribers and not channel.lock.locked():
        del _channels[run_id]


async def emit(run_id: uuid.UUID, event_type: str, payload: dict[str, Any] | None = None) -> None:
    """Store one event with the next seq for the run and publish it to live subscribers."""
    channel = _channel(run_id)
    async with channel.lock:
        async with async_session_maker() as db:
            if channel.next_seq is None:
                last = await db.scalar(
                    select(func.max(RunEvent.seq)).where(RunEvent.run_id == run_id)
                )
                channel.next_seq = (last or 0) + 1
            row = RunEvent(
                run_id=run_id, seq=channel.next_seq, type=event_type, payload=payload or {}
            )
            db.add(row)
            await db.commit()
            await db.refresh(row)
            channel.next_seq += 1
        event = RunEventOut(
            seq=row.seq, type=row.type, payload=row.payload, created_at=row.created_at
        )
        for queue in channel.subscribers:
            queue.put_nowait(event)
    if event_type in TERMINAL_EVENTS:
        _release_if_idle(run_id)
    else:
        _evict_idle()


async def replay(run_id: uuid.UUID, after_seq: int) -> list[RunEventOut]:
    async with async_session_maker() as db:
        rows = await db.scalars(
            select(RunEvent)
            .where(RunEvent.run_id == run_id, RunEvent.seq > after_seq)
            .order_by(RunEvent.seq)
        )
        return [
            RunEventOut(seq=r.seq, type=r.type, payload=r.payload, created_at=r.created_at)
            for r in rows
        ]


def subscribe(run_id: uuid.UUID) -> asyncio.Queue[RunEventOut]:
    queue: asyncio.Queue[RunEventOut] = asyncio.Queue()
    _channel(run_id).subscribers.add(queue)
    return queue


def unsubscribe(run_id: uuid.UUID, queue: asyncio.Queue[RunEventOut]) -> None:
    channel = _channels.get(run_id)
    if channel is not None:
        channel.subscribers.discard(queue)
        _release_if_idle(run_id)
