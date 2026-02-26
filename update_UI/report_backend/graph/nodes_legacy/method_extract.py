from __future__ import annotations

from graph.state import AgentState
from llm.client import LLMClient


def method_extract(state: AgentState, *, llm: LLMClient) -> AgentState:
    method_text = state.pdf.method_markdown_text or state.pdf.method_text
    result = llm.method_extract(method_text)
    state.method_tree = [item.model_dump() for item in result.experiments]
    return state
