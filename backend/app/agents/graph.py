from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph

from app.agents.nodes.finalize import finalize
from app.agents.nodes.human_review import human_review
from app.agents.nodes.planner import planner
from app.agents.nodes.research import build_research_branch
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


def build_graph(checkpointer: BaseCheckpointSaver[Any]) -> ResearchGraph:
    graph = StateGraph(ResearchState)
    graph.add_node("planner", planner)
    graph.add_node("human_review", human_review, destinations=("planner", "research"))
    graph.add_node("research", build_research_branch())
    graph.add_node("writer", writer)
    graph.add_node("finalize", finalize)
    graph.add_edge(START, "planner")
    graph.add_edge("planner", "human_review")
    graph.add_edge("research", "writer")
    graph.add_edge("writer", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile(checkpointer=checkpointer)
