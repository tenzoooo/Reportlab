from __future__ import annotations

from core.storage import Storage
from graph.nodes.render_docx_markdown import render_docx_markdown
from graph.state import AgentState, now_iso


def render_docx(state: AgentState, *, storage: Storage) -> AgentState:
    state = render_docx_markdown(state, storage=storage)
    if not state.artifact_docx_key:
        return state

    run_id = (state.job_meta.run_id or "").strip() or state.job_meta.job_id
    target_key = f"artifacts/{run_id}/report.docx"
    if state.artifact_docx_key != target_key:
        docx_bytes = storage.get_bytes(state.artifact_docx_key)
        storage.put_bytes(target_key, docx_bytes)
        state.artifact_docx_key = target_key
        state.rendered_docx.path = target_key
        state.rendered_docx.generated_at = now_iso()

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["render_docx"]
