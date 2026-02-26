from __future__ import annotations

import json
from pathlib import Path

import fitz  # PyMuPDF

from core.storage import build_storage
from graph.state import AgentState
from graph.update_mvp.B_reiya.extract_manual_text import extract_manual_text


class _MockLLM:
    mock = True


def _find_repo_root(start: Path) -> Path:
    candidates = [start, *start.parents]
    for base in candidates:
        if (base / "tmp_state_outputs" / "a_layer_after_all_steps.json").exists():
            return base
    raise FileNotFoundError("repo root with tmp_state_outputs/a_layer_after_all_steps.json not found")


def _load_state_from_json() -> AgentState:
    repo_root = _find_repo_root(Path(__file__).resolve())
    json_path = repo_root / "tmp_state_outputs" / "a_layer_after_all_steps.json"
    data = json.loads(json_path.read_text(encoding="utf-8"))
    return AgentState.model_validate(data)


def _make_pdf_bytes(pages: list[str]) -> bytes:
    doc = fitz.open()
    for page_text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), page_text)
    return doc.tobytes()


def test_b_layer_extract_manual_text_from_state_json(tmp_path) -> None:
    state = _load_state_from_json()
    storage = build_storage(backend="local", storage_dir=tmp_path)

    pdf_key = state.pdf.storage_key
    assert pdf_key
    pdf_bytes = _make_pdf_bytes(["1 Overview\n2 Principle", "3 Theory\n4 Procedure"])
    storage.put_bytes(pdf_key, pdf_bytes)

    state = extract_manual_text(state, storage=storage, llm=_MockLLM())

    assert state.pdf.text
    assert "1 Overview" in state.pdf.text
    assert state.pdf.page_texts == []
    assert state.pdf.page_texts_key

    page_texts = storage.get_json(state.pdf.page_texts_key)
    assert len(page_texts) == 2
    assert page_texts[0]["page"] == 1
    assert "1 Overview" in page_texts[0]["text"]
