#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Apply B8 map_result_numbers to an AgentState JSON (no mocks).")
    p.add_argument("--in", dest="in_path", required=True, help="Input AgentState JSON path (e.g. B-layer output).")
    p.add_argument("--out", dest="out_path", required=True, help="Output AgentState JSON path.")
    return p.parse_args(argv)


def run(argv: list[str]) -> int:
    args = _parse_args(argv)
    repo_root = Path(__file__).resolve().parents[1]
    in_path = Path(args.in_path).expanduser()
    if not in_path.is_absolute():
        in_path = (repo_root / in_path).resolve()
    out_path = Path(args.out_path).expanduser()
    if not out_path.is_absolute():
        out_path = (repo_root / out_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Make report_backend importable from update_UI root.
    sys.path.insert(0, str(repo_root / "report_backend"))

    from graph.state import AgentState  # type: ignore
    from graph.nodes.map_result_numbers import map_result_numbers  # type: ignore

    data = json.loads(in_path.read_text(encoding="utf-8"))
    state = AgentState.model_validate(data)
    state = map_result_numbers(state)
    out_path.write_text(json.dumps(state.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {
        "method_numbers": len(state.pdf.method_numbers or []),
        "result_number_map_keys": len((state.pdf.result_number_map or {}).keys()),
        "experiment_index_keys": len((state.pdf.experiment_index or {}).keys()),
        "warnings": [w.code for w in (state.validation_report.warnings or [])],
        "errors": [e.code for e in (state.validation_report.errors or [])],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:]))

