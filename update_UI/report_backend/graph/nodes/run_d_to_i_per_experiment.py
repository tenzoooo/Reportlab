from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

from graph.nodes.assemble_results_page import assemble_results_page
from graph.nodes.bind_insert_assets import bind_insert_assets
from graph.nodes.build_result_hints_from_method import build_result_hints_from_method
from graph.nodes.generate_graphs import generate_graphs
from graph.nodes.infer_required_outputs import infer_required_outputs
from graph.nodes.inspect_excel import inspect_excel
from graph.nodes.required_outputs_ambiguity_gate import required_outputs_ambiguity_gate
from graph.nodes.select_excel_ranges import select_excel_ranges
from graph.nodes.select_excel_sheet_per_experiment import select_excel_sheet_per_required_outputs
from graph.nodes.sheet_selection_ambiguity_gate import sheet_selection_ambiguity_gate
from graph.nodes.column_unit_ambiguity_gate import column_unit_ambiguity_gate
from graph.nodes.bind_table_columns_and_units import bind_table_columns_and_units
from graph.nodes.quant_comment_assets import generate_quant_comments_from_assets
from graph.state import (
    AgentState,
    AxisHitl,
    ColumnUnitHitl,
    ComputationHitl,
    ExperimentHitlEntry,
    ExperimentUnit,
    ExcelSheetSelectionHitl,
    InsertAssetHitl,
    JobStatus,
    PdfMethodUnit,
    RequiredOutputsHitl,
    TextGenerationHitl,
    TheoryCompareHitl,
    TheoryParamHitl,
    now_iso,
)
from llm.client import LLMClient
from models.contracts import Experiment
from core.storage import Storage
from graph.hitl import hitl_disabled
from graph.nodes.ui_progress import set_ui_progress


_DEFAULT_EXPERIMENT_PARALLELISM = 4


@dataclass(frozen=True)
class _ExperimentTaskResult:
    index: int
    exp_key: str
    result_no: str
    experiments: list[Experiment]
    result_groups: list[Any]
    hitl_entry: ExperimentHitlEntry | None


def _split_experiment_number(exp_key: str) -> tuple[str, str]:
    key = (exp_key or "").strip().replace("．", ".").replace("。", ".")
    parts = [p for p in key.split(".") if p.strip()]
    if len(parts) < 2:
        return key, ""
    idx = parts[1].strip()
    subidx = ".".join([p.strip() for p in parts[2:]]) if len(parts) > 2 else ""
    return idx, subidx


def _method_items_for_unit(unit: ExperimentUnit) -> list[PdfMethodUnit]:
    items: list[PdfMethodUnit] = []
    if unit.parent:
        parent_level = max(1, unit.level - 1) if unit.level else 1
        items.append(
            PdfMethodUnit(
                exp_key=unit.parent.exp_key,
                title=unit.parent.title,
                level=parent_level,
                text=unit.parent.method_text,
                parent_exp_key="",
                child_exp_keys=[unit.exp_key],
            )
        )
    items.append(
        PdfMethodUnit(
            exp_key=unit.exp_key,
            title=unit.title,
            level=max(1, unit.level or 1),
            text=unit.method_text,
            parent_exp_key=unit.parent.exp_key if unit.parent else "",
            child_exp_keys=[],
        )
    )
    return items


def _experiment_for_unit(unit: ExperimentUnit) -> Experiment:
    exp_key = unit.exp_key
    idx, subidx = _split_experiment_number(exp_key)
    return Experiment(
        idx=idx,
        subidx=subidx,
        name=unit.title,
        source_idx=exp_key,
        method_no=exp_key,
        method_summary="",
        result_brief="",
        description_brief="",
        quant_comment="",
        evidence_refs=[],
        blocks=[],
        tables=[],
        figures=[],
    )


def _filter_method_tree(state: AgentState, exp_key: str) -> list[dict]:
    return [item for item in state.method_tree if str(item.get("exp_key") or "").strip() == exp_key]


def _reset_hitl_flags(state: AgentState) -> None:
    state.required_outputs_hitl = RequiredOutputsHitl()
    state.excel_sheet_hitl = ExcelSheetSelectionHitl()
    state.column_unit_hitl = ColumnUnitHitl()
    state.insert_asset_hitl = InsertAssetHitl()
    state.theory_compare_hitl = TheoryCompareHitl()
    state.theory_param_hitl = TheoryParamHitl()
    state.axis_hitl = AxisHitl()
    state.computation_hitl = ComputationHitl()
    state.text_generation_hitl = TextGenerationHitl()


