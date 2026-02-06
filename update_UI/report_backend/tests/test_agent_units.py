from __future__ import annotations

from io import BytesIO
from pathlib import Path

import fitz  # PyMuPDF
from openpyxl import Workbook

from core.config import load_settings
from core.storage import build_storage
from graph.build_graph import build_graph
from graph.nodes.image_assign import image_assign
from graph.nodes.table_assign import table_assign
from graph.nodes.unit_init import unit_init
from graph.nodes.validate import validate
from graph.state import AgentState, JobMeta
from llm.client import LLMClient
from llm.client import _repair_mvp_quant_comment_digits_each_sentence
from llm.client import _sanitize_mvp_quant_comment_paragraph
from models.contracts import (
    BelongsToCandidate,
    Experiment,
    ImageAnalysis,
    ImageAsset,
    TableAnalysis,
    TableAsset,
)


def _make_pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    return doc.tobytes()


def _make_excel_bytes(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    for row in rows:
        ws.append(list(row))
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_unit_init_builds_experiment_list_and_resets_assignments():
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.method_tree = [
        {"exp_key": "3.1", "title": "テスト実験", "method_summary": "手順を確認し、実験を行った。"}
    ]
    state.assets_images = [
        ImageAsset(image_id="img1", filename="a.png", mime_type="image/png", storage_key="k", assigned_to="3.1")
    ]
    state.assets_tables = [
        TableAsset(table_id="tbl1", storage_key="k2", raw_csv="a,b", assigned_to="3.1")
    ]

    unit_init(state)

    assert [e.idx for e in state.experiments] == ["1"]
    assert [e.subidx for e in state.experiments] == [""]
    assert [e.source_idx for e in state.experiments] == ["3.1"]
    assert state.experiments[0].description_brief == "手順を確認し、実験を行った。"
    assert state.assets_images[0].assigned_to is None
    assert state.assets_tables[0].assigned_to is None


def test_asset_assignment_preserves_upload_order_within_blocks(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_MODEL", "dummy")
    monkeypatch.setenv("REPORT_AGENT_MOCK_LLM", "1")

    exp = Experiment(idx="1", subidx="", source_idx="3.1", name="テスト実験", method_summary="方法要約")
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [exp]

    state.assets_images = [
        ImageAsset(
            image_id="img1",
            filename="a.png",
            mime_type="image/png",
            storage_key="k",
            upload_index=2,
            analysis=ImageAnalysis(
                caption="画像",
                quant_comment="",
                belongs_to=[BelongsToCandidate(exp_key="3.1", score=0.9, rationale="")],
                result_summary="画像結果",
            ),
        )
    ]
    state.assets_tables = [
        TableAsset(
            table_id="tbl1",
            storage_key="k2",
            raw_csv="a,b",
            rows=[["a", "b"]],
            upload_index=1,
            analysis=TableAnalysis(
                caption="表",
                quant_comment="",
                belongs_to=[BelongsToCandidate(exp_key="3.1", score=0.9, rationale="")],
                result_summary="表結果",
            ),
        )
    ]

    image_assign(state)
    table_assign(state)
    validate(state, storage=build_storage(backend="local", storage_dir=tmp_path), llm=LLMClient(load_settings()))

    assert [b.type for b in state.experiments[0].blocks] == ["table", "figure"]
    assert state.experiments[0].description_brief


def test_validate_warns_long_caption_and_updates_block_caption(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_MODEL", "dummy")
    monkeypatch.setenv("REPORT_AGENT_MOCK_LLM", "1")

    exp = Experiment(idx="1", subidx="", source_idx="3.1", name="テスト実験", method_summary="方法要約")
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [exp]

    long_caption = "あ" * 16
    state.assets_images = [
        ImageAsset(
            image_id="img1",
            filename="a.png",
            mime_type="image/png",
            storage_key="k",
            upload_index=1,
            assigned_to="3.1",
            analysis=ImageAnalysis(
                caption=long_caption,
                quant_comment="",
                belongs_to=[BelongsToCandidate(exp_key="3.1", score=0.9, rationale="")],
                result_summary="画像結果",
            ),
        )
    ]

    image_assign(state)
    table_assign(state)
    validate(state, storage=build_storage(backend="local", storage_dir=tmp_path), llm=LLMClient(load_settings()))

    captions = [w for w in state.validation_report.warnings if w.code == "WARN_CAPTION_TOO_LONG"]
    assert captions
    assert state.assets_images[0].analysis is not None
    assert len(state.assets_images[0].analysis.caption) == 16
    fig_block = next(b for b in state.experiments[0].blocks if b.type == "figure")
    assert fig_block.figure.caption == state.assets_images[0].analysis.caption
    # Label format: 図 {chapter}.{idx}.{seq} (subidx omitted when empty).
    assert fig_block.figure.label.startswith("図 ")


def test_validate_backfills_assignment_from_analysis(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_MODEL", "dummy")
    monkeypatch.setenv("REPORT_AGENT_MOCK_LLM", "1")

    exp = Experiment(idx="1", subidx="", source_idx="3.1", name="テスト実験", method_summary="方法要約")
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [exp]

    state.assets_images = [
        ImageAsset(
            image_id="img1",
            filename="a.png",
            mime_type="image/png",
            storage_key="k",
            upload_index=1,
            assigned_to=None,
            analysis=ImageAnalysis(
                caption="画像",
                quant_comment="",
                belongs_to=[BelongsToCandidate(exp_key="3.1", score=0.9, rationale="")],
                result_summary="画像結果",
                assigned_exp_key="3.1",
                assigned_score=1.0,
                assigned_rationale="test",
            ),
        )
    ]

    validate(state, storage=build_storage(backend="local", storage_dir=tmp_path), llm=LLMClient(load_settings()))

    assert state.assets_images[0].assigned_to == "3.1"
    assert not any(e.code == "unassigned_image" for e in state.validation_report.errors)


def test_repair_mvp_quant_comment_digits_each_sentence():
    paragraph = "最大は約6.85 mAを観測。欠損が散在する。欠測6点で分かった。"
    repaired = _repair_mvp_quant_comment_digits_each_sentence(paragraph)
    assert repaired.count("。") == 3
    sents = [s for s in repaired.split("。") if s.strip()]
    assert len(sents) == 3
    assert all(any(ch.isdigit() for ch in s) for s in sents)


def test_sanitize_mvp_quant_comment_paragraph_strips_json_like_chars():
    paragraph = '{"paragraph":"VCE≈1.0 Vの条件で、ICは約5.52〜6.83 mA。"}'
    cleaned = _sanitize_mvp_quant_comment_paragraph(paragraph)
    assert "{" not in cleaned and "}" not in cleaned and "[" not in cleaned and "]" not in cleaned and "`" not in cleaned


def test_graph_mvp_renders_docx_with_excel(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_MODEL", "dummy")
    monkeypatch.setenv("REPORT_AGENT_MOCK_LLM", "1")

    settings = load_settings()
    storage = build_storage(backend="local", storage_dir=tmp_path)
    llm = LLMClient(settings)

    job_id = "job"
    pdf_key = f"jobs/{job_id}/source/manual.pdf"
    pdf_bytes = _make_pdf_bytes("3. 実験方法\n3.1 テスト実験\n4. 考察\n導出せよ\n")
    storage.put_bytes(pdf_key, pdf_bytes)
    excel_key = f"jobs/{job_id}/source/excel.xlsx"
    excel_bytes = _make_excel_bytes(
        [
            ["Vce[V]", "Ic[mA]"],
            [0.5, 1.2],
            [1.0, 2.6],
        ]
    )
    storage.put_bytes(excel_key, excel_bytes)

    state = AgentState(job_meta=JobMeta(job_id=job_id))
    state.pdf.filename = "manual.pdf"
    state.pdf.storage_key = pdf_key
    state.excel.filename = "excel.xlsx"
    state.excel.storage_key = excel_key

    template_path = (Path(__file__).resolve().parents[1] / "templates" / "chapter_fixed_docxtpl_ready.docx").resolve()
    graph = build_graph(storage=storage, llm=llm, template_path=str(template_path), mode="mvp")
    result = graph.invoke(state, config={"recursion_limit": 100})
    assert result["artifact_docx_key"]
    assert storage.exists(result["artifact_docx_key"])
