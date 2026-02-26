from __future__ import annotations

from graph.nodes.theory_compare_utils import is_theory_compare_enabled_for_exp
from graph.state import AgentState, JobStatus, ValidationIssue, now_iso
from models.contracts import EvidenceRef


_FAIL_QUANT_COMMENT_MISSING = "FAIL_QUANT_COMMENT_MISSING"
_FAIL_QUANT_NO_DELTA = "FAIL_QUANT_NO_DELTA"
_FAIL_QUANT_NO_ABS_ERROR = "FAIL_QUANT_NO_ABS_ERROR"
_FAIL_OFF_NO_SLOPE = "FAIL_OFF_NO_SLOPE"
_FAIL_OFF_NO_EXTREME = "FAIL_OFF_NO_EXTREME"

_SIGNIFICANT_DIGITS = 3

_SI_PREFIXES = [
    (1e-12, "p"),
    (1e-9, "n"),
    (1e-6, "u"),
    (1e-3, "m"),
    (1.0, ""),
    (1e3, "k"),
    (1e6, "M"),
    (1e9, "G"),
]
_SI_BASE_UNITS = {"V", "A", "s", "Hz", "ohm", "F", "H", "C", "K", "Pa", "W", "J", "g"}


def _format_sig(value: float) -> str:
    if value == 0:
        return "0"
    return f"{value:.{_SIGNIFICANT_DIGITS}g}"


def _is_compound_unit(unit: str) -> bool:
    return any(ch in unit for ch in ["/", "*", "^"])


def _unit_has_prefix(unit: str) -> bool:
    if len(unit) < 2:
        return False
    prefix = unit[0]
    base = unit[1:]
    return prefix in {"p", "n", "u", "m", "k", "M", "G"} and base in _SI_BASE_UNITS


def _format_with_unit(value: float, unit: str) -> str:
    u = (unit or "").strip()
    if not u or u == "1":
        return _format_sig(value)

    if _is_compound_unit(u) or _unit_has_prefix(u) or u not in _SI_BASE_UNITS:
        return f"{_format_sig(value)} {u}"

    v = float(value)
    abs_v = abs(v)
    if abs_v == 0:
        return f"0 {u}"

    chosen = None
    for scale, prefix in _SI_PREFIXES:
        scaled = abs_v / scale
        if 1 <= scaled < 1000:
            chosen = (scale, prefix)
            break
    if chosen is None:
        # Fall back to scientific notation only if no reasonable SI prefix exists.
        sci = f"{v:.{_SIGNIFICANT_DIGITS}g}"
        return f"{sci} {u}"

    scale, prefix = chosen
    scaled_val = v / scale
    return f"{_format_sig(scaled_val)} {prefix}{u}"


def _has_children(state: AgentState, *, idx: str) -> bool:
    return any(exp.idx == idx and exp.subidx for exp in state.experiments)


def _append_metric_evidence(item, *, exp_key: str) -> None:
    if getattr(item, "evidence_refs", None) is None:
        return
    if item.evidence_refs:
        return
    item.evidence_refs.append(
        EvidenceRef(
            source_kind="computed",
            text=exp_key,
            note="quant_metrics",
            target="quant_comment_metrics",
        )
    )


def _has_quant_evidence(exp) -> bool:
    return any(ref.target == "quant_comment" for ref in exp.evidence_refs)


def generate_quant_comment_text(state: AgentState) -> AgentState:
    if state.status == JobStatus.failed:
        return state
    if not state.experiments:
        return state

    for exp in state.experiments:
        if not exp.subidx and _has_children(state, idx=exp.idx):
            continue
        if exp.quant_comment.strip():
            continue
        exp_key = (exp.source_idx or "").strip()
        if not exp_key:
            continue

        parts: list[str] = []
        if is_theory_compare_enabled_for_exp(state, exp_key):
            targets = [d for d in state.delta_error_results if d.exp_key == exp_key]
            for item in targets:
                if item.delta is None:
                    state.validation_report.errors.append(
                        ValidationIssue(code=_FAIL_QUANT_NO_DELTA, message="Delta is missing.", target=exp_key)
                    )
                    state.status = JobStatus.failed
                    break
                if item.abs_error is None:
                    state.validation_report.errors.append(
                        ValidationIssue(code=_FAIL_QUANT_NO_ABS_ERROR, message="Absolute error is missing.", target=exp_key)
                    )
                    state.status = JobStatus.failed
                    break
                unit = (item.measured_unit or item.theory_unit or "").strip()
                if not unit:
                    continue
                theory = _format_with_unit(float(item.theory_value), unit) if item.theory_value is not None else ""
                measured = _format_with_unit(float(item.measured_value), unit) if item.measured_value is not None else ""
                delta = _format_with_unit(float(item.delta), unit)
                abs_error = _format_with_unit(float(item.abs_error), unit)
                if not theory or not measured:
                    continue
                target = (item.target_symbol or "").strip()
                head = f"理論値{target}は{theory}" if target else f"理論値は{theory}"
                sentence = f"{head}、測定平均値は{measured}、Δは{delta}、絶対誤差は{abs_error}である。"
                parts.append(sentence)
                _append_metric_evidence(item, exp_key=exp_key)
        else:
            targets = [s for s in state.slope_extreme_results if s.exp_key == exp_key]
            for item in targets:
                if item.slope is None:
                    state.validation_report.errors.append(
                        ValidationIssue(code=_FAIL_OFF_NO_SLOPE, message="Slope is missing.", target=exp_key)
                    )
                    state.status = JobStatus.failed
                    break
                if item.max_value is None or item.min_value is None:
                    state.validation_report.errors.append(
                        ValidationIssue(code=_FAIL_OFF_NO_EXTREME, message="Extreme values are missing.", target=exp_key)
                    )
                    state.status = JobStatus.failed
                    break
                x_unit = (item.x_unit or "").strip()
                y_unit = (item.y_unit or "").strip()
                if not x_unit or not y_unit:
                    continue
                slope_unit = f"{y_unit}/{x_unit}"
                slope = _format_with_unit(float(item.slope), slope_unit)
                max_value = _format_with_unit(float(item.max_value), y_unit)
                min_value = _format_with_unit(float(item.min_value), y_unit)
                sentence = f"傾きは{slope}、最大値は{max_value}、最小値は{min_value}である。"
                parts.append(sentence)
                _append_metric_evidence(item, exp_key=exp_key)

        if parts:
            exp.quant_comment = " ".join(parts).strip()
            if not _has_quant_evidence(exp):
                exp.evidence_refs.append(
                    EvidenceRef(
                        source_kind="computed",
                        text=exp.quant_comment,
                        note="quant_comment",
                        target="quant_comment",
                    )
                )
        else:
            state.validation_report.errors.append(
                ValidationIssue(code=_FAIL_QUANT_COMMENT_MISSING, message="Quant comment is missing.", target=exp_key)
            )
            state.status = JobStatus.failed

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["generate_quant_comment_text"]
