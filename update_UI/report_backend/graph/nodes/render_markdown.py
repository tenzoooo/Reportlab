from __future__ import annotations

from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue, now_iso

# Use a diagonal line to mask missing table cells.
MISSING_CELL_MARK = "＼"


def _md_escape(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _markdown_table(rows: list[list[str]], *, max_rows: int = 80, max_cols: int = 16) -> str:
    if not rows:
        return ""
    trimmed = [list(r[:max_cols]) for r in rows[:max_rows]]
    cols = max((len(r) for r in trimmed), default=0)
    if cols <= 0:
        return ""
    normalized = [r + [""] * (cols - len(r)) for r in trimmed]

    def cell(v: str) -> str:
        return str(v or "").replace("\n", " ").replace("|", "\\|").strip()

    header = [cell(v) for v in normalized[0]]
    body = [[cell(v) for v in r] for r in normalized[1:]]
    lines: list[str] = []
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] * cols) + " |")
    for r in body:
        lines.append("| " + " | ".join(r) + " |")
    if len(rows) > max_rows:
        lines.append(f"\n… ({len(rows) - max_rows} more rows)")
    return "\n".join(lines).strip()


def render_markdown(state: AgentState, *, storage: Storage) -> AgentState:
    """
    Build a report Markdown containing all report elements.
    This is the "debuggable source of truth" for downstream DOCX conversion.
    """
    if not state.template_context:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="missing_template_context", message="Template context was not built")
        )
        return state

    ctx = state.template_context.model_dump()
    chapter = ctx.get("chapter")
    experiments = ctx.get("experiments") or []

    out: list[str] = []
    out.append(f"# {chapter}. 実験結果".strip())
    out.append("")

    for exp in experiments:
        idx = str(exp.get("idx") or "").strip()
        subidx = str(exp.get("subidx") or "").strip()
        name = str(exp.get("name") or "").strip()
        # User-facing numbering: use chapter.idx (ignore subidx for the experiment title).
        exp_label = f"{chapter}.{idx}" if idx else f"{chapter}"
        out.append(f"## 実験 {exp_label}：{_md_escape(name)}".strip())
        out.append("")

        method_summary = _md_escape(str(exp.get("method_summary") or ""))
        description_brief = _md_escape(str(exp.get("description_brief") or ""))
        exp_qc = _md_escape(str(exp.get("quant_comment") or ""))

        # No "method summary" section. Paste only the brief discussion text (without the heading).
        brief = description_brief or method_summary
        if brief:
            out.append(brief.strip())
            out.append("")

        blocks = exp.get("blocks") or []
        for block in blocks:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "table":
                tbl = block.get("table") or {}
                label = str(tbl.get("label") or "").strip()
                caption = _md_escape(str(tbl.get("caption") or ""))
                rows = tbl.get("rows") if isinstance(tbl.get("rows"), list) else []
                # Caption above (centered).
                cap_line = ""
                if label and caption:
                    cap_line = f"{label}：{caption}"
                elif label:
                    cap_line = label
                elif caption:
                    cap_line = caption
                if cap_line:
                    out.append(cap_line)
                    out.append("")
                cooked_rows: list[list[str]] = []
                for r_idx, r in enumerate(rows if isinstance(rows, list) else []):
                    if not isinstance(r, list):
                        continue
                    out_row: list[str] = []
                    for c in r:
                        s = "" if c is None else str(c)
                        if r_idx > 0 and not s.strip():
                            s = MISSING_CELL_MARK
                        out_row.append(s)
                    cooked_rows.append(out_row)
                out.append(_markdown_table(cooked_rows))
                out.append("")
            elif btype == "figure":
                fig = block.get("figure") or {}
                label = str(fig.get("label") or "").strip()
                caption = _md_escape(str(fig.get("caption") or ""))
                image_id = str(fig.get("figure_image_id") or "").strip()
                # Image first, then caption under it (centered).
                if image_id:
                    # Custom convention for our markdown→docx renderer.
                    out.append(f"![](image:{image_id})")
                else:
                    out.append("![figure](image:missing)")
                out.append("")
                cap_line = ""
                if label and caption:
                    cap_line = f"{label}：{caption}"
                elif label:
                    cap_line = label
                elif caption:
                    cap_line = caption
                if cap_line:
                    out.append(cap_line)
                    out.append("")

        # Exactly ONE quantitative comment per experiment, placed after evidence blocks.
        if exp_qc:
            out.append(exp_qc)
            out.append("")

    markdown = "\n".join(out).strip() + "\n"

    key = f"jobs/{state.job_meta.job_id}/artifact/report.md"
    storage.put_bytes(key, markdown.encode("utf-8"))
    state.artifact_markdown_key = key
    state.job_meta.updated_at = now_iso()
    return state
