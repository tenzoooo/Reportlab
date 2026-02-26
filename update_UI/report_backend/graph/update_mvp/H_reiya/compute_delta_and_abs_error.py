from __future__ import annotations

from graph.nodes.compute_delta_and_abs_error import compute_delta_and_abs_error as _compute_delta_and_abs_error
from graph.state import AgentState


def compute_delta_and_abs_error(state: AgentState) -> AgentState:
    return _compute_delta_and_abs_error(state)
