from __future__ import annotations

from core.storage import Storage
from graph.nodes.inspect_excel import inspect_excel as _inspect_excel
from graph.state import AgentState


def inspect_excel(state: AgentState, *, storage: Storage) -> AgentState:
    return _inspect_excel(state, storage=storage)
