from __future__ import annotations

from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue
from templating.renderer import render_docx_bytes


def render_docx(state: AgentState, *, storage: Storage, template_path: str) -> AgentState:
    if not state.template_context:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="missing_template_context", message="Template context was not built")
        )
        return state

    job_id = state.job_meta.job_id
    try:
        context = state.template_context.model_dump()
        context["__assets_images"] = {img.image_id: img.model_dump() for img in state.assets_images}
        docx_bytes = render_docx_bytes(
            template_path=template_path,
            context=context,
            storage=storage,
            job_id=job_id,
        )
        out_key = f"jobs/{job_id}/artifact/report.docx"
        storage.put_bytes(out_key, docx_bytes)
        state.artifact_docx_key = out_key
        state.status = JobStatus.done if not state.validation_report.errors else JobStatus.partial
        return state
    except Exception as exc:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="render_failed", message=str(exc))
        )
        return state
