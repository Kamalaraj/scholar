"""AUDIT_PLAN 3.10: list and detail endpoints stay under 200 ms p95 with 200 runs."""

import statistics
import time
import uuid

from httpx import AsyncClient

from app.db.models import Depth, ResearchRun, RunStatus, Source, User
from app.db.session import async_session_maker

RUNS = 200


async def _seed(clerk_sub: str) -> tuple[uuid.UUID, uuid.UUID]:
    async with async_session_maker() as db:
        user = User(clerk_user_id=clerk_sub, email=f"{clerk_sub}@example.com")
        db.add(user)
        await db.flush()
        runs = [
            ResearchRun(
                user_id=user.id,
                question=f"Performance question number {i} about heat pumps",
                depth=Depth.QUICK,
                status=RunStatus.COMPLETED,
            )
            for i in range(RUNS)
        ]
        db.add_all(runs)
        await db.flush()
        db.add_all(
            Source(
                run_id=runs[0].id,
                citation_num=n,
                url=f"https://example.org/{n}",
                title=f"Source {n}",
                domain="example.org",
                quote="q",
            )
            for n in range(1, 9)
        )
        await db.commit()
        return user.id, runs[0].id


def p95(samples: list[float]) -> float:
    return statistics.quantiles(samples, n=20)[-1]


async def test_list_and_detail_p95_under_200ms_with_200_runs(
    client: AsyncClient, make_token: object
) -> None:
    sub = f"perf_{uuid.uuid4().hex}"
    _, run_id = await _seed(sub)
    headers = {"Authorization": f"Bearer {make_token(sub=sub)}"}  # type: ignore[operator]
    await client.get("/api/v1/me", headers=headers)  # warm the connection pool and JWKS cache

    for label, path, expect_rows in (
        ("list", "/api/v1/runs?limit=20", 20),
        ("filtered list", "/api/v1/runs?limit=20&status=completed&q=heat", 20),
        ("detail", f"/api/v1/runs/{run_id}", None),
    ):
        samples = []
        for _ in range(60):
            started = time.perf_counter()
            res = await client.get(path, headers=headers)
            samples.append((time.perf_counter() - started) * 1000)
            assert res.status_code == 200
        if expect_rows:
            assert len(res.json()["items"]) == expect_rows
        assert p95(samples) < 200, f"{label} p95 {p95(samples):.0f} ms"
