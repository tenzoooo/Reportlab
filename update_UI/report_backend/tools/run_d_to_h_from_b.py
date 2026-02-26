from __future__ import annotations

import argparse
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys
from pathlib import Path

from graph.state import AgentState


def _load_exp_keys(*, b_layer_path: Path) -> list[str]:
    state = AgentState.model_validate(json.loads(b_layer_path.read_text(encoding="utf-8")))
    method = state.b_layer_bundle.method if state.b_layer_bundle else None
    if not method:
        return []
    exp_keys: list[str] = []
    if method.experiment_units:
        for unit in method.experiment_units:
            exp_key = str(unit.exp_key or "").strip()
            if not exp_key:
                continue
            exp_keys.append(exp_key)
        return exp_keys

    if not method.items:
        return []
    for item in method.items:
        exp_key = str(item.exp_key or "").strip()
        if not exp_key:
            continue
        # Skip parent items that have child experiments.
        if getattr(item, "child_exp_keys", None):
            if list(item.child_exp_keys or []):
                continue
        exp_keys.append(exp_key)
    return exp_keys


def _run_step(*, args: list[str], env: dict[str, str]) -> None:
    subprocess.run(args, check=True, env=env)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run D->H sequentially per exp_key from B-layer JSON.")
    parser.add_argument("--b-layer", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--c-layer", default="tmp_state_outputs/c_layer_run.json")
    parser.add_argument("--out-dir", default="tmp_state_outputs")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--max-workers", type=int, default=0)
    args = parser.parse_args()

    b_layer_path = Path(args.b_layer)
    c_layer_path = Path(args.c_layer)
    out_dir = Path(args.out_dir)

    if not b_layer_path.exists():
        raise SystemExit(f"B_LAYER_NOT_FOUND: {b_layer_path}")
    if not c_layer_path.exists():
        raise SystemExit(f"C_LAYER_NOT_FOUND: {c_layer_path}")
    if not out_dir.exists():
        raise SystemExit(f"OUT_DIR_NOT_FOUND: {out_dir}")

    exp_keys = _load_exp_keys(b_layer_path=b_layer_path)
    if not exp_keys:
        raise SystemExit("EXP_KEYS_EMPTY")

    env = dict(os.environ)
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
    python = sys.executable

    def _run_for_exp_key(exp_key: str) -> None:
        d_input = out_dir / f"d_layer_input_{exp_key}.json"
        d_output = out_dir / f"d_layer_output_{exp_key}.json"
        e_output = out_dir / f"e_layer_output_{exp_key}.json"
        f_output = out_dir / f"f_layer_output_{exp_key}.json"
        g_captions = out_dir / f"g_layer_captions_{exp_key}.json"
        g_quant = out_dir / f"g_layer_quant_{exp_key}.json"
        h_output = out_dir / f"h_layer_output_{exp_key}.json"
        i_output = out_dir / f"i_layer_output_{exp_key}.json"

        _run_step(
            args=[
                python,
                "tools/build_d_layer_input.py",
                "--input",
                str(b_layer_path),
                "--exp-key",
                exp_key,
                "--c-layer",
                str(c_layer_path),
                "--output",
                str(d_input),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_d_layer_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(d_input),
                "--out",
                str(d_output),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_e_layer_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(d_output),
                "--out",
                str(e_output),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_f_layer_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(e_output),
                "--out",
                str(f_output),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_g_layer_captions_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(f_output),
                "--out",
                str(g_captions),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_g_layer_quant_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(f_output),
                "--captions",
                str(g_captions),
                "--out",
                str(g_quant),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_h_layer_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(g_quant),
                "--out",
                str(h_output),
            ],
            env=env,
        )
        _run_step(
            args=[
                python,
                "tools/run_i_layer_for_exp.py",
                "--base",
                str(b_layer_path),
                "--input",
                str(h_output),
                "--out",
                str(i_output),
            ],
            env=env,
        )

    max_workers = args.max_workers if args.max_workers and args.max_workers > 0 else 1
    if max_workers == 1:
        for exp_key in exp_keys:
            try:
                _run_for_exp_key(exp_key)
            except subprocess.CalledProcessError:
                if not args.continue_on_error:
                    raise
    else:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_run_for_exp_key, exp_key): exp_key for exp_key in exp_keys}
            for future in as_completed(futures):
                try:
                    future.result()
                except subprocess.CalledProcessError:
                    if not args.continue_on_error:
                        raise

    print("DONE")


if __name__ == "__main__":
    main()
