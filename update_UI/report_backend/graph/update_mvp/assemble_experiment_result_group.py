from __future__ import annotations

from graph.nodes.assemble_experiment_result_group import assemble_experiment_result_group as _assemble_experiment_result_group
from graph.state import AgentState


def assemble_experiment_result_group(state: AgentState) -> AgentState:
    return _assemble_experiment_result_group(state)
