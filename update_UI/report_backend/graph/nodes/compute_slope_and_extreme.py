from __future__ import annotations

from graph.nodes.theory_compare_utils import is_theory_compare_enabled_for_exp
from graph.state import AgentState, ComputationHitl, SlopeExtremeResult, now_iso
from models.contracts import TableAsset


_HITL_CODE = "HITL_SLOPE_EXTREME_MISSING"


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


def _build_hitl_payload(targets: list[SlopeExtremeResult]) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_targets = []
    for idx, item in enumerate(targets):
        blocks.append(
            "<section>"
            f"<h3>Graph {item.graph_id}</h3>"
            f"<label>Slope <input type=\"number\" name=\"slope_{idx}\" /></label>"
            f"<label>Max <input type=\"number\" name=\"max_{idx}\" /></label>"
            f"<label>Min <input type=\"number\" name=\"min_{idx}\" /></label>"
            "</section>"
        )
        payload_targets.append({"graph_id": item.graph_id, "exp_key": item.exp_key, "result_no": item.result_no})
    html = "<form data-hitl=\"slope_extreme\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets}
    return html, payload


def compute_slope_and_extreme(state: AgentState) -> AgentState:
    results: list[SlopeExtremeResult] = []
    missing: list[SlopeExtremeResult] = []
    keep_hitl = state.computation_hitl if state.computation_hitl.enabled else None

    for axis in state.graph_axis_bindings:
        if not axis.exp_key:
            continue
        if is_theory_compare_enabled_for_exp(state, axis.exp_key):
            continue
        if not axis.x_unit or not axis.y_unit:
            missing.append(
                SlopeExtremeResult(
                    graph_id=axis.graph_id,
                    exp_key=axis.exp_key,
                    result_no=axis.result_no,
                )
            )
            continue
        binding = next((b for b in state.table_column_bindings if b.exp_key == axis.exp_key), None)
        table = _table_for_exp(state, axis.exp_key)
        if binding is None or table is None or not table.rows:
            missing.append(
                SlopeExtremeResult(
                    graph_id=axis.graph_id,
                    exp_key=axis.exp_key,
                    result_no=axis.result_no,
                )
            )
            continue
        x_pos = _column_position(binding, axis.x_column)
        y_pos = _column_position(binding, axis.y_columns[0]) if axis.y_columns else None
        if x_pos is None or y_pos is None:
            missing.append(
                SlopeExtremeResult(
                    graph_id=axis.graph_id,
                    exp_key=axis.exp_key,
                    result_no=axis.result_no,
                )
            )
            continue
        points = []
        for row in table.rows[1:]:
            if x_pos >= len(row) or y_pos >= len(row):
                continue
            xv = _to_float(row[x_pos])
            yv = _to_float(row[y_pos])
            if xv is None or yv is None:
                continue
            points.append((xv, yv))
        if len(points) < 2:
            missing.append(
                SlopeExtremeResult(
                    graph_id=axis.graph_id,
                    exp_key=axis.exp_key,
                    result_no=axis.result_no,
                )
            )
            continue
        x0, y0 = points[0]
        x1, y1 = points[-1]
        dx = x1 - x0
        if abs(dx) < 1e-12:
            missing.append(
                SlopeExtremeResult(
                    graph_id=axis.graph_id,
                    exp_key=axis.exp_key,
                    result_no=axis.result_no,
                )
            )
            continue
        slope = (y1 - y0) / dx
        ys = [p[1] for p in points]
        results.append(
            SlopeExtremeResult(
                graph_id=axis.graph_id,
                exp_key=axis.exp_key,
                result_no=axis.result_no,
                x_unit=axis.x_unit,
                y_unit=axis.y_unit,
                slope=slope,
                max_value=max(ys),
                min_value=min(ys),
                points_count=len(points),
                confidence=0.7,
            )
        )

    state.slope_extreme_results = results
    if keep_hitl:
        state.computation_hitl = keep_hitl
    elif missing:
        html, payload = _build_hitl_payload(missing)
        state.computation_hitl = ComputationHitl(
            enabled=True,
            codes=[_HITL_CODE],
            message="Slope/extreme values could not be computed.",
            html=html,
            payload=payload,
        )
    else:
        state.computation_hitl = ComputationHitl()

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["compute_slope_and_extreme"]
