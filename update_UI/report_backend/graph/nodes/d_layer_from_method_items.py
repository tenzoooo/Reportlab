from __future__ import annotations

from graph.nodes.build_result_hints_from_method import build_result_hints_from_method
from graph.nodes.infer_required_outputs import infer_required_outputs
from graph.state import AgentState, now_iso
from llm.client import LLMClient


def d_layer_from_method_items(state: AgentState, *, llm: LLMClient | None) -> AgentState:
    """
    Dレイヤを method.items のみを入力として実行する統合ノード。
    既存stateは保持し、report.hints / required_outputs を更新する。
    """
    state = build_result_hints_from_method(state, llm=llm)
    state = infer_required_outputs(state, llm=llm)
    state.job_meta.updated_at = now_iso()
    return state
