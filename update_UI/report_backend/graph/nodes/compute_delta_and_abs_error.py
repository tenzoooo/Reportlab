from __future__ import annotations

from statistics import mean

from graph.nodes.theory_compare_utils import any_theory_compare_enabled, is_theory_compare_enabled_for_exp
from graph.state import AgentState, ComputationHitl, DeltaErrorResult, TheoryValueResult, now_iso
from models.contracts import TableAsset


_HITL_CODE = "HITL_DELTA_ERROR_MISSING"

_SYMBOL_SYNONYMS = {
    "R": ["抵抗", "resistance", "ohm"],
    "V": ["電圧", "voltage"],
    "I": ["電流", "current"],
    "C": ["容量", "capacitance"],
    "L": ["インダクタンス", "inductance"],
    "T": ["温度", "temperature"],
    "f": ["周波数", "frequency"],
}


def _to_float(value: str) -> float | None:
    s = (value or "").strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _table_for_exp(state: AgentState, exp_key: str) -> TableAsset | None:
    binding = next((b for b in state.insert_asset_bindings if b.exp_key == exp_key), None)
    if binding and binding.tables_asset_ids:
        for table_id in binding.tables_asset_ids:
            table = next((t for t in state.assets_tables if t.table_id == table_id), None)
            if table:
                return table
    assigned = [t for t in state.assets_tables if t.assigned_to == exp_key]
    if assigned:
        return sorted(assigned, key=lambda t: t.upload_index)[0]
    return state.assets_tables[0] if state.assets_tables else None


def _column_position(binding, column_index: int) -> int | None:
    col_indices = sorted({c.column_index for c in binding.columns if c.column_index > 0})
    if column_index not in col_indices:
        return None
    return col_indices.index(column_index)


def _match_column(binding, symbol: str) -> list[tuple[int, str, str]]:
    if not symbol:
        return []
    target = symbol.lower()
    synonyms = [s.lower() for s in _SYMBOL_SYNONYMS.get(symbol, [])]
    matches = []
    for col in binding.columns:
        name = (col.name or col.header or "").lower()
        if target in name or any(syn in name for syn in synonyms):
            matches.append((col.column_index, col.name or col.header, col.unit))
    return matches


def _build_hitl_payload(targets: list[TheoryValueResult]) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_targets = []
    for idx, item in enumerate(targets):
        blocks.append(
            "<section>"
            f"<h3>Experiment {item.exp_key}</h3>"
            f"<label>Measured value <input type=\"number\" name=\"measured_value_{idx}\" /></label>"
            f"<label>Unit <input type=\"text\" name=\"measured_unit_{idx}\" /></label>"
            "</section>"
        )
        payload_targets.append({"exp_key": item.exp_key, "result_no": item.result_no})
    html = "<form data-hitl=\"delta_error\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets}
    return html, payload


def compute_delta_and_abs_error(state: AgentState) -> AgentState:
    if not any_theory_compare_enabled(state):
        state.delta_error_results = []
        state.computation_hitl = ComputationHitl()
        state.job_meta.updated_at = now_iso()
        return state
    if state.computation_hitl.enabled:
        state.job_meta.updated_at = now_iso()
        return state

    results: list[DeltaErrorResult] = []
    missing: list[TheoryValueResult] = []

    for theory in state.theory_value_results:
        if not is_theory_compare_enabled_for_exp(state, theory.exp_key):
            continue
        if theory.value is None:
            missing.append(theory)
            continue
        binding = next((b for b in state.table_column_bindings if b.exp_key == theory.exp_key), None)
        if binding is None:
            missing.append(theory)
            continue
        matches = _match_column(binding, theory.target_symbol)
        if len(matches) != 1:
            missing.append(theory)
            continue
        column_index, column_name, unit = matches[0]
        table = _table_for_exp(state, theory.exp_key)
        if table is None or not table.rows:
            missing.append(theory)
            continue
        pos = _column_position(binding, column_index)
        if pos is None:
            missing.append(theory)
            continue
        values = []
        for row in table.rows[1:]:
            if pos >= len(row):
                continue
            num = _to_float(row[pos])
            if num is not None:
                values.append(num)
        if not values:
            missing.append(theory)
            continue
        measured_value = mean(values)
        measured_unit = unit or ""
        if theory.unit and measured_unit and theory.unit != measured_unit:
            missing.append(theory)
            continue
        delta = measured_value - theory.value
        results.append(
            DeltaErrorResult(
                exp_key=theory.exp_key,
                result_no=theory.result_no,
                target_symbol=theory.target_symbol,
                theory_value=theory.value,
                theory_unit=theory.unit,
                measured_value=measured_value,
                measured_unit=measured_unit,
                measured_source=column_name,
                delta=delta,
                abs_error=abs(delta),
                confidence=0.75,
            )
        )

    state.delta_error_results = results
    if missing:
        html, payload = _build_hitl_payload(missing)
        state.computation_hitl = ComputationHitl(
            enabled=True,
            codes=[_HITL_CODE],
            message="Delta/absolute error could not be computed.",
            html=html,
            payload=payload,
        )
    else:
        state.computation_hitl = ComputationHitl()

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["compute_delta_and_abs_error"]
