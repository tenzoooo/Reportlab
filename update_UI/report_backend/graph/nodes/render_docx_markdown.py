from __future__ import annotations

from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue
from templating.markdown_docx import render_docx_from_markdown


def render_docx_markdown(state: AgentState, *, storage: Storage) -> AgentState:
    if not state.artifact_markdown_key:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="missing_markdown_artifact", message="Markdown artifact was not generated")
        )
        return state

    job_id = state.job_meta.job_id
    try:
        md = storage.get_bytes(state.artifact_markdown_key).decode("utf-8", "ignore")
        images_by_id = {img.image_id: img for img in state.assets_images}
        docx_bytes = render_docx_from_markdown(markdown=md, storage=storage, images_by_id=images_by_id)
        out_key = f"jobs/{job_id}/artifact/report.docx"
        storage.put_bytes(out_key, docx_bytes)
        state.artifact_docx_key = out_key
        state.status = JobStatus.done if not state.validation_report.errors else JobStatus.partial
        return state
    except Exception as exc:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="render_markdown_docx_failed", message=str(exc)))
        return state