def _clear_outputs(state: AgentState) -> None:
    state.report.hints = []
    state.required_outputs = []
    state.excel_inventory = []
    state.excel_sheet_selections = []
    state.table_column_bindings = []
    state.theory_param_bindings = []
    state.insert_asset_bindings = []
    state.graph_axis_bindings = []
    state.theory_compare_by_experiment = {}
    state.theory_value_results = []
    state.delta_error_results = []
    state.slope_extreme_results = []


def _has_excel_inputs(state: AgentState) -> bool:
    if str(state.excel.storage_key or "").strip():
        return True
    for item in state.excel_files or []:
        if str(item.storage_key or "").strip():
            return True
    return False


def _hitl_entry_from_state(state: AgentState, *, exp_key: str) -> ExperimentHitlEntry | None:
    # Dev/diagnostics mode: never stop for HITL. We still allow the pipeline to fail fast via
    # state.status==failed, but we don't convert ambiguity into a HITL queue entry.
    if hitl_disabled():
        return None
    if state.required_outputs_hitl.enabled:
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="required_outputs",
            code="HITL_REQUIRED_OUTPUTS_UNKNOWN",
            message=state.required_outputs_hitl.message,
            html=state.required_outputs_hitl.html,
            payload=state.required_outputs_hitl.payload,
        )
    if state.excel_sheet_hitl.enabled:
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="excel_sheet",
            code=state.excel_sheet_hitl.code or "HITL_EXCEL_SHEET_UNKNOWN",
            message=state.excel_sheet_hitl.message,
            html=state.excel_sheet_hitl.html,
            payload=state.excel_sheet_hitl.payload,
        )
    if state.column_unit_hitl.enabled:
        code = state.column_unit_hitl.codes[0] if state.column_unit_hitl.codes else "HITL_TABLE_COLUMN_MAPPING_UNKNOWN"
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="column_unit",
            code=code,
            message=state.column_unit_hitl.message,
            html=state.column_unit_hitl.html,
            payload=state.column_unit_hitl.payload,
        )
    if state.insert_asset_hitl.enabled:
        code = state.insert_asset_hitl.codes[0] if state.insert_asset_hitl.codes else "HITL_INSERT_ASSET_UNKNOWN"
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="insert_assets",
            code=code,
            message=state.insert_asset_hitl.message,
            html=state.insert_asset_hitl.html,
            payload=state.insert_asset_hitl.payload,
        )
    if state.theory_compare_hitl.enabled:
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="theory_compare",
            code=state.theory_compare_hitl.code or "HITL_THEORY_COMPARE_PER_EXPERIMENT",
            message=state.theory_compare_hitl.message,
            html=state.theory_compare_hitl.html,
            payload=state.theory_compare_hitl.payload,
        )
    if state.theory_param_hitl.enabled:
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="theory_param",
            code=state.theory_param_hitl.code or "HITL_THEORY_SUBSTITUTION_MISSING",
            message=state.theory_param_hitl.message,
            html=state.theory_param_hitl.html,
            payload=state.theory_param_hitl.payload,
        )
    if state.axis_hitl.enabled:
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="axis",
            code=state.axis_hitl.code or "HITL_AXIS_LABEL_UNKNOWN",
            message=state.axis_hitl.message,
            html=state.axis_hitl.html,
            payload=state.axis_hitl.payload,
        )
    if state.computation_hitl.enabled:
        code = state.computation_hitl.codes[0] if state.computation_hitl.codes else "HITL_COMPUTATION"
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="computation",
            code=code,
            message=state.computation_hitl.message,
            html=state.computation_hitl.html,
            payload=state.computation_hitl.payload,
        )
    if state.text_generation_hitl.enabled:
        code = state.text_generation_hitl.codes[0] if state.text_generation_hitl.codes else "HITL_TEXT_GENERATION"
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="text_generation",
            code=code,
            message=state.text_generation_hitl.message,
            html=state.text_generation_hitl.html,
            payload=state.text_generation_hitl.payload,
            rewind_target=state.text_generation_hitl.rewind_target or "",
        )
    if state.status == JobStatus.failed:
        payload = {"errors": [e.model_dump() for e in state.validation_report.errors]}
        return ExperimentHitlEntry(
            exp_key=exp_key,
            kind="failed",
            code="FAILED_EXPERIMENT",
            message="Experiment processing failed.",
            payload=payload,
        )
    return None


