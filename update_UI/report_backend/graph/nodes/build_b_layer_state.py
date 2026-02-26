from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
from typing import Callable

from core.storage import Storage
from graph.nodes.build_b_layer_bundle import build_b_layer_bundle
from graph.nodes.clean_heading_positions import clean_heading_positions
from graph.nodes.extract_manual_text import extract_manual_text
from graph.nodes.extract_method_numbers import extract_method_numbers
from graph.nodes.locate_discussion_section import locate_discussion_section
from graph.nodes.parse_manual_structure import parse_manual_structure
from graph.state import AgentState, QualityIssue, ValidationIssue, now_iso
from llm.client import LLMClient

_B_LAYER_LLM_FAIL_FAST_ENV = "REPORT_AGENT_B_LAYER_LLM_FAIL_FAST"
_B_LAYER_LLM_NODE_MAX_RETRIES = 3


def _truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def _record_b_layer_llm_error(state: AgentState, *, node: str, exc: Exception) -> None:
    detail = f"{type(exc).__name__}: {exc}"
    message = f"BレイヤーLLM呼び出し失敗 node={node} detail={detail}"
    state.pdf.marker_reason = message
    state.validation_report.errors.append(
        ValidationIssue(code="err_b_layer_llm_call_failed", message=message, target=node)
    )
    state.quality_report.issues.append(
        QualityIssue(
            code="ERR_B_LAYER_LLM_CALL_FAILED",
            stage="B",
            severity="FAIL",
            message=message,
            suggested_action="ask_user",
        )
    )
    state.job_meta.updated_at = now_iso()


def _run_b_layer_llm_node_with_retries(
    state: AgentState,
    *,
    node_name: str,
    fn: Callable[[AgentState], AgentState],
    llm_fail_fast: bool,
) -> AgentState:
    """
    Retry a failing B-layer LLM node up to 3 attempts.
    If all attempts fail, preserve the existing error behavior.
    """
    last_exc: Exception | None = None
    for attempt in range(1, _B_LAYER_LLM_NODE_MAX_RETRIES + 1):
        try:
            return fn(state)
        except Exception as exc:  # noqa: BLE001 - preserve existing broad handling strategy
            last_exc = exc
            _record_b_layer_llm_error(state, node=f"{node_name}[attempt={attempt}]", exc=exc)
            if llm_fail_fast:
                raise RuntimeError(state.pdf.marker_reason) from exc
            if attempt >= _B_LAYER_LLM_NODE_MAX_RETRIES:
                raise
    if last_exc is not None:
        raise last_exc
    return state


def _probe_llm_minimal_request(state: AgentState, *, llm: LLMClient) -> AgentState:
    """
    Send a minimal OpenAI request at the B-layer LLM point for connectivity diagnostics.
    """
    model_name = llm.text_model
    response = llm._client.responses.create(  # noqa: SLF001 - intentional probe on existing client
        model=model_name,
        input="B-layer minimal probe. Reply with OK.",
        max_output_tokens=32,
    )
    output_text = (getattr(response, "output_text", "") or "").strip()
    status = str(getattr(response, "status", "") or "")
    state.validation_report.warnings.append(
        ValidationIssue(
            code="warn_b_layer_llm_probe_ok",
            message=f"BレイヤーLLM疎通確認OK model={model_name} status={status} text={output_text[:80]}",
            target="extract_theory_formulas_llm",
        )
    )
    state.job_meta.updated_at = now_iso()
    return state


def build_b_layer_state(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient,
    theory_output_path: Path | None = None,
    bundle_output_path: Path | None = None,
    llm_parallel_workers: int | None = None,
) -> AgentState:
    """
    Build B-layer state from A-layer state using existing nodes.
    """
    @contextmanager
    def _temp_env(name: str, value: str | None):
        old = os.environ.get(name)
        try:
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
            yield
        finally:
            if old is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = old

    workers = None
    if llm_parallel_workers is not None:
        workers = str(max(1, int(llm_parallel_workers)))
    llm_fail_fast = _truthy(os.environ.get(_B_LAYER_LLM_FAIL_FAST_ENV))

    with (
        _temp_env("REPORT_AGENT_LLM_PARALLEL_WORKERS", workers),
    ):
        state = extract_manual_text(state, storage=storage, llm=llm)
        # Keep an explicit copy for downstream JSON consumers (user-requested field).
        state.pdf.pdf_markdrown = state.pdf.markdown_text or ""
        state = _run_b_layer_llm_node_with_retries(
            state,
            node_name="clean_heading_positions",
            fn=lambda s: clean_heading_positions(s, llm=llm, storage=storage),
            llm_fail_fast=llm_fail_fast,
        )
        state = parse_manual_structure(state)
        state = extract_method_numbers(state)
        state = locate_discussion_section(state)
        # Temporarily disable theory formula extraction and run a minimal LLM probe instead.
        # state = _run_b_layer_llm_node_with_retries(
        #     state,
        #     node_name="extract_theory_formulas_llm",
        #     fn=lambda s: extract_theory_formulas_llm(s, llm=llm, storage=storage, output_path=theory_output_path),
        #     llm_fail_fast=llm_fail_fast,
        # )
        state = _run_b_layer_llm_node_with_retries(
            state,
            node_name="b_layer_llm_minimal_probe",
            fn=lambda s: _probe_llm_minimal_request(s, llm=llm),
            llm_fail_fast=llm_fail_fast,
        )
        state = build_b_layer_bundle(state, output_path=bundle_output_path)
    return state


def build_b_layer_state_and_save(
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
    Build B-layer state and persist the updated state JSON to output_state_path.
    """
    state = build_b_layer_state(
        state,
        storage=storage,
        llm=llm,
        theory_output_path=theory_output_path,
        bundle_output_path=bundle_output_path,
        llm_parallel_workers=llm_parallel_workers,
    )
    output_state_path.write_text(
        json.dumps(state.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return state
