from __future__ import annotations

import json
from pathlib import Path

import fitz  # PyMuPDF

from core.storage import build_storage
from graph.state import AgentState
from graph.update_mvp.B_reiya.clean_heading_positions import clean_heading_positions
from graph.update_mvp.B_reiya.extract_manual_text import extract_manual_text


class _MockLLM:
    mock = True

    def __init__(self) -> None:
        self.calls: list[tuple[type, list[dict]]] = []

    def parse(self, response_model, *, messages, attempts=1, **kwargs):
        self.calls.append((response_model, messages))
        name = getattr(response_model, "__name__", "")
        if name == "_LLMSectionMarkersResponse":
            return response_model.model_validate(
                {
                    "methods": {
                        "found": True,
                        "heading": "1 Method",
                        "start_excerpt_20": "1 Method",
                        "end_excerpt_20": "DEND",
                        "notes": "",
                    },
                    "discussion": {
                        "found": True,
                        "heading": "2 Discussion",
                        "start_excerpt_20": "2 Discussion",
                        "end_excerpt_20": "SEND",
                        "notes": "",
                    },
                }
            )
        if name == "_LLMHeadingResponse":
            return response_model.model_validate(
                {
                    "items": [
                        {"heading_line": "1 Method", "level": 1},
                        {"heading_line": "4.1 Parent Experiment", "level": 2},
                        {"heading_line": "4.1.1 Child Experiment", "level": 3},
                        {"heading_line": "2 Discussion", "level": 1},
                    ]
                }
            )
        if name == "_LLMMethodOutlineResponse":
            return response_model.model_validate(
                {
                    "items": [
                        {
                            "method_number": "4.1.1",
                            "method_name": "Child Experiment",
                            "method_text_prefix5": "Child",
                            "method_text_suffix5": "DEND",
                        }
                    ]
                }
            )
        # For any other model, return empty/default
        if hasattr(response_model, "model_validate"):
            try:
                return response_model.model_validate({"items": []})
            except Exception:
                pass
        raise AssertionError(f"unexpected response_model: {name}")


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


def test_b_layer_clean_heading_positions_sends_extracted_text(tmp_path) -> None:
    state = _load_state_from_json()
    storage = build_storage(backend="local", storage_dir=tmp_path)

    pdf_key = state.pdf.storage_key
    assert pdf_key
    pdf_bytes = _make_pdf_bytes(
        [
            "1 Method\n4.1 Parent Experiment\n4.1.1 Child Experiment\n...DEND\n2 Discussion\n...SEND",
        ]
    )
    storage.put_bytes(pdf_key, pdf_bytes)

    state = extract_manual_text(state, storage=storage, llm=_MockLLM())

    llm = _MockLLM()
    state = clean_heading_positions(state, llm=llm, storage=storage)

    # clean_heading_positions makes 2 LLM calls: markers + headings
    assert len(llm.calls) == 2
    call_names = [getattr(rm, "__name__", "") for rm, _ in llm.calls]
    assert "_LLMSectionMarkersResponse" in call_names
    assert "_LLMHeadingResponse" in call_names

    # Heading call sends pdf_text in the user message
    _, heading_messages = llm.calls[1]
    user_payload = json.loads(heading_messages[1]["content"])
    assert "pdf_text" in user_payload
    assert "Method" in user_payload["pdf_text"]

    # Method/discussion text should be extracted
    assert state.pdf.method_text
    assert "Method" in state.pdf.method_text or "Experiment" in state.pdf.method_text

    # Structured sections should be built
    assert len(state.pdf.structured_sections) >= 1
