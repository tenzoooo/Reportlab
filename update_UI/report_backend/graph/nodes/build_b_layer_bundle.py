from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from graph.state import (
    AgentState,
    BLayerBundle,
    BLayerDiscussion,
    BLayerMethod,
    ExperimentUnit,
    ExperimentUnitParent,
    PdfMethodUnit,
    PdfStructuredSection,
    now_iso,
)


def _chapter_from_exp_key(exp_key: str) -> Optional[int]:
    if not exp_key:
        return None
    head = exp_key.split(".", 1)[0]
    try:
        return int(head)
    except Exception:
        return None


def _method_units_from_numbers(state: AgentState) -> list[PdfMethodUnit]:
    units: list[PdfMethodUnit] = []
    for item in state.pdf.method_numbers or []:
        exp_key = item.exp_key
        level = max(1, exp_key.count(".") + 1)
        units.append(
            PdfMethodUnit(
                exp_key=exp_key,
                title=item.title,
                level=level,
                text="",
                parent_exp_key="",
                child_exp_keys=[],
            )
        )
    return units


def _normalize_heading(text: str) -> str:
    return "".join((text or "").split())


def _flatten_sections(sections: list[PdfStructuredSection]) -> list[PdfStructuredSection]:
    flat: list[PdfStructuredSection] = []

    def _walk(nodes: list[PdfStructuredSection]) -> None:
        for node in nodes:
            flat.append(node)
            if node.children:
                _walk(node.children)

    _walk(sections)
    return flat


def _find_structured_discussion_root(
    sections: list[PdfStructuredSection],
    *,
    heading_line: str,
    title: str,
    section_number: str,
) -> PdfStructuredSection | None:
    for node in sections:
        if heading_line and node.heading_line == heading_line:
            return node
        if section_number and node.section_number == section_number:
            return node
        if title and node.title == title:
            return node
        if node.children:
            found = _find_structured_discussion_root(
                node.children,
                heading_line=heading_line,
                title=title,
                section_number=section_number,
            )
            if found is not None:
                return found
    return None


def _discussion_text_from_structured(
    sections: list[PdfStructuredSection],
    *,
    heading_line: str,
    title: str,
    section_number: str,
) -> str:
    root = _find_structured_discussion_root(
        sections,
        heading_line=heading_line,
        title=title,
        section_number=section_number,
    )
    if root is None:
        return ""

    # Prefer subtree aggregation to preserve section ordering.
    flat: list[PdfStructuredSection] = []

    def _walk(nodes: list[PdfStructuredSection]) -> None:
        for node in nodes:
            flat.append(node)
            if node.children:
                _walk(node.children)

    _walk([root])
    return "\n".join([n.text for n in flat if n.text]).strip()


def _experiment_units_from_method_units(units: list[PdfMethodUnit]) -> list[ExperimentUnit]:
    units_by_key = {str(u.exp_key or "").strip(): u for u in units}
    out: list[ExperimentUnit] = []
    for unit in units:
        exp_key = str(unit.exp_key or "").strip()
        title = str(unit.title or "").strip()
        if not exp_key or not title:
            continue
        has_children = bool(unit.child_exp_keys)
        has_parent = bool(unit.parent_exp_key)
        if has_children:
            continue
        if not has_parent and unit.child_exp_keys:
            continue

        parent = None
        if has_parent:
            parent_unit = units_by_key.get(str(unit.parent_exp_key or "").strip())
            if parent_unit is not None:
                parent = ExperimentUnitParent(
                    exp_key=str(parent_unit.exp_key or "").strip(),
                    title=str(parent_unit.title or "").strip(),
                    method_text=str(parent_unit.text or "").strip(),
                )
        out.append(
            ExperimentUnit(
                exp_key=exp_key,
                title=title,
                method_text=str(unit.text or "").strip(),
                level=int(unit.level or 0),
                parent=parent,
            )
        )
    return out


def _pick_discussion_section(state: AgentState) -> PdfStructuredSection | None:
    keywords = ("考察", "検討", "課題")
    flat = _flatten_sections(list(state.pdf.structured_sections or []))
    for sec in flat:
        heading = _normalize_heading(sec.heading_line or sec.title)
        if any(kw in heading for kw in keywords):
            return sec
    return None


def _discussion_section_number(discussion: object | None) -> str:
    if discussion is None:
        return ""
    if hasattr(discussion, "section"):
        return getattr(discussion, "section") or ""
    if hasattr(discussion, "section_number"):
        return getattr(discussion, "section_number") or ""
    return ""


def _discussion_title(discussion: object | None) -> str:
    if discussion is None:
        return ""
    if hasattr(discussion, "title"):
        return getattr(discussion, "title") or ""
    return ""


def _discussion_heading_line(discussion: object | None) -> str:
    if discussion is None:
        return ""
    if hasattr(discussion, "heading_line"):
        return getattr(discussion, "heading_line") or ""
    return ""


def _is_short_discussion(text: str) -> bool:
    return bool(text) and len(text) < 200


def build_b_layer_bundle(
    state: AgentState,
    *,
    output_path: Path | None = None,
) -> AgentState:
    """
    Build a compact B-layer bundle (method/discussion/theory) from existing state.
    """
    method_units = list(state.pdf.method_units or [])
    if not method_units:
        method_units = _method_units_from_numbers(state)

    method_chapter = state.pdf.method_chapter
    if method_chapter is None and method_units:
        method_chapter = _chapter_from_exp_key(method_units[0].exp_key)

    discussion = state.pdf.discussion_section
    if discussion is None:
        picked = _pick_discussion_section(state)
        if picked is not None:
            discussion = picked
    discussion_chapter = state.pdf.discussion_chapter
    discussion_section_number = _discussion_section_number(discussion)
    if discussion_chapter is None and discussion_section_number:
        discussion_chapter = _chapter_from_exp_key(discussion_section_number)

    discussion_text = state.pdf.discussion_text or ""
    if not discussion_text and discussion is not None and hasattr(discussion, "text"):
        discussion_text = getattr(discussion, "text") or ""
    if _is_short_discussion(discussion_text):
        discussion_text = ""
    if not discussion_text:
        discussion_text = _discussion_text_from_structured(
            list(state.pdf.structured_sections or []),
            heading_line=_discussion_heading_line(discussion),
            title=_discussion_title(discussion),
            section_number=discussion_section_number,
        )

    bundle = BLayerBundle(
        method=BLayerMethod(
            chapter=method_chapter,
            items=method_units,
            experiment_units=_experiment_units_from_method_units(method_units),
        ),
        discussion=BLayerDiscussion(
            chapter=discussion_chapter,
            section_number=discussion_section_number,
            title=_discussion_title(discussion),
            heading_line=_discussion_heading_line(discussion),
            text=discussion_text,
        ),
        theory_formulas=list(state.pdf.theory_formulas_llm or []),
    )
    state.b_layer_bundle = bundle
    if output_path is not None:
        output_path.write_text(
            json.dumps(bundle.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    state.job_meta.updated_at = now_iso()
    return state
