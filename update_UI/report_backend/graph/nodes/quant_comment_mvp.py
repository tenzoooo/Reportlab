from __future__ import annotations

import base64
import os
from copy import deepcopy

from core.excel import table_to_markdown
from .excel_mvp import _extract_driver_setpoints
from core.storage import Storage
from graph.state import AgentState, JobStatus, ValidationIssue, now_iso
from llm.client import LLMClient
from graph.nodes.render_markdown import MISSING_CELL_MARK


def _to_data_url(mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def _load_system_prompt() -> str:
    # User-editable prompt file (preferred).
    env_path = (os.environ.get("REPORT_AGENT_QUANT_VISION_PROMPT_PATH") or "").strip()
    candidates: list[str] = []
    if env_path:
        candidates.append(env_path)
    # Default workspace file
    candidates.append(os.path.join(os.path.dirname(__file__), "..", "..", "workspaces", "prompts", "mvp_quant_comment_vision_system.txt"))
    for p in candidates:
        try:
            path = os.path.abspath(p)
            if os.path.isfile(path):
                txt = open(path, "r", encoding="utf-8").read().strip()
                if txt:
                    return txt
        except Exception:
            continue
    # Fallback (should be overridden by the user).
    return "You are a helpful assistant. Return JSON only: {\"paragraph\":\"...\"}."


def _as_float(value: object) -> float | None:
    try:
        s = str(value or "").strip().replace(",", "")
        if not s or s in {MISSING_CELL_MARK, "／", "/", "-", "—"}:
            return None
        return float(s)
    except Exception:
        return None


def _format_sig(value: float, *, digits: int = 3) -> str:
    if value == 0:
        return "0"
    # Use general format, then trim trailing zeros.
    s = f"{value:.{digits}g}"
    return s


def _target_vce_error_hint(table_rows: list[list[str]]) -> str:
    """
    If the table has a first column like '目標Vce', compute a small, LLM-friendly
    summary of |Vce - 目標Vce| across all series points.
    """
    if not table_rows or len(table_rows) < 2:
        return ""
    header0 = str((table_rows[0][0] if table_rows[0] else "") or "").strip()
    if "目標" not in header0:
        return ""

    body = table_rows[1:]
    pair_starts = [1, 3, 5, 7]
    errs_by_series: dict[int, list[float]] = {1: [], 2: [], 3: [], 4: []}
    worst: tuple[float, float, float, float | None, int] | None = None  # err, target, vce, ic, series

    for r in body:
        target = _as_float(r[0] if len(r) > 0 else "")
        if target is None:
            continue
        for si, start in enumerate(pair_starts, start=1):
            vce = _as_float(r[start] if len(r) > start else "")
            if vce is None:
                continue
            err = abs(vce - target)
            errs_by_series[si].append(err)
            ic = _as_float(r[start + 1] if len(r) > start + 1 else "")
            if worst is None or err > worst[0]:
                worst = (err, target, vce, ic, si)

    total = sum(len(v) for v in errs_by_series.values())
    if total <= 0 or worst is None:
        return ""

    parts: list[str] = []
    for si in [1, 2, 3, 4]:
        vals = errs_by_series[si]
        if not vals:
            continue
        mx = max(vals)
        mean = sum(vals) / len(vals)
        parts.append(f"系列{si} 最大{_format_sig(mx)}V/平均{_format_sig(mean)}V(n={len(vals)})")

    err, target, vce, ic, si = worst
    example = f"最大乖離の例: 目標{_format_sig(target)}Vに対しVce={_format_sig(vce)}V"
    if ic is not None:
        example += f"(Ic={_format_sig(ic)}mA, 系列{si})"
    else:
        example += f"(系列{si})"
    return f"参考（目標追従の誤差）: |Vce-目標Vce| は{', '.join(parts)}。{example}。".strip()


def _ic_over_ib_hint(observations: dict[str, object]) -> str:
    """
    If we have driver setpoints like IB (μA) and a probe point (e.g., Vce≈1V),
    compute a compact Ic/Ib ratio range at the probe as a theory-consistency hint.
    (Avoid β/hFE wording; just provide the ratio.)
    """
    if not observations or not isinstance(observations, dict):
        return ""
    vars_ = observations.get("variables")
    if not isinstance(vars_, dict):
        return ""
    driver = vars_.get("driver")
    if not isinstance(driver, dict):
        return ""
    dname = str(driver.get("name") or "").strip()
    dunit = str(driver.get("unit") or "").strip()
    dvals = driver.get("values")
    if not dname or dunit.lower() not in {"μa", "ua"} or not isinstance(dvals, list) or len(dvals) < 2:
        return ""

    x = vars_.get("x") if isinstance(vars_.get("x"), dict) else {}
    x_name = str((x or {}).get("name") or "Vce").strip()
    probe = observations.get("probe") if isinstance(observations.get("probe"), dict) else {}
    probe_x = probe.get("x")
    try:
        probe_x_f = float(probe_x)
    except Exception:
        probe_x_f = None

    series = observations.get("series")
    if not isinstance(series, list) or not series:
        return ""

    ratios: list[float] = []
    for idx, s in enumerate(series[: len(dvals)]):
        if not isinstance(s, dict):
            continue
        ib = dvals[idx]
        try:
            ib_f = float(ib)
        except Exception:
            continue
        if ib_f <= 0:
            continue
        y_at_probe = s.get("y_at_probe")
        try:
            ic_mA = float(y_at_probe)
        except Exception:
            continue
        # Ic/Ib (A/A) = (ic_mA*1e-3)/(ib_uA*1e-6) = ic_mA/ib_uA * 1000
        ratios.append(ic_mA / ib_f * 1000.0)

    if not ratios:
        return ""
    mn = min(ratios)
    mx = max(ratios)
    if probe_x_f is None:
        return f"参考（整合性）: {x_name}付近でのIc/Ibは約{_format_sig(mn)}〜{_format_sig(mx)}。"
    return f"参考（整合性）: {x_name}≈{_format_sig(probe_x_f)}V付近でのIc/Ibは約{_format_sig(mn)}〜{_format_sig(mx)}。"


def _series_name_hint(observations: dict[str, object]) -> str:
    """
    Provide an explicit mapping from seriesN -> driver setpoint (e.g., IB).
    Helps the model avoid generic「系列1」表現。
    """
    if not isinstance(observations, dict):
        return ""
    driver = (observations.get("variables") or {}).get("driver")
    series = observations.get("series")
    if not (isinstance(driver, dict) and isinstance(series, list) and series):
        return ""
    dname = str(driver.get("name") or "").strip()
    dunit = str(driver.get("unit") or "").strip()
    dvals = driver.get("values")
    if not dname or not isinstance(dvals, list) or not dvals:
        return ""
    parts: list[str] = []
    for idx, s in enumerate(series[: len(dvals)], start=1):
        try:
            v = float(dvals[idx - 1])
        except Exception:
            continue
        parts.append(f"系列{idx}= {dname}={_format_sig(v)}{dunit}")
    if not parts:
        return ""
    return "シリーズ名ヒント（必ずこの表記を用いること）: " + ", ".join(parts)


def quant_comment_mvp(state: AgentState, *, llm: LLMClient, storage: Storage) -> AgentState:
    """
    MVP quantitative comment generation:
    - Primary: vision-based generation from (method text + table + plot image), with user-controlled prompt.
    - Fallback: structured generation from observations JSON when image/table is missing.
    """
    exp = state.experiments[0] if state.experiments else None
    if not exp:
        state.status = JobStatus.partial
        state.validation_report.errors.append(ValidationIssue(code="missing_experiment", message="No experiment in state"))
        return state

    # Build a validation payload from structured observations when available (for strict output checks).
    validation_payload = deepcopy(state.mvp.observations or {})
    # If driver info is missing, try to recover from method_summary (for naming series as IB=...).
    driver = (validation_payload.get("variables") or {}).get("driver") if isinstance(validation_payload.get("variables"), dict) else None
    if not driver:
        inferred_driver = _extract_driver_setpoints(exp.method_summary or "")
        if inferred_driver:
            validation_payload.setdefault("variables", {}).setdefault("driver", inferred_driver)
            # Persist driver back to state for downstream runs.
            try:
                state.mvp.observations = state.mvp.observations or {}
                state.mvp.observations.setdefault("variables", {})["driver"] = inferred_driver  # type: ignore[index]
            except Exception:
                state.mvp.observations = validation_payload  # fallback to replace wholesale

    # Keep validation payload in sync with state (including inferred driver).
    state.mvp.observations = validation_payload

    mode = (os.environ.get("REPORT_AGENT_QUANT_COMMENT_MODE") or "vision").strip().lower()

    # table
    table_rows = exp.tables[0].rows if exp.tables else []
    table_md = table_to_markdown(table_rows, max_rows=40, max_cols=16) if table_rows else ""

    # image
    image_url = ""
    fig_id = exp.figures[0].figure_image_id if exp.figures and exp.figures[0].figure_image_id else ""
    if fig_id:
        asset = next((a for a in state.assets_images if a.image_id == fig_id), None)
        if asset:
            raw = storage.get_bytes(asset.storage_key)
            image_url = _to_data_url(asset.mime_type, raw)

    if mode == "vision" and image_url and table_md:
        system_prompt = _load_system_prompt()
        hint = _target_vce_error_hint(table_rows)
        hint2 = _ic_over_ib_hint(validation_payload)
        hint3 = _series_name_hint(validation_payload)
        user_text = "\n".join(
            [
                "結果表（Markdown）:",
                table_md,
                "",
                hint,
                hint2,
                hint3,
                "" if hint else "",
                "結果グラフ画像を参照して、要求された形式で出力せよ。",
            ]
        ).strip()
        out = llm.mvp_quant_comment_vision(
            system_prompt=system_prompt,
            user_text=user_text,
            image_b64_url=image_url,
            validation_payload=validation_payload,
            attempts=2,
        )
        paragraph = (out.paragraph or "").strip()
        exp.quant_comment = paragraph
    else:
        # Fallback: keep current structured generation (requires observations).
        if not validation_payload:
            state.status = JobStatus.partial
            state.validation_report.errors.append(
                ValidationIssue(code="missing_mvp_observations", message="MVP observations are missing; cannot build quant comment")
            )
            return state
        out = llm.mvp_quant_comment(payload=validation_payload)
        exp.quant_comment = (out.paragraph or "").strip()

    if state.template_context:
        for te in state.template_context.experiments:
            if te.idx == exp.idx and te.subidx == exp.subidx:
                te.quant_comment = exp.quant_comment
                break

    state.job_meta.updated_at = now_iso()
    return state
