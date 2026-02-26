from __future__ import annotations

from graph.nodes.column_unit_ambiguity_gate import (
    column_unit_ambiguity_gate as _column_unit_ambiguity_gate,
)
from graph.state import AgentState


def column_unit_ambiguity_gate(state: AgentState) -> AgentState:
    return _column_unit_ambiguity_gate(state)
