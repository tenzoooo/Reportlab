from __future__ import annotations

from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue, now_iso
from templating.markdown_docx import render_docx_from_markdown


def render_docx_markdown(state: AgentState, *, storage: Storage) -> AgentState:
    markdown_text = ""
    if state.markdown.document_styled:
        markdown_text = state.markdown.document_styled.text
    elif state.markdown.document:
        markdown_text = state.markdown.document.text
    elif state.artifact_markdown_key:
        markdown_text = storage.get_bytes(state.artifact_markdown_key).decode("utf-8", "ignore")
    else:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="missing_markdown_artifact", message="Markdown artifact was not generated")
        )
        return state

    job_id = state.job_meta.job_id
    try:
        images_by_id = {img.image_id: img for img in state.assets_images}
        omml_by_text: dict[str, list[str]] = {}
        for insertion in state.omml_insertion_plan:
            key = insertion.target_text.strip()
            if not key:
                continue
            omml_by_text.setdefault(key, []).append(insertion.omml)
        docx_bytes = render_docx_from_markdown(
            markdown=markdown_text,
            storage=storage,
            images_by_id=images_by_id,
            omml_by_text=omml_by_text,
        )
        out_key = f"jobs/{job_id}/artifact/report.docx"
        storage.put_bytes(out_key, docx_bytes)
        state.artifact_docx_key = out_key
        state.rendered_docx.path = out_key
        state.rendered_docx.omml_inserted = bool(omml_by_text)
        state.rendered_docx.generated_at = now_iso()
        state.status = JobStatus.done if not state.validation_report.errors else JobStatus.partial
        return state
    except Exception as exc:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="render_markdown_docx_failed", message=str(exc)))
        return state