def _merge_experiments(existing: list[Experiment], incoming: list[Experiment], exp_key: str) -> list[Experiment]:
    filtered = [exp for exp in existing if (exp.source_idx or exp.idx) != exp_key]
    filtered.extend(incoming)
    return filtered


def _merge_result_groups(existing: list, incoming: list, result_no: str) -> list:
    filtered = [item for item in existing if getattr(item, "result_no", "") != result_no]
    filtered.extend(incoming)
    return filtered


def _scoped_state(base: AgentState, unit: ExperimentUnit) -> AgentState:
    scoped = base.model_copy(deep=True)
    if scoped.b_layer_bundle is not None:
        scoped.b_layer_bundle.method.items = _method_items_for_unit(unit)
        scoped.b_layer_bundle.method.experiment_units = [unit]
    scoped.experiments = [_experiment_for_unit(unit)]
    scoped.method_tree = _filter_method_tree(scoped, unit.exp_key)
    _clear_outputs(scoped)
    _reset_hitl_flags(scoped)
    scoped.status = JobStatus.created
    return scoped


def _slim_past_report(state: AgentState) -> dict:
    return {
        "storage_key": str(state.past_report.storage_key or ""),
        "filename": str(state.past_report.filename or ""),
    }


def _slim_excel(state: AgentState) -> dict:
    return {
        "storage_key": str(state.excel.storage_key or ""),
        "filename": str(state.excel.filename or ""),
    }


def _slim_excel_files(state: AgentState) -> list[dict]:
    return [
        {
            "excel_id": str(item.excel_id or ""),
            "filename": str(item.filename or ""),
            "storage_key": str(item.storage_key or ""),
        }
        for item in (state.excel_files or [])
    ]


def _slim_excel_sheets(state: AgentState) -> list[dict]:
    sheets: list[dict] = []
    for inv in state.excel_inventory or []:
        sheets.append(
            {
                "excel_id": str(inv.excel_id or ""),
                "filename": str(inv.filename or ""),
                "sheets": [
                    {
                        "sheet_name": str(s.sheet_name or ""),
                        "headers": list(s.headers or []),
                        "numeric_density": float(s.numeric_density or 0.0),
                    }
                    for s in inv.sheets or []
                ],
            }
        )
    return sheets


def _collect_past_report_experiments(state: AgentState, exp_key: str) -> list[dict]:
    matched: list[dict] = []
    key = (exp_key or "").strip()
    if not key:
        return matched

    def _add_from(report) -> None:
        hints = [h for h in (report.hints or []) if (h.exp_key or "").strip() == key]
        if not hints:
            return
        matched.append(
            {
                "report_id": str(report.report_id or ""),
                "filename": str(report.filename or ""),
                "storage_key": str(report.storage_key or ""),
                "hints": [h.model_dump() for h in hints],
            }
        )

    if state.past_report:
        _add_from(state.past_report)
    for report in state.past_reports or []:
        _add_from(report)
    return matched


def _build_experiment_output_payload(
    state: AgentState,
    exp_key: str,
    *,
    unit: ExperimentUnit,
    hitl_entry: ExperimentHitlEntry | None,
) -> dict:
    return {
        "exp_key": exp_key,
        "experiment_unit": unit.model_dump(),
        "past_report_experiments": _collect_past_report_experiments(state, exp_key),
        "excel_files": _slim_excel_files(state),
        "excel_sheets": [],
        "theory_formulas": [t.model_dump() for t in (state.b_layer_bundle.theory_formulas or [])]
        if state.b_layer_bundle
        else [],
        "report": {"hints": [h.model_dump() for h in state.report.hints]},
        "required_outputs": [r.model_dump() for r in state.required_outputs],
        "required_outputs_hitl": state.required_outputs_hitl.model_dump(),
        "experiments": [e.model_dump() for e in state.experiments],
        "result_groups": [g.model_dump() for g in state.result_groups],
        "hitl": {
            "active": bool(hitl_entry),
            "entry": hitl_entry.model_dump() if hitl_entry else None,
        },
    }


