from __future__ import annotations

from io import BytesIO
import re

import fitz  # PyMuPDF
from openpyxl import Workbook

from core.config import load_settings
from core.storage import build_storage
from graph.nodes.classify_assets import classify_assets
from graph.nodes.ingest import ingest
from graph.nodes.normalize_inputs import normalize_inputs
from graph.nodes.session_start import session_start
from graph.nodes_legacy.validate import validate
from graph.state import AgentState, InputAssetKind, InputAssetRef, JobMeta, JobStatus, NormalizedAsset
from llm.client import LLMClient
from models.contracts import ImageAsset, TableAsset


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


def _build_llm(monkeypatch) -> LLMClient:
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_MODEL", "dummy")
    monkeypatch.setenv("OPENAI_VISION_MODEL", "dummy")
    monkeypatch.setenv("REPORT_AGENT_MOCK_LLM", "1")
    return LLMClient(load_settings())


def test_session_start_sets_status_and_run_id() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.job_meta.updated_at = "2000-01-01T00:00:00+00:00"

    session_start(state)

    assert state.status == JobStatus.running
    assert re.fullmatch(r"[0-9a-f]{32}", state.job_meta.run_id)
    assert state.job_meta.updated_at != "2000-01-01T00:00:00+00:00"


def test_ingest_builds_input_assets_and_sets_metadata(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    job_id = "job"
    pdf_key = f"jobs/{job_id}/source/manual.pdf"
    excel_key = f"jobs/{job_id}/source/excel.xlsx"
    img_key = f"jobs/{job_id}/source/img1.png"
    table_key = f"jobs/{job_id}/source/table1.csv"
    report_key = f"jobs/{job_id}/source/report.docx"

    storage.put_bytes(pdf_key, _make_pdf_bytes("Method"))
    storage.put_bytes(excel_key, _make_excel_bytes([["A", "B"], [1, 2]]))
    storage.put_bytes(img_key, b"image")
    storage.put_bytes(table_key, b"A,B\n1,2\n")
    storage.put_bytes(report_key, b"docx")

    state = AgentState(job_meta=JobMeta(job_id=job_id))
    state.job_meta.updated_at = "2000-01-01T00:00:00+00:00"
    state.pdf.filename = "manual.pdf"
    state.pdf.storage_key = pdf_key
    state.excel.filename = "excel.xlsx"
    state.excel.storage_key = excel_key
    state.assets_images = [
        ImageAsset(
            image_id="img1",
            filename="plot_graph.png",
            mime_type="image/png",
            storage_key=img_key,
            upload_index=1,
        )
    ]
    state.assets_tables = [
        TableAsset(
            table_id="tbl1",
            storage_key=table_key,
            raw_csv="A,B\n1,2\n",
            upload_index=2,
        )
    ]
    state.past_report.filename = "report.docx"
    state.past_report.storage_key = report_key

    ingest(state, storage=storage, llm=llm)

    assert state.status == JobStatus.running
    assert state.job_meta.text_model == llm.text_model
    assert state.job_meta.vision_model == llm.vision_model
    assert state.job_meta.updated_at != "2000-01-01T00:00:00+00:00"
    assert len(state.input_assets) == 5
    assert {a.asset_id for a in state.input_assets} == {
        "pdf:manual",
        "excel:primary",
        "image:img1",
        "table:tbl1",
        "past_report:legacy",
    }
    assert [a.kind for a in state.input_assets] == [
        InputAssetKind.pdf,
        InputAssetKind.excel,
        InputAssetKind.image,
        InputAssetKind.table,
        InputAssetKind.past_report,
    ]
    assert state.past_reports and state.past_reports[0].report_id == "legacy"
    assert not state.validation_report.warnings


def test_ingest_warns_missing_pdf_storage_key(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    state = AgentState(job_meta=JobMeta(job_id="job"))
    ingest(state, storage=storage, llm=llm)

    codes = {w.code for w in state.validation_report.warnings}
    assert "warn_input_missing_pdf" in codes
    assert not any(a.kind == InputAssetKind.pdf for a in state.input_assets)


def test_ingest_warns_duplicate_asset_id_and_storage_key(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    pdf_key = "jobs/job/source/manual.pdf"
    image_key = "jobs/job/source/dup.png"
    storage.put_bytes(pdf_key, _make_pdf_bytes("Method"))
    storage.put_bytes(image_key, b"image")

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.pdf.filename = "manual.pdf"
    state.pdf.storage_key = pdf_key
    state.assets_images = [
        ImageAsset(
            asset_id="image:dup",
            image_id="img1",
            filename="dup.png",
            mime_type="image/png",
            storage_key=image_key,
            upload_index=1,
        ),
        ImageAsset(
            asset_id="image:dup",
            image_id="img2",
            filename="dup2.png",
            mime_type="image/png",
            storage_key=image_key,
            upload_index=2,
        ),
    ]

    ingest(state, storage=storage, llm=llm)

    codes = {w.code for w in state.validation_report.warnings}
    assert "warn_input_duplicate_asset_id" in codes
    assert "warn_input_duplicate_storage_key" in codes


def test_normalize_inputs_populates_metadata(tmp_path) -> None:
    storage = build_storage(backend="local", storage_dir=tmp_path)

    pdf_key = "jobs/job/source/manual.pdf"
    excel_key = "jobs/job/source/excel.xlsx"
    img_key = "jobs/job/source/img1.png"
    storage.put_bytes(pdf_key, _make_pdf_bytes("Method"))
    storage.put_bytes(excel_key, _make_excel_bytes([["A", "B"], [1, 2]]))
    storage.put_bytes(img_key, b"image")

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.job_meta.updated_at = "2000-01-01T00:00:00+00:00"
    state.pdf.storage_key = pdf_key
    state.excel.storage_key = excel_key
    state.assets_images = [
        ImageAsset(
            image_id="img1",
            filename="img1.png",
            mime_type="image/png",
            storage_key=img_key,
        )
    ]
    state.input_assets = [
        InputAssetRef(
            asset_id="pdf:manual",
            kind=InputAssetKind.pdf,
            source_id="manual",
            filename="manual.pdf",
            storage_key=pdf_key,
            upload_index=0,
        ),
        InputAssetRef(
            asset_id="excel:primary",
            kind=InputAssetKind.excel,
            source_id="primary",
            filename="excel.xlsx",
            storage_key=excel_key,
            upload_index=0,
        ),
        InputAssetRef(
            asset_id="image:img1",
            kind=InputAssetKind.image,
            source_id="img1",
            filename="img1.png",
            storage_key=img_key,
            upload_index=0,
        ),
    ]

    normalize_inputs(state, storage=storage)

    assert state.job_meta.updated_at != "2000-01-01T00:00:00+00:00"
    assert len(state.normalized_inputs) == 3

    pdf_meta = next(m for m in state.normalized_inputs if m.kind == InputAssetKind.pdf)
    assert pdf_meta.page_count == 1
    assert state.pdf.pages == 1
    assert pdf_meta.size_bytes > 0
    assert len(pdf_meta.sha256) == 64

    excel_meta = next(m for m in state.normalized_inputs if m.kind == InputAssetKind.excel)
    assert excel_meta.sheet_names == ["Sheet1"]
    assert state.excel.sheet_names == ["Sheet1"]

    image_meta = next(m for m in state.normalized_inputs if m.kind == InputAssetKind.image)
    assert image_meta.mime_type == "image/png"
    assert not state.validation_report.warnings


def test_normalize_inputs_warns_on_read_failure(tmp_path) -> None:
    storage = build_storage(backend="local", storage_dir=tmp_path)
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.input_assets = [
        InputAssetRef(
            asset_id="pdf:missing",
            kind=InputAssetKind.pdf,
            source_id="manual",
            filename="manual.pdf",
            storage_key="jobs/job/source/missing.pdf",
            upload_index=0,
        )
    ]

    normalize_inputs(state, storage=storage)

    codes = {w.code for w in state.validation_report.warnings}
    assert "warn_input_read_failed" in codes


def test_classify_assets_heuristic_sets_graph_and_photo(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.job_meta.updated_at = "2000-01-01T00:00:00+00:00"
    state.assets_images = [
        ImageAsset(
            image_id="img1",
            filename="plot_graph.png",
            mime_type="image/png",
            storage_key="img1.png",
        ),
        ImageAsset(
            image_id="img2",
            filename="photo_obs.jpg",
            mime_type="image/jpeg",
            storage_key="img2.jpg",
        ),
    ]

    classify_assets(state, storage=storage, llm=llm)

    by_id = {img.image_id: img for img in state.assets_images}
    graph = by_id["img1"]
    photo = by_id["img2"]

    assert state.job_meta.updated_at != "2000-01-01T00:00:00+00:00"
    assert graph.rough_class == "graph"
    assert graph.rough_class_method == "heuristic"
    assert graph.rough_class_confidence == 0.7
    assert graph.rough_class_rationale == "filename_graph_hint"
    assert photo.rough_class == "photo"
    assert photo.rough_class_method == "heuristic"
    assert photo.rough_class_confidence == 0.7
    assert photo.rough_class_rationale == "filename_photo_hint"


def test_validate_requires_excel_sheet_names(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.normalized_inputs = [
        NormalizedAsset(
            asset_id="excel:primary",
            kind=InputAssetKind.excel,
            source_id="primary",
            filename="excel.xlsx",
            storage_key="jobs/job/source/excel.xlsx",
            sheet_names=[],
        )
    ]

    validate(state, storage=storage, llm=llm)

    codes = {err.code for err in state.validation_report.errors}
    assert "hitl_excel_sheet_names_missing" in codes
