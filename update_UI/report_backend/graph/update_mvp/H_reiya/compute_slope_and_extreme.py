from __future__ import annotations

from graph.nodes.compute_slope_and_extreme import compute_slope_and_extreme as _compute_slope_and_extreme
from graph.state import AgentState


def compute_slope_and_extreme(state: AgentState) -> AgentState:
    return _compute_slope_and_extreme(state)
