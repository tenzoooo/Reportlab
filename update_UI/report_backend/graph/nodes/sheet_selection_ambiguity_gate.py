from __future__ import annotations

from graph.state import AgentState, ExcelSheetSelection, ExcelSheetSelectionHitl, now_iso
from graph.hitl import hitl_disabled


_CONF_AUTO = 0.80


def _build_option(value: str, label: str, *, checked: bool) -> str:
    checked_attr = " checked" if checked else ""
    return f"<label><input type=\"radio\" name=\"excel_sheet\" value=\"{value}\"{checked_attr}> {label}</label>"


def _build_html_payload(
    selections: list[ExcelSheetSelection],
) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_experiments = []
    for idx, selection in enumerate(selections):
        options = []
        candidates = selection.candidates or []
        if not candidates and selection.selected_sheet:
            candidates = [
                {
                    "excel_id": selection.selected_excel_id,
                    "sheet_name": selection.selected_sheet,
                    "confidence": selection.confidence,
                }
            ]
        for cand_idx, cand in enumerate(candidates):
            excel_id = cand.excel_id if hasattr(cand, "excel_id") else cand.get("excel_id", "")
            sheet_name = cand.sheet_name if hasattr(cand, "sheet_name") else cand.get("sheet_name", "")
            conf = cand.confidence if hasattr(cand, "confidence") else cand.get("confidence", 0.0)
            value = f"{excel_id}::{sheet_name}"
            label = f"{sheet_name} (excel={excel_id}, conf={conf:.2f})"
            options.append(_build_option(value, label, checked=cand_idx == 0))

        blocks.append(
            "<section>"
            f"<h3>Experiment {selection.result_no or selection.exp_key} {selection.title}</h3>"
            f"<div>{'<br>'.join(options)}</div>"
            f"<label>Reason (optional) <input type=\"text\" name=\"reason_{idx}\" /></label>"
            "</section>"
        )
        payload_experiments.append(
            {
                "exp_key": selection.exp_key,
                "result_no": selection.result_no,
                "title": selection.title,
                "selected_excel_id": selection.selected_excel_id,
                "selected_sheet": selection.selected_sheet,
                "candidates": [
                    c.model_dump() if hasattr(c, "model_dump") else c for c in candidates
                ],
            }
        )

    html = "<form data-hitl=\"excel_sheet_select\">" + "\n".join(blocks) + "</form>"
    payload = {"experiments": payload_experiments}
    return html, payload


def sheet_selection_ambiguity_gate(state: AgentState) -> AgentState:
    state.excel_sheet_hitl = ExcelSheetSelectionHitl()
    selections = list(state.excel_sheet_selections)
    if not selections:
        # In HITL-disabled mode, do not block the pipeline here.
        if hitl_disabled():
            state.job_meta.updated_at = now_iso()
            return state
        html, payload = _build_html_payload([])
        state.excel_sheet_hitl = ExcelSheetSelectionHitl(
            enabled=True,
            code="HITL_EXCEL_SHEET_UNKNOWN",
            message="Excelのシート選択が未確定です。",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
        return state

    targets = [
        sel
        for sel in selections
        if not sel.selected_sheet
        or not sel.selected_excel_id
        or sel.confidence < _CONF_AUTO
    ]
    if targets:
        if hitl_disabled():
            # Auto-pick the top candidate if available; otherwise keep current selection and continue.
            for sel in targets:
                candidates = list(sel.candidates or [])
                if (not sel.selected_excel_id or not sel.selected_sheet) and candidates:
                    best = candidates[0]
                    sel.selected_excel_id = best.excel_id
                    sel.selected_sheet = best.sheet_name
                    sel.confidence = max(sel.confidence or 0.0, float(getattr(best, "confidence", 0.0) or 0.0))
                    sel.used_llm = bool(getattr(best, "used_llm", False))
            state.excel_sheet_selections = selections
            state.job_meta.updated_at = now_iso()
            return state
        html, payload = _build_html_payload(targets)
        state.excel_sheet_hitl = ExcelSheetSelectionHitl(
            enabled=True,
            code="HITL_EXCEL_SHEET_UNKNOWN",
            message="各実験に対応するExcelシートを選択してください。",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
    return state
