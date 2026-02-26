from __future__ import annotations

from core.storage import Storage
from pathlib import Path

from graph.nodes.past_report_hints import (
    past_report_hints as _past_report_hints,
    past_report_hints_and_save as _past_report_hints_and_save,
)
from graph.state import AgentState
from llm.client import LLMClient


def past_report_hints(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    return _past_report_hints(state, storage=storage, llm=llm)


def past_report_hints_and_save(
    state: AgentState,
    *,
    storage: Storage,
    llm: LLMClient,
    output_state_path: Path,
) -> AgentState:
    return _past_report_hints_and_save(state, storage=storage, llm=llm, output_state_path=output_state_path)
