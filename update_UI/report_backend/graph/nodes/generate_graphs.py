from __future__ import annotations

from graph.nodes.bind_insert_assets import _build_insert_asset_hitl
import json

from graph.nodes.excel_mvp import _render_plot_png
from graph.state import AgentState, InsertAssetBinding, now_iso
from models.contracts import ImageAsset, TableAsset
from core.storage import Storage
from llm.client import LLMClient
from pydantic import BaseModel, Field


_MAX_GRAPHS_PER_EXP = 3


def _to_float(value: str) -> float | None:
    s = (value or "").strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _numeric_columns(table: TableAsset) -> list[int]:
    if not table.rows or len(table.rows) < 2:
        return []
    cols = len(table.rows[0])
    numeric_scores = [0] * cols
    total_scores = [0] * cols
    for row in table.rows[1:]:
        for idx in range(min(cols, len(row))):
            total_scores[idx] += 1
            if _to_float(row[idx]) is not None:
                numeric_scores[idx] += 1
    numeric_cols = []
    for idx, total in enumerate(total_scores):
        if total <= 0:
            continue
        ratio = numeric_scores[idx] / float(total)
        if ratio >= 0.6:
            numeric_cols.append(idx)
    return numeric_cols


def _build_series(table: TableAsset, *, x_idx: int, y_indices: list[int]) -> tuple[list[float], list[tuple[str, list[float]]]]:
    x_vals: list[float] = []
    y_series: list[list[float]] = [[] for _ in y_indices]
    for row in table.rows[1:]:
        if x_idx >= len(row):
            continue
        xv = _to_float(row[x_idx])
        if xv is None:
            continue
        y_vals = []
        for yi in y_indices:
            if yi >= len(row):
                y_vals.append(None)
                continue
            y_vals.append(_to_float(row[yi]))
        if all(v is None for v in y_vals):
            continue
        x_vals.append(xv)
        for idx, val in enumerate(y_vals):
            y_series[idx].append(val if val is not None else float("nan"))
    series = []
    for yi, ys in zip(y_indices, y_series):
        name = table.rows[0][yi] if table.rows and yi < len(table.rows[0]) else f"y{yi+1}"
        series.append((str(name or f"y{yi+1}"), ys))
    return x_vals, series


def _axis_label(table: TableAsset, idx: int, *, fallback: str) -> str:
    if not table.rows:
        return fallback
    if idx < 0 or idx >= len(table.rows[0]):
        return fallback
    return str(table.rows[0][idx] or fallback)


def _axis_range(values: list[float]) -> str:
    cleaned = [v for v in values if v is not None and not (isinstance(v, float) and (v != v))]
    if not cleaned:
        return ""
    return f"{min(cleaned):.6g}~{max(cleaned):.6g}"


class _GraphAxisPickOutput(BaseModel):
    x_column_index: int = Field(default=0, ge=0)
    y_column_indices: list[int] = Field(default_factory=list)
    rationale: str = Field(default="")


def _build_axis_pick_messages(*, payload: dict) -> list[dict]:
    system = (
        "あなたは実験のグラフ軸に対応するExcel列を選ぶ抽出器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- headers: 1行目の列名\n"
        "- preview_rows: 先頭数行の値\n"
        "- graph_expectations: [{name, hint, x_axis_label, y_axis_label}]\n\n"
        "# ルール\n"
        "- x_column_index は1-based。\n"
        "- y_column_indices も1-basedの配列。\n"
        "- x_axis_label/y_axis_label に一致・近い列を優先する。\n"
        "- 数値列を優先する。\n\n"
        "# 出力\n"
        "{\n"
        "  \"x_column_index\": 1,\n"
        "  \"y_column_indices\": [2,3]\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _pick_axes_with_llm(
    *,
    llm: LLMClient,
    headers: list[str],
    preview_rows: list[list[str]],
    graph_expectations: list[dict],
) -> _GraphAxisPickOutput | None:
    payload = {
        "headers": headers,
        "preview_rows": preview_rows,
        "graph_expectations": graph_expectations,
    }
    try:
        return llm.parse(_GraphAxisPickOutput, messages=_build_axis_pick_messages(payload=payload), attempts=2)
    except Exception:
        return None


