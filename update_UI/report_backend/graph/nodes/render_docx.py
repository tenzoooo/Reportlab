from __future__ import annotations

import zipfile
import io

from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue
from templating.renderer import render_docx_bytes


def _detect_unrendered_template_tags(docx_bytes: bytes) -> list[str]:
    """
    Best-effort detection of leftover Jinja tags in the rendered DOCX.
    If tags remain, it usually means the template tags were not recognized
    (e.g., split across runs, inside unsupported elements, or wrong delimiters).
    """
    try:
        with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:  # type: ignore[name-defined]
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
    except Exception:
        return []

    hits: list[str] = []
    for marker in ("{{", "{%", "}}", "%}"):
        if marker in xml:
            hits.append(marker)
    return hits


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

        leftover = _detect_unrendered_template_tags(docx_bytes)
        if leftover:
            state.validation_report.warnings.append(
                ValidationIssue(
                    code="unrendered_template_tags",
                    message=f"Rendered DOCX still contains template markers: {', '.join(leftover)} (check template tags / run splitting)",
                )
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
