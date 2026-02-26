from __future__ import annotations

from graph.nodes.d_layer_from_method_items import d_layer_from_method_items as _d_layer_from_method_items
from graph.state import AgentState
from llm.client import LLMClient


def d_layer_from_method_items(state: AgentState, *, llm: LLMClient) -> AgentState:
    return _d_layer_from_method_items(state, llm=llm)
