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
from core.storage import Storage
from core.observations import build_xy_observations
from graph.state import AgentState, JobStatus, ValidationIssue, now_iso
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


def _render_plot_png(*, x: list[float], series: list[tuple[str, list[float]]], title: str = "") -> bytes:
    """
    Render a simple plot without NumPy/matplotlib (for portability).
    """
    import math

    from PIL import Image, ImageDraw, ImageFont

    width, height = 960, 548  # ~1.75 aspect ratio (matches docx target box)
    margin_l, margin_r, margin_t, margin_b = 80, 24, 54, 70
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

    # Axes
    axis_color = (30, 30, 30)
    grid_color = (220, 220, 220)
    draw.rectangle([margin_l, margin_t, margin_l + plot_w, margin_t + plot_h], outline=axis_color, width=2)

    # Grid (5x5)
    for i in range(1, 5):
        xg = margin_l + int(plot_w * i / 5)
        yg = margin_t + int(plot_h * i / 5)
        draw.line([(xg, margin_t), (xg, margin_t + plot_h)], fill=grid_color, width=1)
        draw.line([(margin_l, yg), (margin_l + plot_w, yg)], fill=grid_color, width=1)

    palette = [
        (31, 119, 180),
        (255, 127, 14),
        (44, 160, 44),
        (214, 39, 40),
        (148, 103, 189),
        (140, 86, 75),
    ]

    # Series lines
    for idx, (name, ys) in enumerate(series[:6]):
        color = palette[idx % len(palette)]
        last = None
        for xx, yy in zip(x, ys):
            if not _is_valid(xx) or not _is_valid(yy):
                last = None
                continue
            pt = to_px(xx, yy)
            if last is not None:
                draw.line([last, pt], fill=color, width=3)
            r = 3
            draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color, outline=color)
            last = pt

    # Title
    if title:
        text = str(title)[:60]
        tw = draw.textlength(text, font=font_bold) if hasattr(draw, "textlength") else None
        tx = int((width - (tw or 0)) / 2) if tw else margin_l
        draw.text((tx, 18), text, fill=axis_color, font=font_bold)

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

    if not state.experiments:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="missing_experiments", message="No experiments were extracted"))
        return state

    if not state.excel.storage_key:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="missing_excel", message="Excel (.xlsx) was not uploaded"))
        return state

    # 1) Pick "first experiment".
    exp_payload = [
        {"exp_key": exp.source_idx or exp.idx, "title": exp.name, "method_summary": exp.method_summary}
        for exp in state.experiments
    ]
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

    # 2) Parse workbook, gather candidates.
    xlsx_bytes = storage.get_bytes(state.excel.storage_key)
    wb = load_workbook_bytes(xlsx_bytes)

    charts = list_chart_refs(wb)
    candidates: list[dict[str, Any]] = []
    for ws in wb.worksheets:
        for cand in find_numeric_blocks(ws):
            candidates.append(
                {
                    "sheet": cand.sheet,
                    "a1_range": cand.a1_range,
                    "numeric_cells": cand.numeric_cells,
                    "total_cells": cand.total_cells,
                    "preview_rows": cand.preview_rows,
                }
            )

    charts_payload: list[dict[str, Any]] = []
    for ch in charts[:12]:
        charts_payload.append(
            {
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

    state.mvp.excel_candidates = candidates[:16]
    state.mvp.excel_charts = charts_payload

    exp_key = chosen.source_idx or chosen.idx
    selection = llm.excel_select(
        payload={
            "experiment": {"exp_key": exp_key, "title": chosen.name, "method_summary": chosen.method_summary},
            "charts": charts_payload,
            "candidates": candidates[:16],
        }
    )

    try:
        state.mvp.excel_selection = selection.model_dump()
    except Exception:
        state.mvp.excel_selection = {}

    state.mvp.excel_rationale = (selection.rationale or "").strip()

    table_rows: list[list[str]] = []
    used_sheet = ""
    used_range = ""

    if (selection.selection_type == "chart") and selection.chart_id:
        chart = next((c for c in charts if c.chart_id == selection.chart_id), None)
        if chart is not None:
            table_rows = build_table_from_chart(wb, chart)
            used_sheet = chart.sheet
            used_range = f"(chart) {chart.chart_id}"

    if not table_rows:
        sheet = (selection.sheet or "").strip()
        if not sheet or sheet not in wb.sheetnames:
            sheet = candidates[0]["sheet"] if candidates else wb.sheetnames[0]
        ws = wb[sheet]

        a1 = (selection.a1_range or "").strip().upper().replace(" ", "")
        if not validate_a1_range(a1):
            a1 = candidates[0]["a1_range"] if candidates else ws.calculate_dimension()
            a1 = str(a1 or "").strip().upper().replace(" ", "")
            if a1 and ":" not in a1:
                a1 = f"{a1}:{a1}"
        table_rows = extract_a1_range(ws, a1, max_rows=200, max_cols=40)
        used_sheet = sheet
        used_range = a1

    state.mvp.excel_sheet = used_sheet
    state.mvp.excel_range = used_range

    if not table_rows:
        state.status = JobStatus.partial
        state.validation_report.errors.append(
            ValidationIssue(code="excel_extract_failed", message="Could not extract a non-empty table from Excel")
        )
        return state

    # 3) Make markdown/csv for debugging + LLM table analysis.
    state.mvp.table_rows = table_rows[:60]
    state.mvp.table_markdown = table_to_markdown(table_rows, max_rows=40, max_cols=16)

    driver = _extract_driver_setpoints(chosen.method_summary)
    meta, xy_series = _infer_xy_series(table_rows, driver=driver or None)

    # Always use Japanese captions for report consistency (avoid "generated/copy-paste" suspicion).
    # Keep them deterministic and aligned with the experiment text.
    driver_name = str(driver.get("name") or "").strip() if isinstance(driver, dict) else ""
    x_name = str(meta.get("x_name") or "X").strip()
    y_name = str(meta.get("y_name") or "Y").strip()
    table_caption = f"{chosen.name}：{driver_name + '別の' if driver_name else ''}{x_name}と{y_name}の測定結果"
    # NOTE: ImageAnalysis.caption is constrained (<=15 chars) for UI consistency; keep short & generic.
    figure_caption = f"{y_name}-{x_name}測定"

    # Extract structured (non-natural-language) facts for the MVP quantitative comment node.
    state.mvp.observations = {}
    if xy_series:
        x_name = str(meta.get("x_name") or "X").strip()
        x_unit = str(meta.get("x_unit") or "").strip()
        y_name = str(meta.get("y_name") or "Y").strip()
        y_unit = str(meta.get("y_unit") or "").strip()
        state.mvp.observations = build_xy_observations(
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

    chosen.quant_comment = ""
    chosen.blocks.append(
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

    # 4) Generate plot from the table (best-effort).
    if xy_series:
        x_unit = str(meta.get("x_unit") or "").strip()
        y_unit = str(meta.get("y_unit") or "").strip()
        state.mvp.plot_x_label = f"{x_name} [{x_unit}]".strip() if x_unit else x_name
        state.mvp.plot_y_label = f"{y_name} [{y_unit}]".strip() if y_unit else y_name
        png = _render_vce_ic_plot_png(
            series=xy_series,
            title=chosen.name,
            x_label=state.mvp.plot_x_label,
            y_label=state.mvp.plot_y_label,
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
        chosen.blocks.append(
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

    state.job_meta.updated_at = now_iso()
    return state
