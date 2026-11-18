"""Run the research graph from the terminal.

    uv run python scripts/run_research.py "question" [--depth quick|deep] [--yes]

Uses LLM_PROVIDER / SEARCH_PROVIDER from the environment (fake by default).
Without --yes it shows the plan and asks before researching.
"""

import argparse
import asyncio
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make `app` importable

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402
from langgraph.types import Command  # noqa: E402

from app.agents.budget import TokenBudget, current_budget  # noqa: E402
from app.agents.graph import build_graph, make_serde  # noqa: E402
from app.core.config import settings  # noqa: E402


async def main(question: str, depth: str, auto_approve: bool) -> None:
    started = time.monotonic()
    budget = TokenBudget(settings.run_token_budget)
    current_budget.set(budget)
    graph = build_graph(InMemorySaver(serde=make_serde()))
    config = {
        "configurable": {"thread_id": str(uuid.uuid4())},
        "max_concurrency": settings.max_research_concurrency,
    }
    print(f"LLM={settings.llm_provider} search={settings.search_provider}")
    await graph.ainvoke({"question": question, "depth": depth}, config)  # type: ignore[arg-type]
    plan = (await graph.aget_state(config)).values["plan"]  # type: ignore[arg-type]
    print("\nPlan:")
    for i, q in enumerate(plan, 1):
        print(f"  {i}. {q.text}")
    if not auto_approve:
        answer = await asyncio.to_thread(input, "\nApprove? [y/N] ")
        if answer.strip().lower() != "y":
            print("Stopped before research.")
            return
    await graph.ainvoke(Command(resume=[q.model_dump() for q in plan]), config)  # type: ignore[arg-type]
    values = (await graph.aget_state(config)).values  # type: ignore[arg-type]
    print("\n" + values["report_markdown"])
    print("\nSources:")
    for s in values["numbered_sources"]:
        print(f"  [{s.citation_num}] {s.title} - {s.url}")
    print(f"\nTime: {time.monotonic() - started:.1f}s  Tokens: {budget.used:,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("question")
    parser.add_argument("--depth", choices=["quick", "deep"], default="quick")
    parser.add_argument("--yes", action="store_true", help="approve the plan automatically")
    args = parser.parse_args()
    asyncio.run(main(args.question, args.depth, args.yes))
