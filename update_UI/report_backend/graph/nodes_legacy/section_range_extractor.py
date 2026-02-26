from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Any, Callable, Iterable, Optional, Literal
import re
import unicodedata

SectionType = Literal["method", "discussion"]


@dataclass
class SectionNode:
    node_id: str
    heading_line: str
    title: str
    level: int
    start_index: int
    end_index: int
    text: str
    section_number: str
    children: list["SectionNode"] = field(default_factory=list)


@dataclass
class MethodItem:
    exp_key: str
    title: str
    text: str
    level: int


@dataclass
class MethodSectionResult:
    chapter: Optional[int]
    items: list[MethodItem]


@dataclass
class DiscussionSectionResult:
    chapter: Optional[int]
    text: str


@dataclass
class CandidateDrop:
    reason: str
    details: str


@dataclass
class ExtractResult:
    method: MethodSectionResult
    discussion: DiscussionSectionResult
    dropped_candidates: list[CandidateDrop]
    hitl_required: bool
    hitl_message: Optional[str]
    selection_reason: str
    debug: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RangeChoice:
    method_start: Optional[str]
    method_end: Optional[str]
    discussion_start: Optional[str]
    discussion_end: Optional[str]
    confidence: float = 0.0
    reason: str = ""


LLMRangeSelector = Callable[[list[dict[str, Any]]], RangeChoice]

_SECTION_NUMBER_RE = re.compile(r"^\s*(\d+(?:[.．]\d+)*)")


def _normalize_heading(text: str) -> str:
    s = unicodedata.normalize("NFKC", text or "")
    s = re.sub(r"\s+", "", s)
    return s


def _extract_section_number(text: str) -> str:
    raw = (text or "").replace("．", ".")
    raw = raw.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    m = _SECTION_NUMBER_RE.match(raw)
    return m.group(1) if m else ""


def _extract_title(text: str) -> str:
    raw = (text or "").strip()
    m = _SECTION_NUMBER_RE.match(raw)
    if not m:
        return raw
    rest = raw[m.end() :].lstrip(" .．:：").strip()
    return rest or raw


def _build_nodes(raw_nodes: list[dict[str, Any]]) -> list[SectionNode]:
    def _parse(node: dict[str, Any]) -> SectionNode:
        heading_line = str(node.get("heading_line") or "")
        title = str(node.get("title") or "")
        section_number = str(node.get("section_number") or "")
        parsed_number = _extract_section_number(heading_line or title)
        if parsed_number and parsed_number != section_number:
            section_number = parsed_number
        elif not section_number:
            section_number = parsed_number
        if not title:
            title = _extract_title(heading_line)
        children_raw = node.get("children") or []
        return SectionNode(
            node_id=str(node.get("node_id") or ""),
            heading_line=heading_line,
            title=title,
            level=int(node.get("level") or 1),
            start_index=int(node.get("start_index") or 0),
            end_index=int(node.get("end_index") or 0),
            text=str(node.get("text") or ""),
            section_number=section_number,
            children=[_parse(child) for child in children_raw],
        )

    return [_parse(n) for n in raw_nodes or []]


def _flatten(nodes: list[SectionNode]) -> list[SectionNode]:
    out: list[SectionNode] = []

    def _walk(ns: list[SectionNode]) -> None:
        for n in ns:
            out.append(n)
            if n.children:
                _walk(n.children)

    _walk(nodes)
    return out


def _subtree_nodes(root: SectionNode) -> list[SectionNode]:
    nodes: list[SectionNode] = []

    def _walk(n: SectionNode) -> None:
        nodes.append(n)
        for c in n.children:
            _walk(c)

    _walk(root)
    return nodes


def _pick_range(
    flat: list[SectionNode],
    start_heading: str,
    end_heading: str,
) -> list[SectionNode]:
    index_map = {n.heading_line: i for i, n in enumerate(flat)}
    if start_heading not in index_map or end_heading not in index_map:
        return []
    start_idx = index_map[start_heading]
    end_idx = index_map[end_heading]
    if end_idx < start_idx:
        return []
    return flat[start_idx : end_idx + 1]


