from __future__ import annotations

from graph.nodes.build_references_page import build_references_page
from graph.state import AgentState, ArtifactsBundle, JobStatus, MarkdownDocument, ValidationIssue, now_iso


def _discussion_summary_chapters(state: AgentState) -> tuple[int, int]:
    if state.b_layer_bundle and state.b_layer_bundle.method:
        base = int(state.b_layer_bundle.method.chapter or 0)
    else:
        base = 0
    if base <= 0 and state.pdf.method_chapter:
        base = int(state.pdf.method_chapter or 0)
    if base <= 0:
        base = 1
    return base + 2, base + 3


def compose_discussion_summary_references_markdown(state: AgentState) -> AgentState:
    if state.status == JobStatus.failed:
        return state

    discussion_text = (state.discussion_page.text if state.discussion_page else "").strip()
    summary_text = (state.summary_page.text if state.summary_page else "").strip()
    if not discussion_text or not summary_text:
        state.validation_report.errors.append(
            ValidationIssue(code="FAIL_N_LAYER_OUTPUT_MISSING", message="discussion/summary text is missing.")
        )
        state.status = JobStatus.failed
        state.job_meta.updated_at = now_iso()
        return state

    if state.references_page is None or not state.references_page.formatted_lines:
        state = build_references_page(state)

    refs = state.references_page.formatted_lines if state.references_page else []
    discussion_ch, summary_ch = _discussion_summary_chapters(state)
    lines: list[str] = [
        f"## {discussion_ch}. 考察",
        discussion_text,
        "",
        f"## {summary_ch}. まとめ",
        summary_text,
        "",
        f"## {summary_ch + 1}. 参考文献",
    ]
    if refs:
        lines.extend([f"- {line}" for line in refs])
    else:
        lines.append("- （参考文献なし）")

    markdown = "\n".join(lines).strip() + "\n"
    state.markdown.document = MarkdownDocument(text=markdown, generated_at=now_iso())
    if state.artifacts.json_bundle is None:
        state.artifacts.json_bundle = ArtifactsBundle(payload={}, generated_at=now_iso())
    state.artifacts.json_bundle.payload["pre_j_markdown"] = markdown
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["compose_discussion_summary_references_markdown"]
