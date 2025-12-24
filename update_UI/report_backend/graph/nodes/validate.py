from __future__ import annotations

import re

from core.storage import Storage
from core.text import caption_len, truncate_caption
from graph.state import AgentState, ValidationIssue
from graph.utils import infer_report_chapter
from llm.client import LLMClient
from models.contracts import TemplateContext


_SENTENCE_SPLIT_RE = re.compile(r"[。\n]+")


def _to_past_tense(text: str) -> str:
    """
    Best-effort conversion to past tense for typical lab manual summaries.
    This is intentionally conservative; LLM prompts should also be updated to output past tense.
    """

    s = (text or "").strip()
    if not s:
        return ""

    sentences = [p.strip() for p in _SENTENCE_SPLIT_RE.split(s) if p.strip()]
    out: list[str] = []
    for sent in sentences:
        t = sent
        # Common endings.
        replacements = [
            ("する", "した"),
            ("行う", "行った"),
            ("測定する", "測定した"),
            ("設定する", "設定した"),
            ("変化させる", "変化させた"),
            ("使用する", "使用した"),
            ("用いる", "用いた"),
            ("確認する", "確認した"),
            ("作成する", "作成した"),
            ("求める", "求めた"),
            ("繰り返す", "繰り返した"),
            ("とする", "とした"),
        ]
        for a, b in replacements:
            if t.endswith(a):
                t = t[: -len(a)] + b
                break
        out.append(t + "。")

    return "".join(out).strip()


def _exp_path(chapter: int, idx: str, subidx: str) -> str:
    parts = [str(chapter).strip(), str(idx).strip()]
    s = str(subidx or "").strip()
    if s:
        parts.append(s)
    return ".".join([p for p in parts if p])


def _result_sentence(exp: dict, *, prefer_figure: bool = True) -> str:
    """
    Build a short result overview sentence (do NOT use result_brief).
    If a figure/table exists, reference its label at the end.
    """

    blocks = exp.get("blocks") if isinstance(exp.get("blocks"), list) else []
    label = ""
    caption = ""
    if blocks:
        chosen = None
        if prefer_figure:
            chosen = next((b for b in blocks if isinstance(b, dict) and b.get("type") == "figure"), None)
        if chosen is None:
            chosen = next((b for b in blocks if isinstance(b, dict) and b.get("type") in {"figure", "table"}), None)
        if chosen and isinstance(chosen, dict):
            content = chosen.get("figure") if chosen.get("type") == "figure" else chosen.get("table")
            if isinstance(content, dict):
                label = str(content.get("label") or "").strip()
                caption = str(content.get("caption") or "").strip()

    if label:
        if caption:
            return f"{caption}の実験結果の概要を以下の{label}に示す。"
        return f"実験結果の概要を以下の{label}に示す。"

    return "実験結果の概要をまとめた。"


def _compact_result_summary(value: str, *, max_len: int = 80) -> tuple[str, bool]:
    text = (value or "").strip()
    if not text:
        return "", False
    if len(text) > max_len:
        return text[:max_len], True
    return text, False


