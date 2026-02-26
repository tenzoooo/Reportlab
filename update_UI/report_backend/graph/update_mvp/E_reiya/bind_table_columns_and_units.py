from __future__ import annotations

from graph.nodes.bind_table_columns_and_units import (
    bind_table_columns_and_units as _bind_table_columns_and_units,
)
from graph.state import AgentState
from llm.client import LLMClient


def bind_table_columns_and_units(state: AgentState, *, llm: LLMClient | None = None) -> AgentState:
    return _bind_table_columns_and_units(state, llm=llm)
