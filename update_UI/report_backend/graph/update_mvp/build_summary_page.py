from __future__ import annotations

from graph.nodes.build_summary_page import build_summary_page as _build_summary_page
from graph.state import AgentState
from llm.client import LLMClient


def build_summary_page(state: AgentState, *, llm: LLMClient) -> AgentState:
    return _build_summary_page(state, llm=llm)