def validate(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    state.validation_report.errors = []
    state.validation_report.warnings = []
    state.validation_report.retry_targets = []
    state.next_action = ""

    chapter = infer_report_chapter(state)

    # Duplicate experiment idx detection.
    seen_exp: set[str] = set()
    for exp in state.experiments:
        if exp.idx in seen_exp:
            state.validation_report.errors.append(
                ValidationIssue(code="duplicate_experiment_idx", message=f"duplicate experiment idx: {exp.idx}", target=exp.idx)
            )
        seen_exp.add(exp.idx)

    # Caption length enforcement (15 chars for images).
    for img in state.assets_images:
        if not img.analysis:
            state.validation_report.errors.append(
                ValidationIssue(code="missing_image_analysis", message="image analysis is missing", target=img.image_id)
            )
            state.validation_report.retry_targets.append(
                ValidationIssue(code="retry_image_analyze", message="retry image analyze", target=img.image_id)
            )
            continue
        cap = img.analysis.caption
        if caption_len(cap) > 15:
            truncated = truncate_caption(cap, max_len=15)
            img.analysis.caption = truncated
            state.validation_report.warnings.append(
                ValidationIssue(
                    code="caption_truncated",
                    message=f"caption truncated to 15 chars: '{cap}' -> '{truncated}'",
                    target=img.image_id,
                )
            )

        if not img.analysis.belongs_to:
            state.validation_report.errors.append(
                ValidationIssue(code="empty_belongs_to", message="belongs_to is empty", target=img.image_id)
            )
            state.validation_report.retry_targets.append(
                ValidationIssue(code="retry_image_analyze", message="retry image analyze", target=img.image_id)
            )

        if not img.assigned_to:
            state.validation_report.errors.append(
                ValidationIssue(code="unassigned_image", message="image was not assigned to any experiment", target=img.image_id)
            )

    for tbl in state.assets_tables:
        if not tbl.analysis:
            state.validation_report.errors.append(
                ValidationIssue(code="missing_table_analysis", message="table analysis is missing", target=tbl.table_id)
            )
            state.validation_report.retry_targets.append(
                ValidationIssue(code="retry_table_analyze", message="retry table analyze", target=tbl.table_id)
            )
        if tbl.analysis and not tbl.assigned_to:
            state.validation_report.errors.append(
                ValidationIssue(code="unassigned_table", message="table was not assigned to any experiment", target=tbl.table_id)
            )

    # Discussion retry: if we have discussion text/prompts but got no units.
    has_discussion_source = bool(state.pdf.consideration_prompts) or bool(state.pdf.discussion_text.strip())
    if has_discussion_source and not state.consideration.units:
        state.validation_report.errors.append(
            ValidationIssue(code="missing_discussion_units", message="consideration units are missing")
        )
        state.validation_report.retry_targets.append(
            ValidationIssue(code="retry_discussion", message="retry discussion generation")
        )

    # Re-number labels deterministically using: 図/表 {chapter}.{idx}.{subidx}.{seq} (subidx omitted when empty).
    used_image_ids: set[str] = set()
    for exp in state.experiments:
        path = _exp_path(chapter, exp.idx, exp.subidx)
        fig_seq = 1
        tbl_seq = 1

        for block in exp.blocks:
            if block.type == "figure":
                block.figure.label = f"図 {path}.{fig_seq}"
                fig_seq += 1

                image_id = block.figure.figure_image_id
                if image_id:
                    if image_id in used_image_ids:
                        state.validation_report.errors.append(
                            ValidationIssue(code="duplicate_image_block", message="image used in multiple blocks", target=image_id)
                        )
                    used_image_ids.add(image_id)
                    match = next((img for img in state.assets_images if img.image_id == image_id), None)
                    if match and match.analysis:
                        block.figure.caption = match.analysis.caption
            elif block.type == "table":
                block.table.label = f"表 {path}.{tbl_seq}"
                tbl_seq += 1

    for exp in state.experiments:
        past_method = _to_past_tense(exp.method_summary)
        exp.method_summary = past_method or exp.method_summary

        # Populate convenience lists for UI/editor use.
        # These mirror the order of `exp.blocks` (which is also what the template uses).
        exp.figures = [b.figure for b in exp.blocks if b.type == "figure"]
        exp.tables = [b.table for b in exp.blocks if b.type == "table"]

        # For parent (subidx="") experiments that have children, keep method summary only.
        has_children = any((e.idx == exp.idx and e.subidx) for e in state.experiments)
        if not exp.subidx and has_children:
            exp.description_brief = exp.method_summary.strip()
            continue

        exp.description_brief = f"{exp.method_summary} {_result_sentence(exp.model_dump())}".strip()

    # Build TemplateContext.
    ctx = TemplateContext(
        chapter=chapter,
        chapter_plus_1=chapter + 1,
        chapter_plus_2=chapter + 2,
        experiments=state.experiments,
        consideration=state.consideration,
        summary=state.summary,
    )
    state.template_context = ctx

    return state
