from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from core.excel import find_numeric_blocks, load_workbook_bytes
from core.storage import Storage
from graph.state import AgentState, EExcelRangeSelection, GraphAxisInfo, InputAssetKind, now_iso
from graph.nodes.inspect_excel import inspect_excel
from graph.nodes.select_excel_sheet_per_experiment import select_excel_sheet_per_required_outputs
from llm.client import LLMClient


class _GraphAxesOutput(BaseModel):
    x_name: str = Field(default="")
    x_unit: str = Field(default="")
    y_name: str = Field(default="")
    y_unit: str = Field(default="")
    series_names: list[str] = Field(default_factory=list)
    condition_names: list[str] = Field(default_factory=list)


class _OutputExpectation(BaseModel):
    name: str = Field(default="")
    hint: str = Field(default="")


class _ExcelRangeOutput(BaseModel):
    exp_key: str = Field(default="")
    title: str = Field(default="")
    excel_id: str = Field(default="")
    sheet: str = Field(default="")
    a1_range: str = Field(default="")
    has_graph: bool = Field(default=False)
    graph_axes: _GraphAxesOutput = Field(default_factory=_GraphAxesOutput)
    table_expectations: list[_OutputExpectation] = Field(default_factory=list)
    graph_expectations: list[_OutputExpectation] = Field(default_factory=list)
    rationale: str = Field(default="")


class _ExcelRangesResponse(BaseModel):
    item: _ExcelRangeOutput


class _TableAssignmentItem(BaseModel):
    exp_key: str = Field(default="")
    table_ids: list[str] = Field(default_factory=list)


class _TableAssignmentsOutput(BaseModel):
    items: list[_TableAssignmentItem] = Field(default_factory=list)


def _excel_sources(state: AgentState) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    for asset in state.input_assets:
        if getattr(asset, "kind", None) == InputAssetKind.excel:
            storage_key = str(asset.storage_key or "").strip()
            if storage_key:
                sources.append(
                    {
                        "excel_id": str(asset.asset_id or asset.storage_key or "primary"),
                        "filename": str(asset.filename or ""),
                        "storage_key": storage_key,
                    }
                )
    if not sources and state.excel.storage_key:
        sources.append(
            {
                "excel_id": "primary",
                "filename": str(state.excel.filename or ""),
                "storage_key": str(state.excel.storage_key or ""),
            }
        )
    if not sources and state.excel_files:
        for excel in state.excel_files:
            if not excel.storage_key:
                continue
            sources.append(
                {
                    "excel_id": str(excel.excel_id or "primary"),
                    "filename": str(excel.filename or ""),
                    "storage_key": str(excel.storage_key or ""),
                }
            )
    return sources


