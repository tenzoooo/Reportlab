#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\nSTDERR: {proc.stderr.strip()}")
    return proc.stdout.strip()


def _curl_json(cmd: list[str]) -> dict[str, Any]:
    out = _run(cmd)
    try:
        data = json.loads(out)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Expected JSON but got: {out[:500]}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected JSON object but got: {type(data).__name__}")
    return data


def _file_arg(path: Path) -> str:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    return f"@{path}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload assets to report agent and verify update_mvp workflow execution."
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--excel", action="append", type=Path, default=[])
    parser.add_argument("--image", action="append", type=Path, default=[])
    parser.add_argument("--past-report", action="append", type=Path, default=[])
    parser.add_argument("--mode", default="update_mvp", choices=["update_mvp", "mvp", "prepare", "full"])
    parser.add_argument("--state-dir", default=None, type=Path)
    args = parser.parse_args()

    base = args.base_url.rstrip("/")

    create = _curl_json(
        ["curl", "-sS", "-X", "POST", "-F", f"pdf={_file_arg(args.pdf)}", f"{base}/jobs"]
    )
    job_id = str(create.get("job_id") or "")
    if not job_id:
        raise RuntimeError(f"Missing job_id in /jobs response: {create}")

    for excel in args.excel:
        _curl_json(
            ["curl", "-sS", "-X", "POST", "-F", f"excel={_file_arg(excel)}", f"{base}/jobs/{job_id}/excel"]
        )

    for image in args.image:
        _curl_json(
            ["curl", "-sS", "-X", "POST", "-F", f"image={_file_arg(image)}", f"{base}/jobs/{job_id}/images"]
        )

    for report in args.past_report:
        _curl_json(
            ["curl", "-sS", "-X", "POST", "-F", f"report={_file_arg(report)}", f"{base}/jobs/{job_id}/past-report"]
        )

    run = _curl_json(["curl", "-sS", "-X", "POST", f"{base}/jobs/{job_id}/run?mode={args.mode}"])
    intermediate = _curl_json(["curl", "-sS", f"{base}/jobs/{job_id}/intermediate"])

    run_mode = str(intermediate.get("job_meta", {}).get("run_mode", ""))
    expected_mode = "update_mvp" if args.mode in {"update_mvp", "mvp"} else args.mode
    status = str(intermediate.get("status", ""))

    default_state_dir = Path(__file__).resolve().parents[1] / ".agent_data" / "jobs"
    state_dir = args.state_dir or default_state_dir
    source_dir = state_dir / job_id / "source"
    source_files = sorted([str(p) for p in source_dir.rglob("*") if p.is_file()]) if source_dir.exists() else []

    print(
        json.dumps(
            {
                "job_id": job_id,
                "run_response_status": run.get("status", ""),
                "run_response_error": run.get("error") or run.get("detail") or "",
                "intermediate_status": status,
                "expected_run_mode": expected_mode,
                "actual_run_mode": run_mode,
                "state_dir": str(state_dir),
                "source_file_count": len(source_files),
                "source_files": source_files,
                "mode_ok": run_mode == expected_mode,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if run.get("error") or run.get("detail"):
        raise RuntimeError(f"run endpoint returned error: {run.get('error') or run.get('detail')}")

    if run_mode != expected_mode:
        raise RuntimeError(f"run_mode mismatch: expected={expected_mode} actual={run_mode}")

    if len(source_files) == 0:
        raise RuntimeError("No files found under local source directory; upload may have failed")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise SystemExit(1)
