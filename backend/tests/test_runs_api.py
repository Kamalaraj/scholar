import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.models import PlanItem, ResearchRun, RunStatus, Source
from app.db.session import async_session_maker
from app.services.run_service import transition_run

QUESTION = "What are the main approaches to recycling EV batteries?"


async def _create(client: AsyncClient, headers: dict[str, str], **body: Any) -> dict[str, Any]:
    payload = {"question": QUESTION, "depth": "quick", **body}
    response = await client.post("/api/v1/runs", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


async def _set_status(run_id: str, *path: RunStatus) -> None:
    async with async_session_maker() as db:
        run = await db.get(ResearchRun, uuid.UUID(run_id))
        assert run is not None
        for status in path:
            await transition_run(db, run, status)


# --- auth -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/runs"),
        ("GET", "/api/v1/runs"),
        ("GET", f"/api/v1/runs/{uuid.uuid4()}"),
        ("DELETE", f"/api/v1/runs/{uuid.uuid4()}"),
    ],
)
async def test_runs_routes_require_auth(client: AsyncClient, method: str, path: str) -> None:
    response = await client.request(method, path, json={"question": QUESTION})
    assert response.status_code == 401


# --- create ---------------------------------------------------------------------------------


async def test_create_run_starts_pending(client: AsyncClient, user_a: dict[str, str]) -> None:
    run = await _create(client, user_a, question=f"  {QUESTION}  ", depth="deep")
    assert run["status"] == "pending"
    assert run["depth"] == "deep"
    assert run["question"] == QUESTION
    assert run["source_count"] == 0
    assert run["completed_at"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"question": "too short"},
        {"question": " " * 20},
        {"question": "x" * 1001},
        {"question": QUESTION, "depth": "extreme"},
        {},
    ],
    ids=["short", "whitespace", "too-long", "bad-depth", "empty"],
)
async def test_create_run_validation(
    client: AsyncClient, user_a: dict[str, str], body: dict[str, Any]
) -> None:
    response = await client.post("/api/v1/runs", json=body, headers=user_a)
    assert response.status_code == 422


