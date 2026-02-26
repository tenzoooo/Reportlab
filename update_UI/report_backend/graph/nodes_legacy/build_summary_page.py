from __future__ import annotations

from graph.state import AgentState, JobStatus, SummaryPage, ValidationIssue, now_iso
from llm.client import LLMClient


_FAIL_SUMMARY_SOURCE_MISSING = "FAIL_SUMMARY_SOURCE_MISSING"
_FAIL_SUMMARY_MISSING = "FAIL_SUMMARY_MISSING"


def _format_consideration_text(state: AgentState) -> str:
    lines: list[str] = []
    for unit in state.consideration.units:
        index = (unit.index or "").strip()
        discussion = (unit.discussion_active or "").strip()
        if not index and not discussion:
            continue
        body = f"({index}){discussion}".strip()
        lines.append(body)
    return "\n".join(lines).strip()


def _experiments_payload(state: AgentState) -> list[dict[str, str]]:
    payload: list[dict[str, str]] = []
    if state.result_groups:
        for group in state.result_groups:
            result = group.result_description.text
            qc = group.quant_comment.text.text
            result_text = " ".join([s for s in [result, qc] if s]).strip()
            payload.append(
                {
                    "exp_key": group.result_no,
                    "name": group.experiment_name,
                    "result": result_text,
                }
            )
        return payload

    for exp in state.experiments:
        result = (exp.result_brief or "").strip()
        payload.append({"exp_key": (exp.source_idx or exp.idx).strip(), "name": exp.name, "result": result})
    return payload


def _pdf_text(state: AgentState) -> str:
    text = (state.pdf.text or "").strip()
    if text:
        return text
    parts = [state.pdf.method_text, state.pdf.discussion_text]
    return "\n\n".join([p.strip() for p in parts if (p or "").strip()]).strip()


def build_summary_page(state: AgentState, *, llm: LLMClient) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if (state.summary or "").strip():
        return state

    pdf_text = _pdf_text(state)
    experiments = _experiments_payload(state)
    consideration_text = _format_consideration_text(state)

    if not pdf_text and not experiments and not consideration_text:
        state.validation_report.errors.append(
            ValidationIssue(code=_FAIL_SUMMARY_SOURCE_MISSING, message="Summary sources are missing.")
        )
        state.status = JobStatus.failed
        state.job_meta.updated_at = now_iso()
        return state

    try:
        out = llm.generate_summary(pdf_text=pdf_text, experiments=experiments, consideration_text=consideration_text)
    except Exception:
        out = None

    summary = (out.summary if out else "").strip()
    if not summary:
        state.validation_report.errors.append(
            ValidationIssue(code=_FAIL_SUMMARY_MISSING, message="Summary is missing.")
        )
        state.status = JobStatus.failed
        state.job_meta.updated_at = now_iso()
        return state

    state.summary = summary
    state.summary_page = SummaryPage(text=summary, generated_at=now_iso())
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["build_summary_page"]
