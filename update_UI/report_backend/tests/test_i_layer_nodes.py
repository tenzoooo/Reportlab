from __future__ import annotations

from graph.nodes_legacy.generate_captions import generate_captions
from graph.nodes_legacy.generate_quant_comment_text import generate_quant_comment_text
from graph.nodes_legacy.generate_result_description import generate_result_description
from graph.nodes.summarize_method_to_overview import summarize_method_to_overview
from graph.state import (
    AgentState,
    DeltaErrorResult,
    InsertAssetBinding,
    JobMeta,
    TableColumnBinding,
)
from models.contracts import (
    Experiment,
    FigureBlock,
    FigureContent,
    TableBlock,
    TableContent,
)


def test_summarize_method_to_overview_hitl_when_missing() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.pdf.method_text = "方法章の本文"
    state.experiments = [
        Experiment(
            idx="1",
            subidx="",
            name="実験A",
            source_idx="4.1",
            method_summary="",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[],
        )
    ]

    summarize_method_to_overview(state)

    assert state.text_generation_hitl.enabled is True
    assert "HITL_METHOD_SUMMARY_MISSING" in state.text_generation_hitl.codes


def test_summarize_method_to_overview_fills_summary() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.method_tree = [
        {"exp_key": "4.1", "title": "実験A", "method_summary": "手順を実施した。"},
    ]
    state.experiments = [
        Experiment(
            idx="1",
            subidx="",
            name="実験A",
            source_idx="4.1",
            method_summary="",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[],
        )
    ]

    summarize_method_to_overview(state)

    exp = state.experiments[0]
    assert exp.method_summary == "手順を実施した。"
    assert any(ref.target == "method_summary" for ref in exp.evidence_refs)


def test_generate_result_description_uses_labels() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    exp = Experiment(
        idx="1",
        subidx="",
        name="実験A",
        source_idx="4.1",
        method_summary="操作を行った。",
        result_brief="",
        description_brief="",
        quant_comment="",
        blocks=[
            TableBlock(
                table=TableContent(
                    label="表 5.1.1.1",
                    caption="",
                    rows=[["Time (s)", "Voltage (V)"], ["0", "0"]],
                )
            ),
            FigureBlock(
                figure=FigureContent(
                    label="図 5.1.1.1",
                    caption="",
                    figure_image_id="img_1",
                    asset_upload_index=1,
                )
            ),
        ],
    )
    state.experiments = [exp]

    generate_result_description(state)

    assert "表 5.1.1.1" in exp.result_brief
    assert "図 5.1.1.1" in exp.result_brief
    assert exp.result_brief.endswith("示す。")


def test_generate_result_description_hitl_when_assets_missing() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [
        Experiment(
            idx="1",
            subidx="",
            name="実験A",
            source_idx="4.1",
            method_summary="操作を行った。",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[],
        ),
        Experiment(
            idx="2",
            subidx="",
            name="実験B",
            source_idx="4.2",
            method_summary="操作を行った。",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[
                TableBlock(
                    table=TableContent(label="", caption="", rows=[["A", "B"], ["1", "2"]])
                )
            ],
        ),
    ]
    state.insert_asset_bindings = [
        InsertAssetBinding(exp_key="4.1", result_no="5.1", missing_tables=1),
        InsertAssetBinding(exp_key="4.2", result_no="5.2", tables_asset_ids=["tbl_5.2_1"]),
    ]

    generate_result_description(state)

    assert state.text_generation_hitl.enabled is True
    assert "HITL_INSERT_ASSET_MISSING" in state.text_generation_hitl.codes


def test_generate_captions_fills_empty_caption() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [
        Experiment(
            idx="1",
            subidx="",
            name="測定",
            source_idx="4.1",
            method_summary="",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[
                TableBlock(
                    table=TableContent(
                        label="表 5.1.1.1",
                        caption="",
                        rows=[["Time (s)", "Voltage (V)"], ["0", "0"]],
                    )
                )
            ],
        )
    ]
    state.table_column_bindings = [
        TableColumnBinding(
            exp_key="4.1",
            result_no="5.1",
            columns=[],
        )
    ]

    generate_captions(state)

    caption = state.experiments[0].blocks[0].table.caption
    assert caption.startswith("測定")


def test_generate_quant_comment_text_formats_si_units() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.theory_compare_enabled = True
    state.experiments = [
        Experiment(
            idx="1",
            subidx="",
            name="実験A",
            source_idx="4.1",
            method_summary="",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[],
        )
    ]
    state.delta_error_results = [
        DeltaErrorResult(
            exp_key="4.1",
            result_no="5.1",
            target_symbol="I",
            theory_value=0.001,
            theory_unit="A",
            measured_value=0.002,
            measured_unit="A",
            delta=0.001,
            abs_error=0.001,
            confidence=0.9,
        )
    ]

    generate_quant_comment_text(state)

    text = state.experiments[0].quant_comment
    assert "1 mA" in text


def test_generate_quant_comment_text_fail_when_missing() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.theory_compare_enabled = True
    state.experiments = [
        Experiment(
            idx="1",
            subidx="",
            name="実験A",
            source_idx="4.1",
            method_summary="",
            result_brief="",
            description_brief="",
            quant_comment="",
            blocks=[],
        )
    ]

    generate_quant_comment_text(state)

    assert any(e.code == "FAIL_QUANT_COMMENT_MISSING" for e in state.validation_report.errors)
    assert state.status.value == "failed"