def _write_experiment_payload(
    *,
    state: AgentState,
    exp_key: str,
    unit: ExperimentUnit,
    hitl_entry: ExperimentHitlEntry | None,
) -> None:
    try:
        from pathlib import Path
        import json

        out_path = Path("tmp_state_outputs") / f"di_exp_{exp_key}.json"
        payload = _build_experiment_output_payload(
            state,
            exp_key,
            unit=unit,
            hitl_entry=hitl_entry,
        )
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _build_experiment_page_node(state: AgentState) -> AgentState:
    # Lazy import to avoid update_mvp package import cycle during module initialization.
    from graph.update_mvp.I_reiya.build_experiment_page import build_experiment_page

    return build_experiment_page(state)


def _resolve_experiment_parallelism(total_units: int) -> int:
    if total_units <= 1:
        return 1
    raw = (os.environ.get("REPORT_AGENT_EXPERIMENT_PARALLELISM") or "").strip()
    if raw:
        try:
            workers = int(raw)
        except Exception:
            workers = _DEFAULT_EXPERIMENT_PARALLELISM
    else:
        workers = _DEFAULT_EXPERIMENT_PARALLELISM
    workers = max(1, workers)
    return min(total_units, workers)


def _run_unit_pipeline(
    *,
    index: int,
    unit: ExperimentUnit,
    base: AgentState,
    storage: Storage,
    llm: LLMClient,
) -> _ExperimentTaskResult:
    scoped = _scoped_state(base, unit)
    exp_key = str(unit.exp_key or "").strip()
    has_excel_inputs = _has_excel_inputs(scoped)
    if not exp_key:
        return _ExperimentTaskResult(
            index=index,
            exp_key="",
            result_no="",
            experiments=[],
            result_groups=[],
            hitl_entry=None,
        )

    scoped = build_result_hints_from_method(scoped, llm=llm)
    scoped = infer_required_outputs(scoped, llm=llm)
    scoped = required_outputs_ambiguity_gate(scoped)
    entry = _hitl_entry_from_state(scoped, exp_key=exp_key)
    if entry:
        _write_experiment_payload(state=scoped, exp_key=exp_key, unit=unit, hitl_entry=entry)
        return _ExperimentTaskResult(
            index=index,
            exp_key=exp_key,
            result_no="",
            experiments=[],
            result_groups=[],
            hitl_entry=entry,
        )

    if has_excel_inputs:
        scoped = inspect_excel(scoped, storage=storage)
        scoped = select_excel_sheet_per_required_outputs(scoped, llm=llm)
        scoped = sheet_selection_ambiguity_gate(scoped)
        entry = _hitl_entry_from_state(scoped, exp_key=exp_key)
        if entry:
            _write_experiment_payload(state=scoped, exp_key=exp_key, unit=unit, hitl_entry=entry)
            return _ExperimentTaskResult(
                index=index,
                exp_key=exp_key,
                result_no="",
                experiments=[],
                result_groups=[],
                hitl_entry=entry,
            )

        scoped = select_excel_ranges(scoped, storage=storage, llm=llm)
        scoped = bind_table_columns_and_units(scoped, llm=llm)
        scoped = column_unit_ambiguity_gate(scoped)
        entry = _hitl_entry_from_state(scoped, exp_key=exp_key)
        if entry:
            _write_experiment_payload(state=scoped, exp_key=exp_key, unit=unit, hitl_entry=entry)
            return _ExperimentTaskResult(
                index=index,
                exp_key=exp_key,
                result_no="",
                experiments=[],
                result_groups=[],
                hitl_entry=entry,
            )
    else:
        # No workbook input: skip Excel-dependent extraction/binding stages.
        # Also drop table/graph requirements to avoid false HITL due to missing Excel assets.
        for req in scoped.required_outputs or []:
            req.tables_count = 0
            req.graphs_count = 0
        scoped.excel_inventory = []
        scoped.excel_sheet_selections = []
        scoped.table_column_bindings = []

    scoped = bind_insert_assets(scoped, storage=storage)
    entry = _hitl_entry_from_state(scoped, exp_key=exp_key)
    if entry:
        _write_experiment_payload(state=scoped, exp_key=exp_key, unit=unit, hitl_entry=entry)
        return _ExperimentTaskResult(
            index=index,
            exp_key=exp_key,
            result_no="",
            experiments=[],
            result_groups=[],
            hitl_entry=entry,
        )

    if has_excel_inputs:
        scoped = generate_graphs(scoped, storage=storage)
    scoped = generate_quant_comments_from_assets(scoped, storage=storage, llm=llm)
    scoped = _build_experiment_page_node(scoped)

    result_no = str(scoped.pdf.result_number_map.get(exp_key, "") or "")
    _write_experiment_payload(state=scoped, exp_key=exp_key, unit=unit, hitl_entry=None)
    return _ExperimentTaskResult(
        index=index,
        exp_key=exp_key,
        result_no=result_no,
        experiments=list(scoped.experiments or []),
        result_groups=list(scoped.result_groups or []),
        hitl_entry=None,
    )


