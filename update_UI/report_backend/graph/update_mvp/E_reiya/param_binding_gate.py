from __future__ import annotations

from graph.nodes.param_binding_gate import param_binding_gate as _param_binding_gate
from graph.state import AgentState


def param_binding_gate(state: AgentState) -> AgentState:
    return _param_binding_gate(state)
