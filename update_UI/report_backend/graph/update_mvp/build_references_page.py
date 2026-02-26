from __future__ import annotations

from graph.nodes.build_references_page import build_references_page as _build_references_page
from graph.state import AgentState


def build_references_page(state: AgentState) -> AgentState:
    return _build_references_page(state)
