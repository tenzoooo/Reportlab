from __future__ import annotations

import json

from graph.nodes.infer_required_outputs import infer_required_outputs
from graph.nodes.required_outputs_ambiguity_gate import required_outputs_ambiguity_gate
from graph.state import (
    AgentState,
    BLayerBundle,
    BLayerMethod,
    JobMeta,
    PdfMethodUnit,
    RequiredOutputCandidate,
    RequiredOutputEstimate,
)


class _MockLLM:
    def parse(self, response_model, *, messages, attempts=1, model=None):
        payload = json.loads(messages[-1]["content"])
        methods = payload.get("methods") or []
        items = []
        for m in methods:
            exp_key = m.get("exp_key", "")
            title = m.get("title", "")
            text = m.get("method_text", "")
            if "table1 table2 graph1 photo2" in text:
                items.append(
                    {
                        "exp_key": exp_key,
                        "title": title,
                        "method_summary": text,
                        "tables_count": 2,
                        "graphs_count": 1,
                        "photos_count": 2,
                        "confidence": 0.8,
                        "rationale": "explicit counts",
                        "evidence": ["table1", "table2", "graph1", "photo2"],
                        "candidates": [],
                    }
                )
            elif "figure1" in text:
                items.append(
                    {
                        "exp_key": exp_key,
                        "title": title,
                        "method_summary": text,
                        "tables_count": 0,
                        "graphs_count": 0,
                        "photos_count": 0,
                        "confidence": 0.6,
                        "rationale": "ambiguous figure",
                        "evidence": ["figure1"],
                        "candidates": [
                            {
                                "tables_count": 0,
                                "graphs_count": 1,
                                "photos_count": 0,
                                "confidence": 0.6,
                                "rationale": "figure as graph",
                                "evidence": ["figure1"],
                            },
                            {
                                "tables_count": 0,
                                "graphs_count": 0,
                                "photos_count": 1,
                                "confidence": 0.6,
                                "rationale": "figure as photo",
                                "evidence": ["figure1"],
                            },
                        ],
                    }
                )
        return response_model.model_validate({"items": items})


def _state_with_method_tree(method_summary: str) -> AgentState:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.b_layer_bundle = BLayerBundle(
        method=BLayerMethod(
            items=[
                PdfMethodUnit(exp_key="4.1", title="Test", text=method_summary, level=1),
            ]
        )
    )
    return state


def test_infer_required_outputs_with_explicit_counts() -> None:
    state = _state_with_method_tree("table1 table2 graph1 photo2")
    infer_required_outputs(state, llm=_MockLLM())

    assert len(state.required_outputs) == 1
    result = state.required_outputs[0]
    assert result.tables_count == 2
    assert result.graphs_count == 1
    assert result.photos_count == 2
    assert result.confidence >= 0.75
    assert not result.candidates


def test_infer_required_outputs_ambiguous_figures() -> None:
    state = _state_with_method_tree("figure1")
    infer_required_outputs(state, llm=_MockLLM())

    result = state.required_outputs[0]
    assert result.candidates
    assert len(result.candidates) == 2
    counts = {(c.graphs_count, c.photos_count) for c in result.candidates}
    assert (1, 0) in counts
    assert (0, 1) in counts


def test_required_outputs_gate_modes() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.required_outputs = [
        RequiredOutputEstimate(
            exp_key="4.1",
            title="Test",
            method_summary="summary",
            tables_count=1,
            graphs_count=0,
            photos_count=0,
            confidence=0.8,
        )
    ]
    required_outputs_ambiguity_gate(state)
    assert state.required_outputs_hitl.enabled is False

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.required_outputs = [
        RequiredOutputEstimate(
            exp_key="4.1",
            title="Test",
            method_summary="summary",
            tables_count=1,
            graphs_count=0,
            photos_count=0,
            confidence=0.6,
        )
    ]
    required_outputs_ambiguity_gate(state)
    assert state.required_outputs_hitl.enabled is True
    assert state.required_outputs_hitl.mode == "confirm"
    assert "<form" in state.required_outputs_hitl.html
    assert "Experiment 4.1" in state.required_outputs_hitl.html

    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.required_outputs = [
        RequiredOutputEstimate(
            exp_key="4.1",
            title="Test",
            method_summary="summary",
            tables_count=1,
            graphs_count=0,
            photos_count=0,
            confidence=0.4,
        )
    ]
    required_outputs_ambiguity_gate(state)
    assert state.required_outputs_hitl.enabled is True
    assert state.required_outputs_hitl.mode == "required"


def test_required_outputs_gate_hits_on_candidates() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.required_outputs = [
        RequiredOutputEstimate(
            exp_key="4.1",
            title="Test",
            method_summary="summary",
            tables_count=1,
            graphs_count=0,
            photos_count=0,
            confidence=0.9,
            candidates=[
                RequiredOutputCandidate(
                    tables_count=1,
                    graphs_count=1,
                    photos_count=0,
                    confidence=0.6,
                    rationale="ambiguous",
                    evidence=["figure1"],
                )
            ],
        )
    ]
    required_outputs_ambiguity_gate(state)
    assert state.required_outputs_hitl.enabled is True
