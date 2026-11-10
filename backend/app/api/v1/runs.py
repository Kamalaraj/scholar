import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.types import ResearchGraph
from app.core.security import get_current_user
from app.db.models import RunStatus, User
from app.db.session import get_db
from app.schemas.run import PlanAction, RunCreate, RunDetail, RunList, RunOut
from app.services import run_executor, run_service

router = APIRouter(prefix="/runs", tags=["runs"])

CurrentUser = Annotated[User, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")


def get_graph(request: Request) -> ResearchGraph | None:
    """The compiled research graph, set in the app lifespan (absent in API-only tests)."""
    return getattr(request.app.state, "graph", None)


Graph = Annotated[ResearchGraph | None, Depends(get_graph)]


def _out(run: object, source_count: int) -> RunOut:
    out = RunOut.model_validate(run)
    out.source_count = source_count
    return out


@router.post("", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def create_run(body: RunCreate, user: CurrentUser, db: Db, graph: Graph) -> RunOut:
    run, count = await run_service.create_run(db, user.id, body.question, body.depth)
    if graph is not None:
        run_executor.start_planning(graph, run.id)
    return _out(run, count)


@router.get("", response_model=RunList)
async def list_runs(
    user: CurrentUser,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
    status_filter: Annotated[RunStatus | None, Query(alias="status")] = None,
) -> RunList:
    try:
        rows, next_cursor = await run_service.list_runs(
            db, user.id, limit=limit, cursor=cursor, status=status_filter
        )
    except run_service.InvalidCursorError as exc:
        raise HTTPException(status_code=422, detail="Invalid cursor") from exc
    return RunList(items=[_out(r, c) for r, c in rows], next_cursor=next_cursor)


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: uuid.UUID, user: CurrentUser, db: Db) -> RunDetail:
    detail = await run_service.get_run_detail(db, user.id, run_id)
    if detail is None:
        raise _NOT_FOUND
    return detail


@router.get("/{run_id}/report.md")
async def download_report(run_id: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    built = await run_service.build_report_markdown(db, user.id, run_id)
    if built is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    markdown, filename = built
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{run_id}/plan", response_model=RunOut)
async def submit_plan(
    run_id: uuid.UUID, body: PlanAction, user: CurrentUser, db: Db, graph: Graph
) -> RunOut:
    found = await run_service.get_run(db, user.id, run_id)
    if found is None:
        raise _NOT_FOUND
    run, count = found
    if graph is None:
        raise HTTPException(status_code=503, detail="Research engine is not available")
    try:
        if body.action == "replan":
            await run_service.begin_replan(db, run)
        else:
            approved = await run_service.approve_plan(db, run, body.items)
    except run_service.TooManyReplansError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="This run has used all its new-plan requests. Edit the plan and approve it.",
        ) from exc
    except run_service.InvalidTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The plan can only be changed while the run is awaiting approval",
        ) from exc
    if body.action == "replan":
        run_executor.start_replan(graph, run.id, body.feedback or "")
    else:
        run_executor.start_research(graph, run.id, approved)
    await db.refresh(run)  # updated_at is set server-side on commit
    return _out(run, count)


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    found = await run_service.get_run(db, user.id, run_id)
    if found is None:
        raise _NOT_FOUND
    try:
        await run_service.delete_run(db, found[0])
    except run_service.RunNotDeletableError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
