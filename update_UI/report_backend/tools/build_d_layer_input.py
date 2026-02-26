from __future__ import annotations

import argparse
import json
from pathlib import Path

from graph.nodes.build_b_layer_bundle import build_b_layer_bundle
from graph.state import AgentState, PdfMethodUnit


def _build_items(unit) -> list[dict]:
    items: list[dict] = []
    if unit.parent:
        parent_level = max(1, unit.level - 1) if unit.level else 1
        items.append(
            PdfMethodUnit(
                exp_key=unit.parent.exp_key,
                title=unit.parent.title,
                level=parent_level,
                text=unit.parent.method_text,
                parent_exp_key="",
                child_exp_keys=[unit.exp_key],
            ).model_dump()
        )
    items.append(
        PdfMethodUnit(
            exp_key=unit.exp_key,
            title=unit.title,
            level=max(1, unit.level or 1),
            text=unit.method_text,
            parent_exp_key=unit.parent.exp_key if unit.parent else "",
            child_exp_keys=[],
        ).model_dump()
    )
    return items


def _load_c_layer_headings(*, c_layer_path: Path, prefer_past_reports: bool = True) -> list[dict]:
    if not c_layer_path.exists():
        return []
    try:
        raw = json.loads(c_layer_path.read_text(encoding="utf-8"))
        state = AgentState.model_validate(raw)
    except Exception:
        return []
    headings: list[dict] = []
    reports = list(state.past_reports or []) if prefer_past_reports else []
    if not reports:
        reports = [state.past_report] if state.past_report else []
    for report in reports:
        for h in report.result_section_headings or []:
            headings.append(
                {
                    "heading_line": str(h.heading_line or ""),
                    "title": str(h.title or ""),
                    "section_text": str(h.section_text or ""),
                    "page_image_paths": list(h.page_image_paths or []),
                    "exp_key": str(getattr(h, "exp_key", "") or ""),
                }
            )
    return headings


def _match_headings_by_title(headings: list[dict], title: str) -> list[dict]:
    key = str(title or "").strip()
    if not key:
        return []
    return [h for h in headings if str(h.get("title") or "").strip() == key]


def _match_headings_by_exp_key(headings: list[dict], exp_key: str) -> list[dict]:
    key = str(exp_key or "").strip()
    if not key:
        return []
    return [h for h in headings if str(h.get("exp_key") or "").strip() == key]


def build_d_layer_input(*, input_path: Path, exp_key: str, c_layer_path: Path) -> dict:
    state = AgentState.model_validate(json.loads(input_path.read_text(encoding="utf-8")))
    state = build_b_layer_bundle(state)
    if state.b_layer_bundle is not None:
        state.b_layer_bundle.discussion = None
    state.pdf = None
    unit = None
    if state.b_layer_bundle:
        for item in state.b_layer_bundle.method.experiment_units:
            if (item.exp_key or "").strip() == exp_key:
                unit = item
                break
    if unit is None:
        raise SystemExit(f"EXP_NOT_FOUND: {exp_key}")

    def _slim_excel_sheets() -> list[dict]:
        sheets: list[dict] = []
        for inv in state.excel_inventory or []:
            sheets.append(
                {
                    "excel_id": str(inv.excel_id or ""),
                    "filename": str(inv.filename or ""),
                    "sheets": [
                        {
                            "sheet_name": str(s.sheet_name or ""),
                            "headers": list(s.headers or []),
                            "numeric_density": float(s.numeric_density or 0.0),
                        }
                        for s in inv.sheets or []
                    ],
                }
            )
        return sheets

    c_layer_headings = _load_c_layer_headings(c_layer_path=c_layer_path, prefer_past_reports=True)
    past_report_heading = _match_headings_by_title(c_layer_headings, unit.title)
    past_report_by_exp_key = _match_headings_by_exp_key(c_layer_headings, exp_key)

    def _filter_theory_formulas() -> list[dict]:
        items = (state.b_layer_bundle.theory_formulas if state.b_layer_bundle else []) or []
        matched: list[dict] = []
        for item in items:
            data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            exps = data.get("experiments") or []
            if not exps:
                continue
            for exp_item in exps:
                exp_item = str(exp_item or "").strip()
                if not exp_item:
                    continue
                exp_item_key = exp_item.split()[0].strip()
                if exp_item_key == exp_key:
                    matched.append(data)
                    break
        return matched

    return {
        "exp_key": unit.exp_key,
        "experiment": {
            "exp_key": unit.exp_key,
            "title": unit.title,
            "method_text": unit.method_text,
            "parent": unit.parent.model_dump() if unit.parent else None,
        },
        "past_report_experiments": [
            {
                "exp_key": str(h.get("exp_key") or ""),
                "title": str(h.get("title") or ""),
                "section_text": str(h.get("section_text") or ""),
                "heading_line": str(h.get("heading_line") or ""),
            }
            for h in past_report_by_exp_key
        ],
        "excel_files": [
            {
                "excel_id": str(item.excel_id or ""),
                "filename": str(item.filename or ""),
                "storage_key": str(item.storage_key or ""),
            }
            for item in (state.excel_files or [])
        ],
        "excel_sheets": _slim_excel_sheets(),
        "theory_formulas": _filter_theory_formulas(),
        "experiment_unit": unit.model_dump(),
        "past_report_heading": past_report_heading,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build D-layer input JSON for a single experiment.")
    parser.add_argument("--input", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--exp-key", default="")
    parser.add_argument("--exp-index", type=int, default=0)
    parser.add_argument("--output", default="")
    parser.add_argument("--c-layer", default="tmp_state_outputs/c_layer_run.json")
    args = parser.parse_args()

    input_path = Path(args.input)
    exp_key = str(args.exp_key or "").strip()
    if not exp_key:
        state = AgentState.model_validate(json.loads(input_path.read_text(encoding="utf-8")))
        state = build_b_layer_bundle(state)
        units = list((state.b_layer_bundle.method.experiment_units if state.b_layer_bundle else []) or [])
        if not units:
            raise SystemExit("EXP_UNITS_EMPTY")
        idx = args.exp_index
        if idx < 0 or idx >= len(units):
            raise SystemExit("EXP_INDEX_OUT_OF_RANGE")
        exp_key = str(units[idx].exp_key or "").strip()
        if not exp_key:
            raise SystemExit("EXP_KEY_REQUIRED")

    c_layer_path = Path(args.c_layer)
    payload = build_d_layer_input(input_path=input_path, exp_key=exp_key, c_layer_path=c_layer_path)

    out_path = Path(args.output) if args.output else Path("tmp_state_outputs/d_layer_input_exp_key.json")
    if "exp_key" in out_path.name:
        out_path = out_path.with_name(out_path.name.replace("exp_key", exp_key))
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
