from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook

from core.storage import LocalStorage
from graph.nodes.bind_insert_assets import bind_insert_assets
from graph.nodes.resolve_axes_and_units import resolve_axes_and_units
from graph.state import (
    AgentState,
    ColumnUnitBinding,
    InsertAssetBinding,
    JobMeta,
    RequiredOutputEstimate,
    TableColumnBinding,
)
from models.contracts import ImageAsset


def _make_workbook_bytes(sheet_name: str, headers: list[str], rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _state_with_excel(storage: LocalStorage, key: str) -> AgentState:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.excel.storage_key = key
    state.excel.filename = "sample.xlsx"
    return state


def test_bind_insert_assets_assigns_table_and_graph(tmp_path) -> None:
    storage = LocalStorage(root=tmp_path)
    data = _make_workbook_bytes(
        "5.1 Data",
        ["Time (s)", "Voltage (V)"],
        [[0.0, 1.0], [1.0, 2.0]],
    )
    key = storage.put_bytes("excel/sample.xlsx", data)
    state = _state_with_excel(storage, key)
    state.pdf.result_number_map = {"4.1": "5.1"}
    state.required_outputs = [
        RequiredOutputEstimate(exp_key="4.1", tables_count=1, graphs_count=1, photos_count=0, confidence=0.9)
    ]
    state.table_column_bindings = [
        TableColumnBinding(
            exp_key="4.1",
            result_no="5.1",
            excel_id="primary",
            sheet_name="5.1 Data",
            header_row_index=1,
            columns=[
                ColumnUnitBinding(column_index=1, header="Time (s)", name="Time", unit="s"),
                ColumnUnitBinding(column_index=2, header="Voltage (V)", name="Voltage", unit="V"),
            ],
            confidence=0.9,
        )
    ]
    state.assets_images = [
        ImageAsset(
            image_id="img_1",
            filename="graph.png",
            mime_type="image/png",
            storage_key="images/img_1.png",
            upload_index=1,
            rough_class="graph",
            rough_class_confidence=0.9,
            rough_class_method="heuristic",
            rough_class_rationale="test",
            assigned_to="4.1",
        )
    ]

    bind_insert_assets(state, storage=storage)

    assert state.assets_tables
    assert state.insert_asset_bindings
    binding = state.insert_asset_bindings[0]
    assert binding.tables_asset_ids
    assert binding.graphs_asset_ids == ["img_1"]
    assert binding.missing_tables == 0
    assert state.insert_asset_hitl.enabled is False


def test_resolve_axes_and_units_no_hitl() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.table_column_bindings = [
        TableColumnBinding(
            exp_key="4.1",
            result_no="5.1",
            sheet_name="5.1 Data",
            header_row_index=1,
            columns=[
                ColumnUnitBinding(column_index=1, header="Time (s)", name="Time", unit="s"),
                ColumnUnitBinding(column_index=2, header="Voltage (V)", name="Voltage", unit="V"),
            ],
            confidence=0.9,
        )
    ]
    state.insert_asset_bindings = [
        InsertAssetBinding(
            exp_key="4.1",
            result_no="5.1",
            graphs_asset_ids=["fig_5.1_1"],
        )
    ]

    resolve_axes_and_units(state, llm=None)

    assert state.graph_axis_bindings
    axis = state.graph_axis_bindings[0]
    assert axis.x_column == 1
    assert axis.y_columns
    assert axis.x_unit == "s"
    assert axis.y_unit == "V"
    assert state.axis_hitl.enabled is False
