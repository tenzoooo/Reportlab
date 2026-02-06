from __future__ import annotations

from graph.nodes.run_d_to_i_per_experiment import run_d_to_i_per_experiment as _run_d_to_i_per_experiment
from graph.state import AgentState
from llm.client import LLMClient
from core.storage import Storage


def run_d_to_i_per_experiment(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient,
) -> AgentState:
    return _run_d_to_i_per_experiment(state, storage=storage, llm=llm)


__all__ = ["run_d_to_i_per_experiment"]
