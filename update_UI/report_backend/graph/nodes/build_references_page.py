from __future__ import annotations

from graph.state import AgentState, JobStatus, ReferencesPage, now_iso
from models.contracts import Reference


def _format_reference_line(ref: Reference) -> str:
    parts = [f"[{ref.id}]", ref.title, ref.year or "", ref.authors or ""]
    return " ".join([p.strip() for p in parts if p and p.strip()]).strip()


def build_references_page(state: AgentState) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if state.consideration.references:
        return state

    filename = (state.pdf.filename or "").strip()
    title = filename if filename else "実験書PDF（配布資料）"
    ref = Reference(id="1", title=title, year="", authors="", notes=None)
    state.consideration.references = [ref]
    state.consideration.reference_list_formatted = [_format_reference_line(ref)]
    state.references_page = ReferencesPage(
        references=[ref],
        formatted_lines=list(state.consideration.reference_list_formatted),
        generated_at=now_iso(),
    )
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["build_references_page"]
