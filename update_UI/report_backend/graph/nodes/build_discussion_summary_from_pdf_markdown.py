from __future__ import annotations

from pydantic import BaseModel, Field

from graph.state import AgentState, DiscussionPage, JobStatus, SummaryPage, ValidationIssue, now_iso
from llm.client import LLMClient


class _DiscussionSummaryOutput(BaseModel):
    discussion_text: str = Field(default="")
    summary_text: str = Field(default="")


def _build_messages(pdf_markdown: str, discussion_source: str) -> list[dict]:
    system = (
        "あなたは実験書PDFの本文から、考察文とまとめ文を生成する担当です。\n"
        "出力はJSONのみ。説明文は禁止。\n"
        "考察文は与えられた考察指示文に従い、能動態で書く。\n"
        "考察文は「考察番号 + 本文」の形式で並べる。\n"
        "考察文・まとめ文ともに箇条書きは禁止、常体（だ・である調）で書く。\n"
        "語彙は大学2年生レベルにする。\n"
        "まとめ文は「実験を受けた本人としてレポートに記載する」文体で、分量の制約は設けない。\n\n"
        "# 出力\n"
        "{\n"
        "  \"discussion_text\": \"...\",\n"
        "  \"summary_text\": \"...\"\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": (
                "pdf_markdrown:\n<<<\n"
                + pdf_markdown
                + "\n>>>\n\n"
                + "discussion_source:\n<<<\n"
                + discussion_source
                + "\n>>>"
            ),
        },
    ]


def build_discussion_summary_from_pdf_markdown(state: AgentState, *, llm: LLMClient) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state

    pdf_markdown = (state.pdf.pdf_markdrown or "").strip()
    discussion_source = ""
    if state.b_layer_bundle and state.b_layer_bundle.discussion:
        discussion_source = (state.b_layer_bundle.discussion.text or "").strip()
    if not discussion_source:
        discussion_source = (state.pdf.discussion_text or "").strip()

    if not pdf_markdown and not discussion_source:
        state.validation_report.errors.append(
            ValidationIssue(code="FAIL_PDF_MARKDOWN_MISSING", message="pdf_markdrown and discussion text are empty.")
        )
        state.status = JobStatus.failed
        state.job_meta.updated_at = now_iso()
        return state

    out = llm.parse(
        _DiscussionSummaryOutput,
        messages=_build_messages(pdf_markdown, discussion_source),
        attempts=2,
    )
    discussion_text = (out.discussion_text or "").strip()
    summary_text = (out.summary_text or "").strip()

    state.discussion_page = DiscussionPage(text=discussion_text, prompts=[], units=[], generated_at=now_iso())
    state.summary_page = SummaryPage(text=summary_text, generated_at=now_iso())
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["build_discussion_summary_from_pdf_markdown"]
