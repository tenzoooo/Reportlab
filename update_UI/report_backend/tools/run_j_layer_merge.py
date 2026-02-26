from __future__ import annotations

import argparse
import json
from pathlib import Path

from graph.state import AgentState


def _ordered_exp_keys(*, base_path: Path) -> list[str]:
    state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    method = state.b_layer_bundle.method if state.b_layer_bundle else None
    if not method or not method.items:
        return []
    exp_keys: list[str] = []
    for item in method.items:
        exp_key = str(item.exp_key or "").strip()
        if not exp_key:
            continue
        if item.child_exp_keys:
            continue
        exp_keys.append(exp_key)
    return exp_keys


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge H-layer outputs into base state (J layer).")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--h-dir", default="tmp_state_outputs")
    parser.add_argument("--m-layer", default="tmp_state_outputs/m_layer_output.json")
    parser.add_argument("--out", default="tmp_state_outputs/j_layer_merged.json")
    args = parser.parse_args()

    base_path = Path(args.base)
    h_dir = Path(args.h_dir)
    m_layer_path = Path(args.m_layer)
    out_path = Path(args.out)

    if not base_path.exists():
        raise SystemExit(f"BASE_NOT_FOUND: {base_path}")
    if not h_dir.exists():
        raise SystemExit(f"H_DIR_NOT_FOUND: {h_dir}")
    if m_layer_path.exists():
        m_layer_data = _load_json(m_layer_path)
        base_data["results_page_footer"] = {
            "discussion": m_layer_data.get("discussion") or "",
            "summary": m_layer_data.get("summary") or "",
            "references": m_layer_data.get("references") or [],
            "markdown": m_layer_data.get("pre_j_markdown") or m_layer_data.get("markdown") or "",
            "discussion_chapter": m_layer_data.get("discussion_chapter"),
            "summary_chapter": m_layer_data.get("summary_chapter"),
            "references_chapter": m_layer_data.get("references_chapter"),
        }

    base_data = _load_json(base_path)
    exp_keys = _ordered_exp_keys(base_path=base_path)
    if not exp_keys:
        raise SystemExit("EXP_KEYS_EMPTY")

    merged_pages: list[dict] = []
    merged_images: dict[str, dict] = {}
    base_images = base_data.get("assets_images") or []
    for img in base_images:
        image_id = str(img.get("image_id") or "").strip()
        if image_id:
            merged_images[image_id] = img
    for exp_key in exp_keys:
        h_path = h_dir / f"i_layer_output_{exp_key}.json"
        if not h_path.exists():
            continue
        h_data = _load_json(h_path)
        result_key = f"result_page_{exp_key}"
        if result_key in h_data:
            base_data[result_key] = h_data[result_key]
            merged_pages.append(h_data[result_key])
        for img in h_data.get("assets_images") or []:
            image_id = str(img.get("image_id") or "").strip()
            if not image_id:
                continue
            merged_images[image_id] = img

    base_data["result_page"] = merged_pages
    if merged_images:
        base_data["assets_images"] = list(merged_images.values())

    out_path.write_text(json.dumps(base_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
