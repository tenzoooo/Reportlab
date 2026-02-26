from __future__ import annotations

import re

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

_DA_DEARU_RE = re.compile(r"(です|ます|でした|ました)(。|$)")

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


def _ends_with_shimesu(text: str) -> bool:
    s = (text or "").strip()
    return s.endswith("示す") or s.endswith("示す。") or s.endswith("示す．")


def _detect_banned_terms(text: str, *, extra_terms: list[str]) -> list[str]:
    found: list[str] = []
    for term in _BANNED_TERMS + extra_terms:
        if term and term in text:
            found.append(term)
    return sorted(set(found))


def validate_preformat(state: AgentState) -> AgentState:
    stage = "N.validate_preformat"
    new_issues: list[QualityIssue] = []

    if state.results_page is None:
        _add_issue(
            new_issues,
            code="FAIL_RESULTS_PAGE_MISSING",
            stage=stage,
            severity="FAIL",
            message="Results page is missing before preformat validation.",
            suggested_action="stop",
        )
        state.quality_report.issues.extend(new_issues)
        _sync_validation_report(state, new_issues)
        _refresh_pass_gate(state)
        state.job_meta.updated_at = now_iso()
        return state

    markdown_text = ""
    if state.markdown.document_styled:
        markdown_text = state.markdown.document_styled.text or ""
    elif state.markdown.document:
        markdown_text = state.markdown.document.text or ""

    required_by_result_no: dict[str, tuple[int, int, int]] = {}
    for req in state.required_outputs:
        result_no = (state.pdf.result_number_map.get(req.exp_key, "") or "").strip()
        if result_no:
            required_by_result_no[result_no] = (req.tables_count, req.graphs_count, req.photos_count)

    binding_by_result_no: dict[str, object] = {}
    for binding in state.insert_asset_bindings:
        result_no = (binding.result_no or "").strip()
        if not result_no:
            result_no = (state.pdf.result_number_map.get(binding.exp_key, "") or "").strip()
        if result_no:
            binding_by_result_no[result_no] = binding

    axis_by_result_no: dict[str, list[object]] = {}
    for axis in state.graph_axis_bindings:
        result_no = (axis.result_no or "").strip()
        if result_no:
            axis_by_result_no.setdefault(result_no, []).append(axis)

    for section in state.results_page.sections:
        for group in section.groups:
            result_no = (group.result_no or "").strip()
            if not (group.method_no or "").strip():
                _add_issue(
                    new_issues,
                    code="HITL_METHOD_TO_RESULT_MAPPING",
                    stage=stage,
                    severity="HITL",
                    message=f"Method-to-result mapping missing for result {result_no}.",
                    suggested_action="ask_user",
                )

            overview = (group.experiment_overview.text or "").strip()
            if not overview:
                _add_issue(
                    new_issues,
                    code="HITL_METHOD_SUMMARY_MISSING",
                    stage=stage,
                    severity="HITL",
                    message=f"Method summary missing for result {result_no}.",
                    suggested_action="ask_user",
                )

            result_desc = (group.result_description.text or "").strip()
            if not result_desc:
                _add_issue(
                    new_issues,
                    code="FAIL_RESULT_DESCRIPTION_MISSING",
                    stage=stage,
                    severity="FAIL",
                    message=f"Result description missing for result {result_no}.",
                    suggested_action="stop",
                )
            elif not _ends_with_shimesu(result_desc):
                _add_issue(
                    new_issues,
                    code="FAIL_RESULT_DESC_NOT_END_WITH_SHIMESU",
                    stage=stage,
                    severity="FAIL",
                    message=f"Result description does not end with '示す' for result {result_no}.",
                    suggested_action="autofix",
                )

            binding = binding_by_result_no.get(result_no)
            required_counts = required_by_result_no.get(result_no, (0, 0, 0))
            actual_counts = (len(group.tables), len(group.figures), len(group.photos))

            if binding is not None:
                if getattr(binding, "type_unknown", False):
                    _add_issue(
                        new_issues,
                        code="HITL_ASSET_TYPE_UNKNOWN",
                        stage=stage,
                        severity="HITL",
                        message=f"Asset type unknown for result {result_no}.",
                        suggested_action="ask_user",
                    )
                if getattr(binding, "ambiguous", False):
                    _add_issue(
                        new_issues,
                        code="HITL_INSERT_ASSET_UNKNOWN",
                        stage=stage,
                        severity="HITL",
                        message=f"Asset binding ambiguous for result {result_no}.",
                        suggested_action="ask_user",
                    )
                missing = (
                    getattr(binding, "missing_tables", 0),
                    getattr(binding, "missing_graphs", 0),
                    getattr(binding, "missing_photos", 0),
                )
                if any(val > 0 for val in missing):
                    _add_issue(
                        new_issues,
                        code="HITL_INSERT_ASSET_MISSING",
                        stage=stage,
                        severity="HITL",
                        message=f"Required assets missing for result {result_no}.",
                        suggested_action="ask_user",
                    )
            else:
                if any(req > actual for req, actual in zip(required_counts, actual_counts)):
                    _add_issue(
                        new_issues,
                        code="HITL_INSERT_ASSET_MISSING",
                        stage=stage,
                        severity="HITL",
                        message=f"Required assets missing for result {result_no}.",
                        suggested_action="ask_user",
                    )

            for asset in group.tables + group.figures + group.photos:
                caption_text = (asset.caption.text or "").strip()
                if not caption_text:
                    _add_issue(
                        new_issues,
                        code="FAIL_CAPTION_MISSING",
                        stage=stage,
                        severity="FAIL",
                        message=f"Caption missing for asset {asset.label}.",
                        suggested_action="stop",
                    )

            quant_text = (group.quant_comment.text.text or "").strip()
            if not quant_text:
                _add_issue(
                    new_issues,
                    code="FAIL_QUANT_COMMENT_MISSING",
                    stage=stage,
                    severity="FAIL",
                    message=f"Quant comment missing for result {result_no}.",
                    suggested_action="stop",
                )

            metrics = group.quant_comment.metrics or {}
            if group.quant_comment.theory_compare:
                if "delta" not in metrics:
                    _add_issue(
                        new_issues,
                        code="FAIL_QUANT_NO_DELTA",
                        stage=stage,
                        severity="FAIL",
                        message=f"Delta metric missing for result {result_no}.",
                        suggested_action="stop",
                    )
                if "abs_error" not in metrics:
                    _add_issue(
                        new_issues,
                        code="FAIL_QUANT_NO_ABS_ERROR",
                        stage=stage,
                        severity="FAIL",
                        message=f"Absolute error metric missing for result {result_no}.",
                        suggested_action="stop",
                    )
            else:
                if "slope" not in metrics:
                    _add_issue(
                        new_issues,
                        code="FAIL_OFF_NO_SLOPE",
                        stage=stage,
                        severity="FAIL",
                        message=f"Slope metric missing for result {result_no}.",
                        suggested_action="stop",
                    )
                if "extreme" not in metrics:
                    _add_issue(
                        new_issues,
                        code="FAIL_OFF_NO_EXTREME",
                        stage=stage,
                        severity="FAIL",
                        message=f"Extreme metric missing for result {result_no}.",
                        suggested_action="stop",
                    )

            if group.figures:
                axis_bindings = axis_by_result_no.get(result_no, [])
                if not axis_bindings:
                    _add_issue(
                        new_issues,
                        code="HITL_AXIS_LABEL_UNKNOWN",
                        stage=stage,
                        severity="HITL",
                        message=f"Axis labels missing for result {result_no}.",
                        suggested_action="ask_user",
                    )
                    _add_issue(
                        new_issues,
                        code="HITL_UNIT_UNKNOWN",
                        stage=stage,
                        severity="HITL",
                        message=f"Axis units missing for result {result_no}.",
                        suggested_action="ask_user",
                    )
                else:
                    for axis in axis_bindings:
                        if not (axis.x_label or "").strip() or not (axis.y_label or "").strip():
                            _add_issue(
                                new_issues,
                                code="HITL_AXIS_LABEL_UNKNOWN",
                                stage=stage,
                                severity="HITL",
                                message=f"Axis labels missing for result {result_no}.",
                                suggested_action="ask_user",
                            )
                        if not (axis.x_unit or "").strip() or not (axis.y_unit or "").strip():
                            _add_issue(
                                new_issues,
                                code="HITL_UNIT_UNKNOWN",
                                stage=stage,
                                severity="HITL",
                                message=f"Axis units missing for result {result_no}.",
                                suggested_action="ask_user",
                            )
                        break

            if markdown_text:
                for asset in group.tables + group.figures + group.photos:
                    if asset.label and asset.label not in markdown_text:
                        _add_issue(
                            new_issues,
                            code="FAIL_REFERENCE_BROKEN",
                            stage=stage,
                            severity="FAIL",
                            message=f"Reference label '{asset.label}' not found in markdown.",
                            suggested_action="stop",
                        )

    if markdown_text and _DA_DEARU_RE.search(markdown_text):
        _add_issue(
            new_issues,
            code="FAIL_STYLE_NOT_DA_DEARU",
            stage=stage,
            severity="FAIL",
            message="Document style is not unified to da/dearu.",
            suggested_action="autofix",
        )

    extra_terms = []
    if isinstance(state.style_rules, dict):
        extra_terms = [str(term).strip() for term in state.style_rules.get("soft_avoid_phrases", []) if term]
    banned_hits = _detect_banned_terms(markdown_text, extra_terms=extra_terms) if markdown_text else []
    for term in banned_hits:
        _add_issue(
            new_issues,
            code="WARN_STYLE_BANNED_PHRASE",
            stage=stage,
            severity="WARN",
            message=f"Banned/soft-avoid phrase '{term}' remains in markdown.",
            suggested_action="autofix",
        )

    state.quality_report.issues.extend(new_issues)
    _sync_validation_report(state, new_issues)
    _refresh_pass_gate(state)
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["validate_preformat"]
