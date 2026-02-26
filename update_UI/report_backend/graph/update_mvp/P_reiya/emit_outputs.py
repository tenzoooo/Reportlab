from __future__ import annotations

import json
from pathlib import Path

from core.storage import Storage
from graph.state import AgentState, now_iso


_LOCAL_BASE = "/tmp/reportlab"


def _run_id(state: AgentState) -> str:
    return (state.job_meta.run_id or "").strip() or state.job_meta.job_id


def _markdown_text(state: AgentState) -> str:
    if state.markdown.document_styled:
        return state.markdown.document_styled.text
    if state.markdown.document:
        return state.markdown.document.text
    return ""


def _write_local(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def emit_outputs(state: AgentState, *, storage: Storage) -> AgentState:
    run_id = _run_id(state)

    docx_key = f"artifacts/{run_id}/report.docx"
    markdown_key = f"artifacts/{run_id}/report.md"
    json_key = f"artifacts/{run_id}/bundle.json"
    quality_key = f"artifacts/{run_id}/quality_report.json"

    markdown_text = _markdown_text(state)
    if markdown_text:
        storage.put_bytes(markdown_key, markdown_text.encode("utf-8"))
        state.artifact_markdown_key = markdown_key

    bundle_payload = {}
    if state.artifacts.json_bundle is not None:
        bundle_payload = state.artifacts.json_bundle.payload
    storage.put_json(json_key, bundle_payload)
    state.artifact_json_key = json_key

    quality_payload = state.quality_report.dict()
    storage.put_json(quality_key, quality_payload)
    state.artifact_quality_report_key = quality_key

    if state.artifact_docx_key and state.artifact_docx_key != docx_key:
        docx_bytes = storage.get_bytes(state.artifact_docx_key)
        storage.put_bytes(docx_key, docx_bytes)
        state.artifact_docx_key = docx_key
        state.rendered_docx.path = docx_key

    local_base = Path(_LOCAL_BASE) / run_id
    if state.artifact_docx_key:
        docx_bytes = storage.get_bytes(state.artifact_docx_key)
        local_docx = local_base / "report.docx"
        _write_local(local_docx, docx_bytes)
        state.rendered_docx.local_path = str(local_docx)

    if markdown_text:
        _write_local(local_base / "report.md", markdown_text.encode("utf-8"))

    _write_local(local_base / "bundle.json", json.dumps(bundle_payload, ensure_ascii=False, indent=2).encode("utf-8"))
    _write_local(
        local_base / "quality_report.json",
        json.dumps(quality_payload, ensure_ascii=False, indent=2).encode("utf-8"),
    )

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["emit_outputs"]
