from __future__ import annotations

import re
import uuid
from io import BytesIO
from typing import Any

from core.excel import (
    build_table_from_chart,
    extract_a1_range,
    find_numeric_blocks,
    list_chart_refs,
    load_workbook_bytes,
    table_to_markdown,
    validate_a1_range,
)
from core.past_report import name_similarity
from core.storage import Storage
from core.observations import build_xy_observations
from graph.state import (
    AgentState,
    ExcelFile,
    JobStatus,
    MVPResultDebuginfo,
    PastReportData,
    ValidationIssue,
    now_iso,
)
from llm.client import LLMClient
from models.contracts import (
    BelongsToCandidate,
    FigureBlock,
    FigureContent,
    ImageAnalysis,
    ImageAsset,
    TableBlock,
    TableContent,
)

MAX_MVP_CHARTS_PER_EXCEL = 12
MAX_MVP_CANDIDATES_PER_EXCEL = 16
# Require HITL confirmation when past-report name match confidence is low.
PAST_REPORT_MATCH_MIN = 0.25


def _iter_past_reports(state: AgentState) -> list[PastReportData]:
    if state.past_reports:
        return list(state.past_reports)
    if state.past_report.storage_key:
        return [state.past_report]
    return []


def _match_past_report_hint(
    *,
    exp_name: str,
    past_reports: list[PastReportData],
) -> tuple[dict[str, Any] | None, float]:
    best_score = 0.0
    best_payload: dict[str, Any] | None = None
    for report in past_reports:
        if not report.hints_ready or not report.hints:
            continue
        for hint in report.hints:
            hint_name = ""
            if isinstance(hint, dict):
                hint_name = str(hint.get("name") or "")
            else:
                hint_name = str(getattr(hint, "name", "") or "")
            score = name_similarity(exp_name, hint_name)
            if score <= best_score:
                continue
            try:
                payload = hint.model_dump()
            except Exception:
                payload = dict(hint) if isinstance(hint, dict) else {}
            payload["match_score"] = score
            payload["source_report_id"] = report.report_id
            payload["source_report_filename"] = report.filename
            best_score = score
            best_payload = payload
    return best_payload, best_score


def _parse_float(value: str) -> float | None:
    s = (value or "").strip()
    if not s:
        return None
    s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return None


_SETPOINT_LIST_RE = re.compile(
    r"(?P<var>[A-Za-z][A-Za-z0-9_]*)\s*(?:=|を)\s*(?P<vals>[0-9][0-9\s,\.／/、]+?)\s*(?P<unit>μA|uA|mA|A|V|Hz|kHz|Ω|ohm|Ohm)",
    re.IGNORECASE,
)
_PREFERRED_FIRST_EXPERIMENT_RE = re.compile(r"^4\.1(?:\.|$)")


def _normalize_exp_key(value: str) -> str:
    return (value or "").strip().replace("．", ".").replace("。", ".")


def _extract_driver_setpoints(method_summary: str) -> dict[str, object]:
    """
    Best-effort extraction of "driver" setpoints from method_summary, e.g.:
      "IB=0, 20, 40, 60 μA"
    Returns a JSON-serializable dict:
      {name, unit, values:[...]} or {} when not found.
    """
    s = (method_summary or "").replace("\n", " ").strip()
    m = _SETPOINT_LIST_RE.search(s)
    if not m:
        return {}
    var = (m.group("var") or "").strip()
    unit = (m.group("unit") or "").strip()
    raw_vals = (m.group("vals") or "").replace(" ", "")
    parts = [p for p in re.split(r"[,／/、]+", raw_vals) if p]
    values: list[float] = []
    for p in parts:
        try:
            values.append(float(p))
        except Exception:
            continue
    # De-dup while preserving order.
    seen: set[float] = set()
    uniq: list[float] = []
    for v in values:
        if v in seen:
            continue
        seen.add(v)
        uniq.append(v)
    if len(uniq) < 2:
        return {}
    return {"name": var, "unit": unit, "values": uniq}


_HEADER_VAR_RE = re.compile(r"^(?P<name>[^\[\(]+)[\[\(](?P<unit>[^\]\)]+)[\]\)]$")


def _parse_header_var(cell: str) -> tuple[str, str] | None:
    s = str(cell or "").strip()
    if not s:
        return None
    m = _HEADER_VAR_RE.match(s)
    if not m:
        return None
    name = (m.group("name") or "").strip()
    unit = (m.group("unit") or "").strip()
    if not name:
        return None
    return name, unit


