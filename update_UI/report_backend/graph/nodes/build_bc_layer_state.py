from __future__ import annotations

import json
from pathlib import Path

from core.storage import Storage
from graph.nodes.build_b_layer_state import build_b_layer_state
from graph.nodes.past_report_hints import past_report_hints
from graph.nodes.past_report_result_structure_hints import past_report_result_structure_hints
from graph.state import AgentState, now_iso
from llm.client import LLMClient


def _has_past_report_inputs(state: AgentState) -> bool:
    if state.past_reports:
        return any(bool(str(report.storage_key or "").strip()) for report in state.past_reports)
    return bool(str(state.past_report.storage_key or "").strip())


def build_bc_layer_state(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient,
    theory_output_path: Path | None = None,
    bundle_output_path: Path | None = None,
    llm_parallel_workers: int | None = None,
) -> AgentState:
    """
    Run B-layer, then C-layer using B-layer experiment list, then merge.
    B-layer updates pdf; C-layer updates past_reports only.
    """
    base = state
    b_state = build_b_layer_state(
        base.model_copy(deep=True),
        storage=storage,
        llm=llm,
        theory_output_path=theory_output_path,
        bundle_output_path=bundle_output_path,
        llm_parallel_workers=llm_parallel_workers,
    )
    # If there is no past report input, skip C-layer entirely to avoid misleading flow.
    if not _has_past_report_inputs(b_state):
        b_state.job_meta.updated_at = now_iso()
        return b_state

    c_state = past_report_hints(b_state.model_copy(deep=True), storage=storage, llm=llm)
    c_state = past_report_result_structure_hints(c_state, llm=llm)
    c_state.job_meta.updated_at = now_iso()
    return c_state


def build_bc_layer_state_and_save(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient,
    output_state_path: Path,
    theory_output_path: Path | None = None,
    bundle_output_path: Path | None = None,
    llm_parallel_workers: int | None = None,
) -> AgentState:
    """
    Run B/C in parallel, merge, and persist updated state.
    """
    merged = build_bc_layer_state(
        state,
        storage=storage,
        llm=llm,
        theory_output_path=theory_output_path,
        bundle_output_path=bundle_output_path,
        llm_parallel_workers=llm_parallel_workers,
    )
    output_state_path.write_text(
        json.dumps(merged.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return merged
