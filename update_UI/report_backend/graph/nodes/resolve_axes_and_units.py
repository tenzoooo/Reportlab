from __future__ import annotations

from graph.nodes.theory_compare_utils import is_theory_compare_enabled_for_exp
from graph.state import (
    AgentState,
    AxisHitl,
    GraphAxisBinding,
    TableColumnBinding,
    now_iso,
)
from llm.client import LLMClient


_CONF_AUTO = 0.80
_CONF_LLM_TRIGGER = 0.55

_X_HINTS = ["time", "t", "sec", "s", "時間", "frequency", "freq", "f", "周波数"]
_Y_HINTS = ["voltage", "current", "resistance", "電圧", "電流", "抵抗", "温度", "temperature"]
_DIMENSIONLESS_HINTS = ["id", "index", "count", "trial", "sample", "step", "no"]
_UNIT_OPTIONS = ["1", "V", "mV", "A", "mA", "ohm", "s", "ms", "Hz", "kHz", "C", "K", "%"]


def _is_dimensionless(name: str) -> bool:
    lower = name.lower()
    return any(token in lower for token in _DIMENSIONLESS_HINTS)


def _find_column(binding: TableColumnBinding, idx: int):
    for col in binding.columns:
        if col.column_index == idx:
            return col
    return None


def _infer_axes(binding: TableColumnBinding) -> tuple[int, list[int], float, str]:
    if not binding.columns:
        return 0, [], 0.2, "no_columns"
    columns = sorted(binding.columns, key=lambda c: c.column_index)
    x_idx = 0
    y_candidates: list[int] = []
    confidence = 0.6
    rationale = "fallback"

    for col in columns:
        name = (col.name or col.header or "").lower()
        if any(hint in name for hint in _X_HINTS):
            x_idx = col.column_index
            rationale = "x_hint"
            confidence = 0.85
            break

    if not x_idx:
        x_idx = columns[0].column_index

    for col in columns:
        if col.column_index == x_idx:
            continue
        name = (col.name or col.header or "").lower()
        if any(hint in name for hint in _Y_HINTS):
            y_candidates.append(col.column_index)
    if not y_candidates:
        y_candidates = [c.column_index for c in columns if c.column_index != x_idx]
    if not y_candidates:
        confidence = 0.3
        rationale = "no_y_candidates"
    return x_idx, y_candidates, confidence, rationale


def _can_call_llm(llm: LLMClient | None) -> bool:
    return bool(llm and callable(getattr(llm, "parse", None)))


def _llm_resolve_axes(binding: TableColumnBinding, *, llm: LLMClient) -> GraphAxisBinding | None:
    from llm.prompts.excel_axis_resolve import EXCEL_AXIS_RESOLVE_SYSTEM, build_excel_axis_resolve_user
    from llm.schemas.excel_axis_resolve import ExcelAxisResolveOutput

    payload = {
        "sheet_name": binding.sheet_name,
        "columns": [
            {
                "column_index": col.column_index,
                "name": col.name or col.header,
                "unit": col.unit,
            }
            for col in binding.columns
        ],
    }
    try:
        output = llm.parse(
            ExcelAxisResolveOutput,
            model=getattr(llm, "text_model", None),
            messages=[
                {"role": "system", "content": EXCEL_AXIS_RESOLVE_SYSTEM},
                {"role": "user", "content": build_excel_axis_resolve_user(payload)},
            ],
            attempts=1,
        )
    except Exception:
        return None

    x_column = int(getattr(output, "x_column", 0) or 0)
    y_columns = list(getattr(output, "y_columns", []) or [])
    if not x_column or not y_columns:
        return None
    x_label = str(getattr(output, "x_label", "") or "")
    y_label = str(getattr(output, "y_label", "") or "")
    x_unit = str(getattr(output, "x_unit", "") or "")
    y_unit = str(getattr(output, "y_unit", "") or "")
    confidence = float(getattr(output, "confidence", 0.0) or 0.0)
    rationale = str(getattr(output, "rationale", "") or "")
    return GraphAxisBinding(
        x_column=x_column,
        y_columns=[int(v) for v in y_columns if int(v) > 0],
        x_label=x_label,
        y_label=y_label,
        x_unit=x_unit,
        y_unit=y_unit,
        confidence=max(0.0, min(confidence, 1.0)),
        rationale=rationale,
        used_llm=True,
    )


