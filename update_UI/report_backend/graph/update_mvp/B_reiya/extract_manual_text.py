from __future__ import annotations

from core.storage import Storage
from graph.nodes.pdf_parse import pdf_parse as _pdf_parse
from graph.state import AgentState
from llm.client import LLMClient


def extract_manual_text(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    return _pdf_parse(state, storage=storage, llm=llm)
