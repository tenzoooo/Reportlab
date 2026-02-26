from __future__ import annotations

from graph.nodes.map_result_numbers import map_result_numbers as _map_result_numbers
from graph.state import AgentState


def map_result_numbers(state: AgentState) -> AgentState:
    return _map_result_numbers(state)
