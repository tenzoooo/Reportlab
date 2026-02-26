from __future__ import annotations

from graph.nodes.extract_method_numbers import extract_method_numbers as _extract_method_numbers
from graph.state import AgentState


def extract_method_numbers(state: AgentState) -> AgentState:
    return _extract_method_numbers(state)
