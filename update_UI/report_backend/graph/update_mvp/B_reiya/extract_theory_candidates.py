from __future__ import annotations

from core.storage import Storage
from graph.nodes.extract_theory_candidates import extract_theory_candidates as _extract_theory_candidates
from graph.state import AgentState


def extract_theory_candidates(state: AgentState, *, storage: Storage | None = None) -> AgentState:
    return _extract_theory_candidates(state, storage=storage)