def _range_until_next_level1(flat: list[SectionNode], start_heading: str) -> list[SectionNode]:
    start_idx = _resolve_heading_to_index(flat, start_heading)
    if start_idx is None:
        return []
    end_idx = len(flat) - 1
    for i in range(start_idx + 1, len(flat)):
        if flat[i].level == 1:
            end_idx = i - 1
            break
    if end_idx < start_idx:
        end_idx = start_idx
    return flat[start_idx : end_idx + 1]

def _nearest_numbered_heading_index(flat: list[SectionNode], index: int) -> Optional[int]:
    if index < 0 or index >= len(flat):
        return None
    best_idx = None
    best_dist = None
    for i, n in enumerate(flat):
        if not n.section_number:
            continue
        if "." not in n.section_number and not n.section_number.isdigit():
            continue
        dist = abs(i - index)
        if best_dist is None or dist < best_dist:
            best_dist = dist
            best_idx = i
    return best_idx


def _resolve_heading_to_index(flat: list[SectionNode], heading: str) -> Optional[int]:
    if not heading:
        return None
    for i, n in enumerate(flat):
        if n.heading_line == heading:
            return i
    return None


def _coerce_range(
    flat: list[SectionNode],
    start_heading: Optional[str],
    end_heading: Optional[str],
) -> tuple[Optional[str], Optional[str], str]:
    reason = ""
    start_idx = _resolve_heading_to_index(flat, start_heading or "")
    end_idx = _resolve_heading_to_index(flat, end_heading or "")

    # If missing, cannot coerce
    if start_idx is None and end_idx is None:
        return start_heading, end_heading, "missing_both"

    # If only one exists, use nearest numbered heading for the other
    if start_idx is None and end_idx is not None:
        n_idx = _nearest_numbered_heading_index(flat, end_idx)
        if n_idx is not None:
            start_idx = n_idx
            start_heading = flat[n_idx].heading_line
            reason = "start_coerced_to_numbered"
    elif end_idx is None and start_idx is not None:
        n_idx = _nearest_numbered_heading_index(flat, start_idx)
        if n_idx is not None:
            end_idx = n_idx
            end_heading = flat[n_idx].heading_line
            reason = "end_coerced_to_numbered"

    if start_idx is None or end_idx is None:
        return start_heading, end_heading, reason or "missing_one"

    # Ensure order
    if end_idx < start_idx:
        start_idx, end_idx = end_idx, start_idx
        start_heading, end_heading = end_heading, start_heading
        reason = "order_swapped"

    # Prefer numbered headings for both ends
    if flat[start_idx].section_number == "":
        n_idx = _nearest_numbered_heading_index(flat, start_idx)
        if n_idx is not None:
            start_idx = n_idx
            start_heading = flat[n_idx].heading_line
            reason = reason or "start_numbered_adjust"
    if flat[end_idx].section_number == "":
        n_idx = _nearest_numbered_heading_index(flat, end_idx)
        if n_idx is not None:
            end_idx = n_idx
            end_heading = flat[n_idx].heading_line
            reason = reason or "end_numbered_adjust"

    return start_heading, end_heading, reason or "ok"


def _chapter_from_section_number(section_number: str) -> Optional[int]:
    if not section_number:
        return None
    try:
        return int(section_number.split(".")[0])
    except Exception:
        return None


