from __future__ import annotations

import re

from core.storage import Storage
from core.text import caption_len
from graph.state import AgentState, InputAssetKind, ValidationIssue
from graph.utils import infer_report_chapter
from graph.nodes_legacy.label_blocks import assign_block_labels
from llm.client import LLMClient
from models.contracts import TemplateContext


_SENTENCE_SPLIT_RE = re.compile(r"[。\n]+")
_HITL_EXCEL_SHEET_NAMES_MISSING = "hitl_excel_sheet_names_missing"


def _missing_excel_sheet_name_targets(state: AgentState) -> list[str]:
    missing: list[str] = []
    if state.normalized_inputs:
        for asset in state.normalized_inputs:
            if asset.kind != InputAssetKind.excel:
                continue
            if asset.sheet_names:
                continue
            target = asset.asset_id or asset.storage_key or asset.filename or "excel"
            missing.append(target)
        return sorted(set(missing))

    # Fallback for legacy flows that skip normalize_inputs.
    if state.excel.storage_key and not state.excel.sheet_names:
        target = state.excel.asset_id or state.excel.storage_key or state.excel.filename or "excel"
        missing.append(target)
    for excel in state.excel_files:
        if not excel.storage_key or excel.sheet_names:
            continue
        target = excel.asset_id or excel.storage_key or excel.filename or excel.excel_id or "excel"
        missing.append(target)
    return sorted(set(missing))


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


def _as_float(value: str) -> float | None:
    s = (value or "").strip()
    if not s:
        return None
    s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return None


def _mvp_quant_insights_from_table(rows: list[list[str]]) -> dict[str, object]:
    """
    Derive simple, defensible "result" facts from the Excel table:
    - ranges of IC
    - approximate plateau behavior at VCE>=~1V
    - missing/blank cells
    - target vs measured VCE deviation
    Table layout (current MVP):
      col0: target Vce
      (col1,col2), (col3,col4), (col5,col6), (col7,col8) are (Vce,Ic) pairs
    """
    if not rows or len(rows) < 2:
        return {}

    body = rows[1:]  # skip header
    pair_starts = [1, 3, 5, 7]

    series: list[dict[str, object]] = []
    target_dev: list[float] = []

    for si, start in enumerate(pair_starts, start=1):
        points: list[tuple[float, float]] = []
        missing = 0
        missing_targets: list[str] = []
        for r in body:
            target = _as_float(r[0] if len(r) > 0 else "")
            vce = _as_float(r[start] if len(r) > start else "")
            ic = _as_float(r[start + 1] if len(r) > start + 1 else "")
            if vce is None or ic is None:
                # count only when there is at least some row content (avoid trailing empties)
                if (len(r) > start and (r[start] or "").strip()) or (len(r) > start + 1 and (r[start + 1] or "").strip()):
                    missing += 1
                else:
                    # true blank
                    missing += 1
                if len(r) > 0 and str(r[0] or "").strip():
                    missing_targets.append(str(r[0]).strip())
                continue
            points.append((vce, ic))
            if target is not None:
                target_dev.append(abs(vce - target))

        if not points:
            continue

        ics = [ic for _, ic in points]
        min_ic = min(ics)
        max_ic = max(ics)
        v_ge_1 = [ic for v, ic in points if v >= 1.0]
        plateau = None
        if len(v_ge_1) >= 2:
            plateau = (min(v_ge_1), max(v_ge_1))

        series.append(
            {
                "series": si,
                "min_ic": min_ic,
                "max_ic": max_ic,
                "plateau": plateau,
                "missing": missing,
                "missing_targets": missing_targets[:8],
                "n": len(points),
            }
        )

    if not series:
        return {}

    # Sort series by max_ic (gives "largest current" series last).
    series_sorted = sorted(series, key=lambda d: float(d.get("max_ic") or 0.0))
    smallest = series_sorted[0]
    largest = series_sorted[-1]

    dev_max = max(target_dev) if target_dev else None

    return {
        "series": series_sorted,
        "smallest": smallest,
        "largest": largest,
        "target_vce_dev_max": dev_max,
    }


