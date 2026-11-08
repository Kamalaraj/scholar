from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agents.llm import get_llm, invoke_structured
from app.agents.prompts.templates import PLANNER_FEEDBACK, PLANNER_SYSTEM, PLANNER_USER
from app.agents.state import ResearchState, SubQuestion

QUESTION_COUNT = {"quick": 3, "deep": 6}


class PlanOut(BaseModel):
    sub_questions: list[SubQuestion] = Field(min_length=1, max_length=8)


async def planner(state: ResearchState) -> dict[str, list[SubQuestion]]:
    count = QUESTION_COUNT.get(state.get("depth", "quick"), 3)
    user = PLANNER_USER.format(question=state["question"])
    if state.get("feedback"):
        user += PLANNER_FEEDBACK.format(feedback=state["feedback"])
    out = await invoke_structured(
        get_llm("strong"),
        PlanOut,
        [SystemMessage(content=PLANNER_SYSTEM.format(count=count)), HumanMessage(content=user)],
    )
    return {"plan": out.sub_questions[:count]}
