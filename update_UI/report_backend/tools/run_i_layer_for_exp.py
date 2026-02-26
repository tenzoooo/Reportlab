from __future__ import annotations

import argparse
import json
from pathlib import Path

from graph.state import AgentState, now_iso


def _experiment_meta(*, state: AgentState, exp_key: str) -> dict:
    title = ""
    parent = None
    method = state.b_layer_bundle.method if state.b_layer_bundle else None
    units = list(method.experiment_units or []) if method else []
    items = list(method.items or []) if method else []

    for unit in units:
        if str(unit.exp_key or "").strip() == exp_key:
            title = str(unit.title or "")
            if unit.parent:
                parent = {"exp_key": str(unit.parent.exp_key or ""), "title": str(unit.parent.title or "")}
            return {"exp_key": exp_key, "title": title, "parent": parent}

    for item in items:
        if str(item.exp_key or "").strip() == exp_key:
            title = str(item.title or "")
            parent_exp_key = str(item.parent_exp_key or "").strip()
            if parent_exp_key:
                parent_title = ""
                for candidate in items:
                    if str(candidate.exp_key or "").strip() == parent_exp_key:
                        parent_title = str(candidate.title or "")
                        break
                parent = {"exp_key": parent_exp_key, "title": parent_title}
            return {"exp_key": exp_key, "title": title, "parent": parent}

    return {"exp_key": exp_key, "title": title, "parent": parent}


def _bump_parent_key(parent: dict | None) -> dict | None:
    if not parent:
        return None
    exp_key = str(parent.get("exp_key") or "").strip()
    if not exp_key:
        return parent
    parts = exp_key.split(".")
    if not parts:
        return parent
    try:
        parts[0] = str(int(parts[0]) + 1)
        parent = dict(parent)
        parent["exp_key"] = ".".join(parts)
        return parent
    except ValueError:
        return parent


def _build_output(*, base: dict, exp_key: str, exp_title: str, parent: dict | None) -> dict:
    tables = list(base.get("tables") or [])
    graphs = list(base.get("graphs") or [])

    out = dict(base)
    result_page_key = f"result_page_{exp_key}"
    result_page_value = {
        "experiment_number": str(base.get("experiment_number") or exp_key),
        "experiment_name": exp_title,
        "method_summary": str(base.get("method_summary") or ""),
        "result_description": str(base.get("result_description") or ""),
        "tables": tables,
        "graphs": graphs,
        "table_captions": list(base.get("table_captions") or []),
        "graph_captions": list(base.get("graph_captions") or []),
        "quant_comment": base.get("quant_comment") or [],
        "experiment_parent": parent,
    }
    out.update(
        {
            "exp_key": exp_key,
            "experiment_number": exp_key,
            "experiment_title": exp_title,
            "experiment_name": exp_title,
            "experiment_parent": parent,
            "tables": tables,
            "graphs": graphs,
            result_page_key: result_page_value,
        }
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Build I-layer JSON for markdown generation.")
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

    meta = _experiment_meta(state=base_state, exp_key=exp_key)
    base_state.job_meta.updated_at = now_iso()

    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/i_layer_output_{exp_key}.json")
    out_path.write_text(
        json.dumps(
            _build_output(
                base=input_data,
                exp_key=exp_key,
                exp_title=meta.get("title") or "",
                parent=_bump_parent_key(meta.get("parent")),
            ),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(out_path)


if __name__ == "__main__":
    main()
