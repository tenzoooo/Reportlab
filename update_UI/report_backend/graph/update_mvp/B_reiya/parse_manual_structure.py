from __future__ import annotations

from graph.nodes.parse_manual_structure import parse_manual_structure as _parse_manual_structure
from graph.state import AgentState


def parse_manual_structure(state: AgentState) -> AgentState:
    return _parse_manual_structure(state)
