from __future__ import annotations

import base64
import os
from copy import deepcopy

from core.excel import table_to_markdown
from graph.nodes.excel_mvp import _extract_driver_setpoints
from core.storage import Storage
from graph.state import AgentState, JobStatus, MVPResultDebuginfo, ValidationIssue, now_iso
from llm.client import LLMClient
from graph.nodes_legacy.render_markdown import MISSING_CELL_MARK


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


def _series_prefix(observations: dict[str, object]) -> str:
    vars_ = observations.get("variables") if isinstance(observations.get("variables"), dict) else {}
    x = vars_.get("x") if isinstance(vars_.get("x"), dict) else {}
    y = vars_.get("y") if isinstance(vars_.get("y"), dict) else {}
    x_name = str((x or {}).get("name") or "").strip()
    y_name = str((y or {}).get("name") or "").strip()
    if not x_name or not y_name:
        return ""
    return f"{x_name}-{y_name}"


def _merge_mvp_observations(observations_list: list[dict[str, object]]) -> dict[str, object]:
    if not observations_list:
        return {}

    series_combined: list[dict[str, object]] = []
    variables_sets: list[dict[str, object]] = []
    missing_total = 0
    missing_examples: list[str] = []
    forbidden_terms: set[str] = set()
    allowed_terms_sets: list[set[str]] = []
    notes_sets: list[tuple[str, ...]] = []

    experiment = observations_list[0].get("experiment") if isinstance(observations_list[0], dict) else {}

    for obs in observations_list:
        if not isinstance(obs, dict):
            continue

        vars_ = obs.get("variables") if isinstance(obs.get("variables"), dict) else {}
        x = vars_.get("x") if isinstance(vars_.get("x"), dict) else {}
        y = vars_.get("y") if isinstance(vars_.get("y"), dict) else {}
        driver = vars_.get("driver") if isinstance(vars_.get("driver"), dict) else {}
        variables_sets.append({"x": x, "y": y, "driver": driver})

        prefix = _series_prefix(obs)
        series = obs.get("series") if isinstance(obs.get("series"), list) else []
        for item in series:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if prefix:
                name = f"{prefix}:{name}" if name else prefix
            out_item = dict(item)
            out_item["name"] = name
            series_combined.append(out_item)

        missing_data = obs.get("missing_data") if isinstance(obs.get("missing_data"), dict) else {}
        raw_missing = missing_data.get("total_missing_points")
        if raw_missing is not None:
            try:
                missing_total += int(raw_missing)
            except Exception:
                pass
        examples = missing_data.get("examples") if isinstance(missing_data.get("examples"), list) else []
        for ex in examples:
            s = str(ex or "").strip()
            if s and len(missing_examples) < 8:
                missing_examples.append(s)

        term_guidance = obs.get("term_guidance") if isinstance(obs.get("term_guidance"), dict) else {}
        allowed_terms = term_guidance.get("allowed_terms") if isinstance(term_guidance.get("allowed_terms"), list) else []
        allowed_terms_sets.append({str(t).strip() for t in allowed_terms if str(t).strip()})
        notes = term_guidance.get("notes") if isinstance(term_guidance.get("notes"), list) else []
        notes_s = tuple(str(n).strip() for n in notes if str(n).strip())
        if notes_s:
            notes_sets.append(notes_s)

        forbidden = (
            obs.get("禁止語")
            or obs.get("forbidden_terms")
            or obs.get("forbidden")
            or []
        )
        if isinstance(forbidden, list):
            for t in forbidden:
                term = str(t or "").strip()
                if term:
                    forbidden_terms.add(term)

    allowed_terms_final: set[str] = set()
    if allowed_terms_sets:
        allowed_terms_final = set.intersection(*allowed_terms_sets) if allowed_terms_sets else set()

    notes_final: list[str] = []
    if notes_sets and all(n == notes_sets[0] for n in notes_sets):
        notes_final = list(notes_sets[0])

    payload: dict[str, object] = {
        "experiment": experiment if isinstance(experiment, dict) else {},
        "variables_sets": variables_sets,
        "series": series_combined,
        "missing_data": {
            "has_missing": missing_total > 0,
            "total_missing_points": missing_total,
            "examples": missing_examples[:8],
        },
        "term_guidance": {
            "allowed_terms": sorted(list(allowed_terms_final)),
            "notes": notes_final,
        },
        "forbidden_terms": sorted(list(forbidden_terms)),
        "results_count": len(observations_list),
    }
    return payload


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
    if exp.quant_comment.strip():
        state.job_meta.updated_at = now_iso()
        return state

    # Build a validation payload from structured observations when available (for strict output checks).
    observations_list: list[dict[str, object]] = []
    for item in state.mvp.results:
        if isinstance(item, MVPResultDebuginfo) and item.observations:
            observations_list.append(item.observations)

    if len(observations_list) == 1:
        validation_payload = deepcopy(observations_list[0])
    elif len(observations_list) > 1:
        validation_payload = _merge_mvp_observations(observations_list)
    else:
        validation_payload = deepcopy(state.mvp.observations or {})

    # If driver info is missing, try to recover from method_summary (single-result only).
    if len(observations_list) <= 1 and isinstance(validation_payload.get("variables"), dict):
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

    if not validation_payload:
        exp.quant_comment = ""
        if state.template_context:
            for te in state.template_context.experiments:
                if te.idx == exp.idx and te.subidx == exp.subidx:
                    te.quant_comment = exp.quant_comment
                    break
        state.job_meta.updated_at = now_iso()
        return state

    mode = (os.environ.get("REPORT_AGENT_QUANT_COMMENT_MODE") or "vision").strip().lower()
    multi_results = len(state.mvp.results) > 1

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

    use_vision = (mode == "vision") and (not multi_results) and image_url and table_md
    if use_vision and not validation_payload:
        validation_payload = {
            "series": [],
            "missing_data": {"has_missing": False, "total_missing_points": 0, "examples": []},
            "forbidden_terms": [],
        }
        state.mvp.observations = validation_payload

    if use_vision:
        system_prompt = _load_system_prompt()
        hint = _target_vce_error_hint(table_rows) if validation_payload else ""
        hint2 = _ic_over_ib_hint(validation_payload) if validation_payload else ""
        hint3 = _series_name_hint(validation_payload) if validation_payload else ""
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
        out = llm.mvp_quant_comment(payload=validation_payload)
        exp.quant_comment = (out.paragraph or "").strip()

    if state.template_context:
        for te in state.template_context.experiments:
            if te.idx == exp.idx and te.subidx == exp.subidx:
                te.quant_comment = exp.quant_comment
                break

    state.job_meta.updated_at = now_iso()
    return state
