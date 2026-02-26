from __future__ import annotations

import json

from graph.state import (
    AgentState,
    AssetAssignment,
    AxisBindingEntry,
    CRequiredOutputsState,
    ColumnBindingEntry,
    EExcelState,
    ExcelSheetSelectionEntry,
    FAssetsState,
    HITLResponse,
    JobStatus,
    ParamValueEntry,
    RequiredOutputCounts,
    TableBindingEntry,
    TheoryFormula,
    now_iso,
)
from graph.state import PdfHeadingEvidence
from graph.nodes.theory_compare_utils import any_theory_compare_enabled


def _parse_csv_list(value: object) -> list[str]:
    if value is None:
        return []
    text = str(value).strip()
    if not text:
        return []
    return [item.strip() for item in text.split(",") if item.strip()]


def _parse_int(value: object, *, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(str(value).strip())
    except Exception:
        return default


def _parse_json(value: object) -> object:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _ensure_c_required_outputs(state: AgentState) -> CRequiredOutputsState:
    if state.c_required_outputs is None:
        state.c_required_outputs = CRequiredOutputsState()
    return state.c_required_outputs


def _ensure_e_excel(state: AgentState) -> EExcelState:
    if state.e_excel is None:
        state.e_excel = EExcelState()
    return state.e_excel


def _ensure_f_assets(state: AgentState) -> FAssetsState:
    if state.f_assets is None:
        state.f_assets = FAssetsState()
    return state.f_assets


def _update_method_to_result(state: AgentState, answers: dict) -> None:
    exp_key = str(answers.get("exp_key") or "").strip()
    result_no = str(answers.get("result_no") or "").strip()
    method_no = str(answers.get("method_no") or "").strip()
    if exp_key and result_no:
        state.pdf.result_number_map[exp_key] = result_no
    if exp_key and method_no:
        for exp in state.experiments:
            if exp.idx == exp_key:
                exp.method_no = method_no
                break


def _update_discussion_section(state: AgentState, answers: dict) -> None:
    section_id = str(answers.get("section_id") or "").strip()
    title = str(answers.get("title") or "").strip()
    start_page = _parse_int(answers.get("start_page"), default=0)
    end_page = _parse_int(answers.get("end_page"), default=0)
    if section_id:
        state.pdf.discussion_section = PdfHeadingEvidence(
            section=section_id,
            title=title,
            level=1,
            raw_line="",
            page=start_page or None,
            line_index=None,
            global_index=None,
        )
        state.pdf.discussion_chapter = start_page or state.pdf.discussion_chapter
        if end_page:
            state.pdf.discussion_text = state.pdf.discussion_text


def _update_excel_sheet(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    excel_file_id = str(answers.get("excel_file_id") or "").strip()
    sheet_name = str(answers.get("sheet_name") or "").strip()
    if not result_no:
        return
    e_excel = _ensure_e_excel(state)
    e_excel.sheet_selection_by_result_no[result_no] = ExcelSheetSelectionEntry(
        excel_file_id=excel_file_id,
        sheet_name=sheet_name,
    )


def _update_table_columns(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    table_id = str(answers.get("table_id") or "").strip() or "table"
    columns_json = _parse_json(answers.get("columns_json"))
    if not result_no:
        return
    columns: list[ColumnBindingEntry] = []
    if isinstance(columns_json, list):
        for item in columns_json:
            if not isinstance(item, dict):
                continue
            columns.append(
                ColumnBindingEntry(
                    name=str(item.get("name") or "").strip(),
                    col_ref=str(item.get("col_ref") or item.get("column") or "").strip(),
                    unit=str(item.get("unit") or "").strip(),
                )
            )
    e_excel = _ensure_e_excel(state)
    bindings = e_excel.table_bindings_by_result_no.get(result_no, [])
    updated = False
    for idx, binding in enumerate(bindings):
        if binding.table_id == table_id:
            bindings[idx] = TableBindingEntry(table_id=table_id, columns=columns)
            updated = True
            break
    if not updated:
        bindings.append(TableBindingEntry(table_id=table_id, columns=columns))
    e_excel.table_bindings_by_result_no[result_no] = bindings


def _update_unit_unknown(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    target = str(answers.get("target") or "").strip()
    unit = str(answers.get("unit") or "").strip()
    if not result_no or not unit:
        return
    e_excel = _ensure_e_excel(state)
    if target == "table":
        table_id = str(answers.get("table_id") or "").strip() or "table"
        column_name = str(answers.get("column_name") or "").strip()
        bindings = e_excel.table_bindings_by_result_no.get(result_no, [])
        if not bindings:
            bindings = [TableBindingEntry(table_id=table_id, columns=[])]
        for binding in bindings:
            if binding.table_id != table_id:
                continue
            for col in binding.columns:
                if column_name and (col.name == column_name or col.col_ref == column_name):
                    col.unit = unit
                    break
            else:
                if column_name:
                    binding.columns.append(ColumnBindingEntry(name=column_name, col_ref=column_name, unit=unit))
        e_excel.table_bindings_by_result_no[result_no] = bindings
        return

    if target == "axis":
        axis = str(answers.get("axis") or "").strip()
        axis_binding = e_excel.axis_bindings_by_result_no.get(result_no, AxisBindingEntry())
        if axis == "x":
            axis_binding.x_unit = unit
        elif axis == "y":
            axis_binding.y_unit = unit
        e_excel.axis_bindings_by_result_no[result_no] = axis_binding


def _update_axis_labels(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    if not result_no:
        return
    x_column = _parse_int(answers.get("x_column"), default=0)
    y_columns = _parse_csv_list(answers.get("y_columns"))
    y_columns_int = []
    for item in y_columns:
        y_columns_int.append(_parse_int(item, default=0))
    axis_binding = AxisBindingEntry(
        x_column=x_column,
        y_columns=y_columns_int,
        x_label=str(answers.get("x_label") or "").strip(),
        y_label=str(answers.get("y_label") or "").strip(),
        x_unit=str(answers.get("x_unit") or "").strip(),
        y_unit=str(answers.get("y_unit") or "").strip(),
    )
    e_excel = _ensure_e_excel(state)
    e_excel.axis_bindings_by_result_no[result_no] = axis_binding


def _update_insert_assets(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    if not result_no:
        return
    assignments = AssetAssignment(
        tables=_parse_csv_list(answers.get("tables")),
        graphs=_parse_csv_list(answers.get("graphs")),
        photos=_parse_csv_list(answers.get("photos")),
    )
    f_assets = _ensure_f_assets(state)
    f_assets.assignments_by_result_no[result_no] = assignments


def _update_insert_assets_missing(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    action = str(answers.get("action") or "").strip()
    if not result_no:
        return
    if action == "proceed_zero":
        c_required = _ensure_c_required_outputs(state)
        c_required.by_result_no[result_no] = RequiredOutputCounts()


def _next_formula_id(state: AgentState) -> str:
    return f"manual-{len(state.pdf.theory_formulas) + 1}"


def _update_theory_formula_missing(state: AgentState, answers: dict) -> None:
    raw = str(answers.get("raw_formula") or "").strip()
    normalized = str(answers.get("normalized_formula") or "").strip()
    omml = str(answers.get("omml") or "").strip()
    select_as_primary = str(answers.get("select_as_primary") or "").strip().lower() == "true"
    if not raw:
        return
    formula_id = _next_formula_id(state)
    if select_as_primary:
        for formula in state.pdf.theory_formulas:
            formula.selected = False
    state.pdf.theory_formulas.append(
        TheoryFormula(
            candidate_id=formula_id,
            raw=raw,
            normalized=normalized or raw,
            omml=omml,
            source_kind="user",
            selected=select_as_primary,
        )
    )


def _update_omml_conversion_failed(state: AgentState, answers: dict) -> None:
    formula_id = str(answers.get("formula_id") or "").strip()
    raw = str(answers.get("raw_formula") or "").strip()
    omml = str(answers.get("omml") or "").strip()
    if not formula_id or not raw:
        return
    for formula in state.pdf.theory_formulas:
        if formula.candidate_id == formula_id:
            formula.raw = raw
            if omml:
                formula.omml = omml
            formula.selected = True
            break


def _update_theory_substitution_missing(state: AgentState, answers: dict) -> None:
    result_no = str(answers.get("result_no") or "").strip()
    params_json = _parse_json(answers.get("params_json"))
    if not result_no or not isinstance(params_json, dict):
        return
    e_excel = _ensure_e_excel(state)
    entry = e_excel.param_bindings_by_result_no.get(result_no, {})
    for key, payload in params_json.items():
        if not isinstance(payload, dict):
            continue
        entry[str(key)] = ParamValueEntry(
            value=payload.get("value"),
            unit=str(payload.get("unit") or "").strip(),
            sheet_name=payload.get("sheet_name"),
            cell_or_range=payload.get("cell_or_range"),
        )
    e_excel.param_bindings_by_result_no[result_no] = entry


def _update_theory_compare_hitl(state: AgentState, answers: dict) -> None:
    payload = _parse_json(answers.get("payload_json"))
    if not isinstance(payload, dict):
        payload = {}
    experiments = payload.get("experiments")
    if not isinstance(experiments, list):
        experiments = []
    decisions: dict[str, bool] = {}
    for idx, exp in enumerate(experiments):
        if not isinstance(exp, dict):
            continue
        exp_key = str(exp.get("exp_key") or "").strip()
        if not exp_key:
            continue
        raw = answers.get(f"compare_{idx}")
        if raw is None:
            raw = exp.get("default_compare")
        val = str(raw).strip().lower()
        if val in {"true", "1", "yes"}:
            decisions[exp_key] = True
        elif val in {"false", "0", "no"}:
            decisions[exp_key] = False
        else:
            decisions[exp_key] = bool(exp.get("default_compare"))
    if decisions:
        state.theory_compare_by_experiment = decisions
        state.theory_compare_enabled = any_theory_compare_enabled(state)
        state.theory_compare_decided = True
        state.theory_compare_hitl.enabled = False


def apply_hitl_response(state: AgentState) -> AgentState:
    if state.hitl_active is None or state.hitl_response is None:
        return state

    if state.hitl_response.request_id != state.hitl_active.request_id:
        state.status = JobStatus.waiting_hitl
        state.job_meta.updated_at = now_iso()
        return state

    response: HITLResponse = state.hitl_response
    issue_code = state.hitl_active.issue_code
    answers = response.answers or {}

    if issue_code == "HITL_METHOD_TO_RESULT_MAPPING":
        _update_method_to_result(state, answers)
    elif issue_code == "HITL_DISCUSSION_SECTION_UNKNOWN":
        _update_discussion_section(state, answers)
    elif issue_code == "HITL_EXCEL_SHEET_UNKNOWN":
        _update_excel_sheet(state, answers)
    elif issue_code == "HITL_TABLE_COLUMN_MAPPING_UNKNOWN":
        _update_table_columns(state, answers)
    elif issue_code == "HITL_UNIT_UNKNOWN":
        _update_unit_unknown(state, answers)
    elif issue_code == "HITL_AXIS_LABEL_UNKNOWN":
        _update_axis_labels(state, answers)
    elif issue_code == "HITL_INSERT_ASSET_UNKNOWN":
        _update_insert_assets(state, answers)
    elif issue_code == "HITL_INSERT_ASSET_MISSING":
        _update_insert_assets_missing(state, answers)
    elif issue_code == "HITL_THEORY_FORMULA_MISSING":
        _update_theory_formula_missing(state, answers)
    elif issue_code == "HITL_OMML_CONVERSION_FAILED":
        _update_omml_conversion_failed(state, answers)
    elif issue_code == "HITL_THEORY_SUBSTITUTION_MISSING":
        _update_theory_substitution_missing(state, answers)
    elif issue_code == "HITL_THEORY_COMPARE_PER_EXPERIMENT":
        _update_theory_compare_hitl(state, answers)

    state.hitl_history.append(
        {
            "request": state.hitl_active.dict(),
            "response": response.dict(),
            "rewind_target": state.hitl_active.rewind_target,
            "timestamp": now_iso(),
        }
    )
    state.next_rewind_target = state.hitl_active.rewind_target
    state.status = JobStatus.ready_to_resume
    state.hitl_active = None
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["apply_hitl_response"]
