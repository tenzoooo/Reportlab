from __future__ import annotations

from graph.nodes.resolve_axes_and_units import resolve_axes_and_units as _resolve_axes_and_units
from graph.state import AgentState
from llm.client import LLMClient


def resolve_axes_and_units(state: AgentState, *, llm: LLMClient | None = None) -> AgentState:
    return _resolve_axes_and_units(state, llm=llm)
