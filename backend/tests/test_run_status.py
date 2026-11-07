import itertools
import uuid

import pytest

from app.db.models import Depth, ResearchRun, RunStatus, User
from app.db.session import async_session_maker
from app.services.run_service import (
    ALLOWED_TRANSITIONS,
    TERMINAL_STATUSES,
    InvalidTransitionError,
    can_transition,
    transition_run,
)

S = RunStatus

EXPECTED: set[tuple[RunStatus, RunStatus]] = {
    (S.PENDING, S.PLANNING),
    (S.PENDING, S.CANCELLED),
    (S.PENDING, S.FAILED),
    (S.PLANNING, S.AWAITING_APPROVAL),
    (S.PLANNING, S.CANCELLED),
    (S.PLANNING, S.FAILED),
    (S.AWAITING_APPROVAL, S.PLANNING),
    (S.AWAITING_APPROVAL, S.RESEARCHING),
    (S.AWAITING_APPROVAL, S.CANCELLED),
    (S.AWAITING_APPROVAL, S.FAILED),
    (S.RESEARCHING, S.WRITING),
    (S.RESEARCHING, S.CANCELLED),
    (S.RESEARCHING, S.FAILED),
    (S.WRITING, S.COMPLETED),
    (S.WRITING, S.CANCELLED),
    (S.WRITING, S.FAILED),
}


@pytest.mark.parametrize(
    ("current", "target"), list(itertools.product(RunStatus, RunStatus)), ids=lambda s: s.value
)
def test_every_transition_pair(current: RunStatus, target: RunStatus) -> None:
    assert can_transition(current, target) is ((current, target) in EXPECTED)


def test_every_status_has_an_entry() -> None:
    assert set(ALLOWED_TRANSITIONS) == set(RunStatus)


def test_terminal_statuses_have_no_exits() -> None:
    for status in TERMINAL_STATUSES:
        assert ALLOWED_TRANSITIONS[status] == frozenset()


async def _new_run() -> ResearchRun:
    async with async_session_maker() as db:
        user = User(clerk_user_id=f"user_{uuid.uuid4().hex}")
        db.add(user)
        await db.flush()
        run = ResearchRun(
            user_id=user.id, question="A sufficiently long question", depth=Depth.QUICK
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return run


async def test_transition_persists_and_sets_completed_at() -> None:
    run = await _new_run()
    async with async_session_maker() as db:
        merged = await db.merge(run)
        for status in (S.PLANNING, S.AWAITING_APPROVAL, S.RESEARCHING, S.WRITING):
            await transition_run(db, merged, status)
            assert merged.completed_at is None
        await transition_run(db, merged, S.COMPLETED)
        assert merged.completed_at is not None
    async with async_session_maker() as db:
        fresh = await db.get(ResearchRun, run.id)
        assert fresh is not None
        assert fresh.status is S.COMPLETED


async def test_failed_transition_records_the_error() -> None:
    run = await _new_run()
    async with async_session_maker() as db:
        merged = await db.merge(run)
        await transition_run(db, merged, S.FAILED, error="Search provider unavailable")
        assert merged.error == "Search provider unavailable"
        assert merged.completed_at is not None


async def test_invalid_transition_raises_and_changes_nothing() -> None:
    run = await _new_run()
    async with async_session_maker() as db:
        merged = await db.merge(run)
        with pytest.raises(InvalidTransitionError):
            await transition_run(db, merged, S.COMPLETED)
        assert merged.status is S.PENDING
        assert merged.completed_at is None
