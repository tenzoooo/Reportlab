from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from core.config import load_settings
from core.excel import load_workbook_bytes
from core.storage import build_storage
from graph.nodes.d_layer_from_method_items import d_layer_from_method_items
from graph.state import AgentState, PdfMethodUnit, now_iso
from llm.client import LLMClient


def _build_method_items(exp: dict) -> list[PdfMethodUnit]:
    items: list[PdfMethodUnit] = []
    parent = exp.get("parent") or {}
    if parent:
        items.append(
            PdfMethodUnit(
                exp_key=str(parent.get("exp_key") or ""),
                title=str(parent.get("title") or ""),
                level=1,
                text=str(parent.get("method_text") or ""),
                parent_exp_key="",
                child_exp_keys=[str(exp.get("exp_key") or "")],
            )
        )
    items.append(
        PdfMethodUnit(
            exp_key=str(exp.get("exp_key") or ""),
            title=str(exp.get("title") or ""),
            level=2,
            text=str(exp.get("method_text") or ""),
            parent_exp_key=str(parent.get("exp_key") or ""),
            child_exp_keys=[],
        )
    )
    return items


def _build_output_payload(
    *,
    exp_key: str,
    state: AgentState,
    past_report_hints: list[dict],
    past_report_heading: list[dict],
    excel_files: list[dict],
    excel_sheets: list[dict],
    theory_formulas: list[dict],
    excel_images: list[dict],
) -> dict:
    return {
        "exp_key": exp_key,
        "required_outputs": [r.model_dump() for r in state.required_outputs],
        "report": {"hints": [h.model_dump() for h in state.report.hints]},
        "past_report_hints": past_report_hints,
        "past_report_heading": past_report_heading,
        "excel_files": excel_files,
        "excel_sheets": excel_sheets,
        "theory_formulas": theory_formulas,
        "excel_images": excel_images,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run D-layer for a single experiment and emit slim output JSON.")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    base_path = Path(args.base)
    input_path = Path(args.input)

    base_state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    input_data = json.loads(input_path.read_text(encoding="utf-8"))

    exp = input_data.get("experiment") or {}
    exp_key = str(exp.get("exp_key") or "").strip()
    if not exp_key:
        raise SystemExit("EXP_KEY_REQUIRED")

    if not base_state.b_layer_bundle:
        raise SystemExit("B_LAYER_BUNDLE_MISSING")

    base_state.b_layer_bundle.method.items = _build_method_items(exp)
    base_state.job_meta.updated_at = now_iso()

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)
    state = d_layer_from_method_items(base_state, llm=llm)

    past_report_hints = list(input_data.get("past_report_experiments") or [])
    past_report_heading = list(input_data.get("past_report_heading") or [])
    excel_files = list(input_data.get("excel_files") or [])
    excel_sheets = list(input_data.get("excel_sheets") or [])
    theory_formulas = list(input_data.get("theory_formulas") or [])

    def _safe(value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._-]+", "_", value or "").strip("_") or "sheet"

    def _sheet_selections() -> list[dict]:
        selections = list(input_data.get("excel_sheet_selections") or [])
        if selections:
            return [s for s in selections if str(s.get("exp_key") or "").strip() == exp_key]
        title = str(exp.get("title") or "").strip()
        if not title:
            return []
        matches = [s for s in excel_sheets if title in str(s.get("sheet_name") or "")]
        if len(matches) == 1:
            return [
                {
                    "exp_key": exp_key,
                    "excel_id": matches[0].get("excel_id"),
                    "sheet_name": matches[0].get("sheet_name"),
                }
            ]
        return []

    def _extract_excel_images() -> list[dict]:
        selections = _sheet_selections()
        if not selections:
            return []
        excel_map = {str(e.get("excel_id") or ""): e for e in excel_files}
        images: list[dict] = []
        for sel in selections:
            excel_id = str(sel.get("excel_id") or "")
            sheet_name = str(sel.get("sheet_name") or "")
            excel = excel_map.get(excel_id) or excel_map.get(excel_id.replace("excel:", "", 1))
            if not excel or not excel.get("storage_key"):
                continue
            wb = load_workbook_bytes(storage.get_bytes(str(excel.get("storage_key"))))
            if sheet_name not in wb.sheetnames:
                continue
            ws = wb[sheet_name]
            sheet_images = list(getattr(ws, "_images", []) or [])
            for idx, img in enumerate(sheet_images, start=1):
                data = b""
                try:
                    data = img._data()
                except Exception:
                    continue
                if not data:
                    continue
                fmt = (getattr(img, "format", "") or "").lower()
                ext = "png" if fmt not in {"png", "jpeg", "jpg"} else ("jpg" if fmt == "jpeg" else fmt)
                mime = "image/png" if ext == "png" else "image/jpeg"
                image_id = f"excel_{exp_key}_{excel_id}_{idx}"
                key = f"excel_images/{state.job_meta.job_id}/{exp_key}/{_safe(excel_id)}/{_safe(sheet_name)}/{image_id}.{ext}"
                storage_key = storage.put_bytes(key, data)
                images.append(
                    {
                        "image_id": image_id,
                        "filename": f"{image_id}.{ext}",
                        "mime_type": mime,
                        "storage_key": storage_key,
                        "upload_index": 2000 + idx,
                        "rough_class": "graph",
                        "rough_class_confidence": 1.0,
                        "rough_class_method": "excel_embedded",
                        "rough_class_rationale": "embedded in excel sheet",
                        "assigned_to": exp_key,
                        "analysis": None,
                        "excel_id": excel_id,
                        "sheet_name": sheet_name,
                    }
                )
        return images

    excel_images = _extract_excel_images()
    payload = _build_output_payload(
        exp_key=exp_key,
        state=state,
        past_report_hints=past_report_hints,
        past_report_heading=past_report_heading,
        excel_files=excel_files,
        excel_sheets=excel_sheets,
        theory_formulas=theory_formulas,
        excel_images=excel_images,
    )

    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/d_layer_output_{exp_key}.json")
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
