from __future__ import annotations

from core.storage import Storage
from graph.update_mvp.a_reiya.ingest import ingest as _ingest
from graph.state import AgentState
from llm.client import LLMClient


def ingest(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    return _ingest(state, storage=storage, llm=llm)
