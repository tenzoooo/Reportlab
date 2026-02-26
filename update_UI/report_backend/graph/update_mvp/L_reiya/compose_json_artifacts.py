from __future__ import annotations

from typing import Any

from graph.state import AgentState, ArtifactsBundle, now_iso
from models.contracts import EvidenceRef, TextWithEvidence


def _evidence_from_text(obj: TextWithEvidence | None) -> list[EvidenceRef]:
    if not obj:
        return []
    return list(obj.evidence_refs or [])


def _collect_results_evidence(state: AgentState) -> list[EvidenceRef]:
    if not state.results_page:
        return []
    refs: list[EvidenceRef] = []
    for section in state.results_page.sections:
        refs.extend(section.evidence_refs)
        for group in section.groups:
            refs.extend(group.evidence_refs)
            refs.extend(_evidence_from_text(group.experiment_overview))
            refs.extend(_evidence_from_text(group.result_description))
            refs.extend(_evidence_from_text(group.quant_comment.text))
            for table in group.tables:
                refs.extend(_evidence_from_text(table.caption))
            for figure in group.figures:
                refs.extend(_evidence_from_text(figure.caption))
            for photo in group.photos:
                refs.extend(_evidence_from_text(photo.caption))
    return refs


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


def _quant_comment_metrics(state: AgentState) -> list[dict[str, Any]]:
    if not state.results_page:
        return []
    rows: list[dict[str, Any]] = []
    for section in state.results_page.sections:
        for group in section.groups:
            metrics = group.quant_comment.metrics or {}
            if not metrics:
                continue
            rows.append(
                {
                    "result_no": group.result_no,
                    "experiment_name": group.experiment_name,
                    "metrics": metrics,
                }
            )
    return rows


def compose_json_artifacts(state: AgentState) -> AgentState:
    payload: dict[str, Any] = {
        "result_number_map": state.pdf.result_number_map,
        "results_page": state.results_page.model_dump() if state.results_page else None,
        "results_evidence_refs": [ref.model_dump() for ref in _collect_results_evidence(state)],
        "theory_formulas": [f.model_dump() for f in state.pdf.theory_formulas],
        "theory_formula_primary": _pick_primary_formula(state),
        "computation": {
            "theory_value_results": [r.model_dump() for r in state.theory_value_results],
            "delta_error_results": [r.model_dump() for r in state.delta_error_results],
            "slope_extreme_results": [r.model_dump() for r in state.slope_extreme_results],
            "quant_comment_metrics": _quant_comment_metrics(state),
            "compute_log": state.compute_log,
        },
        "excel_binding": {
            "excel_inventory": [inv.model_dump() for inv in state.excel_inventory],
            "excel_sheet_selections": [sel.model_dump() for sel in state.excel_sheet_selections],
            "table_column_bindings": [binding.model_dump() for binding in state.table_column_bindings],
            "theory_param_bindings": [binding.model_dump() for binding in state.theory_param_bindings],
            "insert_asset_bindings": [binding.model_dump() for binding in state.insert_asset_bindings],
            "graph_axis_bindings": [binding.model_dump() for binding in state.graph_axis_bindings],
        },
        "assets": {
            "images": [img.model_dump() for img in state.assets_images],
            "tables": [tbl.model_dump() for tbl in state.assets_tables],
        },
        "hitl_history": [entry.model_dump() for entry in state.hitl_history],
        "quality_report": state.quality_report.model_dump(),
    }

    state.artifacts.json_bundle = ArtifactsBundle(payload=payload, generated_at=now_iso())
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["compose_json_artifacts"]
