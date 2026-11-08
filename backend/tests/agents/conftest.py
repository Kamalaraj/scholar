import pytest
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.graph import build_graph, make_serde


@pytest.fixture
def graph():  # type: ignore[no-untyped-def]
    return build_graph(InMemorySaver(serde=make_serde()))