def _select_table_for_exp(tables: list[TableAsset], exp_key: str) -> TableAsset | None:
    assigned = [t for t in tables if t.assigned_to == exp_key]
    if assigned:
        assigned.sort(key=lambda t: t.upload_index)
        return assigned[0]
    return tables[0] if tables else None


def _generate_graph_asset(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient | None,
    table: TableAsset,
    exp_key: str,
    result_no: str,
    fig_index: int,
) -> ImageAsset | None:
    numeric_cols = _numeric_columns(table)
    if len(numeric_cols) < 2:
        return None
    x_idx = numeric_cols[0]
    y_indices = numeric_cols[1:]
    graph_expectations = [
        e.model_dump() if hasattr(e, "model_dump") else e
        for e in (
            next((r.graph_expectations for r in state.required_outputs if r.exp_key == exp_key), []) or []
        )
    ]
    headers = list(table.rows[0] if table.rows else [])
    preview_rows = [list(r) for r in (table.rows[:6] if table.rows else [])]
    if llm and headers:
        picked = _pick_axes_with_llm(
            llm=llm,
            headers=[str(h or "") for h in headers],
            preview_rows=preview_rows,
            graph_expectations=graph_expectations,
        )
        if picked and picked.x_column_index > 0 and picked.y_column_indices:
            x_idx = max(0, int(picked.x_column_index) - 1)
            y_indices = [max(0, int(i) - 1) for i in picked.y_column_indices if int(i) > 0]
    x_vals, series = _build_series(table, x_idx=x_idx, y_indices=y_indices)
    if len(x_vals) < 2 or not series:
        return None

    x_label = _axis_label(table, x_idx, fallback="X")
    if len(y_indices) == 1:
        y_label = _axis_label(table, y_indices[0], fallback="Y")
    else:
        y_label = "Y"
    png = _render_plot_png(
        x=x_vals,
        series=series,
        title=result_no or exp_key,
        x_label=x_label,
        y_label=y_label,
    )
    figure_id = f"fig_{result_no or exp_key}_{fig_index}"
    storage_key = f"graphs/{state.job_meta.run_id or state.job_meta.job_id}/{result_no or exp_key}/{figure_id}.png"
    storage.put_bytes(storage_key, png)
    return ImageAsset(
        asset_id=figure_id,
        image_id=figure_id,
        filename=f"{figure_id}.png",
        mime_type="image/png",
        storage_key=storage_key,
        upload_index=1000 + fig_index,
        rough_class="graph",
        rough_class_confidence=1.0,
        rough_class_method="generated",
        rough_class_rationale="generated from Excel table",
        analysis=None,
        assigned_to=exp_key,
        x_column_index=x_idx + 1,
        y_column_indices=[i + 1 for i in y_indices],
        x_label=x_label,
        y_label=y_label,
        x_range=_axis_range(x_vals),
        y_range=_axis_range([v for _, ys in series for v in ys]),
    )


def generate_graphs(state: AgentState, *, storage: Storage, llm: LLMClient | None = None) -> AgentState:
    if not state.insert_asset_bindings:
        return state

    tables = list(state.assets_tables)
    images = list(state.assets_images)
    updated_bindings: list[InsertAssetBinding] = []

    for binding in state.insert_asset_bindings:
        missing = max(0, binding.required_graphs - len(binding.graphs_asset_ids))
        if missing <= 0:
            updated_bindings.append(binding)
            continue
        table = _select_table_for_exp(tables, binding.exp_key)
        new_ids: list[str] = []
        for idx in range(min(missing, _MAX_GRAPHS_PER_EXP)):
            asset = _generate_graph_asset(
                state,
                storage=storage,
                llm=llm,
                table=table,
                exp_key=binding.exp_key,
                result_no=binding.result_no,
                fig_index=idx + 1,
            )
            if asset is None:
                break
            images.append(asset)
            new_ids.append(asset.image_id)
        binding = binding.model_copy(
            update={
                "graphs_asset_ids": list(binding.graphs_asset_ids) + new_ids,
                "missing_graphs": max(0, binding.required_graphs - (len(binding.graphs_asset_ids) + len(new_ids))),
            }
        )
        updated_bindings.append(binding)

    state.assets_images = images
    state.insert_asset_bindings = updated_bindings
    state.insert_asset_hitl = _build_insert_asset_hitl(updated_bindings, tables=tables, images=images)
    state.job_meta.updated_at = now_iso()
    return state
