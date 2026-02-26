from __future__ import annotations

from pathlib import Path

from core.storage import Storage
from graph.nodes.extract_theory_formulas_llm import extract_theory_formulas_llm as _extract_theory_formulas_llm
from graph.state import AgentState
from llm.client import LLMClient


def extract_theory_formulas_llm(
    state: AgentState,
    *,
    llm: LLMClient | None,
    storage: Storage | None = None,
    output_path: Path | None = None,
) -> AgentState:
    return _extract_theory_formulas_llm(state, llm=llm, storage=storage, output_path=output_path)
