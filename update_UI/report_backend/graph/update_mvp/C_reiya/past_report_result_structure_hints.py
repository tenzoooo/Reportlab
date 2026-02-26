from __future__ import annotations

from graph.nodes.past_report_result_structure_hints import (
    past_report_result_structure_hints as _past_report_result_structure_hints,
)
from graph.state import AgentState
from llm.client import LLMClient


def past_report_result_structure_hints(state: AgentState, *, llm: LLMClient) -> AgentState:
    return _past_report_result_structure_hints(state, llm=llm)
