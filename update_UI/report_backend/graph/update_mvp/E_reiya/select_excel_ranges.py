from __future__ import annotations

from core.storage import Storage
from graph.nodes.select_excel_ranges import select_excel_ranges as _select_excel_ranges
from graph.state import AgentState
from llm.client import LLMClient


def select_excel_ranges(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    return _select_excel_ranges(state, storage=storage, llm=llm)
