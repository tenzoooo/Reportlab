from __future__ import annotations

from graph.state import AgentState


def infer_report_chapter(state: AgentState, *, default: int = 4) -> int:
    if state.pdf.method_chapter:
        return state.pdf.method_chapter + 1
    if state.pdf.discussion_chapter:
        return max(1, state.pdf.discussion_chapter - 1)
    return default

