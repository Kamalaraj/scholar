from typing import Any

from langgraph.types import interrupt

from app.agents.state import ResearchState, SubQuestion


def human_review(state: ResearchState) -> dict[str, list[SubQuestion]]:
    """Pause until the user approves (and maybe edits) the plan."""
    decision: Any = interrupt({"plan": [q.model_dump() for q in state["plan"]]})
    return {"plan": [SubQuestion.model_validate(item) for item in decision]}
