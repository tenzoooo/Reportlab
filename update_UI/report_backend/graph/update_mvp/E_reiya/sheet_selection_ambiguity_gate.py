from __future__ import annotations

from graph.nodes.sheet_selection_ambiguity_gate import (
    sheet_selection_ambiguity_gate as _sheet_selection_ambiguity_gate,
)
from graph.state import AgentState


def sheet_selection_ambiguity_gate(state: AgentState) -> AgentState:
    return _sheet_selection_ambiguity_gate(state)
