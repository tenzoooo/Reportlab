from __future__ import annotations

from typing import Iterable

from graph.state import AgentState, MarkdownDocument, now_iso
from models.contracts import AssetRef, ResultsPage, TextWithEvidence


def _normalize_text(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _markdown_table(rows: list[list[str]], *, max_rows: int = 80, max_cols: int = 16) -> str:
    if not rows:
        return ""
    trimmed = [list(r[:max_cols]) for r in rows[:max_rows]]
    cols = max((len(r) for r in trimmed), default=0)
    if cols <= 0:
        return ""
    normalized = [r + [""] * (cols - len(r)) for r in trimmed]

    def cell(value: str) -> str:
        return str(value or "").replace("\n", " ").replace("|", "\\|").strip()

    header = [cell(v) for v in normalized[0]]
    body = [[cell(v) for v in r] for r in normalized[1:]]
    lines: list[str] = []
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] * cols) + " |")
    for row in body:
        lines.append("| " + " | ".join(row) + " |")
    if len(rows) > max_rows:
        lines.append(f"\n… ({len(rows) - max_rows} more rows)")
    return "\n".join(lines).strip()


def _format_text_block(text: str | TextWithEvidence | None) -> str:
    if isinstance(text, TextWithEvidence):
        return _normalize_text(text.text)
    return _normalize_text(text or "")


def _collect_asset_ids(refs: Iterable[AssetRef]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for ref in refs:
        asset_id = (ref.asset_id or "").strip()
        if not asset_id or asset_id in seen:
            continue
        seen.add(asset_id)
        ordered.append(asset_id)
    return ordered


def _format_asset_caption(label: str, caption: str) -> str:
    label = (label or "").strip()
    caption = (caption or "").strip()
    if label and caption:
        return f"{label}：{caption}"
    if label:
        return label
    return caption


def _format_results_page(state: AgentState, page: ResultsPage) -> tuple[str, list[str]]:
    out: list[str] = []
    assets_manifest: list[str] = []

    title = (page.title or "実験結果").strip()
    chapter = (page.chapter or "").strip()
    if chapter:
        out.append(f"# {chapter}. {title}".strip())
    else:
        out.append(f"# {title}".strip())
    out.append("")

    image_by_asset = {img.asset_id: img for img in state.assets_images}
    table_by_asset = {tbl.asset_id: tbl for tbl in state.assets_tables}

    for section in page.sections:
        section_title = f"{section.parent_result_no} {section.title}".strip()
        out.append(f"## {section_title}".strip())
        out.append("")

        if section.header_only:
            continue

        for group in section.groups:
            header = f"{group.result_no} {group.experiment_name}".strip()
            out.append(f"### {header}".strip())
            out.append("")

            overview = _format_text_block(group.experiment_overview)
            if overview:
                out.append(overview)
                out.append("")

            description = _format_text_block(group.result_description)
            if description:
                out.append(description)
                out.append("")

            for table_ref in group.tables:
                caption = _format_asset_caption(table_ref.label, _format_text_block(table_ref.caption))
                if caption:
                    out.append(caption)
                    out.append("")
                asset = table_by_asset.get(table_ref.asset_id)
                if asset and asset.rows:
                    out.append(_markdown_table(asset.rows))
                    out.append("")
                assets_manifest.extend(_collect_asset_ids([table_ref]))

            for figure_ref in group.figures:
                asset = image_by_asset.get(figure_ref.asset_id)
                image_id = asset.image_id if asset else "missing"
                out.append(f"![](image:{image_id})")
                out.append("")
                caption = _format_asset_caption(figure_ref.label, _format_text_block(figure_ref.caption))
                if caption:
                    out.append(caption)
                    out.append("")
                assets_manifest.extend(_collect_asset_ids([figure_ref]))

            for photo_ref in group.photos:
                asset = image_by_asset.get(photo_ref.asset_id)
                image_id = asset.image_id if asset else "missing"
                out.append(f"![](image:{image_id})")
                out.append("")
                caption = _format_asset_caption(photo_ref.label, _format_text_block(photo_ref.caption))
                if caption:
                    out.append(caption)
                    out.append("")
                assets_manifest.extend(_collect_asset_ids([photo_ref]))

            quant_comment = _format_text_block(group.quant_comment.text)
            if quant_comment:
                out.append(quant_comment)
                out.append("")

    text = "\n".join(out).strip() + "\n"
    return text, assets_manifest


def _format_discussion(state: AgentState) -> str:
    page = state.discussion_page
    if page and page.text:
        return _normalize_text(page.text)

    lines: list[str] = []
    for unit in state.consideration.units:
        index = (unit.index or "").strip()
        discussion = (unit.discussion_active or "").strip()
        if not index and not discussion:
            continue
        body = f"({index}){discussion}".strip()
        lines.append(body)
    return "\n".join(lines).strip()


def _format_summary(state: AgentState) -> str:
    page = state.summary_page
    if page and page.text:
        return _normalize_text(page.text)
    return _normalize_text(state.summary)


def _format_references(state: AgentState) -> str:
    page = state.references_page
    if page and page.formatted_lines:
        return "\n".join([_normalize_text(line) for line in page.formatted_lines if (line or "").strip()]).strip()

    if state.consideration.reference_list_formatted:
        return "\n".join([_normalize_text(line) for line in state.consideration.reference_list_formatted]).strip()

    lines: list[str] = []
    for ref in state.consideration.references:
        parts = [f"[{ref.id}]", ref.title, ref.year or "", ref.authors or ""]
        line = " ".join([p.strip() for p in parts if p and p.strip()]).strip()
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def compose_markdown_document(state: AgentState) -> AgentState:
    if state.results_page is None:
        markdown_text = "# 実験結果\n"
        assets_manifest: list[str] = []
    else:
        markdown_text, assets_manifest = _format_results_page(state, state.results_page)
        assets_manifest = list(dict.fromkeys(assets_manifest))

    discussion_text = _format_discussion(state)
    summary_text = _format_summary(state)
    references_text = _format_references(state)

    out: list[str] = [markdown_text.rstrip()]
    if discussion_text:
        out.append("## 考察")
        out.append("")
        out.append(discussion_text)
        out.append("")

    if summary_text:
        out.append("## まとめ")
        out.append("")
        out.append(summary_text)
        out.append("")

    if references_text:
        out.append("## 参考文献")
        out.append("")
        out.append(references_text)
        out.append("")

    document = MarkdownDocument(
        text="\n".join(out).strip() + "\n",
        generated_at=now_iso(),
        evidence_refs=[],
        assets_manifest=assets_manifest,
    )

    state.markdown.document = document
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["compose_markdown_document"]