def extract_method_discussion_sections(
    structured_sections: list[dict[str, Any]],
    *,
    llm_select: Optional[LLMRangeSelector],
    method_only: bool = False,
    debug: bool = False,
) -> dict[str, Any]:
    """
    入力: structured_sections (list[dict])
    出力: method/discussion の構造化 JSON（決定論抽出）
    """
    nodes = _build_nodes(structured_sections)
    flat = _flatten(nodes)

    heading_items = [
        {
            "heading_line": n.heading_line,
            "level": n.level,
            "section_number": n.section_number,
            "title": n.title,
        }
        for n in flat
        if n.heading_line
    ]

    dropped: list[CandidateDrop] = []
    if llm_select is None:
        result = ExtractResult(
            method=MethodSectionResult(chapter=None, items=[]),
            discussion=DiscussionSectionResult(chapter=None, text=""),
            dropped_candidates=dropped,
            hitl_required=True,
            hitl_message="LLMが未指定のため選択できません",
            selection_reason="llm_missing",
        )
        return result.to_dict()

    choice = llm_select(heading_items)
    if not choice:
        result = ExtractResult(
            method=MethodSectionResult(chapter=None, items=[]),
            discussion=DiscussionSectionResult(chapter=None, text=""),
            dropped_candidates=dropped,
            hitl_required=True,
            hitl_message="LLMの選択結果が空です",
            selection_reason="llm_empty",
        )
        return result.to_dict()

    method_start, method_end, method_reason = _coerce_range(flat, choice.method_start, choice.method_end)
    discussion_start = None
    discussion_end = None
    discussion_reason = ""
    if not method_only:
        discussion_start, discussion_end, discussion_reason = _coerce_range(flat, choice.discussion_start, choice.discussion_end)

    method_range = _pick_range(flat, method_start or "", method_end or "")
    discussion_range = _pick_range(flat, discussion_start or "", discussion_end or "") if not method_only else []

    method_root = None
    method_range_override: list[SectionNode] = []
    if choice.method_start:
        idx = _resolve_heading_to_index(flat, choice.method_start)
        if idx is not None:
            method_root = flat[idx]
            method_reason = "start_only"
            method_range_override = _range_until_next_level1(flat, choice.method_start)
        else:
            method_root = method_range[0] if method_range else None
    else:
        method_root = method_range[0] if method_range else None
    discussion_root = None
    discussion_range_override: list[SectionNode] = []
    if not method_only and choice.discussion_start:
        idx = _resolve_heading_to_index(flat, choice.discussion_start)
        if idx is not None:
            discussion_root = flat[idx]
            discussion_reason = "start_only"
            discussion_range_override = _range_until_next_level1(flat, choice.discussion_start)
        else:
            discussion_root = discussion_range[0] if discussion_range else None
    elif not method_only:
        discussion_root = discussion_range[0] if discussion_range else None

    method_items: list[MethodItem] = []
    if method_root:
        if method_range_override:
            nodes = method_range_override
        else:
            nodes = _subtree_nodes(method_root)
        for n in nodes:
            if "." not in n.section_number:
                continue
            exp_key = n.section_number
            title = n.title or _extract_title(n.heading_line)
            method_items.append(MethodItem(exp_key=exp_key, title=title, text=n.text, level=n.level))

    discussion_text = ""
    if discussion_root:
        if discussion_range_override:
            discussion_text = "\n".join([n.text for n in discussion_range_override if n.text]).strip()
        else:
            subtree = _subtree_nodes(discussion_root)
            discussion_text = "\n".join([n.text for n in subtree if n.text]).strip()

    if method_only:
        hitl_required = not bool(method_root)
    else:
        hitl_required = not (method_root and discussion_root)
    hitl_message = None
    if hitl_required:
        hitl_message = "method の範囲が確定できません" if method_only else "method/discussion の範囲が確定できません"

    combined_reason = choice.reason or "llm_range_choice"
    if method_only:
        if method_reason != "ok":
            combined_reason = f"{combined_reason};method:{method_reason}"
    else:
        if method_reason != "ok" or discussion_reason != "ok":
            combined_reason = f"{combined_reason};method:{method_reason};discussion:{discussion_reason}"

    debug_info = None
    if debug:
        debug_info = {
            "llm_choice": {
                "method_start": choice.method_start,
                "method_end": choice.method_end,
                "discussion_start": choice.discussion_start,
                "discussion_end": choice.discussion_end,
                "confidence": choice.confidence,
                "reason": choice.reason,
            },
            "coerced": {
                "method_start": method_start,
                "method_end": method_end,
                "discussion_start": discussion_start,
                "discussion_end": discussion_end,
                "method_reason": method_reason,
                "discussion_reason": discussion_reason,
            },
            "method_only": method_only,
        }

    result = ExtractResult(
        method=MethodSectionResult(
            chapter=_chapter_from_section_number(method_root.section_number if method_root else ""),
            items=method_items,
        ),
        discussion=DiscussionSectionResult(
            chapter=_chapter_from_section_number(discussion_root.section_number if discussion_root else ""),
            text=discussion_text,
        ),
        dropped_candidates=dropped,
        hitl_required=hitl_required,
        hitl_message=hitl_message,
        selection_reason=combined_reason,
        debug=debug_info,
    )
    return result.to_dict()
