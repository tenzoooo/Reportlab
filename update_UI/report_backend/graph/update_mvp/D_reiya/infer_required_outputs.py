from __future__ import annotations

from graph.nodes.infer_required_outputs import infer_required_outputs as _infer_required_outputs
from graph.state import AgentState
from llm.client import LLMClient


def infer_required_outputs(state: AgentState, *, llm: LLMClient) -> AgentState:
    return _infer_required_outputs(state, llm=llm)
