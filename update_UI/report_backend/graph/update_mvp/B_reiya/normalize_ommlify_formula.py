from __future__ import annotations

from graph.nodes.normalize_ommlify_formula import normalize_and_ommlify_formula as _normalize_and_ommlify_formula
from graph.state import AgentState


def normalize_and_ommlify_formula(state: AgentState) -> AgentState:
    return _normalize_and_ommlify_formula(state)
