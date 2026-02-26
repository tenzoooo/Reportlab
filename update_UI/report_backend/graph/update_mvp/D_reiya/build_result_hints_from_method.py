from __future__ import annotations

from graph.nodes.build_result_hints_from_method import build_result_hints_from_method as _build_result_hints_from_method
from graph.state import AgentState
from llm.client import LLMClient


def build_result_hints_from_method(state: AgentState, *, llm: LLMClient) -> AgentState:
    return _build_result_hints_from_method(state, llm=llm)
