from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook

from core.storage import LocalStorage
from graph.nodes.bind_table_columns_and_units import bind_table_columns_and_units
from graph.nodes.bind_theory_substitution_params import bind_theory_substitution_params
from graph.nodes.column_unit_ambiguity_gate import column_unit_ambiguity_gate
from graph.nodes.inspect_excel import inspect_excel
from graph.nodes.param_binding_gate import param_binding_gate
from graph.nodes.select_excel_sheet_per_experiment import select_excel_sheet_per_experiment
from graph.nodes.sheet_selection_ambiguity_gate import sheet_selection_ambiguity_gate
from graph.state import AgentState, JobMeta, MethodNumberEvidence, TheoryFormula


def _make_workbook_bytes(sheet_name: str, headers: list[str], rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(headers)
    for row in rows:
        ws.append(row)
    other = wb.create_sheet("Other")
    other.append(["foo", "bar"])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _state_with_excel(storage: LocalStorage, key: str) -> AgentState:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.excel.storage_key = key
    state.excel.filename = "sample.xlsx"
    return state


def test_inspect_and_select_excel_sheet(tmp_path) -> None:
    storage = LocalStorage(root=tmp_path)
    data = _make_workbook_bytes(
        "4.1-5.1 Test Data",
        ["Voltage (V)", "Current (A)"],
        [[1.0, 2.0], [2.0, 3.0]],
    )
    key = storage.put_bytes("excel/sample.xlsx", data)
    state = _state_with_excel(storage, key)
    state.pdf.method_numbers = [MethodNumberEvidence(exp_key="4.1", title="Test")]
    state.pdf.result_number_map = {"4.1": "5.1"}

    inspect_excel(state, storage=storage)
    select_excel_sheet_per_experiment(state, llm=None)

    assert state.excel_inventory
    assert state.excel_sheet_selections
    selection = state.excel_sheet_selections[0]
    assert selection.selected_sheet == "4.1-5.1 Test Data"
    assert selection.confidence >= 0.8

    sheet_selection_ambiguity_gate(state)
    assert state.excel_sheet_hitl.enabled is False


def test_column_binding_unit_missing_triggers_hitl(tmp_path) -> None:
    storage = LocalStorage(root=tmp_path)
    data = _make_workbook_bytes(
        "4.1-5.1 Test Data",
        ["Voltage", "index"],
        [[1.0, 1], [2.0, 2]],
    )
    key = storage.put_bytes("excel/sample.xlsx", data)
    state = _state_with_excel(storage, key)
    state.pdf.method_numbers = [MethodNumberEvidence(exp_key="4.1", title="Test")]
    state.pdf.result_number_map = {"4.1": "5.1"}

    inspect_excel(state, storage=storage)
    select_excel_sheet_per_experiment(state, llm=None)
    bind_table_columns_and_units(state, llm=None)

    binding = state.table_column_bindings[0]
    assert "Voltage" in binding.missing_units
    assert any(col.unit == "1" for col in binding.columns)

    column_unit_ambiguity_gate(state)
    assert state.column_unit_hitl.enabled is True
    assert "HITL_UNIT_UNKNOWN" in state.column_unit_hitl.codes


def test_param_binding_gate_missing_params(tmp_path) -> None:
    storage = LocalStorage(root=tmp_path)
    data = _make_workbook_bytes(
        "4.1-5.1 Test Data",
        ["R (ohm)", "index"],
        [[100, 1], [200, 2]],
    )
    key = storage.put_bytes("excel/sample.xlsx", data)
    state = _state_with_excel(storage, key)
    state.pdf.method_numbers = [MethodNumberEvidence(exp_key="4.1", title="Test")]
    state.pdf.result_number_map = {"4.1": "5.1"}
    state.pdf.theory_formulas = [
        TheoryFormula(
            candidate_id="t1",
            raw="V = I * R",
            normalized="V = I * R",
            omml="",
            source_kind="theory",
        )
    ]

    inspect_excel(state, storage=storage)
    select_excel_sheet_per_experiment(state, llm=None)
    bind_theory_substitution_params(state, llm=None)
    param_binding_gate(state)

    assert state.theory_param_hitl.enabled is True
    assert state.theory_param_hitl.code == "HITL_THEORY_SUBSTITUTION_MISSING"
