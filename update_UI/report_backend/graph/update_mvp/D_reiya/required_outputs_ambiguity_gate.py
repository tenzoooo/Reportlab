from __future__ import annotations

from graph.nodes.required_outputs_ambiguity_gate import required_outputs_ambiguity_gate as _required_outputs_ambiguity_gate
from graph.state import AgentState


def required_outputs_ambiguity_gate(state: AgentState) -> AgentState:
    return _required_outputs_ambiguity_gate(state)