def _build_axis_hitl_payload(bindings: list[GraphAxisBinding], columns_by_exp: dict[str, TableColumnBinding]) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_targets = []
    for idx, binding in enumerate(bindings):
        col_binding = columns_by_exp.get(binding.exp_key)
        options = []
        if col_binding:
            for col in col_binding.columns:
                label = f"{col.column_index}:{col.name or col.header}"
                options.append((col.column_index, label, col.unit))
        x_options = "".join([f"<option value=\"{opt[0]}\">{opt[1]}</option>" for opt in options])
        y_options = x_options
        unit_opts = "".join([f"<option value=\"{u}\">{u}</option>" for u in _UNIT_OPTIONS])
        blocks.append(
            "<section>"
            f"<h3>Graph {binding.graph_id}</h3>"
            f"<label>X column <select name=\"x_column_{idx}\">{x_options}</select></label>"
            f"<label>Y columns <select multiple name=\"y_columns_{idx}\">{y_options}</select></label>"
            f"<label>X label <input type=\"text\" name=\"x_label_{idx}\" /></label>"
            f"<label>Y label <input type=\"text\" name=\"y_label_{idx}\" /></label>"
            f"<label>X unit <select name=\"x_unit_{idx}\">{unit_opts}</select></label>"
            f"<label>Y unit <select name=\"y_unit_{idx}\">{unit_opts}</select></label>"
            "</section>"
        )
        payload_targets.append(
            {
                "graph_id": binding.graph_id,
                "exp_key": binding.exp_key,
                "result_no": binding.result_no,
            }
        )
    html = "<form data-hitl=\"axis_labels\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets, "unit_options": _UNIT_OPTIONS}
    return html, payload


def resolve_axes_and_units(state: AgentState, *, llm: LLMClient | None = None) -> AgentState:
    axis_bindings: list[GraphAxisBinding] = []
    columns_by_exp = {b.exp_key: b for b in state.table_column_bindings if b.exp_key}

    for binding in state.insert_asset_bindings:
        if is_theory_compare_enabled_for_exp(state, binding.exp_key):
            continue
        col_binding = columns_by_exp.get(binding.exp_key)
        for graph_id in binding.graphs_asset_ids:
            if col_binding is None:
                axis_bindings.append(
                    GraphAxisBinding(
                        graph_id=graph_id,
                        exp_key=binding.exp_key,
                        result_no=binding.result_no,
                        confidence=0.2,
                        rationale="no_column_binding",
                        used_llm=False,
                    )
                )
                continue

            x_idx, y_cols, confidence, rationale = _infer_axes(col_binding)
            x_col = _find_column(col_binding, x_idx)
            y_col = _find_column(col_binding, y_cols[0]) if y_cols else None
            x_label = (x_col.name or x_col.header) if x_col else ""
            y_label = (y_col.name or y_col.header) if y_col else ""
            x_unit = (x_col.unit or "") if x_col else ""
            y_unit = (y_col.unit or "") if y_col else ""

            axis = GraphAxisBinding(
                graph_id=graph_id,
                exp_key=binding.exp_key,
                result_no=binding.result_no,
                x_column=x_idx,
                y_columns=y_cols,
                x_label=x_label,
                y_label=y_label,
                x_unit=x_unit,
                y_unit=y_unit,
                confidence=confidence,
                rationale=rationale,
                used_llm=False,
            )

            needs_llm = axis.confidence < _CONF_LLM_TRIGGER and _can_call_llm(llm)
            if needs_llm and col_binding:
                llm_axis = _llm_resolve_axes(col_binding, llm=llm)
                if llm_axis and llm_axis.confidence >= axis.confidence:
                    axis = axis.model_copy(
                        update={
                            "x_column": llm_axis.x_column,
                            "y_columns": llm_axis.y_columns,
                            "x_label": llm_axis.x_label,
                            "y_label": llm_axis.y_label,
                            "x_unit": llm_axis.x_unit,
                            "y_unit": llm_axis.y_unit,
                            "confidence": llm_axis.confidence,
                            "rationale": llm_axis.rationale,
                            "used_llm": True,
                        }
                    )

            axis_bindings.append(axis)

    state.graph_axis_bindings = axis_bindings

    hitl_targets: list[GraphAxisBinding] = []
    for axis in axis_bindings:
        if axis.confidence < _CONF_AUTO:
            hitl_targets.append(axis)
            continue
        if not axis.x_label or not axis.y_label:
            hitl_targets.append(axis)
            continue
        if not axis.x_unit or not axis.y_unit:
            hitl_targets.append(axis)
            continue

    hitl_targets = list({a.graph_id: a for a in hitl_targets}.values())
    if hitl_targets:
        html, payload = _build_axis_hitl_payload(hitl_targets, columns_by_exp)
        state.axis_hitl = AxisHitl(
            enabled=True,
            code="HITL_AXIS_LABEL_UNKNOWN",
            message="Confirm axis labels and units for graphs.",
            html=html,
            payload=payload,
        )
    else:
        state.axis_hitl = AxisHitl()

    state.job_meta.updated_at = now_iso()
    return state