async def test_create_run_accepts_boundary_lengths(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    await _create(client, user_a, question="x" * 10)
    await _create(client, user_a, question="x" * 1000)


# --- get / list -----------------------------------------------------------------------------


async def test_get_run(client: AsyncClient, user_a: dict[str, str]) -> None:
    created = await _create(client, user_a)
    response = await client.get(f"/api/v1/runs/{created['id']}", headers=user_a)
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


async def test_get_unknown_run_is_404(client: AsyncClient, user_a: dict[str, str]) -> None:
    response = await client.get(f"/api/v1/runs/{uuid.uuid4()}", headers=user_a)
    assert response.status_code == 404


async def test_get_malformed_id_is_422(client: AsyncClient, user_a: dict[str, str]) -> None:
    assert (await client.get("/api/v1/runs/not-a-uuid", headers=user_a)).status_code == 422


async def test_list_is_newest_first(client: AsyncClient, user_a: dict[str, str]) -> None:
    ids = [(await _create(client, user_a))["id"] for _ in range(3)]
    response = await client.get("/api/v1/runs", headers=user_a)
    assert [r["id"] for r in response.json()["items"]] == ids[::-1]
    assert response.json()["next_cursor"] is None


async def test_cursor_pagination_has_no_gaps_or_duplicates(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    created = [(await _create(client, user_a))["id"] for _ in range(5)]
    seen: list[str] = []
    cursor: str | None = None
    pages = 0
    while True:
        params: dict[str, Any] = {"limit": 2}
        if cursor:
            params["cursor"] = cursor
        body = (await client.get("/api/v1/runs", params=params, headers=user_a)).json()
        seen += [r["id"] for r in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3
    assert seen == created[::-1]


async def test_list_status_filter(client: AsyncClient, user_a: dict[str, str]) -> None:
    pending = await _create(client, user_a)
    cancelled = await _create(client, user_a)
    await _set_status(cancelled["id"], RunStatus.CANCELLED)

    only_cancelled = await client.get("/api/v1/runs?status=cancelled", headers=user_a)
    assert [r["id"] for r in only_cancelled.json()["items"]] == [cancelled["id"]]
    only_pending = await client.get("/api/v1/runs?status=pending", headers=user_a)
    assert [r["id"] for r in only_pending.json()["items"]] == [pending["id"]]
    assert (await client.get("/api/v1/runs?status=bogus", headers=user_a)).status_code == 422


@pytest.mark.parametrize("params", ["limit=0", "limit=101", "cursor=garbage"])
async def test_list_rejects_bad_params(
    client: AsyncClient, user_a: dict[str, str], params: str
) -> None:
    assert (await client.get(f"/api/v1/runs?{params}", headers=user_a)).status_code == 422


async def test_source_count_is_reported(client: AsyncClient, user_a: dict[str, str]) -> None:
    run = await _create(client, user_a)
    async with async_session_maker() as db:
        for n in (1, 2):
            db.add(
                Source(
                    run_id=uuid.UUID(run["id"]),
                    citation_num=n,
                    url=f"https://example.com/{n}",
                    title=f"Source {n}",
                    domain="example.com",
                )
            )
        await db.commit()
    detail = (await client.get(f"/api/v1/runs/{run['id']}", headers=user_a)).json()
    listed = (await client.get("/api/v1/runs", headers=user_a)).json()["items"][0]
    assert detail["source_count"] == 2
    assert listed["source_count"] == 2


# --- ownership ------------------------------------------------------------------------------


async def test_other_users_run_is_404_everywhere(
    client: AsyncClient, user_a: dict[str, str], user_b: dict[str, str]
) -> None:
    run = await _create(client, user_a)
    url = f"/api/v1/runs/{run['id']}"

    assert (await client.get(url, headers=user_b)).status_code == 404
    assert (await client.delete(url, headers=user_b)).status_code == 404
    assert (await client.get("/api/v1/runs", headers=user_b)).json()["items"] == []
    # The owner is unaffected by user B's attempts.
    assert (await client.get(url, headers=user_a)).status_code == 200


# --- delete ---------------------------------------------------------------------------------


async def test_delete_run_then_404(client: AsyncClient, user_a: dict[str, str]) -> None:
    run = await _create(client, user_a)
    assert (await client.delete(f"/api/v1/runs/{run['id']}", headers=user_a)).status_code == 204
    assert (await client.get(f"/api/v1/runs/{run['id']}", headers=user_a)).status_code == 404


async def test_delete_active_run_is_409(client: AsyncClient, user_a: dict[str, str]) -> None:
    run = await _create(client, user_a)
    await _set_status(run["id"], RunStatus.PLANNING)
    response = await client.delete(f"/api/v1/runs/{run['id']}", headers=user_a)
    assert response.status_code == 409
    assert (await client.get(f"/api/v1/runs/{run['id']}", headers=user_a)).status_code == 200


async def test_delete_cascades_to_children(client: AsyncClient, user_a: dict[str, str]) -> None:
    run = await _create(client, user_a)
    run_id = uuid.UUID(run["id"])
    async with async_session_maker() as db:
        db.add(PlanItem(run_id=run_id, position=0, text="First angle"))
        db.add(
            Source(run_id=run_id, citation_num=1, url="https://e.com", title="t", domain="e.com")
        )
        await db.commit()

    await client.delete(f"/api/v1/runs/{run['id']}", headers=user_a)

    async with async_session_maker() as db:
        plan = await db.scalar(select(func.count(PlanItem.id)).where(PlanItem.run_id == run_id))
        sources = await db.scalar(select(func.count(Source.id)).where(Source.run_id == run_id))
    assert plan == 0
    assert sources == 0


async def test_list_uses_one_query_for_runs_and_counts(
    client: AsyncClient, user_a: dict[str, str]
) -> None:
    """No N+1: source counts come from a subquery, not a query per run."""
    from sqlalchemy import event

    from app.db.session import engine

    for _ in range(5):
        await _create(client, user_a)

    statements: list[str] = []

    def record(conn: Any, cursor: Any, statement: str, *args: Any) -> None:
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        response = await client.get("/api/v1/runs", headers=user_a)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record)

    assert len(response.json()["items"]) == 5
    assert sum("FROM research_runs" in s for s in statements) == 1
    assert sum("FROM sources" in s for s in statements) == 1  # the subquery inside that select