def validate(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    hitl_required = bool(state.mvp.hitl_required)
    hitl_message = (state.mvp.hitl_message or "").strip()
    hitl_code = (state.mvp.hitl_code or "hitl_image_required").strip() or "hitl_image_required"

    state.validation_report.errors = []
    state.validation_report.warnings = []
    state.validation_report.retry_targets = []
    state.next_action = ""

    if hitl_required:
        state.validation_report.errors.append(
            ValidationIssue(
                code=hitl_code,
                message=hitl_message or "HITL required: upload observation/result images and rerun.",
            )
        )

    for target in _missing_excel_sheet_name_targets(state):
        state.validation_report.errors.append(
            ValidationIssue(
                code=_HITL_EXCEL_SHEET_NAMES_MISSING,
                message="Excel sheet names are missing; upload a readable Excel file or provide sheet names via HITL.",
                target=target,
            )
        )

    chapter = infer_report_chapter(state)

    # Duplicate experiment idx detection.
    seen_exp: set[str] = set()
    for exp in state.experiments:
        if exp.idx in seen_exp:
            state.validation_report.errors.append(
                ValidationIssue(code="duplicate_experiment_idx", message=f"duplicate experiment idx: {exp.idx}", target=exp.idx)
            )
        seen_exp.add(exp.idx)

    # Caption length warning only (no truncation).
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
            state.validation_report.warnings.append(
                ValidationIssue(
                    code="WARN_CAPTION_TOO_LONG",
                    message=f"caption length exceeds 15 chars: '{cap}'",
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

        # Some MVP paths populate `analysis.assigned_exp_key` but skip the explicit image-assign node.
        # Treat that as the assignment source of truth before reporting `unassigned_image`.
        if not img.assigned_to:
            exp_key = str(getattr(img.analysis, "assigned_exp_key", "") or "").strip()
            if not exp_key:
                first = img.analysis.belongs_to[0] if img.analysis.belongs_to else None
                exp_key = str(getattr(first, "exp_key", "") or "").strip()
            if exp_key:
                img.assigned_to = exp_key

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
            exp_key = str(getattr(tbl.analysis, "assigned_exp_key", "") or "").strip()
            if not exp_key:
                first = tbl.analysis.belongs_to[0] if tbl.analysis.belongs_to else None
                exp_key = str(getattr(first, "exp_key", "") or "").strip()
            if exp_key:
                tbl.assigned_to = exp_key
        if tbl.analysis and not tbl.assigned_to:
            state.validation_report.errors.append(
                ValidationIssue(code="unassigned_table", message="table was not assigned to any experiment", target=tbl.table_id)
            )

    # Discussion retry: if we have discussion text/prompts but got no units.
    run_mode = (state.job_meta.run_mode or "").strip().lower()
    has_discussion_source = bool(state.pdf.consideration_prompts) or bool(state.pdf.discussion_text.strip())
    if run_mode not in {"mvp", "update_mvp"}:
        if has_discussion_source and not state.consideration.units:
            state.validation_report.errors.append(
                ValidationIssue(code="missing_discussion_units", message="consideration units are missing")
            )
            state.validation_report.retry_targets.append(
                ValidationIssue(code="retry_discussion", message="retry discussion generation")
            )

    # Assign labels if missing.
    assign_block_labels(state, chapter=chapter)

    # Detect duplicate image usage and backfill captions from analysis if present.
    used_image_ids: set[str] = set()
    for exp in state.experiments:
        for block in exp.blocks:
            if block.type != "figure":
                continue
            image_id = block.figure.figure_image_id
            if not image_id:
                continue
            if image_id in used_image_ids:
                state.validation_report.errors.append(
                    ValidationIssue(code="duplicate_image_block", message="image used in multiple blocks", target=image_id)
                )
            used_image_ids.add(image_id)
            match = next((img for img in state.assets_images if img.image_id == image_id), None)
            if match and match.analysis and match.analysis.caption:
                block.figure.caption = match.analysis.caption

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

        # MVP wants a more explicit narrative: process → table/figure references.
        if run_mode in {"mvp", "update_mvp"}:
            if exp.description_brief.strip() and exp.result_brief.strip():
                continue
            if exp.result_brief.strip():
                parts = [exp.method_summary.strip(), exp.result_brief.strip()]
                exp.description_brief = " ".join([p for p in parts if p]).strip()
                continue
            exp_dump = exp.model_dump()
            blocks = exp_dump.get("blocks") if isinstance(exp_dump.get("blocks"), list) else []
            tbl = next((b for b in blocks if isinstance(b, dict) and b.get("type") == "table"), None)
            fig = next((b for b in blocks if isinstance(b, dict) and b.get("type") == "figure"), None)
            tbl_label = ""
            fig_label = ""
            tbl_rows: list[list[str]] = []
            if isinstance(tbl, dict):
                t = tbl.get("table")
                if isinstance(t, dict):
                    tbl_label = str(t.get("label") or "").strip()
                    rr = t.get("rows")
                    if isinstance(rr, list):
                        tbl_rows = [[str(c or "") for c in (row or [])] for row in rr if isinstance(row, list)]
            if isinstance(fig, dict):
                f = fig.get("figure")
                if isinstance(f, dict):
                    fig_label = str(f.get("label") or "").strip()

            # IMPORTANT (TA feedback):
            # Do not place quantitative conclusions before showing the evidence (table/figure).
            # Keep the pre-evidence text purely procedural + pointers.
            parts: list[str] = []
            if exp.method_summary.strip():
                parts.append(exp.method_summary.strip())
            if tbl_label:
                parts.append(f"測定で得られた値を{tbl_label}に整理し、以下に示す。")
            if fig_label:
                parts.append(f"また、同データの傾向を{fig_label}に示す。")
            exp.description_brief = " ".join([p for p in parts if p]).strip()
        else:
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
