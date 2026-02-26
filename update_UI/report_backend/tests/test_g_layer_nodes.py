from __future__ import annotations

from graph.nodes.decide_theory_compare_hitl import decide_theory_compare_hitl
from graph.nodes.decide_theory_compare_toggle import decide_theory_compare_toggle
from graph.state import AgentState, InsertAssetBinding, JobMeta, LLMTheoryFormula
from models.contracts import Experiment


def test_decide_theory_compare_toggle_defaults_to_hitl() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    decide_theory_compare_toggle(state)

    assert state.theory_compare_enabled is True
    assert state.theory_compare_hitl.enabled is True
    assert state.theory_compare_hitl.code == "HITL_THEORY_COMPARE_TOGGLE"
    assert "<form" in state.theory_compare_hitl.html


def test_decide_theory_compare_toggle_respects_preset_off() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.theory_compare_enabled = False

    decide_theory_compare_toggle(state)

    assert state.theory_compare_enabled is False
    assert state.theory_compare_decided is True
    assert state.theory_compare_hitl.enabled is False


def test_decide_theory_compare_hitl_uses_formula_default() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.experiments = [Experiment(idx="1", name="Test Experiment")]
    state.insert_asset_bindings = [
        InsertAssetBinding(exp_key="1", tables_asset_ids=["t1"], graphs_asset_ids=["g1"])
    ]
    state.pdf.theory_formulas_llm = [
        LLMTheoryFormula(formula="V=IR", context="test", experiments=["1"])
    ]

    decide_theory_compare_hitl(state)

    assert state.theory_compare_hitl.enabled is True
    assert state.theory_compare_by_experiment["1"] is True
    assert "experiments" in state.theory_compare_hitl.payload


def test_decide_theory_compare_hitl_skips_when_no_experiments() -> None:
    state = AgentState(job_meta=JobMeta(job_id="job"))

    decide_theory_compare_hitl(state)

    assert state.theory_compare_hitl.enabled is False
