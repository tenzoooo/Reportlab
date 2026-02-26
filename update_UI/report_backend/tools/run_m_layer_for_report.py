from __future__ import annotations

import argparse
import json
from pathlib import Path

from graph.nodes.compose_discussion_summary_references_markdown import (
    compose_discussion_summary_references_markdown,
)
from graph.state import AgentState, DiscussionPage, SummaryPage


def main() -> None:
    parser = argparse.ArgumentParser(description="Run M-layer: compose markdown from N-layer output.")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--input", default="tmp_state_outputs/n_layer_output.json")
    parser.add_argument("--out", default="tmp_state_outputs/m_layer_output.json")
    args = parser.parse_args()

    base_path = Path(args.base)
    input_path = Path(args.input)
    out_path = Path(args.out)

    state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    n_payload = json.loads(input_path.read_text(encoding="utf-8"))

    state.discussion_page = DiscussionPage(text=str(n_payload.get("discussion_text") or ""))
    state.summary_page = SummaryPage(text=str(n_payload.get("summary_text") or ""))
    if not state.pdf.filename:
        state.pdf.filename = str(n_payload.get("pdf_filename") or "")

    state = compose_discussion_summary_references_markdown(state)

    payload = {
        "markdown": state.markdown.document.text if state.markdown.document else "",
        "discussion": "",
        "summary": "",
        "references": state.references_page.formatted_lines if state.references_page else [],
        "discussion_chapter": None,
        "summary_chapter": None,
        "references_chapter": None,
        "pre_j_markdown": "",
    }
    if state.markdown.document and state.markdown.document.text:
        payload["discussion"] = state.discussion_page.text if state.discussion_page else ""
        payload["summary"] = state.summary_page.text if state.summary_page else ""
        for line in state.markdown.document.text.splitlines():
            if line.startswith("## "):
                if "考察" in line and payload["discussion_chapter"] is None:
                    payload["discussion_chapter"] = line.replace("## ", "").strip()
                if "まとめ" in line and payload["summary_chapter"] is None:
                    payload["summary_chapter"] = line.replace("## ", "").strip()
                if "参考文献" in line and payload["references_chapter"] is None:
                    payload["references_chapter"] = line.replace("## ", "").strip()
    if state.artifacts.json_bundle and state.artifacts.json_bundle.payload:
        payload["pre_j_markdown"] = str(state.artifacts.json_bundle.payload.get("pre_j_markdown") or "")
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
