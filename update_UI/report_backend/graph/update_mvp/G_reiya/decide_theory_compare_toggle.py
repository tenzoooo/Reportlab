from __future__ import annotations

from graph.nodes.decide_theory_compare_toggle import decide_theory_compare_toggle as _decide_theory_compare_toggle
from graph.state import AgentState


def decide_theory_compare_toggle(state: AgentState) -> AgentState:
    return _decide_theory_compare_toggle(state)
