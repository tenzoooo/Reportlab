from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.config import load_settings
from core.excel import extract_a1_range, load_workbook_bytes, table_to_csv
from core.storage import build_storage
from graph.nodes.bind_insert_assets import bind_insert_assets
from graph.nodes.bind_table_columns_and_units import bind_table_columns_and_units
from graph.nodes.generate_graphs import generate_graphs
from graph.state import (
    AgentState,
    ExcelFile,
    ExcelInventory,
    ExcelSheetSelection,
    EExcelRangeSelection,
    RequiredOutputEstimate,
    now_iso,
)
from models.contracts import ImageAsset, TableAsset
from llm.client import LLMClient


def _build_output_payload(*, exp_key: str, state: AgentState) -> dict:
    return {
        "exp_key": exp_key,
        "excel_sheet_selections": [s.model_dump() for s in state.excel_sheet_selections],
        "excel_range_selections": [r.model_dump() for r in state.e_excel.range_selections],
        "table_column_bindings": [b.model_dump() for b in state.table_column_bindings],
        "insert_asset_bindings": [b.model_dump() for b in state.insert_asset_bindings],
        "assets_tables": [t.model_dump() for t in state.assets_tables],
        "assets_images": [i.model_dump() for i in state.assets_images],
        "insert_asset_hitl": state.insert_asset_hitl.model_dump(),
        "theory_formulas": list(state.b_layer_bundle.theory_formulas or []) if state.b_layer_bundle else [],
    }


def _build_tables_from_ranges(
    *,
    state: AgentState,
    storage: Storage,
) -> list[TableAsset]:
    excel_map = {str(e.excel_id or ""): e for e in state.excel_files}
    tables: list[TableAsset] = []
    for idx, sel in enumerate(state.e_excel.range_selections, 1):
        excel_id = str(sel.excel_id or "")
        excel = excel_map.get(excel_id)
        if excel is None and excel_id.startswith("excel:"):
            excel = excel_map.get(excel_id.replace("excel:", "", 1))
        if not excel or not excel.storage_key:
            continue
        xlsx_bytes = storage.get_bytes(str(excel.storage_key))
        wb = load_workbook_bytes(xlsx_bytes)
        if sel.sheet not in wb.sheetnames:
            continue
        ws = wb[sel.sheet]
        rows = extract_a1_range(ws, str(sel.a1_range or ""), max_rows=220, max_cols=40)
        if not rows:
            continue
        table_id = f"tbl_{sel.exp_key}_{idx}"
        storage_key = f"tables/{state.job_meta.job_id}/{sel.exp_key}/{table_id}.json"
        tables.append(
            TableAsset(
                asset_id=table_id,
                table_id=table_id,
                storage_key=storage_key,
                raw_csv=table_to_csv(rows),
                upload_index=idx,
                rows=rows,
                assigned_to=str(sel.exp_key or ""),
            )
        )
    return tables


def main() -> None:
    parser = argparse.ArgumentParser(description="Run F-layer for a single experiment and emit slim output JSON.")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    base_path = Path(args.base)
    input_path = Path(args.input)

    base_state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    input_data = json.loads(input_path.read_text(encoding="utf-8"))

    exp_key = str(input_data.get("exp_key") or "").strip()
    if not exp_key:
        raise SystemExit("EXP_KEY_REQUIRED")

    base_state.excel_sheet_selections = [
        ExcelSheetSelection.model_validate(s) for s in (input_data.get("excel_sheet_selections") or [])
    ]
    base_state.e_excel.range_selections = [
        EExcelRangeSelection.model_validate(r) for r in (input_data.get("excel_range_selections") or [])
    ]
    base_state.required_outputs = [
        RequiredOutputEstimate.model_validate(r) for r in (input_data.get("required_outputs") or [])
    ]
    if base_state.b_layer_bundle and input_data.get("theory_formulas") is not None:
        base_state.b_layer_bundle.theory_formulas = input_data.get("theory_formulas") or []
    base_state.excel_files = [
        ExcelFile.model_validate(e) for e in (input_data.get("excel_files") or [])
    ]
    base_state.excel_inventory = [
        ExcelInventory.model_validate(e) for e in (input_data.get("excel_inventory") or [])
    ]
    base_state.assets_images = [
        ImageAsset.model_validate(i) for i in (input_data.get("excel_images") or [])
    ]
    base_state.job_meta.updated_at = now_iso()

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)

    base_state.assets_tables = _build_tables_from_ranges(state=base_state, storage=storage)
    state = bind_table_columns_and_units(base_state, llm=llm)
    state = bind_insert_assets(state, storage=storage)
    state = generate_graphs(state, storage=storage, llm=llm)

    payload = _build_output_payload(exp_key=exp_key, state=state)
    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/f_layer_output_{exp_key}.json")
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
