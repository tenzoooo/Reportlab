from __future__ import annotations

from typing import List, Optional, Dict

from graph.state import AgentState, PdfStructuredSection, ValidationIssue, now_iso

# Heuristic categorization map
_CATEGORY_KEYWORDS = {
    "method": ["実験方法", "実験手順", "実験", "操作", "方法"],
    "theory": ["理論", "原理", "基礎", "公式"],
    "principle": ["原理"],  # Sometimes distinct from theory
    "discussion": ["考察", "検討", "報告事項", "課題"],
    "objective": ["目的", "概要", "はじめに"],
    "result": ["結果", "実験結果"],  # Usually not present in manual, but good to know
}

_CATEGORY_EXCLUDE = {
    "method": ["使用方法", "機器の使用方法"],
}

def _categorize_section(title: str) -> str:
    t = title.strip().replace(" ", "")
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        excludes = _CATEGORY_EXCLUDE.get(cat, [])
        if excludes and any(kw in t for kw in excludes):
            continue
        for kw in keywords:
            if kw in t:
                return cat
    return "other"


def _filter_method_candidates(items: list[PdfStructuredSection]) -> list[PdfStructuredSection]:
    filtered: list[PdfStructuredSection] = []
    for sec in items:
        title = (sec.title or sec.heading_line or "").replace(" ", "")
        if not title:
            continue
        if "目的" in title or "結果" in title:
            continue
        if "書" in title:
            continue
        filtered.append(sec)
    return filtered

def _flatten_structured(sections: list[PdfStructuredSection]) -> list[PdfStructuredSection]:
    flat: list[PdfStructuredSection] = []

    def _walk(nodes: list[PdfStructuredSection]) -> None:
        for node in nodes:
            flat.append(node)
            if node.children:
                _walk(node.children)

    _walk(sections)
    return flat


def parse_manual_structure(state: AgentState) -> AgentState:
    """
    B2. ParseManualStructure
    Parses the manual text blocks to identify section structure and categorizes them.
    Populates state.pdf.section_candidates and state.pdf.heading_positions.
    """
    
    if not state.pdf.structured_sections:
        state.validation_report.errors.append(
            ValidationIssue(code="missing_structured_sections", message="No structured sections available for parsing")
        )
        return state

    flat_sections = _flatten_structured(state.pdf.structured_sections)

    # Organize by category for easier lookup in later steps
    candidates: Dict[str, List[PdfStructuredSection]] = {}

    for sec in flat_sections:
        title = sec.title or sec.heading_line
        if not title:
            continue
        cat = _categorize_section(title)
        candidates.setdefault(cat, []).append(sec)
        
    if "method" in candidates:
        candidates["method"] = _filter_method_candidates(candidates["method"])
    state.pdf.section_candidates = candidates
    state.job_meta.updated_at = now_iso()
    
    return state