def run_d_to_i_per_experiment(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient,
) -> AgentState:
    units = list((state.b_layer_bundle.method.experiment_units if state.b_layer_bundle else []) or [])
    if not units:
        return state

    parent_to_children: dict[str, list[ExperimentUnit]] = {}
    for unit in units:
        parent_key = (unit.parent.exp_key if unit.parent else "").strip()
        if parent_key:
            parent_to_children.setdefault(parent_key, []).append(unit)

    filtered_units: list[ExperimentUnit] = []
    for unit in units:
        exp_key = (unit.exp_key or "").strip()
        has_parent = bool(unit.parent and (unit.parent.exp_key or "").strip())
        has_children = exp_key in parent_to_children
        if has_parent:
            filtered_units.append(unit)
        elif not has_children:
            filtered_units.append(unit)

    units = filtered_units

    base = state.model_copy(deep=True)
    merged = state
    # ノード開始直後に「実験数」を明示（UIの"処理中"に出す）
    set_ui_progress(
        merged,
        storage=storage,
        phase="D-Iレイヤー",
        detail=f"実験処理: 0/{len(units)}",
        current_experiment="",
    )
    hitl_queue: list[ExperimentHitlEntry] = list(state.experiment_hitl_queue or [])
    accumulated_experiments: list[Experiment] = []
    accumulated_groups: list = []
    workers = _resolve_experiment_parallelism(len(units))
    task_results: list[_ExperimentTaskResult] = []
    if workers <= 1:
        for index, unit in enumerate(units):
            exp_label = f"{unit.exp_key} {unit.title}".strip()
            set_ui_progress(
                merged,
                storage=storage,
                phase="D-Iレイヤー",
                detail=f"実験処理: {index}/{len(units)}",
                current_experiment=exp_label,
            )
            task_results.append(
                _run_unit_pipeline(
                    index=index,
                    unit=unit,
                    base=base,
                    storage=storage,
                    llm=llm,
                )
            )
    else:
        indexed_results: list[_ExperimentTaskResult | None] = [None] * len(units)
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="exp-path") as executor:
            future_map = {
                executor.submit(
                    _run_unit_pipeline,
                    index=index,
                    unit=unit,
                    base=base,
                    storage=storage,
                    llm=llm,
                ): index
                for index, unit in enumerate(units)
            }
            done_count = 0
            for future in as_completed(future_map):
                index = future_map[future]
                indexed_results[index] = future.result()
                done_count += 1
                # 並列時は順序が前後するため、完了数ベースで可視化する
                completed = indexed_results[index]
                exp_label = ""
                if completed and completed.exp_key:
                    unit = units[index]
                    exp_label = f"{unit.exp_key} {unit.title}".strip()
                set_ui_progress(
                    merged,
                    storage=storage,
                    phase="D-Iレイヤー",
                    detail=f"実験処理: {done_count}/{len(units)}",
                    current_experiment=exp_label,
                )
        task_results = [r for r in indexed_results if r is not None]

    for task in task_results:
        if not task.exp_key:
            continue
        if task.hitl_entry:
            hitl_queue.append(task.hitl_entry)
            continue
        accumulated_experiments = _merge_experiments(accumulated_experiments, task.experiments, task.exp_key)
        if task.result_no:
            accumulated_groups = _merge_result_groups(accumulated_groups, task.result_groups, task.result_no)

    merged.experiments = accumulated_experiments
    merged.result_groups = accumulated_groups
    merged.experiment_hitl_queue = hitl_queue
    _reset_hitl_flags(merged)
    merged = assemble_results_page(merged)
    set_ui_progress(
        merged,
        storage=storage,
        phase="D-Iレイヤー",
        detail=f"実験処理: {len(units)}/{len(units)}",
        current_experiment="",
    )
    merged.job_meta.updated_at = now_iso()
    return merged


__all__ = ["run_d_to_i_per_experiment"]
