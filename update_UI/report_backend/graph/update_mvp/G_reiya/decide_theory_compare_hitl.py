from __future__ import annotations

from graph.nodes.decide_theory_compare_hitl import decide_theory_compare_hitl as _decide_theory_compare_hitl
from graph.state import AgentState


def decide_theory_compare_hitl(state: AgentState) -> AgentState:
    return _decide_theory_compare_hitl(state)


__all__ = ["decide_theory_compare_hitl"]
