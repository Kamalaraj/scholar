import operator
from typing import Annotated, TypedDict

from pydantic import BaseModel, Field


class SubQuestion(BaseModel):
    text: str = Field(min_length=5, max_length=300)
    reason: str | None = None


class Source(BaseModel):
    url: str
    title: str
    domain: str
    quote: str | None = None
    citation_num: int | None = None


class Finding(BaseModel):
    """One reader summary of one page, tied to the sub-question it answers."""

    sub_question_index: int
    source_url: str
    summary: str


class ResearchState(TypedDict, total=False):
    question: str
    depth: str  # "quick" | "deep"
    feedback: str | None
    plan: list[SubQuestion]
    # Merged across parallel research branches.
    findings: Annotated[list[Finding], operator.add]
    sources: Annotated[list[Source], operator.add]
    # Set by the writer / finalize nodes.
    numbered_sources: list[Source]
    report_markdown: str
    key_findings: list[str]


class BranchState(TypedDict, total=False):
    """State of one research branch (one sub-question), run through the research subgraph."""

    question: str
    index: int
    sub_question: SubQuestion
    depth: str
    results: list[dict[str, str]]
    findings: Annotated[list[Finding], operator.add]
    sources: Annotated[list[Source], operator.add]


class BranchOutput(TypedDict):
    """The only keys a research branch hands back to the parent graph."""

    findings: list[Finding]
    sources: list[Source]
