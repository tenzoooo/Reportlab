from __future__ import annotations

import re

from graph.state import AgentState
from llm.client import LLMClient


_CHAPTER_START_RE = re.compile(r"(?m)^\s*(\d+)[.．]\s+\S")


def _shrink_text(text: str, *, max_chars: int = 120_000) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if len(t) <= max_chars:
        return t

    keywords = ["実験方法", "実験手順", "方法", "Procedure", "考察", "検討事項", "報告事項", "Discussion"]
    positions: list[int] = []
    for kw in keywords:
        p = t.find(kw)
        if p != -1:
            positions.append(p)
    positions.sort()
    if positions:
        start = max(0, positions[0] - 10_000)
        end = min(len(t), start + max_chars)
        return t[start:end]
    return t[:max_chars]


def _slice_from_heading(full_text: str, heading_line: str) -> str | None:
    t = (full_text or "").strip()
    h = (heading_line or "").strip("\n")
    if not t or not h:
        return None

    start = t.find(h)
    if start == -1:
        return None

    # Find the next chapter-like heading after the matched heading line.
    after = start + len(h)
    end_match = _CHAPTER_START_RE.search(t, after)
    end = end_match.start() if end_match else len(t)
    return t[start:end].strip()


def pdf_sections(state: AgentState, *, llm: LLMClient) -> AgentState:
    """
    LLM-based detection of section start headings, then deterministic slicing of method/discussion text.
    This improves robustness against heading variations like "実験手順", "第X章", etc.
    """

    full_text = (state.pdf.text or "").strip()
    if not full_text:
        return state

    probe_text = _shrink_text(full_text)
    if not probe_text:
        return state

    try:
        out = llm.detect_pdf_sections(probe_text)
    except Exception:
        # Keep regex-based slices from pdf_parse.
        return state

    # Apply only if the returned lines are verbatim substrings of the full text.
    method_line = (out.method_heading_line or "").strip("\n")
    if method_line and method_line in full_text:
        sliced = _slice_from_heading(full_text, method_line)
        if sliced:
            state.pdf.method_text = sliced

    discussion_line = (out.discussion_heading_line or "").strip("\n")
    if discussion_line and discussion_line in full_text:
        sliced = _slice_from_heading(full_text, discussion_line)
        if sliced:
            state.pdf.discussion_text = sliced

    return state

