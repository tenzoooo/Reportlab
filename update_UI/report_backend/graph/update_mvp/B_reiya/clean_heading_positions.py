from __future__ import annotations

from core.storage import Storage
from graph.nodes.clean_heading_positions import clean_heading_positions as _clean_heading_positions
from graph.state import AgentState
from llm.client import LLMClient


def clean_heading_positions(state: AgentState, *, llm: LLMClient, storage: Storage | None = None) -> AgentState:
    return _clean_heading_positions(state, llm=llm, storage=storage)