def _infer_xy_series(
    table_rows: list[list[str]],
    *,
    driver: dict[str, object] | None = None,
) -> tuple[dict[str, str], list[dict[str, Any]]]:
    """
    Interpret a common lab table layout:
      (colX, colX+1), (colY, colY+1), ... are repeated (x, y) pairs.
    Variable names/units are inferred from header cells when they look like "Vce[V]".
    Returns per-series dicts with points and missing summary.
    """
    if not table_rows or len(table_rows) < 2:
        return {}, []
    header = table_rows[0] if isinstance(table_rows[0], list) else []
    body = [r for r in table_rows[1:] if isinstance(r, list)]
    if not body:
        return {}, []
    expected_rows = len(body)

    pair_starts: list[int] = []
    x_name = ""
    x_unit = ""
    y_name = ""
    y_unit = ""

    # Prefer header detection:
    # 1) Find the most frequent consecutive (x,y) header pair like "Vce[V]" + "Ic[mA]" repeated across columns.
    pair_counts: dict[tuple[str, str, str, str], int] = {}
    for start in range(0, max(0, len(header) - 1)):
        hv1 = _parse_header_var(str(header[start] or ""))
        hv2 = _parse_header_var(str(header[start + 1] or ""))
        if not hv1 or not hv2:
            continue
        key = (hv1[0], hv1[1], hv2[0], hv2[1])
        pair_counts[key] = pair_counts.get(key, 0) + 1

    chosen_key = max(pair_counts.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    if chosen_key:
        x_name, x_unit, y_name, y_unit = chosen_key
        for start in range(0, max(0, len(header) - 1)):
            hv1 = _parse_header_var(str(header[start] or ""))
            hv2 = _parse_header_var(str(header[start + 1] or ""))
            if not hv1 or not hv2:
                continue
            if (hv1[0], hv1[1], hv2[0], hv2[1]) == chosen_key:
                pair_starts.append(start)

    volt_units = {"v", "mv"}
    curr_units = {"a", "ma", "ua", "μa"}
    swap_xy = (x_unit or "").strip().lower() in curr_units and (y_unit or "").strip().lower() in volt_units
    if swap_xy and x_name and y_name:
        x_name, y_name = y_name, x_name
        x_unit, y_unit = y_unit, x_unit

    if not pair_starts:
        # Fallback: assume alternating pairs from col1.
        max_cols = max((len(r) for r in body), default=0)
        for start in range(0, max_cols - 1, 2):
            pair_starts.append(start)

    series_out: list[dict[str, Any]] = []
    for idx, start in enumerate(pair_starts, start=1):
        if not x_name or not y_name:
            hv1 = _parse_header_var(str(header[start] or "")) if len(header) > start else None
            hv2 = _parse_header_var(str(header[start + 1] or "")) if len(header) > start + 1 else None
            if hv1 and hv2:
                x_name, x_unit = hv1
                y_name, y_unit = hv2

        points: list[tuple[float, float]] = []
        missing_targets: list[str] = []
        for r in body:
            x_raw = r[start] if len(r) > start else ""
            y_raw = r[start + 1] if len(r) > start + 1 else ""
            if swap_xy:
                x_raw, y_raw = y_raw, x_raw
            vce = _parse_float(x_raw)
            ic = _parse_float(y_raw)
            if vce is None or ic is None:
                # record missing with target Vce when available
                if len(r) > 0 and str(r[0] or "").strip():
                    missing_targets.append(str(r[0]).strip())
                continue
            points.append((vce, ic))

        if not points and not missing_targets:
            continue

        name = f"系列{idx}"
        if driver and isinstance(driver.get("values"), list) and isinstance(driver.get("name"), str) and isinstance(driver.get("unit"), str):
            vals = driver.get("values") or []
            if (idx - 1) < len(vals):
                try:
                    v = float(vals[idx - 1])
                    name = f"{driver.get('name')}={v:g} {driver.get('unit')}"
                except Exception:
                    pass

        series_out.append(
            {
                "index": idx,
                "name": name,
                "points": points,
                "missing_targets": missing_targets[:8],
                "missing_count": len(missing_targets),
                "expected_rows": expected_rows,
            }
        )

    meta = {"x_name": x_name or "X", "x_unit": x_unit, "y_name": y_name or "Y", "y_unit": y_unit}
    return meta, series_out


def _nearest_point(points: list[tuple[float, float]], x0: float) -> tuple[float, float] | None:
    if not points:
        return None
    return min(points, key=lambda p: abs(p[0] - x0))


def _render_plot_png(
    *,
    x: list[float],
    series: list[tuple[str, list[float]]],
    title: str = "",
    x_label: str = "",
    y_label: str = "",
) -> bytes:
    """
    Render a simple plot without NumPy/matplotlib (for portability).
    """
    import math

    from PIL import Image, ImageDraw, ImageFont

    width, height = 960, 548  # ~1.75 aspect ratio (matches docx target box)
    margin_l, margin_r, margin_t, margin_b = 80, 24, 54, 70
    plot_w = max(1, width - margin_l - margin_r)
    plot_h = max(1, height - margin_t - margin_b)

    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = None
    font_bold = None
    try:
        import os
        from pathlib import Path

        font_path_env = (os.environ.get("REPORT_AGENT_PLOT_FONT_PATH") or "").strip()
        candidates: list[str] = []
        if font_path_env:
            candidates.append(font_path_env)

        # macOS common Japanese fonts (Mincho first).
        candidates.extend(
            [
                "/System/Library/Fonts/ヒラギノ明朝 ProN W3.otf",
                "/System/Library/Fonts/ヒラギノ明朝 ProN W6.otf",
                "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",
                "/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.otf",
                "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
                "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
            ]
        )

        chosen = next((p for p in candidates if p and Path(p).exists()), "")
        if chosen:
            font = ImageFont.truetype(chosen, size=16)
            font_bold = ImageFont.truetype(chosen, size=18)
    except Exception:
        font = None
        font_bold = None

    if font is None:
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
    if font_bold is None:
        font_bold = font

    def _is_valid(v: float) -> bool:
        return v is not None and not math.isnan(v) and math.isfinite(v)

    xs = [v for v in x if _is_valid(v)]
    ys_all: list[float] = []
    for _, ys in series:
        ys_all.extend([v for v in ys if _is_valid(v)])

    if not xs or not ys_all:
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys_all), max(ys_all)
    if abs(max_x - min_x) < 1e-12:
        max_x = min_x + 1.0
    if abs(max_y - min_y) < 1e-12:
        max_y = min_y + 1.0

    # Small padding for nicer visuals.
    pad_x = (max_x - min_x) * 0.03
    pad_y = (max_y - min_y) * 0.06
    min_x -= pad_x
    max_x += pad_x
    min_y -= pad_y
    max_y += pad_y

    def to_px(xx: float, yy: float) -> tuple[int, int]:
        px = margin_l + int((xx - min_x) / (max_x - min_x) * plot_w)
        py = margin_t + int((max_y - yy) / (max_y - min_y) * plot_h)
        return px, py

    # Axes (no frame)
    axis_color = (30, 30, 30)
    grid_color = (220, 220, 220)

    x_axis_y = margin_t + plot_h
    y_axis_x = margin_l
    draw.line([(margin_l, x_axis_y), (margin_l + plot_w, x_axis_y)], fill=axis_color, width=2)
    draw.line([(y_axis_x, margin_t), (y_axis_x, margin_t + plot_h)], fill=axis_color, width=2)

    # No background grid lines

    palette = [
        (31, 119, 180),
        (255, 127, 14),
        (44, 160, 44),
        (214, 39, 40),
        (148, 103, 189),
        (140, 86, 75),
    ]

    # Scatter points
    for idx, (name, ys) in enumerate(series[:6]):
        color = palette[idx % len(palette)]
        last = None
        for xx, yy in zip(x, ys):
            if not _is_valid(xx) or not _is_valid(yy):
                last = None
                continue
            pt = to_px(xx, yy)
            r = 3
            draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color, outline=color)
            last = pt

    # Title removed by request

    # Axis labels
    if x_label:
        text = str(x_label)[:60]
        tw = draw.textlength(text, font=font) if hasattr(draw, "textlength") else None
        tx = int(margin_l + (plot_w - (tw or 0)) / 2) if tw else margin_l
        draw.text((tx, margin_t + plot_h + 30), text, fill=axis_color, font=font)

    if y_label:
        text = str(y_label)[:60]
        try:
            label_img = Image.new("RGBA", (200, 28), (255, 255, 255, 0))
            label_draw = ImageDraw.Draw(label_img)
            label_draw.text((0, 0), text, fill=axis_color, font=font)
            rotated = label_img.rotate(90, expand=True)
            ry = margin_t + int((plot_h - rotated.height) / 2)
            img.paste(rotated, (14, ry), rotated)
        except Exception:
            draw.text((8, margin_t + int(plot_h / 2)), text, fill=axis_color, font=font)

    # Ticks and numeric labels (8 intervals)
    tick_count = 8
    for i in range(tick_count + 1):
        # X axis
        xt = min_x + (max_x - min_x) * i / float(tick_count)
        px = margin_l + int(plot_w * i / float(tick_count))
        draw.line([(px, x_axis_y), (px, x_axis_y + 6)], fill=axis_color, width=2)
        x_text = str(int(round(xt)))
        tw = draw.textlength(x_text, font=font) if hasattr(draw, "textlength") else None
        tx = px - int((tw or 0) / 2)
        draw.text((tx, x_axis_y + 10), x_text, fill=axis_color, font=font)

        # Y axis
        yt = min_y + (max_y - min_y) * i / float(tick_count)
        py = margin_t + int(plot_h * (tick_count - i) / float(tick_count))
        draw.line([(y_axis_x - 6, py), (y_axis_x, py)], fill=axis_color, width=2)
        y_text = str(int(round(yt)))
        tw = draw.textlength(y_text, font=font) if hasattr(draw, "textlength") else None
        tx = y_axis_x - 10 - int(tw or 0)
        draw.text((tx, py - 8), y_text, fill=axis_color, font=font)

    # Legend
    if len(series) > 1:
        lx = margin_l + plot_w - 220
        ly = 18
        for idx, (name, _) in enumerate(series[:6]):
            color = palette[idx % len(palette)]
            y = ly + idx * 16
            draw.rectangle([lx, y + 3, lx + 10, y + 13], fill=color, outline=color)
            draw.text((lx + 14, y), (name or f"y{idx+1}")[:24], fill=axis_color, font=font)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _render_vce_ic_plot_png(*, series: list[dict[str, Any]], title: str = "", x_label: str = "X", y_label: str = "Y") -> bytes:
    """
    Render IC-VCE curves for each series: series[i]["points"] is [(vce, ic), ...].
    """
    import math

    from PIL import Image, ImageDraw, ImageFont

    width, height = 980, 560
    legend_w = 240 if len(series) > 1 else 0
    margin_l, margin_r, margin_t, margin_b = 90, 24 + legend_w, 64, 80
    plot_w = max(1, width - margin_l - margin_r)
    plot_h = max(1, height - margin_t - margin_b)

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    font = None
    font_bold = None
    try:
        import os
        from pathlib import Path

        font_path_env = (os.environ.get("REPORT_AGENT_PLOT_FONT_PATH") or "").strip()
        candidates: list[str] = []
        if font_path_env:
            candidates.append(font_path_env)
        candidates.extend(
            [
                "/System/Library/Fonts/ヒラギノ明朝 ProN W3.otf",
                "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",
                "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
            ]
        )
        chosen = next((p for p in candidates if p and Path(p).exists()), "")
        if chosen:
            font = ImageFont.truetype(chosen, size=16)
            font_bold = ImageFont.truetype(chosen, size=18)
    except Exception:
        font = None
        font_bold = None
    if font is None:
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
    if font_bold is None:
        font_bold = font

    def _is_valid(v: float) -> bool:
        return v is not None and not math.isnan(v) and math.isfinite(v)

    all_points: list[tuple[float, float]] = []
    for s in series:
        pts = s.get("points")
        if isinstance(pts, list):
            for p in pts:
                if isinstance(p, tuple) and len(p) == 2 and _is_valid(p[0]) and _is_valid(p[1]):
                    all_points.append((float(p[0]), float(p[1])))
    if not all_points:
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    xs = [p[0] for p in all_points]
    ys = [p[1] for p in all_points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    if abs(max_x - min_x) < 1e-12:
        max_x = min_x + 1.0
    if abs(max_y - min_y) < 1e-12:
        max_y = min_y + 1.0

    pad_x = (max_x - min_x) * 0.04
    pad_y = (max_y - min_y) * 0.08
    min_x -= pad_x
    max_x += pad_x
    min_y -= pad_y
    max_y += pad_y

    def to_px(xx: float, yy: float) -> tuple[int, int]:
        px = margin_l + int((xx - min_x) / (max_x - min_x) * plot_w)
        py = margin_t + int((max_y - yy) / (max_y - min_y) * plot_h)
        return px, py

    axis_color = (25, 25, 25)
    grid_color = (225, 225, 225)
    draw.rectangle([margin_l, margin_t, margin_l + plot_w, margin_t + plot_h], outline=axis_color, width=2)

    for i in range(1, 5):
        xg = margin_l + int(plot_w * i / 5)
        yg = margin_t + int(plot_h * i / 5)
        draw.line([(xg, margin_t), (xg, margin_t + plot_h)], fill=grid_color, width=1)
        draw.line([(margin_l, yg), (margin_l + plot_w, yg)], fill=grid_color, width=1)

    # Axis labels
    draw.text((margin_l, margin_t + plot_h + 18), str(x_label)[:28], fill=axis_color, font=font)
    draw.text((12, margin_t), str(y_label)[:28], fill=axis_color, font=font)

    # Title
    if title:
        text = str(title)[:60]
        tw = draw.textlength(text, font=font_bold) if hasattr(draw, "textlength") else None
        tx = int((width - (tw or 0)) / 2) if tw else margin_l
        draw.text((tx, 20), text, fill=axis_color, font=font_bold)

    palette = [
        (31, 119, 180),
        (214, 39, 40),
        (44, 160, 44),
        (148, 103, 189),
        (255, 127, 14),
        (140, 86, 75),
    ]

    for idx, s in enumerate(series[:6]):
        pts = s.get("points") if isinstance(s.get("points"), list) else []
        pts2 = [(float(a), float(b)) for a, b in pts if _is_valid(a) and _is_valid(b)]
        pts2 = sorted(pts2, key=lambda p: p[0])
        if len(pts2) < 1:
            continue
        color = palette[idx % len(palette)]
        for xx, yy in pts2:
            pt = to_px(xx, yy)
            # Scatter only (do NOT connect points): prevents implicit "continuous curve" claim.
            r = 4
            draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color, outline=color)

    # Legend in right margin (no overlap with plot frame).
    if len(series) > 1:
        lx = margin_l + plot_w + 18
        ly = margin_t + 12
        for idx, s in enumerate(series[:6]):
            color = palette[idx % len(palette)]
            y = ly + idx * 22
            draw.rectangle([lx, y + 5, lx + 12, y + 17], fill=color, outline=color)
            name = str(s.get("name") or f"series_{idx+1}")
            draw.text((lx + 18, y + 2), name[:22], fill=axis_color, font=font)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def excel_mvp(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    """
    MVP:
    - Pick "first experiment" via LLM.
    - Select a results table from Excel (chart-ref preferred, else numeric block candidate).
    - Build table block + generate a plot image.
    - Keep everything debuggable via state.mvp and snapshots.
    """
    state.job_meta.run_mode = (state.job_meta.run_mode or "mvp").strip() or "mvp"
    state.job_meta.updated_at = now_iso()
    state.mvp.hitl_required = False
    state.mvp.hitl_code = ""
    state.mvp.hitl_message = ""
    state.mvp.results = []

    if not state.experiments:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="missing_experiments", message="No experiments were extracted"))
        return state

    excel_sources: list[ExcelFile] = list(state.excel_files)
    if not excel_sources and state.excel.storage_key:
        excel_sources.append(
            ExcelFile(
                excel_id="primary",
                filename=state.excel.filename,
                storage_key=state.excel.storage_key,
                upload_index=0,
            )
        )

    if not excel_sources:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="missing_excel", message="Excel (.xlsx) was not uploaded"))
        return state

    past_reports = _iter_past_reports(state)

    # 1) Pick "first experiment".
    preferred = None
    if len(state.experiments) >= 2:
        first_key = _normalize_exp_key(str(state.experiments[0].source_idx or ""))
        second_key = _normalize_exp_key(str(state.experiments[1].source_idx or ""))
        if first_key == "4.1" and second_key == "4.1.1":
            preferred = state.experiments[1]

    if preferred is None:
        preferred = next(
            (e for e in state.experiments if _PREFERRED_FIRST_EXPERIMENT_RE.match(_normalize_exp_key(str(e.source_idx or "")))),
            None,
        )

    if preferred is not None:
        chosen = preferred
        state.mvp.first_experiment_exp_key = chosen.source_idx or chosen.idx
        if _normalize_exp_key(str(chosen.source_idx or "")) == "4.1.1":
            state.mvp.first_experiment_rationale = "Rule: when ordered 4.1 then 4.1.1, prioritize 4.1.1."
        else:
            state.mvp.first_experiment_rationale = "Rule: prioritize 4.1."
    else:
        exp_payload = []
        for exp in state.experiments:
            item = {"exp_key": exp.source_idx or exp.idx, "title": exp.name, "method_summary": exp.method_summary}
            if past_reports:
                hint_payload, _score = _match_past_report_hint(exp_name=exp.name, past_reports=past_reports)
                if hint_payload:
                    item["past_report_hint"] = hint_payload
            exp_payload.append(item)
        choice = llm.mvp_first_experiment(payload={"experiments": exp_payload})
        chosen_key = (choice.exp_key or "").strip()
        chosen = next((e for e in state.experiments if e.source_idx == chosen_key or e.idx == chosen_key), None)
        if chosen is None:
            chosen = state.experiments[0]

        state.mvp.first_experiment_exp_key = chosen.source_idx or chosen.idx
        state.mvp.first_experiment_rationale = (choice.rationale or "").strip()

    # MVP scope: only this experiment.
    chosen.blocks = []
    chosen.quant_comment = ""
    state.experiments = [chosen]

    if past_reports and any(r.hints_ready and r.hints for r in past_reports):
        _chosen_hint, chosen_score = _match_past_report_hint(exp_name=chosen.name, past_reports=past_reports)
        if chosen_score < PAST_REPORT_MATCH_MIN:
            state.mvp.hitl_required = True
            state.mvp.hitl_code = "hitl_past_report_mismatch"
            state.mvp.hitl_message = (
                f"Past report may not match current experiment: '{chosen.name}'. "
                f"Best match score={chosen_score:.2f}. Confirm past report selection."
            )

    # 2) Parse workbooks, gather candidates across uploaded Excel files.
    workbooks_by_id: dict[str, Any] = {}
    charts_by_excel_id: dict[str, list[Any]] = {}
    excel_meta_by_id: dict[str, dict[str, str]] = {}
    candidates_payload: list[dict[str, Any]] = []
    charts_payload: list[dict[str, Any]] = []

    for excel in excel_sources:
        excel_id = str(excel.excel_id or "").strip()
        if not excel_id:
            continue
        excel_meta_by_id[excel_id] = {"filename": excel.filename, "storage_key": excel.storage_key}
        xlsx_bytes = storage.get_bytes(excel.storage_key)
        wb = load_workbook_bytes(xlsx_bytes)
        workbooks_by_id[excel_id] = wb

        charts = list_chart_refs(wb)
        charts_by_excel_id[excel_id] = charts
        for ch in charts[:MAX_MVP_CHARTS_PER_EXCEL]:
            charts_payload.append(
                {
                    "excel_id": excel_id,
                    "excel_filename": excel.filename,
                    "chart_id": ch.chart_id,
                    "sheet": ch.sheet,
                    "chart_type": ch.chart_type,
                    "title": ch.title,
                    "series": [
                        {"sheet": s.sheet, "values_range": s.values_range, "x_range": s.x_range, "title": s.title}
                        for s in ch.series[:8]
                    ],
                }
            )

        cand_count = 0
        for ws in wb.worksheets:
            for cand in find_numeric_blocks(ws):
                candidates_payload.append(
                    {
                        "excel_id": excel_id,
                        "excel_filename": excel.filename,
                        "sheet": cand.sheet,
                        "a1_range": cand.a1_range,
                        "numeric_cells": cand.numeric_cells,
                        "total_cells": cand.total_cells,
                        "preview_rows": cand.preview_rows,
                    }
                )
                cand_count += 1
                if cand_count >= MAX_MVP_CANDIDATES_PER_EXCEL:
                    break
            if cand_count >= MAX_MVP_CANDIDATES_PER_EXCEL:
                break

    state.mvp.excel_candidates = candidates_payload
    state.mvp.excel_charts = charts_payload

    exp_key = chosen.source_idx or chosen.idx
    remaining_candidates = candidates_payload[:]
    remaining_charts = charts_payload[:]
    selections: list[dict[str, Any]] = []
    max_iters = len(remaining_candidates) + len(remaining_charts)

    for _ in range(max_iters):
        if not remaining_candidates and not remaining_charts:
            break

        payload = {
            "experiment": {"exp_key": exp_key, "title": chosen.name, "method_summary": chosen.method_summary},
            "charts": remaining_charts,
            "candidates": remaining_candidates,
        }
        if past_reports:
            hint_payload, _score = _match_past_report_hint(exp_name=chosen.name, past_reports=past_reports)
            if hint_payload:
                payload["past_report_hint"] = hint_payload

        selection = llm.excel_select(payload=payload)
        if getattr(selection, "stop", False):
            break

        selected_excel_id = str(getattr(selection, "excel_id", "") or "").strip()
        if not selected_excel_id:
            if len(workbooks_by_id) == 1:
                selected_excel_id = next(iter(workbooks_by_id))
            else:
                break
        if selected_excel_id not in workbooks_by_id:
            break

        wb = workbooks_by_id[selected_excel_id]
        excel_filename = excel_meta_by_id.get(selected_excel_id, {}).get("filename", "")

        table_rows: list[list[str]] = []
        used_sheet = ""
        used_range = ""

        if (selection.selection_type == "chart") and selection.chart_id:
            charts = charts_by_excel_id.get(selected_excel_id, [])
            chart = next((c for c in charts if c.chart_id == selection.chart_id), None)
            if chart is None:
                break
            table_rows = build_table_from_chart(wb, chart)
            used_sheet = chart.sheet
            used_range = f"(chart) {chart.chart_id}"
            remaining_charts = [
                c for c in remaining_charts if not (c.get("excel_id") == selected_excel_id and c.get("chart_id") == selection.chart_id)
            ]
        else:
            sheet = (selection.sheet or "").strip()
            a1 = (selection.a1_range or "").strip().upper().replace(" ", "")
            chosen_candidate = None
            if sheet and a1:
                chosen_candidate = next(
                    (
                        c
                        for c in remaining_candidates
                        if c.get("excel_id") == selected_excel_id and c.get("sheet") == sheet and c.get("a1_range") == a1
                    ),
                    None,
                )
            if chosen_candidate is None and sheet:
                chosen_candidate = next(
                    (c for c in remaining_candidates if c.get("excel_id") == selected_excel_id and c.get("sheet") == sheet),
                    None,
                )
            if chosen_candidate is None and remaining_candidates:
                chosen_candidate = next((c for c in remaining_candidates if c.get("excel_id") == selected_excel_id), None)

            if chosen_candidate:
                sheet = chosen_candidate.get("sheet") or ""
                a1 = chosen_candidate.get("a1_range") or ""

            if not sheet or sheet not in wb.sheetnames:
                sheet = wb.sheetnames[0] if wb.sheetnames else ""
            if not sheet:
                break
            ws = wb[sheet]

            a1 = (a1 or "").strip().upper().replace(" ", "")
            if not validate_a1_range(a1):
                a1 = str(ws.calculate_dimension() or "").strip().upper().replace(" ", "")
                if a1 and ":" not in a1:
                    a1 = f"{a1}:{a1}"

            table_rows = extract_a1_range(ws, a1, max_rows=200, max_cols=40)
            used_sheet = sheet
            used_range = a1
            remaining_candidates = [
                c
                for c in remaining_candidates
                if not (
                    c.get("excel_id") == selected_excel_id
                    and c.get("sheet") == used_sheet
                    and c.get("a1_range") == used_range
                )
            ]

        if not table_rows:
            break

        selection_dump: dict[str, Any] = {}
        try:
            selection_dump = selection.model_dump()
        except Exception:
            selection_dump = {}

        selections.append(
            {
                "selection": selection,
                "selection_dump": selection_dump,
                "table_rows": table_rows,
                "used_sheet": used_sheet,
                "used_range": used_range,
                "excel_id": selected_excel_id,
                "excel_filename": excel_filename,
            }
        )

    if not selections:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="excel_extract_failed", message="Could not extract a non-empty table from Excel")
        )
        return state

    driver = _extract_driver_setpoints(chosen.method_summary)
    manual_images = [img for img in state.assets_images if img.analysis is None and not img.assigned_to]
    manual_images.sort(key=lambda img: int(getattr(img, "upload_index", 0) or 0))
    table_blocks: list[TableBlock] = []
    figure_blocks: list[FigureBlock] = []

    for idx, picked in enumerate(selections, start=1):
        table_rows = picked["table_rows"]
        used_sheet = picked["used_sheet"]
        used_range = picked["used_range"]
        selection = picked["selection"]
        selection_dump = picked["selection_dump"]
        excel_id = picked.get("excel_id") or ""
        excel_filename = picked.get("excel_filename") or ""

        meta, xy_series = _infer_xy_series(table_rows, driver=driver or None)

        # Always use Japanese captions for report consistency (avoid "generated/copy-paste" suspicion).
        # Keep them deterministic and aligned with the experiment text.
        driver_name = str(driver.get("name") or "").strip() if isinstance(driver, dict) else ""
        x_name = str(meta.get("x_name") or "X").strip()
        y_name = str(meta.get("y_name") or "Y").strip()
        table_caption = f"{chosen.name}：{driver_name + '別の' if driver_name else ''}{x_name}と{y_name}の測定結果"
        # NOTE: ImageAnalysis.caption is constrained (<=15 chars) for UI consistency; keep short & generic.
        figure_caption = f"{y_name}-{x_name}測定"

        observations: dict[str, Any] = {}
        plot_x_label = ""
        plot_y_label = ""
        plot_title = ""

        if xy_series:
            x_unit = str(meta.get("x_unit") or "").strip()
            y_unit = str(meta.get("y_unit") or "").strip()
            plot_x_label = f"{x_name} [{x_unit}]".strip() if x_unit else x_name
            plot_y_label = f"{y_name} [{y_unit}]".strip() if y_unit else y_name
            plot_title = chosen.name
            observations = build_xy_observations(
                experiment_key=exp_key,
                experiment_title=chosen.name,
                x_name=x_name,
                x_unit=x_unit,
                y_name=y_name,
                y_unit=y_unit,
                driver=driver if isinstance(driver, dict) else None,
                series=xy_series,
                probe_x=None,
                region_x_min=None,
            )

        result_debug = MVPResultDebuginfo(
            excel_id=str(excel_id or ""),
            excel_filename=str(excel_filename or ""),
            selection_type=str(getattr(selection, "selection_type", "") or ""),
            chart_id=str(getattr(selection, "chart_id", "") or ""),
            sheet=used_sheet,
            a1_range=used_range,
            rationale=str(getattr(selection, "rationale", "") or "").strip(),
            table_markdown=table_to_markdown(table_rows, max_rows=40, max_cols=16),
            table_rows=table_rows[:60],
            plot_kind="",
            plot_x_label=plot_x_label,
            plot_y_label=plot_y_label,
            plot_title=plot_title,
            observations=observations,
        )

        table_blocks.append(
            TableBlock(
                table=TableContent(
                    asset_upload_index=None,
                    label="",
                    caption=table_caption,
                    rows=table_rows,
                    quant_comment="",
                )
            )
        )

        if xy_series:
            png = _render_vce_ic_plot_png(
                series=xy_series,
                title=plot_title,
                x_label=plot_x_label,
                y_label=plot_y_label,
            )

            image_id = uuid.uuid4().hex
            img_key = f"jobs/{state.job_meta.job_id}/generated/plots/{image_id}.png"
            storage.put_bytes(img_key, png)

            upload_index = state.job_meta.next_upload_index
            state.job_meta.next_upload_index += 1

            img_asset = ImageAsset(
                image_id=image_id,
                filename=f"{image_id}.png",
                mime_type="image/png",
                storage_key=img_key,
                upload_index=upload_index,
                analysis=ImageAnalysis(
                    caption=figure_caption,
                    quant_comment="",
                    belongs_to=[BelongsToCandidate(exp_key=exp_key, score=1.0, rationale="generated from selected table")],
                    result_summary="表データから傾向を可視化した。",
                    ocr_text="",
                    assigned_exp_key=exp_key,
                    assigned_score=1.0,
                    assigned_rationale="MVP: attach generated plot to the first experiment",
                ),
                assigned_to=exp_key,
            )
            state.assets_images.append(img_asset)
            figure_blocks.append(
                FigureBlock(
                    figure=FigureContent(
                        figure_image_id=image_id,
                        asset_upload_index=upload_index,
                        label="",
                        caption=figure_caption,
                        quant_comment="",
                    )
                )
            )
            result_debug.image_id = image_id
            result_debug.image_source = "generated"
        else:
            if manual_images:
                manual = manual_images.pop(0)
                manual.analysis = ImageAnalysis(
                    caption=figure_caption,
                    quant_comment="",
                    belongs_to=[BelongsToCandidate(exp_key=exp_key, score=1.0, rationale="user provided result image")],
                    result_summary="ユーザー提供画像を結果図として使用。",
                    ocr_text="",
                    assigned_exp_key=exp_key,
                    assigned_score=1.0,
                    assigned_rationale="HITL: attach user-provided image",
                )
                manual.assigned_to = exp_key
                figure_blocks.append(
                    FigureBlock(
                        figure=FigureContent(
                            figure_image_id=manual.image_id,
                            asset_upload_index=manual.upload_index,
                            label="",
                            caption=figure_caption,
                            quant_comment="",
                        )
                    )
                )
                result_debug.image_id = manual.image_id
                result_debug.image_source = "manual"
            else:
                result_debug.image_source = "none"

        state.mvp.results.append(result_debug)

        if idx == 1:
            state.mvp.excel_filename = str(excel_filename or "")
            state.mvp.excel_sheet = used_sheet
            state.mvp.excel_range = used_range
            state.mvp.excel_rationale = str(getattr(selection, "rationale", "") or "").strip()
            state.mvp.excel_selection = selection_dump or {}
            state.mvp.table_rows = table_rows[:60]
            state.mvp.table_markdown = table_to_markdown(table_rows, max_rows=40, max_cols=16)
            state.mvp.plot_x_label = plot_x_label
            state.mvp.plot_y_label = plot_y_label
            state.mvp.plot_title = plot_title
            state.mvp.observations = observations

    chosen.blocks = table_blocks + figure_blocks
    chosen.quant_comment = ""

    state.job_meta.updated_at = now_iso()
    return state
