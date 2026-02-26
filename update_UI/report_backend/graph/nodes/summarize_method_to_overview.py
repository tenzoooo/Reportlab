from __future__ import annotations

from graph.state import AgentState, JobStatus, TextGenerationHitl, ValidationIssue, now_iso
from models.contracts import EvidenceRef


_HITL_CODE = "HITL_METHOD_SUMMARY_MISSING"
_FAIL_CODE = "FAIL_METHOD_SUMMARY_MISSING"
_REWIND_TARGET = "SummarizeMethodToOverview"


def _has_children(state: AgentState, *, idx: str) -> bool:
    return any(exp.idx == idx and exp.subidx for exp in state.experiments)


def _method_summary_maps(state: AgentState) -> tuple[dict[str, str], dict[str, str]]:
    by_key: dict[str, str] = {}
    by_title: dict[str, str] = {}
    for item in state.method_tree:
        exp_key = str(item.get("exp_key") or "").strip()
        title = str(item.get("title") or "").strip()
        summary = str(item.get("method_summary") or "").strip()
        if exp_key and summary:
            by_key[exp_key] = summary
        if title and summary:
            by_title[title] = summary
    return by_key, by_title


def _has_evidence(exp, *, target: str, source_kind: str) -> bool:
    return any(ref.target == target and ref.source_kind == source_kind for ref in exp.evidence_refs)


def _build_hitl_payload(missing: list[dict[str, str]], method_text: str) -> tuple[str, dict[str, object]]:
    blocks = []
    targets = []
    for idx, item in enumerate(missing):
        exp_key = item.get("exp_key") or ""
        title = item.get("title") or ""
        blocks.append(
            "<section>"
            f"<h3>Experiment {exp_key} {title}</h3>"
            f"<label>Method summary <textarea name=\"method_summary_{idx}\" rows=\"4\"></textarea></label>"
            "</section>"
        )
        targets.append({"exp_key": exp_key, "title": title})

    note = ""
    if method_text:
        snippet = method_text.strip().replace("\n", " ")
        if len(snippet) > 400:
            snippet = snippet[:400] + "..."
        note = f"<p>Method text snippet: {snippet}</p>"

    html = "<form data-hitl=\"method_summary\">" + note + "\n".join(blocks) + "</form>"
    payload = {"targets": targets, "method_text": method_text}
    return html, payload


def summarize_method_to_overview(state: AgentState) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if not state.experiments:
        return state

    by_key, by_title = _method_summary_maps(state)
    missing: list[dict[str, str]] = []

    for exp in state.experiments:
        if not exp.subidx and _has_children(state, idx=exp.idx):
            continue
        if exp.method_summary.strip():
            continue
        exp_key = (exp.source_idx or "").strip()
        summary = by_key.get(exp_key) or by_title.get(exp.name or "")
        if summary:
            exp.method_summary = summary
            if not exp.description_brief.strip():
                exp.description_brief = summary
            if not _has_evidence(exp, target="method_summary", source_kind="llm"):
                exp.evidence_refs.append(
                    EvidenceRef(
                        source_kind="llm",
                        asset_id=state.pdf.asset_id,
                        text=summary,
                        note="method_extract",
                        target="method_summary",
                    )
                )
            if state.pdf.method_text and not _has_evidence(exp, target="method_summary", source_kind="pdf"):
                exp.evidence_refs.append(
                    EvidenceRef(
                        source_kind="pdf",
                        asset_id=state.pdf.asset_id,
                        text=state.pdf.method_text[:200],
                        note="method_text",
                        target="method_summary",
                    )
                )
            continue
        missing.append({"exp_key": exp_key or exp.idx, "title": exp.name})

    if missing:
        has_method_source = bool(state.pdf.method_text.strip()) or bool(state.method_tree)
        if not has_method_source:
            for item in missing:
                state.validation_report.errors.append(
                    ValidationIssue(code=_FAIL_CODE, message="Method summary is missing.", target=item.get("exp_key"))
                )
            state.status = JobStatus.failed
        else:
            html, payload = _build_hitl_payload(missing, state.pdf.method_text)
            state.text_generation_hitl = TextGenerationHitl(
                enabled=True,
                codes=[_HITL_CODE],
                message="Method summary is missing for some experiments.",
                html=html,
                payload=payload,
                rewind_target=_REWIND_TARGET,
            )

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["summarize_method_to_overview"]
