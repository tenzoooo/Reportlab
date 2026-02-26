#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RunResult:
    storage_dir: Path
    job_id: str
    output_state_path: Path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run Report Agent B-layer only for a local PDF file (no mocks).")
    p.add_argument("--pdf", required=True, help="Path to input PDF (manual).")
    p.add_argument(
        "--out",
        default="tmp_state_outputs/b_layer_state.json",
        help="Output path for full AgentState JSON.",
    )
    p.add_argument(
        "--storage-dir",
        default="tmp_state_outputs/b_layer_storage",
        help="Local storage dir for this run (will be created if missing).",
    )
    p.add_argument(
        "--llm-parallel-workers",
        type=int,
        default=None,
        help="Override REPORT_AGENT_LLM_PARALLEL_WORKERS for this run.",
    )
    return p.parse_args(argv)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _dump_summary(state: Any) -> dict[str, Any]:
    # Keep this summary stable and machine-readable for quick diagnosis.
    pdf = getattr(state, "pdf", None)
    return {
        "job_id": getattr(getattr(state, "job_meta", None), "job_id", ""),
        "pdf": {
            "filename": getattr(pdf, "filename", ""),
            "storage_key": getattr(pdf, "storage_key", ""),
            "pages": getattr(pdf, "pages", None),
            "markdown_len": len(getattr(pdf, "markdown_text", "") or ""),
            "method_text_len": len(getattr(pdf, "method_text", "") or ""),
            "discussion_text_len": len(getattr(pdf, "discussion_text", "") or ""),
            "method_units": len(getattr(pdf, "method_units", []) or []),
            "method_numbers": len(getattr(pdf, "method_numbers", []) or []),
            "needs_hitl_methods": bool(getattr(pdf, "needs_hitl_methods", False)),
            "needs_hitl_discussion": bool(getattr(pdf, "needs_hitl_discussion", False)),
            "needs_hitl_result_map": bool(getattr(pdf, "needs_hitl_result_map", False)),
            "needs_hitl_theory": bool(getattr(pdf, "needs_hitl_theory", False)),
        },
        "experiments": len(getattr(state, "experiments", []) or []),
        "validation": {
            "errors": [e.model_dump() for e in getattr(getattr(state, "validation_report", None), "errors", []) or []],
            "warnings": [w.model_dump() for w in getattr(getattr(state, "validation_report", None), "warnings", []) or []],
        },
    }


def run(argv: list[str]) -> int:
    args = _parse_args(argv)
    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists() or not pdf_path.is_file():
        print(f"[ERROR] PDF not found: {pdf_path}", file=sys.stderr)
        return 2

    # Local imports: keep script usable from update_UI root without extra PYTHONPATH setup.
    repo_root = Path(__file__).resolve().parents[1]
    report_backend_dir = repo_root / "report_backend"
    sys.path.insert(0, str(report_backend_dir))

    from core.config import load_settings  # type: ignore
    from core.storage import build_storage  # type: ignore
    from core.jobs import save_state  # type: ignore
    from graph.nodes.build_b_layer_state import build_b_layer_state_and_save  # type: ignore
    from graph.state import AgentState, JobMeta, JobStatus, now_iso  # type: ignore
    from llm.client import LLMClient  # type: ignore

    settings = load_settings()
    storage_dir = Path(args.storage_dir).expanduser()
    if not storage_dir.is_absolute():
        storage_dir = (repo_root / storage_dir).resolve()
    storage = build_storage(backend=settings.storage_backend, storage_dir=storage_dir)

    job_id = uuid.uuid4().hex
    pdf_key = f"jobs/{job_id}/source/manual.pdf"
    storage.put_bytes(pdf_key, pdf_path.read_bytes())

    state = AgentState(job_meta=JobMeta(job_id=job_id))
    state.status = JobStatus.created
    state.pdf.filename = pdf_path.name
    state.pdf.storage_key = pdf_key
    state.job_meta.updated_at = now_iso()
    save_state(storage, state)

    llm = LLMClient(settings)

    output_state_path = Path(args.out).expanduser()
    if not output_state_path.is_absolute():
        output_state_path = (repo_root / output_state_path).resolve()
    _ensure_parent(output_state_path)

    state = build_b_layer_state_and_save(
        state,
        storage=storage,
        llm=llm,
        output_state_path=output_state_path,
        llm_parallel_workers=args.llm_parallel_workers,
    )

    summary = _dump_summary(state)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:]))

