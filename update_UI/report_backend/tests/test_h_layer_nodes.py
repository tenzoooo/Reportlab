from __future__ import annotations

from graph.nodes.compute_delta_and_abs_error import compute_delta_and_abs_error
from graph.nodes.compute_slope_and_extreme import compute_slope_and_extreme
from graph.nodes.compute_theory_value import compute_theory_value
from graph.state import (
    AgentState,
    ColumnUnitBinding,
    GraphAxisBinding,
    InsertAssetBinding,
    JobMeta,
    TableColumnBinding,
    TheoryFormula,
    TheoryParamBinding,
    TheoryParamValue,
)
from models.contracts import TableAsset


def test_compute_theory_value_and_delta() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.theory_compare_enabled = True
    state.pdf.theory_formulas = [
        TheoryFormula(
            candidate_id="t1",
            raw="V = I * R",
            normalized="V = I * R",
            omml="",
            source_kind="theory",
        )
    ]
    state.theory_param_bindings = [
        TheoryParamBinding(
            exp_key="4.1",
            result_no="5.1",
            required_params=["I", "R"],
            params=[
                TheoryParamValue(symbol="I", value=2.0, unit="A"),
                TheoryParamValue(symbol="R", value=3.0, unit="ohm"),
            ],
        )
    ]
    state.table_column_bindings = [
        TableColumnBinding(
            exp_key="4.1",
            result_no="5.1",
            columns=[
                ColumnUnitBinding(column_index=1, name="Voltage", unit="V"),
                ColumnUnitBinding(column_index=2, name="Other", unit="1"),
            ],
        )
    ]
    state.assets_tables = [
        TableAsset(
            table_id="tbl_5.1_1",
            storage_key="tables/x.json",
            raw_csv="",
            rows=[["Voltage (V)", "Other"], ["6", "1"], ["6", "2"]],
            assigned_to="4.1",
        )
    ]
    state.insert_asset_bindings = [
        InsertAssetBinding(exp_key="4.1", result_no="5.1", tables_asset_ids=["tbl_5.1_1"])
    ]

    compute_theory_value(state)
    compute_delta_and_abs_error(state)

    assert state.theory_value_results
    assert state.delta_error_results
    assert abs(state.theory_value_results[0].value - 6.0) < 1e-6
    assert abs(state.delta_error_results[0].delta) < 1e-6


def test_compute_slope_and_extreme() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.theory_compare_enabled = False
    state.graph_axis_bindings = [
        GraphAxisBinding(
            graph_id="fig_5.1_1",
            exp_key="4.1",
            result_no="5.1",
            x_column=1,
            y_columns=[2],
            x_unit="s",
            y_unit="V",
        )
    ]
    state.table_column_bindings = [
        TableColumnBinding(
            exp_key="4.1",
            result_no="5.1",
            columns=[
                ColumnUnitBinding(column_index=1, name="Time", unit="s"),
                ColumnUnitBinding(column_index=2, name="Voltage", unit="V"),
            ],
        )
    ]
    state.assets_tables = [
        TableAsset(
            table_id="tbl_5.1_1",
            storage_key="tables/x.json",
            raw_csv="",
            rows=[["Time (s)", "Voltage (V)"], ["0", "0"], ["2", "4"]],
            assigned_to="4.1",
        )
    ]
    state.insert_asset_bindings = [
        InsertAssetBinding(exp_key="4.1", result_no="5.1", tables_asset_ids=["tbl_5.1_1"])
    ]

    compute_slope_and_extreme(state)

    assert state.slope_extreme_results
    result = state.slope_extreme_results[0]
    assert abs(result.slope - 2.0) < 1e-6
    assert result.max_value == 4.0
    assert result.min_value == 0.0
