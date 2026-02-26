from __future__ import annotations

from graph.nodes.assemble_experiment_result_group import assemble_experiment_result_group
from graph.nodes.assemble_results_page import assemble_results_page
from graph.state import AgentState, DeltaErrorResult, InsertAssetBinding, JobMeta, RequiredOutputEstimate
from models.contracts import (
    EvidenceRef,
    Experiment,
    FigureBlock,
    FigureContent,
    ImageAsset,
    TableBlock,
    TableContent,
)


def _build_experiment() -> Experiment:
    return Experiment(
        idx="1",
        subidx="",
        name="実験A",
        source_idx="4.1",
        method_no="4.1",
        method_summary="方法を実施した。",
        result_brief="測定結果を表 5.1.1 に示す。",
        description_brief="",
        quant_comment="定量コメントである。",
        evidence_refs=[
            EvidenceRef(target="method_summary", text="方法を実施した。"),
            EvidenceRef(target="result_description", text="測定結果を表 5.1.1 に示す。"),
            EvidenceRef(target="quant_comment", text="定量コメントである。"),
        ],
        blocks=[
            TableBlock(
                table=TableContent(
                    label="表 5.1.1",
                    caption="測定結果",
                    rows=[["A", "B"], ["1", "2"]],
                    evidence_refs=[],
                )
            ),
            FigureBlock(
                figure=FigureContent(
                    label="図 5.1.1",
                    caption="測定グラフ",
                    figure_image_id="img_1",
                    asset_upload_index=1,
                    evidence_refs=[],
                )
            ),
        ],
    )


def _build_state() -> AgentState:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [_build_experiment()]
    state.pdf.result_number_map = {"4.1": "5.1"}
    state.required_outputs = [
        RequiredOutputEstimate(exp_key="4.1", title="実験A", tables_count=1, graphs_count=1, photos_count=0)
    ]
    state.insert_asset_bindings = [
        InsertAssetBinding(
            exp_key="4.1",
            result_no="5.1",
            tables_asset_ids=["tbl_5.1_1"],
            graphs_asset_ids=["img_1"],
            photos_asset_ids=[],
            required_tables=1,
            required_graphs=1,
            required_photos=0,
        )
    ]
    state.assets_images = [
        ImageAsset(
            image_id="img_1",
            filename="img_1.png",
            mime_type="image/png",
            storage_key="s3://img_1.png",
            upload_index=1,
            rough_class="graph",
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
    state.theory_compare_enabled = True
    return state


def test_assemble_experiment_result_group_builds_group() -> None:
    state = _build_state()

    assemble_experiment_result_group(state)

    assert len(state.result_groups) == 1
    group = state.result_groups[0]
    assert group.result_no == "5.1"
    assert group.method_no == "4.1"
    assert group.experiment_name == "実験A"
    assert group.experiment_overview.text == "方法を実施した。"
    assert group.result_description.text == "測定結果を表 5.1.1 に示す。"
    assert group.tables[0].asset_id == "tbl_5.1_1"
    assert group.figures[0].asset_id == "img_1"
    assert group.quant_comment.theory_compare is True
    assert "theory_value" in group.quant_comment.metrics


def test_assemble_experiment_result_group_hitl_when_method_no_missing() -> None:
    state = _build_state()
    state.experiments[0].method_no = None

    assemble_experiment_result_group(state)

    assert state.text_generation_hitl.enabled is True
    assert "HITL_METHOD_NUMBER_MISSING" in state.text_generation_hitl.codes


def test_assemble_results_page_builds_page() -> None:
    state = _build_state()

    assemble_experiment_result_group(state)
    assemble_results_page(state)

    assert state.results_page is not None
    assert len(state.results_page.sections) == 1
    section = state.results_page.sections[0]
    assert section.title == "結果 5.1"
    assert section.header_only is False
    assert len(section.groups) == 1
