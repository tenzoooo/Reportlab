from __future__ import annotations

from graph.nodes.compute_theory_value import compute_theory_value as _compute_theory_value
from graph.state import AgentState


def compute_theory_value(state: AgentState) -> AgentState:
    return _compute_theory_value(state)
