from __future__ import annotations

from graph.state import AgentState, ColumnUnitHitl, TableColumnBinding, now_iso
from graph.hitl import hitl_disabled


_CONF_AUTO = 0.80
_UNIT_OPTIONS = ["1", "V", "mV", "A", "mA", "ohm", "s", "ms", "Hz", "kHz", "C", "K", "%"]


def _col_letter(index: int) -> str:
    if index <= 0:
        return ""
    result = ""
    i = index
    while i > 0:
        i, rem = divmod(i - 1, 26)
        result = chr(ord("A") + rem) + result
    return result


def _is_unambiguous(binding: TableColumnBinding) -> bool:
    return not binding.missing_units and not binding.missing_mappings


def _build_html_payload(
    targets: list[TableColumnBinding],
) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_targets = []
    for exp_idx, binding in enumerate(targets):
        options = [
            (col.column_index, f"{_col_letter(col.column_index)} {col.header}".strip())
            for col in binding.columns
        ]
        column_rows = []
        for col_idx, col in enumerate(binding.columns):
            mapping_options = []
            for opt_index, opt_label in options:
                checked = " selected" if opt_index == col.column_index else ""
                mapping_options.append(
                    f"<option value=\"{opt_index}\"{checked}>{opt_label}</option>"
                )
            unit_options = []
            for unit in _UNIT_OPTIONS:
                selected = " selected" if unit == (col.unit or "") else ""
                unit_options.append(f"<option value=\"{unit}\"{selected}>{unit}</option>")
            column_rows.append(
                "<div>"
                f"<label>{col.name or col.header or f'col_{col.column_index}'}</label> "
                f"<select name=\"column_mapping_{exp_idx}_{col_idx}\">{''.join(mapping_options)}</select> "
                f"<select name=\"unit_select_{exp_idx}_{col_idx}\">{''.join(unit_options)}</select>"
                "</div>"
            )
        blocks.append(
            "<section>"
            f"<h3>Experiment {binding.result_no or binding.exp_key}</h3>"
            f"{''.join(column_rows)}"
            "</section>"
        )
        payload_targets.append(
            {
                "exp_key": binding.exp_key,
                "result_no": binding.result_no,
                "excel_id": binding.excel_id,
                "sheet_name": binding.sheet_name,
                "columns": [c.model_dump() for c in binding.columns],
            }
        )

    html = "<form data-hitl=\"column_unit_mapping\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets, "unit_options": _UNIT_OPTIONS}
    return html, payload


def column_unit_ambiguity_gate(state: AgentState) -> AgentState:
    state.column_unit_hitl = ColumnUnitHitl()
    bindings = list(state.table_column_bindings)
    if not bindings:
        # In HITL-disabled mode, do not block the pipeline here.
        if hitl_disabled():
            state.job_meta.updated_at = now_iso()
            return state
        html, payload = _build_html_payload([])
        state.column_unit_hitl = ColumnUnitHitl(
            enabled=True,
            codes=["HITL_TABLE_COLUMN_MAPPING_UNKNOWN"],
            message="表の列マッピングが未確定です。",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
        return state

    targets: list[TableColumnBinding] = []
    codes: set[str] = set()
    for binding in bindings:
        unambiguous = _is_unambiguous(binding)
        needs_hitl = False
        if binding.missing_mappings:
            codes.add("HITL_TABLE_COLUMN_MAPPING_UNKNOWN")
            needs_hitl = True
        if binding.missing_units:
            codes.add("HITL_UNIT_UNKNOWN")
            needs_hitl = True
        if binding.confidence < _CONF_AUTO and not unambiguous:
            needs_hitl = True
        if needs_hitl:
            targets.append(binding)

    if targets:
        if hitl_disabled():
            # Do not block; keep bindings as-is and continue.
            state.job_meta.updated_at = now_iso()
            return state
        html, payload = _build_html_payload(targets)
        state.column_unit_hitl = ColumnUnitHitl(
            enabled=True,
            codes=sorted(codes),
            message="列マッピングと単位を確認してください。",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
    return state
