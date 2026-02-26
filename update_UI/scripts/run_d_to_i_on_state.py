#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run D-I (per-experiment pipeline) on an AgentState JSON (no mocks).")
    p.add_argument("--in", dest="in_path", required=True, help="Input AgentState JSON path (e.g. B8 output).")
    p.add_argument("--out", dest="out_path", required=True, help="Output AgentState JSON path.")
    p.add_argument(
        "--storage-dir",
        required=True,
        help="Local storage root that contains jobs/<job_id>/source/... referenced by the state JSON.",
    )
    return p.parse_args(argv)


def _safe_len(value: Any) -> int:
    if value is None:
        return 0
    try:
        return len(value)  # type: ignore[arg-type]
    except Exception:
        return 0


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

    storage_dir = Path(args.storage_dir).expanduser()
    if not storage_dir.is_absolute():
        storage_dir = (repo_root / storage_dir).resolve()

    # Make report_backend importable from update_UI root.
    sys.path.insert(0, str(repo_root / "report_backend"))

    from core.config import load_settings  # type: ignore
    from core.storage import build_storage  # type: ignore
    from graph.state import AgentState  # type: ignore
    from graph.nodes.run_d_to_i_per_experiment import run_d_to_i_per_experiment  # type: ignore
    from llm.client import LLMClient  # type: ignore

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=storage_dir)
    llm = LLMClient(settings)

    data = json.loads(in_path.read_text(encoding="utf-8"))
    state = AgentState.model_validate(data)

    state = run_d_to_i_per_experiment(state, storage=storage, llm=llm)
    out_path.write_text(json.dumps(state.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")

    snapshots = list(state.snapshots or [])
    last_step = snapshots[-1].step if snapshots else ""
    results_sections = _safe_len(getattr(getattr(state, "results_page", None), "sections", None))

    summary = {
        "last_step": last_step,
        "experiment_units": _safe_len(getattr(getattr(getattr(state, "b_layer_bundle", None), "method", None), "experiment_units", None)),
        "experiments": _safe_len(getattr(state, "experiments", None)),
        "result_groups": _safe_len(getattr(state, "result_groups", None)),
        "results_sections": results_sections,
        "hitl_queue": _safe_len(getattr(state, "experiment_hitl_queue", None)),
        "errors": [{"code": e.code, "message": e.message, "target": e.target} for e in (state.validation_report.errors or [])],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:]))

