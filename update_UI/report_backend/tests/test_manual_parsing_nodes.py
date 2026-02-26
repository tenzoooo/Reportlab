from __future__ import annotations

import fitz  # PyMuPDF

from core.storage import build_storage
from graph.nodes.extract_method_numbers import extract_method_numbers
from graph.nodes.extract_theory_candidates import extract_theory_candidates
from graph.nodes.locate_discussion_section import locate_discussion_section
from graph.nodes.map_result_numbers import map_result_numbers
from graph.nodes.normalize_ommlify_formula import normalize_and_ommlify_formula
from graph.nodes.parse_manual_structure import parse_manual_structure
from graph.nodes.pdf_parse import pdf_parse
from graph.state import AgentState, JobMeta, PdfData, PdfTextBlock


def _default_manual_text() -> str:
    return "\n".join(
        [
            "1 Overview",
            "2 Principle",
            "2.1 Ohm Law",
            "3 Theory",
            "3.1 Model",
            "Eq(1) V = IR",
            "4 Procedure",
            "4.1 Test A",
            "V=IR",
            "4.1.1 Condition",
            "5 Discussion",
            "5.1 Results",
        ]
    )


def _build_state(text: str | None = None) -> AgentState:
    text = text or _default_manual_text()
    pdf = PdfData(
        text=text,
        page_texts=[PdfTextBlock(page=1, text=text)],
        method_chapter=4,
        discussion_chapter=5,
    )
    return AgentState(job_meta=JobMeta(job_id="job"), pdf=pdf)


def _make_pdf_bytes(pages: list[str]) -> bytes:
    doc = fitz.open()
    for page_text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), page_text)
    return doc.tobytes()


def test_pdf_parse_extracts_page_text_blocks(tmp_path) -> None:
    storage = build_storage(backend="local", storage_dir=tmp_path)
    pdf_key = "jobs/job/source/manual.pdf"
    pdf_bytes = _make_pdf_bytes(["1 Overview\n2 Principle", "3 Theory\n4 Procedure"])
    storage.put_bytes(pdf_key, pdf_bytes)

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.pdf.storage_key = pdf_key
    state.pdf.filename = "manual.pdf"

    pdf_parse(state, storage=storage, llm=None)

    assert state.pdf.pages == 2
    assert state.pdf.page_texts == []
    assert state.pdf.page_texts_key
    raw = storage.get_json(state.pdf.page_texts_key)
    assert len(raw) == 2
    assert raw[0]["page"] == 1
    assert "1 Overview" in raw[0]["text"]
    assert raw[1]["page"] == 2
    assert "3 Theory" in raw[1]["text"]


def test_manual_parsing_pipeline_extracts_numbers_and_formulas() -> None:
    state = _build_state()
    state = parse_manual_structure(state)
    assert state.pdf.section_candidates.get("method")
    assert state.pdf.section_candidates.get("theory")
    assert state.pdf.section_candidates.get("discussion")

    state = extract_method_numbers(state)
    exp_keys = [item.exp_key for item in state.pdf.method_numbers]
    assert "4.1" in exp_keys
    assert "4.1.1" in exp_keys
    assert state.pdf.needs_hitl_methods is False

    state = map_result_numbers(state)
    assert state.pdf.result_number_map.get("4.1") == "5.1"
    assert state.pdf.result_number_map.get("4.1.1") == "5.1.1"
    assert state.pdf.needs_hitl_result_map is False

    state = locate_discussion_section(state)
    assert state.pdf.discussion_section is not None
    assert state.pdf.needs_hitl_discussion is False

    state = extract_theory_candidates(state)
    assert any("V=IR" in cand.raw or "V = IR" in cand.raw for cand in state.pdf.theory_candidates)
    assert state.pdf.needs_hitl_theory is False

    state = normalize_and_ommlify_formula(state)
    assert any(formula.omml.startswith("<m:oMath") for formula in state.pdf.theory_formulas)
    assert state.pdf.needs_hitl_theory is False


def test_method_numbers_hitl_when_missing() -> None:
    text = "\n".join(
        [
            "1 Overview",
            "2 Theory",
            "2.1 Model",
            "3 Discussion",
        ]
    )
    state = _build_state(text)
    state = parse_manual_structure(state)
    state = extract_method_numbers(state)

    assert not state.pdf.method_numbers
    assert state.pdf.needs_hitl_methods is True


def test_discussion_section_hitl_when_missing() -> None:
    text = "\n".join(
        [
            "1 Overview",
            "2 Theory",
            "2.1 Model",
            "4 Procedure",
            "4.1 Test A",
        ]
    )
    state = _build_state(text)
    state = parse_manual_structure(state)
    state = locate_discussion_section(state)

    assert state.pdf.discussion_section is None
    assert state.pdf.needs_hitl_discussion is True


def test_theory_candidates_hitl_when_missing() -> None:
    text = "\n".join(
        [
            "1 Overview",
            "2 Theory",
            "2.1 Model",
            "4 Procedure",
            "4.1 Test A",
            "5 Discussion",
        ]
    )
    state = _build_state(text)
    state = parse_manual_structure(state)
    state = extract_theory_candidates(state)
    state = normalize_and_ommlify_formula(state)

    assert not state.pdf.theory_candidates
    assert not state.pdf.theory_formulas
    assert state.pdf.needs_hitl_theory is True
