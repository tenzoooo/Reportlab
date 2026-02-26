from __future__ import annotations

from graph.nodes_legacy.build_discussion_page import build_discussion_page
from graph.nodes.build_references_page import build_references_page
from graph.nodes_legacy.build_summary_page import build_summary_page
from graph.state import AgentState, JobMeta
from llm.schemas.discussion import DiscussionOutput, DiscussionUnit
from llm.schemas.discussion_extract import DiscussionExtractOutput
from llm.schemas.summary import SummaryOutput
from models.contracts import (
    AssetRef,
    ExperimentResultGroup,
    MetricValue,
    QuantComment,
    TextWithEvidence,
)


class _DummyLLM:
    def extract_discussion_prompts(self, text: str) -> DiscussionExtractOutput:
        return DiscussionExtractOutput(prompts=["導出せよ"])

    def generate_discussion(self, prompts: list[str], *, experiments: list[dict[str, str]] | None = None) -> DiscussionOutput:
        return DiscussionOutput(units=[DiscussionUnit(index="1", discussion_active="導出する。")])

    def generate_summary(self, *, pdf_text: str, experiments: list[dict[str, str]], consideration_text: str) -> SummaryOutput:
        return SummaryOutput(summary="まとめだ。")


def _build_state() -> AgentState:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.pdf.discussion_text = "考察\n導出せよ\n"
    state.pdf.filename = "実験書.pdf"
    return state


def test_build_discussion_page_generates_units() -> None:
    state = _build_state()
    llm = _DummyLLM()

    build_discussion_page(state, llm=llm)

    assert len(state.consideration.units) == 1
    unit = state.consideration.units[0]
    assert unit.index == "1"
    assert unit.discussion_active == "導出する。"


def test_build_discussion_page_hitl_when_range_unknown() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    llm = _DummyLLM()

    build_discussion_page(state, llm=llm)

    assert state.text_generation_hitl.enabled is True
    assert "HITL_DISCUSSION_RANGE_UNKNOWN" in state.text_generation_hitl.codes


def test_build_summary_page_sets_summary() -> None:
    state = _build_state()
    llm = _DummyLLM()
    state.result_groups = [
        ExperimentResultGroup(
            result_no="5.1",
            method_no="4.1",
            experiment_name="実験A",
            experiment_overview=TextWithEvidence(text="方法", evidence_refs=[]),
            result_description=TextWithEvidence(text="結果", evidence_refs=[]),
            tables=[],
            figures=[],
            photos=[],
            quant_comment=QuantComment(
                theory_compare=True,
                metrics={
                    "theory_value": MetricValue(value=1.0, unit="V"),
                    "measured_value": MetricValue(value=1.1, unit="V"),
                    "delta": MetricValue(value=0.1, unit="V"),
                    "abs_error": MetricValue(value=0.1, unit="V"),
                },
                text=TextWithEvidence(text="定量コメント", evidence_refs=[]),
            ),
            evidence_refs=[],
        )
    ]

    build_summary_page(state, llm=llm)

    assert state.summary == "まとめだ。"


def test_build_references_page_sets_reference() -> None:
    state = _build_state()

    build_references_page(state)

    assert len(state.consideration.references) == 1
    assert state.consideration.references[0].title == "実験書.pdf"
