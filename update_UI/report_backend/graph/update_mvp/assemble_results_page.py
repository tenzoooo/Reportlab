from __future__ import annotations

from graph.nodes.assemble_results_page import assemble_results_page as _assemble_results_page
from graph.state import AgentState


def assemble_results_page(state: AgentState) -> AgentState:
    return _assemble_results_page(state)
