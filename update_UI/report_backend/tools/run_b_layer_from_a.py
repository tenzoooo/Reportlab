from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.config import load_settings
from core.storage import build_storage
from graph.nodes.build_b_layer_state import build_b_layer_state_and_save
from graph.state import AgentState
from llm.client import LLMClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Run B-layer from A-layer state JSON.")
    parser.add_argument("--input", default="tmp_state_outputs/a_layer_after_all_steps.json")
    parser.add_argument("--out", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--theory-out", default="")
    parser.add_argument("--bundle-out", default="")
    parser.add_argument("--llm-workers", type=int, default=0)
    args = parser.parse_args()

    input_path = Path(args.input)
    out_path = Path(args.out)
    if not input_path.exists():
        raise SystemExit(f"INPUT_NOT_FOUND: {input_path}")

    theory_out = Path(args.theory_out) if args.theory_out else None
    bundle_out = Path(args.bundle_out) if args.bundle_out else None
    llm_workers = args.llm_workers if args.llm_workers and args.llm_workers > 0 else None

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)

    state = AgentState.model_validate(json.loads(input_path.read_text(encoding="utf-8")))
    build_b_layer_state_and_save(
        state,
        storage=storage,
        llm=llm,
        output_state_path=out_path,
        theory_output_path=theory_out,
        bundle_output_path=bundle_out,
        llm_parallel_workers=llm_workers,
    )
    print(out_path)


if __name__ == "__main__":
    main()
