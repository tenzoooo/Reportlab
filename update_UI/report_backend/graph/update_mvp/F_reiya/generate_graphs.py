from __future__ import annotations

from core.storage import Storage
from graph.nodes.generate_graphs import generate_graphs as _generate_graphs
from graph.state import AgentState
from llm.client import LLMClient


def generate_graphs(state: AgentState, *, storage: Storage, llm: LLMClient | None = None) -> AgentState:
    return _generate_graphs(state, storage=storage, llm=llm)
