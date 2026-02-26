from __future__ import annotations

from core.storage import Storage
from graph.nodes.quant_comment_assets import generate_quant_comments_from_assets as _generate_quant_comments_from_assets
from graph.state import AgentState
from llm.client import LLMClient


def generate_quant_comments_from_assets(
    state: AgentState, *, storage: Storage, llm: LLMClient | None = None
) -> AgentState:
    return _generate_quant_comments_from_assets(state, storage=storage, llm=llm)
