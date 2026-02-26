from __future__ import annotations

from pathlib import Path

from graph.nodes.merge_required_outputs_from_c_layer import (
    merge_required_outputs_from_c_layer_state as _merge_required_outputs_from_c_layer_state,
)
from graph.state import AgentState


def merge_required_outputs_from_c_layer(
    state: AgentState,
    *,
    c_layer_state_path: Path,
) -> AgentState:
    return _merge_required_outputs_from_c_layer_state(state, c_layer_state_path=c_layer_state_path)
