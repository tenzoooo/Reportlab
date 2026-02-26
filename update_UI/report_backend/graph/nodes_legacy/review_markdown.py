from __future__ import annotations

import json

from core.markdown_review import review_markdown
from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue, now_iso


def review_markdown_node(state: AgentState, *, storage: Storage) -> AgentState:
    """
    Post-process generated markdown with a rule-based reviewer pipeline.
    Always runs to completion in MVP; stores:
    - raw markdown key
    - reviewed markdown key (state.artifact_markdown_key)
    - review log JSON key + in-state preview
    """
    if not state.artifact_markdown_key:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="missing_markdown_artifact", message="Markdown artifact was not generated")
        )
        return state

    job_id = state.job_meta.job_id
    raw_key = state.artifact_markdown_key
    try:
        raw_md = storage.get_bytes(raw_key).decode("utf-8", "ignore")
    except Exception as exc:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="read_markdown_failed", message=str(exc)))
        return state

    reviewed_md, review_log = review_markdown(raw_md)

    reviewed_key = f"jobs/{job_id}/artifact/report_reviewed.md"
    storage.put_bytes(reviewed_key, reviewed_md.encode("utf-8"))

    log_key = f"jobs/{job_id}/artifact/review_log.json"
    storage.put_json(log_key, review_log)

    state.artifact_markdown_raw_key = raw_key
    state.artifact_markdown_key = reviewed_key
    state.artifact_review_log_key = log_key
    # Keep a small preview in-state for /jobs/{id} debug (avoid huge logs).
    try:
        state.review_log = json.loads(json.dumps(review_log, ensure_ascii=False))  # ensure JSON-serializable
    except Exception:
        state.review_log = {}

    state.job_meta.updated_at = now_iso()
    return state

