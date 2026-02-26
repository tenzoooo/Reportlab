from __future__ import annotations

import argparse
import json
from pathlib import Path

from models.contracts import ImageAsset, TableAsset
from graph.state import AgentState, now_iso


def _build_output_payload(*, exp_key: str, table_captions: list[dict], graph_captions: list[dict]) -> dict:
    return {
        "exp_key": exp_key,
        "table_captions": table_captions,
        "graph_captions": graph_captions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate captions for tables/graphs per experiment.")
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

    tables = [TableAsset.model_validate(t) for t in (input_data.get("assets_tables") or [])]
    images = [ImageAsset.model_validate(i) for i in (input_data.get("assets_images") or [])]

    table_expectations: list[str] = []
    graph_expectations: list[str] = []
    for sel in input_data.get("excel_range_selections") or []:
        result = sel.get("result") or {}
        for t in result.get("table_expectations") or []:
            name = str(t.get("name") or "").strip()
            if name:
                table_expectations.append(name)
        for g in result.get("graph_expectations") or []:
            name = str(g.get("name") or "").strip()
            if name:
                graph_expectations.append(name)

    table_captions: list[dict] = []
    for idx, table in enumerate(tables):
        caption = table_expectations[idx] if idx < len(table_expectations) else ""
        table_captions.append({"asset_id": table.table_id, "caption": caption, "error": ""})

    graph_captions: list[dict] = []
    for idx, image in enumerate(images):
        caption = graph_expectations[idx] if idx < len(graph_expectations) else ""
        graph_captions.append({"asset_id": image.image_id, "caption": caption, "error": ""})

    base_state.job_meta.updated_at = now_iso()

    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/g_layer_captions_{exp_key}.json")
    out_path.write_text(
        json.dumps(_build_output_payload(exp_key=exp_key, table_captions=table_captions, graph_captions=graph_captions), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(out_path)


if __name__ == "__main__":
    main()
