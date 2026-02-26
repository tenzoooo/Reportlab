from __future__ import annotations

from graph.nodes.select_excel_sheet_per_experiment import (
    select_excel_sheet_per_experiment as _select_excel_sheet_per_experiment,
    select_excel_sheet_per_required_outputs as _select_excel_sheet_per_required_outputs,
)
from graph.state import AgentState
from llm.client import LLMClient


def select_excel_sheet_per_experiment(state: AgentState, *, llm: LLMClient | None = None) -> AgentState:
    return _select_excel_sheet_per_experiment(state, llm=llm)


def select_excel_sheet_per_required_outputs(
    state: AgentState, *, llm: LLMClient | None = None
) -> AgentState:
    return _select_excel_sheet_per_required_outputs(state, llm=llm)
