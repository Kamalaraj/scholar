import re

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agents.llm import get_llm, invoke_structured
from app.agents.prompts.templates import WRITER_SYSTEM, WRITER_USER
from app.agents.state import ResearchState, Source

CITATION = re.compile(r"\s?\[(\d+)\]")


class ReportOut(BaseModel):
    key_findings: list[str] = Field(min_length=1, max_length=6)
    markdown: str = Field(min_length=1)


def number_sources(state: ResearchState) -> list[Source]:
    """Dedupe by URL in plan order and assign citation numbers 1..n."""
    ordered = sorted(state.get("findings", []), key=lambda f: (f.sub_question_index, f.source_url))
    by_url = {s.url: s for s in state.get("sources", [])}
    numbered: list[Source] = []
    seen: set[str] = set()
    for finding in ordered:
        source = by_url.get(finding.source_url)
        if source is None or source.url in seen:
            continue
        seen.add(source.url)
        numbered.append(source.model_copy(update={"citation_num": len(numbered) + 1}))
    return numbered


def strip_invalid_citations(text: str, valid: set[int]) -> str:
    """Drop [n] markers that do not map to a collected source."""
    return CITATION.sub(lambda m: m.group(0) if int(m.group(1)) in valid else "", text)


async def writer(state: ResearchState) -> dict[str, object]:
    sources = number_sources(state)
    if not sources:
        raise ValueError("Research found no readable sources to write from")
    summaries: dict[str, list[str]] = {}
    for f in state.get("findings", []):
        summaries.setdefault(f.source_url, []).append(f.summary)
    blocks = [
        f"[{s.citation_num}] {s.title} ({s.domain})\n"
        + "\n".join(f"- {t}" for t in summaries.get(s.url, []))
        for s in sources
    ]
    plan = "\n".join(f"{i + 1}. {q.text}" for i, q in enumerate(state["plan"]))
    out = await invoke_structured(
        get_llm("strong"),
        ReportOut,
        [
            SystemMessage(content=WRITER_SYSTEM),
            HumanMessage(
                content=WRITER_USER.format(
                    question=state["question"], plan=plan, sources="\n\n".join(blocks)
                )
            ),
        ],
    )
    return {
        "numbered_sources": sources,
        "report_markdown": out.markdown,
        "key_findings": out.key_findings[:5],
    }
