from __future__ import annotations

from typing import Any

from graph.state import AgentState, OmmlInsertion, QualityIssue, now_iso
from .style_transform import style_text_line


def _pick_primary_formula(state: AgentState) -> dict[str, Any] | None:
    if not state.pdf.theory_formulas:
        return None
    if len(state.pdf.theory_formulas) == 1:
        return state.pdf.theory_formulas[0].model_dump()
    for formula in state.pdf.theory_formulas:
        selected = getattr(formula, "selected", False)
        primary = getattr(formula, "primary", False)
        if selected or primary:
            return formula.model_dump()
    return None


def omml_placement_and_sanity(state: AgentState) -> AgentState:
    insertions: list[OmmlInsertion] = []
    primary = _pick_primary_formula(state)
    primary_omml = (primary or {}).get("omml") if primary else None

    if state.results_page:
        for section in state.results_page.sections:
            for group in section.groups:
                if not group.quant_comment.theory_compare:
                    continue
                if not primary_omml:
                    state.quality_report.issues.append(
                        QualityIssue(
                            code="HITL_OMML_CONVERSION_FAILED",
                            stage="M.omml",
                            severity="FAIL",
                            message="Primary OMML formula is missing for theory comparison.",
                            suggested_action="ask_user",
                        )
                    )
                    continue
                raw_text = (group.quant_comment.text.text or "").strip()
                if not raw_text:
                    continue
                target_text, _ = style_text_line(state, raw_text)
                if not target_text:
                    continue
                insertions.append(
                    OmmlInsertion(
                        result_no=group.result_no,
                        target_text=target_text,
                        omml=primary_omml,
                    )
                )

    state.omml_insertion_plan = insertions
    if any(issue.severity == "FAIL" for issue in state.quality_report.issues):
        state.quality_report.pass_gate = False
    else:
        state.quality_report.pass_gate = True
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["omml_placement_and_sanity"]
