from __future__ import annotations

from pathlib import Path

from core.storage import LocalStorage
from graph.nodes.render_markdown import render_markdown
from graph.state import AgentState, JobMeta
from models.contracts import (
    Consideration,
    Experiment,
    FigureBlock,
    FigureContent,
    TableBlock,
    TableContent,
    TemplateContext,
)


def test_render_markdown_replaces_missing_cells_with_diagonal_line(tmp_path: Path):
    storage = LocalStorage(root=tmp_path)

    exp = Experiment(
        idx="1",
        subidx="",
        name="テスト実験",
        source_idx="5.1",
        method_summary="手順を行った。",
        description_brief="手順を行い、結果を整理した。",
        quant_comment="",
        blocks=[
            TableBlock(
                table=TableContent(
                    label="表 5.1.1.1",
                    caption="テスト表",
                    rows=[
                        ["A", "B", "C"],
                        ["1", "", "3"],
                        ["", "2", ""],
                    ],
                    quant_comment="定量コメント: 欠損がある。",
                )
            ),
            FigureBlock(
                figure=FigureContent(
                    figure_image_id="img1",
                    label="図 5.1.1.1",
                    caption="テスト図",
                    quant_comment="定量コメント: 図の説明。",
                )
            ),
        ],
    )

    state = AgentState(job_meta=JobMeta(job_id="job1"))
    state.template_context = TemplateContext(
        chapter=5,
        chapter_plus_1=6,
        chapter_plus_2=7,
        experiments=[exp],
        consideration=Consideration(),
        summary="",
    )

    out = render_markdown(state, storage=storage)
    assert out.artifact_markdown_key
    md = storage.get_bytes(out.artifact_markdown_key).decode("utf-8", "ignore")

    # Missing cells should be rendered as a diagonal line in the table body.
    assert "| 1 | ＼ | 3 |" in md
    assert "| ＼ | 2 | ＼ |" in md


def test_render_markdown_places_single_quant_comment_after_figure(tmp_path: Path):
    storage = LocalStorage(root=tmp_path)

    exp = Experiment(
        idx="1",
        subidx="",
        name="テスト実験",
        source_idx="5.1",
        method_summary="手順を行った。",
        description_brief="手順を行い、結果を整理した。",
        quant_comment="VCE≈1 V付近でICが変化した。",
        blocks=[
            TableBlock(
                table=TableContent(
                    label="表 5.1.1.1",
                    caption="テスト表",
                    rows=[["A", "B"], ["1", "2"]],
                    quant_comment="(should not render)",
                )
            ),
            FigureBlock(
                figure=FigureContent(
                    figure_image_id="img1",
                    label="図 5.1.1.1",
                    caption="テスト図",
                    quant_comment="(should not render)",
                )
            ),
        ],
    )

    state = AgentState(job_meta=JobMeta(job_id="job2"))
    state.template_context = TemplateContext(
        chapter=5,
        chapter_plus_1=6,
        chapter_plus_2=7,
        experiments=[exp],
        consideration=Consideration(),
        summary="",
    )

    out = render_markdown(state, storage=storage)
    md = storage.get_bytes(out.artifact_markdown_key).decode("utf-8", "ignore")

    # Only experiment-level quant comment is rendered.
    assert "(should not render)" not in md
    assert "VCE≈1 V付近でICが変化した。" in md
    # Quant comment is after the figure caption.
    assert md.find("図 5.1.1.1：テスト図") < md.find("VCE≈1 V付近でICが変化した。")
