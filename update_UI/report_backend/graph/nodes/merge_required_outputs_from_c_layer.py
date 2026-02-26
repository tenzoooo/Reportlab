from __future__ import annotations

import json
from pathlib import Path

from graph.state import AgentState, RequiredOutputEstimate, ValidationIssue, now_iso


def _has_past_report(state: AgentState) -> bool:
    if state.past_reports:
        return any(bool(r.storage_key) for r in state.past_reports)
    return bool(state.past_report.storage_key)


def _merge_required_outputs(
    *,
    d_outputs: list[RequiredOutputEstimate],
    c_outputs: list[RequiredOutputEstimate],
) -> list[RequiredOutputEstimate]:
    # D優先: Dにあるexp_keyは上書きしない。Dに無いexp_keyだけCから追加。
    merged: list[RequiredOutputEstimate] = []
    index: dict[str, int] = {}
    for item in d_outputs:
        key = str(item.exp_key or "").strip()
        merged.append(item)
        if key:
            index[key] = len(merged) - 1
    for item in c_outputs:
        key = str(item.exp_key or "").strip()
        if key and key in index:
            continue
        merged.append(item)
        if key:
            index[key] = len(merged) - 1
    return merged


def merge_required_outputs_from_c_layer_state(
    state: AgentState,
    *,
    c_layer_state_path: Path,
) -> AgentState:
    """
    Cレイヤのstate JSONを読み込み、required_outputsをDレイヤstateへ統合する。
    Dを優先し、Dに無いexp_keyのみCから補完する。
    過去レポートが無い場合は何もしない。
    """
    if not _has_past_report(state):
        return state
    if not c_layer_state_path.exists():
        state.validation_report.warnings.append(
            ValidationIssue(code="warn_c_layer_state_missing", message=f"Cレイヤstateが存在しません: {c_layer_state_path}")
        )
        return state

    raw = json.loads(c_layer_state_path.read_text(encoding="utf-8"))
    c_state = AgentState.model_validate(raw)
    state.required_outputs = _merge_required_outputs(
        d_outputs=list(state.required_outputs or []),
        c_outputs=list(c_state.required_outputs or []),
    )
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["merge_required_outputs_from_c_layer_state"]
