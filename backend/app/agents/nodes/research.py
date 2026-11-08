import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from app.agents.llm import get_llm, invoke_structured
from app.agents.prompts.templates import READER_SYSTEM, READER_USER
from app.agents.state import BranchOutput, BranchState, Finding, Source
from app.agents.tools.fetch import read_page
from app.agents.tools.search import SearchResult, domain_of, search_web
from app.agents.types import ResearchGraph

log = logging.getLogger(__name__)

PAGES_PER_QUESTION = {"quick": 2, "deep": 3}
CLOSING_TAG = "</untrusted_web_content>"


class ReaderOut(BaseModel):
    summary: str
    quote: str = ""


async def searcher(state: BranchState) -> dict[str, list[dict[str, str]]]:
    results = await search_web(state["sub_question"].text, max_results=4)
    seen: set[str] = set()
    unique: list[SearchResult] = []
    for r in results:
        if r.url not in seen:
            seen.add(r.url)
            unique.append(r)
    return {"results": [r.model_dump() for r in unique]}


async def reader(state: BranchState) -> dict[str, list[Finding] | list[Source]]:
    llm = get_llm("fast")
    limit = PAGES_PER_QUESTION.get(state.get("depth", "quick"), 2)
    findings: list[Finding] = []
    sources: list[Source] = []
    for result in state.get("results", [])[:limit]:
        try:
            text = await read_page(result["url"])
        except Exception as exc:  # a dead page must not sink the branch
            log.warning("page fetch failed", extra={"url": result["url"], "error": str(exc)})
            text = ""
        text = text.strip() or result["content"]
        if not text:
            continue
        content = text.replace(CLOSING_TAG, "")  # page text cannot close its own delimiter
        out = await invoke_structured(
            llm,
            ReaderOut,
            [
                SystemMessage(content=READER_SYSTEM),
                HumanMessage(
                    content=READER_USER.format(
                        sub_question=state["sub_question"].text, content=content
                    )
                ),
            ],
        )
        quote = out.quote if out.quote and out.quote in text else text[:200]
        sources.append(
            Source(
                url=result["url"],
                title=result["title"],
                domain=domain_of(result["url"]),
                quote=quote,
            )
        )
        findings.append(
            Finding(
                sub_question_index=state["index"], source_url=result["url"], summary=out.summary
            )
        )
    return {"findings": findings, "sources": sources}


def build_research_subgraph() -> ResearchGraph:
    graph = StateGraph(BranchState, output_schema=BranchOutput)
    graph.add_node("searcher", searcher)
    graph.add_node("reader", reader)
    graph.add_edge(START, "searcher")
    graph.add_edge("searcher", "reader")
    graph.add_edge("reader", END)
    return graph.compile()
