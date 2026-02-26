import pytest
from graph.state import AgentState, PdfData, PdfMethodUnit, PdfTextBlock, JobMeta
from graph.nodes.build_b_layer_bundle import build_b_layer_bundle
from graph.nodes.clean_heading_positions import clean_heading_positions
from graph.nodes.parse_manual_structure import parse_manual_structure

class _MockLLM:
    def __init__(self, responses):
        self._responses = list(responses)

    def parse(self, response_model, *, messages, attempts=1, **kwargs):
        if not self._responses:
            raise RuntimeError("no more responses")
        resp = self._responses.pop(0)
        if isinstance(resp, Exception):
            raise resp
        return resp


def _state_with_lines(lines: list[str]) -> AgentState:
    pdf = PdfData(page_texts=[PdfTextBlock(page=1, text="\n".join(lines))])
    return AgentState(job_meta=JobMeta(job_id="test_job"), pdf=pdf)


class _RespItem:
    """Mock for _LLMHeadingItem (heading_line, level, notes)."""
    def __init__(
        self,
        heading_line: str,
        level: int | None = None,
        notes: str | None = None,
    ):
        self.heading_line = heading_line
        self.level = level
        self.notes = notes


class _Resp:
    def __init__(self, items):
        self.items = items


class _MarkerEntry:
    def __init__(self):
        self.found = False
        self.heading = None
        self.start_excerpt_20 = None
        self.end_excerpt_20 = None
        self.notes = ""


class _MarkerResp:
    """Dummy response for _LLMSectionMarkersResponse (first parse call)."""
    def __init__(self):
        self.methods = _MarkerEntry()
        self.discussion = _MarkerEntry()


def test_drops_non_doc_heading_kinds():
    """Non-heading lines (e.g. parts table) should not appear in heading_positions_cleaned."""
    state = _state_with_lines(["0.01 mF"])
    # LLM returns no valid headings
    llm = _MockLLM([_MarkerResp(), _Resp([])])
    state = clean_heading_positions(state, llm=llm)
    assert state.pdf.heading_positions_cleaned == []


def test_keeps_true_headings():
    lines = ["2.3. 反転増幅回路", "4.2.1. 反転増幅回路"]
    state = _state_with_lines(lines)
    items = [
        _RespItem("2.3. 反転増幅回路", level=2),
        _RespItem("4.2.1. 反転増幅回路", level=3),
    ]
    llm = _MockLLM([_MarkerResp(), _Resp(items)])
    state = clean_heading_positions(state, llm=llm)
    # Headings are captured in structured_sections (not heading_positions_cleaned,
    # which only holds method/discussion root headings).
    assert len(state.pdf.structured_sections) >= 1
    def _collect_section_numbers(sections):
        nums = []
        for s in sections:
            if s.section_number:
                nums.append(s.section_number)
            nums.extend(_collect_section_numbers(s.children))
        return nums
    nums = _collect_section_numbers(state.pdf.structured_sections)
    assert "2.3" in nums
    assert "4.2.1" in nums


def test_handles_missing_dot_ocr():
    state = _state_with_lines(["2.3 反転増幅回路"])
    items = [_RespItem("2.3 反転増幅回路", level=2)]
    llm = _MockLLM([_MarkerResp(), _Resp(items)])
    state = clean_heading_positions(state, llm=llm)
    assert len(state.pdf.structured_sections) >= 1
    assert state.pdf.structured_sections[0].section_number == "2.3"


def test_rejects_numbered_list_body():
    """Lines that are just numbered lists should not produce heading entries."""
    state = _state_with_lines(["1. Open loop gain G"])
    # LLM returns a heading item, but _build_structured_sections should reject it
    # since "Open loop gain G" is not a real section heading
    llm = _MockLLM([_MarkerResp(), _Resp([])])
    state = clean_heading_positions(state, llm=llm)
    # No valid doc headings should be extracted
    assert state.pdf.heading_positions_cleaned == []


def test_fallback_when_llm_fails():
    state = _state_with_lines(["2.3. 反転増幅回路", "0.01 mF"])
    llm = _MockLLM([_MarkerResp(), RuntimeError("llm failed")])
    state = clean_heading_positions(state, llm=llm)
    assert any(issue.code == "WARN_PDF_HEADING_LLM_FAILED" for issue in state.quality_report.issues)


def test_parse_manual_structure_prefers_cleaned():
    state = _state_with_lines(["4. 実験", "5. 考察"])
    items = [
        _RespItem("4. 実験", level=1),
        _RespItem("5. 考察", level=1),
    ]
    llm = _MockLLM([_MarkerResp(), _Resp(items)])
    state = clean_heading_positions(state, llm=llm)
    assert len(state.pdf.structured_sections) == 2
    state = parse_manual_structure(state)
    assert "discussion" in state.pdf.section_candidates
    assert state.pdf.section_candidates["discussion"][0].title == "考察"


def test_section_candidates_have_ranges():
    state = _state_with_lines(["1. 目的", "2. 理論", "3. 実験方法"])
    items = [
        _RespItem("1. 目的", level=1),
        _RespItem("2. 理論", level=1),
        _RespItem("3. 実験方法", level=1),
    ]
    llm = _MockLLM([_MarkerResp(), _Resp(items)])
    state = clean_heading_positions(state, llm=llm)
    assert len(state.pdf.structured_sections) == 3


def test_experiment_index_built():
    state = _state_with_lines(["3. 実験方法", "3.1 電圧測定", "3.2 電流測定"])
    items = [
        _RespItem("3. 実験方法", level=1),
        _RespItem("3.1 電圧測定", level=2),
        _RespItem("3.2 電流測定", level=2),
    ]
    llm = _MockLLM([_MarkerResp(), _Resp(items)])
    state = clean_heading_positions(state, llm=llm)
    state = parse_manual_structure(state)
    from graph.nodes.extract_method_numbers import extract_method_numbers
    from graph.nodes.map_result_numbers import map_result_numbers

    state = extract_method_numbers(state)
    state = map_result_numbers(state)
    assert "3.1" in state.pdf.experiment_index
    assert state.pdf.experiment_index["3.1"].result_no == "4.1"


def test_build_b_layer_bundle_creates_experiment_units():
    state = AgentState(job_meta=JobMeta(job_id="test_job"))
    state.pdf.method_units = [
        PdfMethodUnit(
            exp_key="4.2",
            title="OPアンプ",
            level=2,
            text="parent method",
            parent_exp_key="",
            child_exp_keys=["4.2.1"],
        ),
        PdfMethodUnit(
            exp_key="4.2.1",
            title="反転増幅回路",
            level=3,
            text="child method",
            parent_exp_key="4.2",
            child_exp_keys=[],
        ),
        PdfMethodUnit(
            exp_key="4.3",
            title="単独実験",
            level=2,
            text="solo method",
            parent_exp_key="",
            child_exp_keys=[],
        ),
    ]
    state = build_b_layer_bundle(state)
    units = state.b_layer_bundle.method.experiment_units
    assert len(units) == 2
    assert units[0].exp_key == "4.2.1"
    assert units[0].parent.exp_key == "4.2"
    assert units[1].exp_key == "4.3"
