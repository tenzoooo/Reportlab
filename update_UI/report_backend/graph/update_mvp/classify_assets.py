from __future__ import annotations

from core.storage import Storage
from graph.update_mvp.a_reiya.classify_assets import classify_assets as _classify_assets
from graph.state import AgentState
from llm.client import LLMClient


def classify_assets(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    return _classify_assets(state, storage=storage, llm=llm)
