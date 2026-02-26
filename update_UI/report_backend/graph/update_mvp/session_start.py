from __future__ import annotations

from graph.update_mvp.a_reiya.session_start import session_start as _session_start
from graph.state import AgentState


def session_start(state: AgentState) -> AgentState:
    return _session_start(state)
