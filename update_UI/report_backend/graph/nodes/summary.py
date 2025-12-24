from __future__ import annotations

from graph.state import AgentState
from llm.client import LLMClient


def summary(state: AgentState, *, llm: LLMClient) -> AgentState:
    pdf_text = state.pdf.text or ""
    if len(pdf_text) > 12000:
        pdf_text = pdf_text[:8000] + "\n...\n" + pdf_text[-4000:]
    experiments = [{"exp_key": e.idx, "name": e.name, "result": e.result_brief} for e in state.experiments]
    consideration_text = "\n".join(
        [f"（{u.index}）{u.discussion_active}\n{u.answer or ''}".strip() for u in state.consideration.units]
    )
    res = llm.generate_summary(pdf_text=pdf_text, experiments=experiments, consideration_text=consideration_text)
    state.summary = res.summary
    return state
