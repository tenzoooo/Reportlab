from __future__ import annotations

from graph.nodes.bind_theory_substitution_params import (
    bind_theory_substitution_params as _bind_theory_substitution_params,
)
from graph.state import AgentState
from llm.client import LLMClient


def bind_theory_substitution_params(state: AgentState, *, llm: LLMClient | None = None) -> AgentState:
    return _bind_theory_substitution_params(state, llm=llm)
