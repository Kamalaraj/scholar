from app.agents.nodes.writer import strip_invalid_citations
from app.agents.state import ResearchState


def finalize(state: ResearchState) -> dict[str, object]:
    """Guarantee the report only cites sources that were actually collected."""
    valid = {s.citation_num for s in state["numbered_sources"] if s.citation_num is not None}
    return {
        "report_markdown": strip_invalid_citations(state["report_markdown"], valid),
        "key_findings": [strip_invalid_citations(k, valid) for k in state["key_findings"]],
    }