def _build_table_assignment_messages(payload: dict[str, Any]) -> list[dict]:
    system = (
        "あなたは実験ごとに対応する表候補を選ぶ抽出器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- experiments: [{exp_key, title, method_text, result_hint, table_expectations, graph_expectations}]\n"
        "- candidates: [{table_id, excel_id, sheet, a1_range, rows, cols, numeric_density, preview_rows}]\n\n"
        "# ルール\n"
        "- exp_key は入力の値をそのまま使う。\n"
        "- table_ids は candidates.table_id のみを選ぶ。\n"
        "- 1実験に複数表が必要なら table_ids を複数返す。\n"
        "- tables_count が指定されている場合、table_ids の件数は tables_count と一致させる。\n"
        "- 該当がなければ table_ids は空配列。\n\n"
        "# 出力\n"
        "{\n"
        "  \"items\": [\n"
        "    {\"exp_key\": \"4.2.1\", \"table_ids\": [\"excel:dc:Sheet1:A1:D12\"]}\n"
        "  ]\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def select_excel_ranges(state: AgentState, *, storage: Storage, llm: LLMClient | None) -> AgentState:
    sources = _excel_sources(state)
    if not sources or llm is None:
        state.e_excel.range_selections = []
        return state

    experiments = [
        {
            "exp_key": r.exp_key,
            "title": r.title,
            "method_summary": r.method_summary,
            "method_text": next(
                (
                    str(i.text or "")
                    for i in (state.b_layer_bundle.method.items if state.b_layer_bundle else [])
                    if str(i.exp_key or "").strip() == str(r.exp_key or "").strip()
                ),
                "",
            ),
            "result_hint": next((h.result_hint for h in state.report.hints if h.exp_key == r.exp_key), ""),
            "tables_count": int(getattr(r, "tables_count", 0) or 0),
            "graphs_count": int(getattr(r, "graphs_count", 0) or 0),
            "table_expectations": [
                e.model_dump() if hasattr(e, "model_dump") else e
                for e in (getattr(r, "table_expectations", []) or [])
            ],
            "graph_expectations": [
                e.model_dump() if hasattr(e, "model_dump") else e
                for e in (getattr(r, "graph_expectations", []) or [])
            ],
        }
        for r in state.required_outputs
        if r.exp_key and r.title
    ]
    if not experiments:
        state.e_excel.range_selections = []
        return state

    if not state.excel_inventory:
        try:
            state = inspect_excel(state, storage=storage)
        except Exception:
            pass
    state = select_excel_sheet_per_required_outputs(state, llm=llm)

    candidates: list[dict[str, Any]] = []
    filenames_by_excel_id: dict[str, str] = {}

    for src in sources:
        excel_id = src["excel_id"]
        filename = src.get("filename", "")
        filenames_by_excel_id[excel_id] = filename
        xlsx_bytes = storage.get_bytes(src["storage_key"])
        wb = load_workbook_bytes(xlsx_bytes)
        for ws in wb.worksheets:
            for cand in find_numeric_blocks(ws):
                table_id = f"{excel_id}:{cand.sheet}:{cand.a1_range}"
                rows = 0
                cols = 0
                try:
                    from openpyxl.utils.cell import range_boundaries

                    min_col, min_row, max_col, max_row = range_boundaries(cand.a1_range)
                    rows = max(1, max_row - min_row + 1)
                    cols = max(1, max_col - min_col + 1)
                except Exception:
                    rows = 0
                    cols = 0
                numeric_density = cand.numeric_cells / float(max(1, cand.total_cells))
                candidates.append(
                    {
                        "table_id": table_id,
                        "excel_id": excel_id,
                        "excel_filename": filename,
                        "sheet": cand.sheet,
                        "a1_range": cand.a1_range,
                        "rows": rows,
                        "cols": cols,
                        "numeric_density": numeric_density,
                        "preview_rows": cand.preview_rows,
                    }
                )

    state.e_excel.range_selections = []
    state.e_excel.sheet_selection_by_result_no = {}
    state.e_excel.table_bindings_by_result_no = {}
    state.e_excel.axis_bindings_by_result_no = {}
    state.e_excel.param_bindings_by_result_no = {}

    if not candidates:
        return state

    payload = {"experiments": experiments, "candidates": candidates}
    assignments = llm.parse(
        _TableAssignmentsOutput,
        messages=_build_table_assignment_messages(payload),
        attempts=2,
    )
    by_id = {c["table_id"]: c for c in candidates}

    for item in assignments.items or []:
        exp_key = str(item.exp_key or "").strip()
        if not exp_key:
            continue
        exp = next((e for e in experiments if e["exp_key"] == exp_key), None)
        if exp is None:
            continue
        for table_id in item.table_ids or []:
            cand = by_id.get(str(table_id or "").strip())
            if not cand:
                continue
            state.e_excel.range_selections.append(
                EExcelRangeSelection(
                    exp_key=exp_key,
                    title=exp["title"],
                    excel_id=cand["excel_id"],
                    excel_filename=cand["excel_filename"],
                    sheet=cand["sheet"],
                    a1_range=cand["a1_range"],
                    has_graph=False,
                    graph_axes=GraphAxisInfo(),
                    result={
                        "exp_key": exp_key,
                        "title": exp["title"],
                        "table_id": cand["table_id"],
                        "table_range": {
                            "excel_id": cand["excel_id"],
                            "sheet": cand["sheet"],
                            "a1_range": cand["a1_range"],
                        },
                        "has_graph": False,
                        "graph_axes": GraphAxisInfo().model_dump(),
                        "table_expectations": exp["table_expectations"],
                        "graph_expectations": exp["graph_expectations"],
                    },
                )
            )
    state.job_meta.updated_at = now_iso()
    return state
