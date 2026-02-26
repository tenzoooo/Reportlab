from __future__ import annotations

import re
from graph.state import AgentState, MethodNumberEvidence, PdfMethodUnit, PdfStructuredSection, ValidationIssue, now_iso

_METHOD_ROOT_KEYWORDS = ("実験", "実験方法", "方法", "実験手順", "手順", "Method", "Methods")
_SECTION_NUMBER_RE = re.compile(r"^\s*(\d+(?:[.．]\d+)*)")

def extract_method_numbers(state: AgentState) -> AgentState:
    """
    B3. ExtractMethodNumbers
    Identifies specific experiment method numbers (e.g., 4.1, 4.2) from the identified method section.
    Populates state.pdf.method_numbers and state.pdf.method_units.
    """
    if not state.pdf.structured_sections:
        state.validation_report.errors.append(
            ValidationIssue(code="missing_structured_sections", message="No structured sections available for method extraction")
        )
        state.pdf.needs_hitl_methods = True
        return state

    def _flatten(nodes: list[PdfStructuredSection]) -> list[PdfStructuredSection]:
        flat: list[PdfStructuredSection] = []

        def _walk(ns: list[PdfStructuredSection]) -> None:
            for n in ns:
                flat.append(n)
                if n.children:
                    _walk(n.children)

        _walk(nodes)
        return flat

    def _normalize(text: str) -> str:
        return re.sub(r"\\s+", "", text or "")

    def _extract_section_number(text: str) -> str:
        raw = text or ""
        raw = raw.replace("．", ".")
        m = _SECTION_NUMBER_RE.match(raw)
        return m.group(1) if m else ""

    flat_sections = _flatten(state.pdf.structured_sections)

    method_root = None
    method_candidates = state.pdf.section_candidates.get("method", [])
    if method_candidates:
        method_root = method_candidates[0]
    if method_root is None:
        for sec in flat_sections:
            if sec.level != 1:
                continue
            heading = _normalize(sec.heading_line or sec.title)
            if any(kw in heading for kw in _METHOD_ROOT_KEYWORDS):
                method_root = sec
                break

    candidates: list[MethodNumberEvidence] = []
    if method_root:
        subtree = _flatten([method_root])
        for sec in subtree:
            section_number = sec.section_number or _extract_section_number(sec.heading_line or sec.title)
            if not section_number or "." not in section_number:
                continue
            method_id = f"method:{section_number}"
            candidates.append(
                MethodNumberEvidence(
                    method_id=method_id,
                    exp_key=section_number,
                    title=sec.title,
                    heading_line=sec.heading_line,
                )
            )

    if not candidates and state.pdf.method_numbers:
        # Keep existing method_numbers (from upstream LLM/deterministic extraction) and build units.
        candidates = list(state.pdf.method_numbers)

    if not candidates:
        state.validation_report.errors.append(
            ValidationIssue(code="hitl_method_number_unknown", message="Could not extract method numbers (e.g. 4.1)")
        )
        state.pdf.needs_hitl_methods = True

    state.pdf.method_numbers = candidates
    state.pdf.method_units = []
    if candidates:
        section_map = {sec.section_number: sec for sec in flat_sections if sec.section_number}

        exp_keys = [c.exp_key for c in candidates]
        exp_set = set(exp_keys)
        parent_map: dict[str, str] = {key: "" for key in exp_keys}
        children_map: dict[str, list[str]] = {key: [] for key in exp_keys}
        for key in exp_keys:
            parts = key.split(".")
            if len(parts) <= 1:
                continue
            parent = ".".join(parts[:-1])
            if parent in exp_set:
                parent_map[key] = parent
                children_map[parent].append(key)

        method_units: list[PdfMethodUnit] = []
        for cand in candidates:
            sec = section_map.get(cand.exp_key)
            level = sec.level if sec else max(1, cand.exp_key.count(".") + 1)
            text = sec.text if sec else ""
            method_units.append(
                PdfMethodUnit(
                    exp_key=cand.exp_key,
                    title=cand.title,
                    level=level,
                    text=text,
                    parent_exp_key=parent_map.get(cand.exp_key, ""),
                    child_exp_keys=children_map.get(cand.exp_key, []),
                )
            )
        state.pdf.method_units = method_units
    state.job_meta.updated_at = now_iso()
    return state
