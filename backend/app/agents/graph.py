from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from app.agents.nodes.finalize import finalize
from app.agents.nodes.human_review import human_review
from app.agents.nodes.planner import planner
from app.agents.nodes.research import build_research_subgraph
from app.agents.nodes.writer import writer
from app.agents.state import ResearchState
from app.agents.types import ResearchGraph


def make_serde() -> JsonPlusSerializer:
    """Checkpoint serializer that explicitly allows our own state types."""
    return JsonPlusSerializer(
        allowed_msgpack_modules=[
            ("app.agents.state", "SubQuestion"),
            ("app.agents.state", "Source"),
            ("app.agents.state", "Finding"),
        ]
    )


def fan_out(state: ResearchState) -> list[Send]:
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


def build_graph(checkpointer: BaseCheckpointSaver[Any]) -> ResearchGraph:
    graph = StateGraph(ResearchState)
    graph.add_node("planner", planner)
    graph.add_node("human_review", human_review)
    graph.add_node("research", build_research_subgraph())
    graph.add_node("writer", writer)
    graph.add_node("finalize", finalize)
    graph.add_edge(START, "planner")
    graph.add_edge("planner", "human_review")
    graph.add_conditional_edges("human_review", fan_out, ["research"])
    graph.add_edge("research", "writer")
    graph.add_edge("writer", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile(checkpointer=checkpointer)
