from __future__ import annotations

from graph.state import AgentState
from llm.client import LLMClient
from models.contracts import ConsiderationUnit


_DISCUSSION_MARKERS = [
    "せよ",
    "しなさい",
    "求めよ",
    "検討せよ",
    "考察せよ",
    "示せ",
    "述べよ",
    "表わしなさい",
    "表しなさい",
]


def discussion(state: AgentState, *, llm: LLMClient) -> AgentState:
    prompts = list(state.pdf.consideration_prompts or [])
    if not prompts:
        discussion_text = (state.pdf.discussion_text or "").strip()
        if discussion_text:
            # Best-effort fallback: take likely instruction lines.
            lines = [l.strip() for l in discussion_text.splitlines() if l.strip()]
            prompts = [l for l in lines if any(m in l for m in _DISCUSSION_MARKERS)] or [discussion_text]
        else:
            prompts = []

    res = llm.generate_discussion(prompts, experiments=None)
    # answer is intentionally not included in the output contract.
    units = [ConsiderationUnit(index=u.index, discussion_active=u.discussion_active, answer=None) for u in res.units]
    state.consideration.units = units
    return state
