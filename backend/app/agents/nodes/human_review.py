from typing import Any, Literal

from langgraph.types import Command, Send, interrupt

from app.agents.state import ResearchState, SubQuestion


def fan_out(state: ResearchState) -> list[Send]:
    """One research branch per approved sub-question."""
    return [
        Send(
            "research",
            {
                "question": state["question"],
                "depth": state.get("depth", "quick"),
                "index": i,
                "sub_question": q,
            },
        )
        for i, q in enumerate(state["plan"])
    ]


def human_review(state: ResearchState) -> Command[Literal["planner", "research"]]:
    """Pause for the user. Resume with a list of items to approve (possibly edited), or with
    `{"replan": feedback}` to send the feedback back to the planner and pause again."""
    decision: Any = interrupt({"plan": [q.model_dump() for q in state["plan"]]})
    if isinstance(decision, dict) and "replan" in decision:
        return Command(goto="planner", update={"feedback": str(decision["replan"])})
    plan = [SubQuestion.model_validate(item) for item in decision]
    return Command(goto=fan_out({**state, "plan": plan}), update={"plan": plan})
