from __future__ import annotations

import fitz  # PyMuPDF

from core.config import load_settings
from core.storage import build_storage
from graph.nodes.past_report_hints import past_report_hints
from graph.state import AgentState, JobMeta
from llm.client import LLMClient


def _make_pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    return doc.tobytes()


def _build_llm(monkeypatch) -> LLMClient:
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_MODEL", "dummy")
    monkeypatch.setenv("OPENAI_VISION_MODEL", "dummy")
    monkeypatch.setenv("REPORT_AGENT_MOCK_LLM", "1")
    return LLMClient(load_settings())


def test_past_report_hints_sets_summary_and_ready(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    pdf_key = "jobs/job/source/report.pdf"
    storage.put_bytes(pdf_key, _make_pdf_bytes("4 Procedure\n4.1 Test A\nResults"))

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.past_report.filename = "report.pdf"
    state.past_report.storage_key = pdf_key

    past_report_hints(state, storage=storage, llm=llm)

    assert len(state.past_reports) == 1
    report = state.past_reports[0]
    assert report.report_id == "legacy"
    assert report.hints_ready is True
    assert report.hints_error == ""
    assert report.extracted_hint
    assert report.hints == []
    assert report.report_summary.structure == []
    assert report.report_summary.data_points == []
    assert report.report_summary.visual_evidence == []


def test_past_report_hints_marks_missing_storage(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.past_report.filename = "report.pdf"
    state.past_report.storage_key = "jobs/job/source/missing.pdf"

    past_report_hints(state, storage=storage, llm=llm)

    report = state.past_reports[0]
    assert report.hints_ready is True
    assert report.hints_error == "past_report_read_failed"


def test_past_report_hints_marks_unsupported_format(tmp_path, monkeypatch) -> None:
    llm = _build_llm(monkeypatch)
    storage = build_storage(backend="local", storage_dir=tmp_path)

    key = "jobs/job/source/report.txt"
    storage.put_bytes(key, b"plain text")

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.past_report.filename = "report.txt"
    state.past_report.storage_key = key

    past_report_hints(state, storage=storage, llm=llm)

    report = state.past_reports[0]
    assert report.hints_ready is True
    assert report.hints_error == "past_report_unsupported_format"
