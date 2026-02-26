from __future__ import annotations

from graph.state import AgentState, QualityIssue, ValidationIssue, now_iso


_BANNED_TERMS = [
    "ほぼ",
    "概ね",
    "顕著に",
    "著しく",
    "非常に",
    "大きく",
    "高い",
]


def _add_issue(
    issues: list[QualityIssue],
    *,
    code: str,
    stage: str,
    severity: str,
    message: str,
    suggested_action: str,
) -> None:
    issues.append(
        QualityIssue(
            code=code,
            stage=stage,
            severity=severity,
            message=message,
            suggested_action=suggested_action,
        )
    )


def _refresh_pass_gate(state: AgentState) -> None:
    state.quality_report.pass_gate = not any(
        issue.severity in {"FAIL", "HITL"} for issue in state.quality_report.issues
    )


def _sync_validation_report(state: AgentState, issues: list[QualityIssue]) -> None:
    for issue in issues:
        vi = ValidationIssue(code=issue.code, message=issue.message)
        if issue.suggested_action == "retry":
            state.validation_report.retry_targets.append(vi)
        elif issue.severity in {"FAIL", "HITL"}:
            state.validation_report.errors.append(vi)
        elif issue.severity == "WARN":
            state.validation_report.warnings.append(vi)


def _contains_banned_terms(text: str, extra_terms: list[str]) -> list[str]:
    found: list[str] = []
    for term in _BANNED_TERMS + extra_terms:
        if term and term in text:
            found.append(term)
    return sorted(set(found))


def _theory_compare_enabled(state: AgentState) -> bool:
    if state.results_page is None:
        return False
    for section in state.results_page.sections:
        for group in section.groups:
            if group.quant_comment.theory_compare:
                return True
    return False


def validate_final(state: AgentState) -> AgentState:
    stage = "N.validate_final"
    new_issues: list[QualityIssue] = []

    if not (state.rendered_docx.path or "").strip():
        _add_issue(
            new_issues,
            code="FAIL_DOCX_RENDER_MISSING",
            stage=stage,
            severity="FAIL",
            message="Rendered DOCX is missing at final validation.",
            suggested_action="stop",
        )
        state.quality_report.issues.extend(new_issues)
        _sync_validation_report(state, new_issues)
        _refresh_pass_gate(state)
        state.job_meta.updated_at = now_iso()
        return state

    if _theory_compare_enabled(state) and not state.rendered_docx.omml_inserted:
        _add_issue(
            new_issues,
            code="FAIL_OMML_MISSING",
            stage=stage,
            severity="FAIL",
            message="OMML insertion is missing for theory-compare results.",
            suggested_action="stop",
        )

    markdown_text = ""
    if state.markdown.document_styled:
        markdown_text = state.markdown.document_styled.text or ""

    extra_terms = []
    if isinstance(state.style_rules, dict):
        extra_terms = [str(term).strip() for term in state.style_rules.get("soft_avoid_phrases", []) if term]

    banned_hits = _contains_banned_terms(markdown_text, extra_terms) if markdown_text else []
    for term in banned_hits:
        _add_issue(
            new_issues,
            code="WARN_STYLE_BANNED_PHRASE",
            stage=stage,
            severity="WARN",
            message=f"Banned/soft-avoid phrase '{term}' remains in styled markdown.",
            suggested_action="autofix",
        )

    state.quality_report.issues.extend(new_issues)
    _sync_validation_report(state, new_issues)
    _refresh_pass_gate(state)
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["validate_final"]
