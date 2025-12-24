from __future__ import annotations

from graph.state import AgentState
from llm.client import LLMClient


_KEYWORDS = ["考察", "検討事項", "検討", "報告事項", "報告", "Discussion"]


def _shrink_text(text: str, *, max_chars: int = 120_000) -> str:
    """
    Keep the extraction input bounded to avoid token blowups.
    This is a best-effort heuristic that preserves verbatim substrings.
    """

    t = (text or "").strip()
    if not t:
        return ""
    if len(t) <= max_chars:
        return t

    positions: list[int] = []
    for kw in _KEYWORDS:
        p = t.find(kw)
        if p != -1:
            positions.append(p)
    positions.sort()

    if positions:
        start = max(0, positions[0] - 10_000)
        end = min(len(t), start + max_chars)
        return t[start:end]

    return t[:max_chars]


def discussion_extract(state: AgentState, *, llm: LLMClient) -> AgentState:
    """
    Use LLM to extract instruction lines from the discussion-related section.
    Stores the extracted lines in state.pdf.consideration_prompts.
    """

    # LLM-first: always extract from the full PDF text (the model finds the section).
    # If the PDF is extremely long, shrink to a window around likely discussion keywords.
    text = _shrink_text(state.pdf.text)
    if not text:
        text = _shrink_text(state.pdf.discussion_text)
    if not text:
        state.pdf.consideration_prompts = []
        return state

    try:
        out = llm.extract_discussion_prompts(text)
        prompts = [p for p in out.prompts if p and str(p).strip()]
        state.pdf.consideration_prompts = prompts
        return state
    except Exception as exc:
        # Non-fatal: keep empty and let downstream logic decide (validator may retry discussion later).
        # Validator may request discussion retry later.
        _ = exc
        return state
