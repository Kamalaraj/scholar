import uuid

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.agents.graph import build_graph, make_serde
from app.core.config import settings


async def test_pause_and_resume_survive_a_new_graph_instance() -> None:
    """The plan pause lives in Postgres, so a fresh graph object (a restart) can resume it."""
    conninfo = settings.database_url.replace("+psycopg", "", 1)
    config = {"configurable": {"thread_id": str(uuid.uuid4())}, "max_concurrency": 3}
    async with AsyncConnectionPool(
        conninfo,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        open=False,
    ) as pool:
        saver = AsyncPostgresSaver(pool, serde=make_serde())  # type: ignore[arg-type]
        await saver.setup()
        first = build_graph(saver)
        await first.ainvoke({"question": "How do heat pumps work?", "depth": "quick"}, config)  # type: ignore[arg-type]

        second = build_graph(AsyncPostgresSaver(pool, serde=make_serde()))  # type: ignore[arg-type]
        state = await second.aget_state(config)  # type: ignore[arg-type]
        assert state.next == ("human_review",)
        plan = [q.model_dump() for q in state.values["plan"]]
        await second.ainvoke(Command(resume=plan), config)  # type: ignore[arg-type]
        final = (await second.aget_state(config)).values  # type: ignore[arg-type]
        assert len(final["numbered_sources"]) >= 3
