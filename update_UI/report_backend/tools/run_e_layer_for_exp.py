from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.config import load_settings
from core.storage import build_storage
from graph.nodes.select_excel_ranges import select_excel_ranges
from graph.state import AgentState, ExcelFile, ExcelInventory, ReportData, RequiredOutputEstimate, now_iso
from models.contracts import ImageAsset
from llm.client import LLMClient


def _build_output_payload(*, exp_key: str, state: AgentState, excel_images: list[dict]) -> dict:
    return {
        "exp_key": exp_key,
        "required_outputs": [r.model_dump() for r in state.required_outputs],
        "excel_sheet_selections": [s.model_dump() for s in state.excel_sheet_selections],
        "excel_range_selections": [r.model_dump() for r in state.e_excel.range_selections],
        "excel_files": [e.model_dump() for e in state.excel_files],
        "excel_inventory": [e.model_dump() for e in state.excel_inventory],
        "theory_formulas": list(state.b_layer_bundle.theory_formulas or []) if state.b_layer_bundle else [],
        "excel_images": excel_images,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run E-layer for a single experiment and emit slim output JSON.")
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

    base_state.required_outputs = [
        RequiredOutputEstimate.model_validate(r) for r in (input_data.get("required_outputs") or [])
    ]
    if base_state.b_layer_bundle and input_data.get("theory_formulas") is not None:
        base_state.b_layer_bundle.theory_formulas = input_data.get("theory_formulas") or []
    report = ReportData.model_validate(input_data.get("report") or {"hints": []})
    base_state.report.hints = list(report.hints or [])

    base_state.excel_files = [
        ExcelFile.model_validate(e) for e in (input_data.get("excel_files") or [])
    ]
    base_state.excel_inventory = [
        ExcelInventory.model_validate(e) for e in (input_data.get("excel_sheets") or [])
    ]
    excel_images = list(input_data.get("excel_images") or [])
    base_state.assets_images = [ImageAsset.model_validate(i) for i in excel_images]

    base_state.job_meta.updated_at = now_iso()

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)

    state = select_excel_ranges(base_state, storage=storage, llm=llm)

    payload = _build_output_payload(exp_key=exp_key, state=state, excel_images=excel_images)
    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/e_layer_output_{exp_key}.json")
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
