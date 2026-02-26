from __future__ import annotations

import os

from graph.hitl import hitl_disabled
from graph.nodes.column_unit_ambiguity_gate import column_unit_ambiguity_gate
from graph.nodes.required_outputs_ambiguity_gate import required_outputs_ambiguity_gate
from graph.nodes.sheet_selection_ambiguity_gate import sheet_selection_ambiguity_gate
from graph.state import (
    AgentState,
    ExcelSheetSelection,
    ExcelSheetSelectionCandidate,
    ColumnUnitBinding,
    RequiredOutputEstimate,
    TableColumnBinding,
)


def test_hitl_disabled_env_flag() -> None:
    os.environ["REPORT_AGENT_DISABLE_HITL"] = "1"
    assert hitl_disabled() is True


def test_sheet_selection_gate_does_not_enable_hitl_when_disabled() -> None:
    os.environ["REPORT_AGENT_DISABLE_HITL"] = "1"
    state = AgentState()
    state.excel_sheet_selections = [
        ExcelSheetSelection(
            exp_key="4.1",
            result_no="",
            title="demo",
            selected_excel_id="",
            selected_sheet="",
            confidence=0.1,
            rationale="",
            evidence=[],
            candidates=[
                ExcelSheetSelectionCandidate(
                    excel_id="excel_1",
                    sheet_name="SheetA",
                    confidence=0.3,
                    rationale="",
                    evidence=[],
                )
            ],
            used_llm=False,
        )
    ]
    out = sheet_selection_ambiguity_gate(state)
    assert out.excel_sheet_hitl.enabled is False
    assert out.excel_sheet_selections[0].selected_excel_id == "excel_1"
    assert out.excel_sheet_selections[0].selected_sheet == "SheetA"


def test_required_outputs_gate_does_not_enable_hitl_when_disabled() -> None:
    os.environ["REPORT_AGENT_DISABLE_HITL"] = "1"
    state = AgentState()
    state.required_outputs = [
        RequiredOutputEstimate(
            exp_key="4.2.2",
            title="demo",
            method_summary="",
            tables_count=1,
            graphs_count=1,
            photos_count=0,
            confidence=0.1,
            rationale="",
            evidence=[],
            candidates=[],
        )
    ]
    out = required_outputs_ambiguity_gate(state)
    assert out.required_outputs_hitl.enabled is False


def test_column_unit_gate_does_not_enable_hitl_when_disabled() -> None:
    os.environ["REPORT_AGENT_DISABLE_HITL"] = "1"
    state = AgentState()
    state.table_column_bindings = [
        TableColumnBinding(
            exp_key="4.3.4",
            result_no="",
            excel_id="excel_1",
            sheet_name="SheetA",
            columns=[
                ColumnUnitBinding(
                    column_index=1,
                    header="Vout",
                    name="Vout",
                    unit="",
                    confidence=0.1,
                    rationale="",
                    evidence=[],
                ),
            ],
            confidence=0.1,
            missing_mappings=["Vout"],
            missing_units=["Vout"],
            used_llm=False,
        )
    ]
    out = column_unit_ambiguity_gate(state)
    assert out.column_unit_hitl.enabled is False
