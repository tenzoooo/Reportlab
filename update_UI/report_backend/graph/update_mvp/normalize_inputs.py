from __future__ import annotations

from core.storage import Storage
from graph.update_mvp.a_reiya.normalize_inputs import normalize_inputs as _normalize_inputs
from graph.state import AgentState


def normalize_inputs(state: AgentState, *, storage: Storage) -> AgentState:
    return _normalize_inputs(state, storage=storage)
