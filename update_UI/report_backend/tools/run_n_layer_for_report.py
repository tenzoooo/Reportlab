from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.config import load_settings
from graph.nodes.build_discussion_summary_from_pdf_markdown import (
    build_discussion_summary_from_pdf_markdown,
)
from graph.state import AgentState
from llm.client import LLMClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Run N-layer: build discussion/summary from pdf_markdrown.")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--out", default="tmp_state_outputs/n_layer_output.json")
    args = parser.parse_args()

    base_path = Path(args.base)
    out_path = Path(args.out)

    state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    settings = load_settings()
    llm = LLMClient(settings)
    state = build_discussion_summary_from_pdf_markdown(state, llm=llm)

    payload = {
        "pdf_filename": state.pdf.filename,
        "discussion_text": (state.discussion_page.text if state.discussion_page else ""),
        "summary_text": (state.summary_page.text if state.summary_page else ""),
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
