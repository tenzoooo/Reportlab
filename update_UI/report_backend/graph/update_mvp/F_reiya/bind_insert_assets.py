from __future__ import annotations

from core.storage import Storage
from graph.nodes.bind_insert_assets import bind_insert_assets as _bind_insert_assets
from graph.state import AgentState


def bind_insert_assets(state: AgentState, *, storage: Storage) -> AgentState:
    return _bind_insert_assets(state, storage=storage)
