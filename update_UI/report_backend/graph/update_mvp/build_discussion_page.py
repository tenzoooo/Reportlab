from __future__ import annotations

from graph.nodes.build_discussion_page import build_discussion_page as _build_discussion_page
from graph.state import AgentState
from llm.client import LLMClient


def build_discussion_page(state: AgentState, *, llm: LLMClient) -> AgentState:
    return _build_discussion_page(state, llm=llm)
