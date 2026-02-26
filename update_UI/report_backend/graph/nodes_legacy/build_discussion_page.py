from __future__ import annotations

from graph.state import AgentState, DiscussionPage, JobStatus, TextGenerationHitl, ValidationIssue, now_iso
from llm.client import LLMClient
from models.contracts import ConsiderationUnit


_HITL_DISCUSSION_RANGE_UNKNOWN = "HITL_DISCUSSION_RANGE_UNKNOWN"
_HITL_DISCUSSION_PROMPTS_MISSING = "HITL_DISCUSSION_PROMPTS_MISSING"
_FAIL_DISCUSSION_UNITS_MISSING = "FAIL_DISCUSSION_UNITS_MISSING"


def _build_range_hitl() -> TextGenerationHitl:
    html = (
        "<form data-hitl=\"discussion_range\">"
        "<label>考察セクション本文"
        "<textarea name=\"discussion_text\" rows=\"8\"></textarea>"
        "</label>"
        "</form>"
    )
    payload = {"reason": "discussion_range_unknown"}
    return TextGenerationHitl(
        enabled=True,
        codes=[_HITL_DISCUSSION_RANGE_UNKNOWN],
        message="Discussion section range is unknown.",
        html=html,
        payload=payload,
        rewind_target="BuildDiscussionPage",
    )


def _build_prompts_hitl(text: str) -> TextGenerationHitl:
    html = (
        "<form data-hitl=\"discussion_prompts\">"
        "<label>考察の指示文（1行1件）"
        "<textarea name=\"discussion_prompts\" rows=\"8\"></textarea>"
        "</label>"
        "</form>"
    )
    payload = {"reason": "discussion_prompts_missing", "discussion_text": text}
    return TextGenerationHitl(
        enabled=True,
        codes=[_HITL_DISCUSSION_PROMPTS_MISSING],
        message="Discussion prompts are missing.",
        html=html,
        payload=payload,
        rewind_target="BuildDiscussionPage",
    )


def _extract_prompts_fallback(text: str) -> list[str]:
    prompts: list[str] = []
    for line in (text or "").splitlines():
        l = line.strip()
        if not l:
            continue
        if any(s in l for s in ["せよ", "しなさい", "求めよ", "検討せよ", "考察せよ", "示せ", "述べよ", "表わしなさい", "表しなさい"]):
            prompts.append(l)
    return prompts


def _normalize_units(units: list[ConsiderationUnit]) -> list[ConsiderationUnit]:
    normalized: list[ConsiderationUnit] = []
    counter = 1
    for unit in units:
        discussion = (unit.discussion_active or "").strip()
        if not discussion:
            continue
        normalized.append(
            ConsiderationUnit(
                index=str(counter),
                discussion_active=discussion,
                answer=None,
            )
        )
        counter += 1
    return normalized


def _format_discussion_text(units: list[ConsiderationUnit]) -> str:
    lines: list[str] = []
    for unit in units:
        index = (unit.index or "").strip()
        discussion = (unit.discussion_active or "").strip()
        if not index and not discussion:
            continue
        lines.append(f"({index}){discussion}".strip())
    return "\n".join(lines).strip()


def build_discussion_page(state: AgentState, *, llm: LLMClient) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if state.consideration.units:
        return state

    discussion_text = (state.pdf.discussion_text or "").strip()
    if not discussion_text:
        state.text_generation_hitl = _build_range_hitl()
        state.job_meta.updated_at = now_iso()
        return state

    prompts = [p for p in (state.pdf.consideration_prompts or []) if str(p).strip()]
    if not prompts:
        try:
            extracted = llm.extract_discussion_prompts(discussion_text)
            prompts = [p for p in (extracted.prompts or []) if str(p).strip()]
        except Exception:
            prompts = []

    if not prompts:
        prompts = _extract_prompts_fallback(discussion_text)

    if not prompts:
        state.text_generation_hitl = _build_prompts_hitl(discussion_text)
        state.job_meta.updated_at = now_iso()
        return state

    state.pdf.consideration_prompts = prompts

    try:
        out = llm.generate_discussion(prompts)
    except Exception:
        out = None

    if not out or not out.units:
        state.validation_report.errors.append(
            ValidationIssue(code=_FAIL_DISCUSSION_UNITS_MISSING, message="Discussion units are missing.")
        )
        state.status = JobStatus.failed
        state.job_meta.updated_at = now_iso()
        return state

    units = _normalize_units(
        [ConsiderationUnit(index=u.index, discussion_active=u.discussion_active, answer=None) for u in out.units]
    )
    if not units:
        state.validation_report.errors.append(
            ValidationIssue(code=_FAIL_DISCUSSION_UNITS_MISSING, message="Discussion units are missing.")
        )
        state.status = JobStatus.failed
        state.job_meta.updated_at = now_iso()
        return state

    state.consideration.units = units
    state.discussion_page = DiscussionPage(
        text=_format_discussion_text(units),
        prompts=list(state.pdf.consideration_prompts or []),
        units=units,
        generated_at=now_iso(),
    )
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["build_discussion_page"]
