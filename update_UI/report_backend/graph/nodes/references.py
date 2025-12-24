from __future__ import annotations

from graph.state import AgentState
from models.contracts import Reference


def references(state: AgentState) -> AgentState:
    # Minimal rule-based fallback: ensure at least one reference exists.
    if state.consideration.references:
        return state
    state.consideration.references = [
        Reference(
            id="1",
            title=f"実験書PDF（配布資料）: {state.pdf.filename}".strip(),
            year="",
            authors="",
        )
    ]
    state.consideration.reference_list_formatted = [
        f"[1] 実験書PDF（配布資料）: {state.pdf.filename}".strip()
    ]
    return state

