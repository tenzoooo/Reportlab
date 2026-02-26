from __future__ import annotations

from graph.state import AgentState


def is_theory_compare_enabled_for_exp(state: AgentState, exp_key: str) -> bool:
    key = (exp_key or "").strip()
    if not key:
        return bool(state.theory_compare_enabled)
    if state.theory_compare_by_experiment and key in state.theory_compare_by_experiment:
        return bool(state.theory_compare_by_experiment[key])
    return bool(state.theory_compare_enabled)


def any_theory_compare_enabled(state: AgentState) -> bool:
    if state.theory_compare_by_experiment:
        return any(bool(value) for value in state.theory_compare_by_experiment.values())
    return bool(state.theory_compare_enabled)


__all__ = ["is_theory_compare_enabled_for_exp", "any_theory_compare_enabled"]
