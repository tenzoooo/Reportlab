from __future__ import annotations

import re

from graph.state import AgentState
from models.contracts import Experiment


_HEADING_SECTION_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+){1,3})\s*$")


def _split_experiment_number(exp_key: str) -> tuple[str, str]:
    """
    Convert PDF section numbering into (idx, subidx).

    - "4.1"   -> ("1", "")
    - "4.1.1" -> ("1", "1")
    - "4.1.2" -> ("1", "2")
    - "4.1.1.1" -> ("1", "1.1")
    """

    key = (exp_key or "").strip().replace("．", ".").replace("。", ".")
    parts = [p for p in key.split(".") if p.strip()]
    if len(parts) < 2:
        return key, ""
    idx = parts[1].strip()
    subidx = ".".join([p.strip() for p in parts[2:]]) if len(parts) > 2 else ""
    return idx, subidx


def unit_init(state: AgentState) -> AgentState:
    experiments: list[Experiment] = []

    headings_by_section: dict[str, str] = {}
    for h in state.pdf.headings:
        section = str(h.get("section") or "").strip()
        title = str(h.get("title") or "").strip()
        if section and title:
            headings_by_section[section] = title
    for item in state.method_tree:
        exp_key = str(item.get("exp_key") or "").strip()
        title = str(item.get("title") or "").strip()
        method_summary = str(item.get("method_summary") or "").strip()
        if not exp_key or not title:
            continue
        idx, subidx = _split_experiment_number(exp_key)
        experiments.append(
            Experiment(
                idx=idx,
                subidx=subidx,
                name=title,
                source_idx=exp_key,
                method_summary=method_summary,
                result_brief="",
                description_brief=method_summary,
                quant_comment="",
            )
        )
    # If subidx experiments exist, ensure their parent (idx with empty subidx) exists to represent hierarchy.
    by_idx: dict[str, list[Experiment]] = {}
    for exp in experiments:
        by_idx.setdefault(exp.idx, []).append(exp)

    augmented: list[Experiment] = []

    def _subidx_key(v: str):
        parts = [p for p in str(v).split(".") if p.strip()]
        out: list[int] = []
        for p in parts:
            try:
                out.append(int(p))
            except Exception:
                out.append(9999)
        return out

    for idx, group in by_idx.items():
        has_children = any(e.subidx for e in group)
        if not has_children:
            augmented.extend(group)
            continue

        parent = next((e for e in group if not e.subidx), None)
        if parent is None:
            child = next((e for e in group if e.subidx), None)
            parent_source = ""
            if child and child.source_idx:
                parts = [p for p in child.source_idx.split(".") if p.strip()]
                if len(parts) >= 2:
                    parent_source = ".".join(parts[:2])

            parent_title = headings_by_section.get(parent_source, "") if parent_source else ""
            parent = Experiment(
                idx=idx,
                subidx="",
                name=parent_title or (parent_source or f"{idx}"),
                source_idx=parent_source,
                method_summary="",
                result_brief="",
                description_brief="",
                quant_comment="",
            )
            augmented.append(parent)

        children = [e for e in group if e.subidx]
        children_sorted = sorted(children, key=lambda e: _subidx_key(e.subidx))
        augmented.extend(children_sorted)

    def _idx_key(v: str):
        try:
            return int(str(v))
        except Exception:
            return 9999

    state.experiments = sorted(augmented, key=lambda e: (_idx_key(e.idx), 0 if not e.subidx else 1, _subidx_key(e.subidx)))
    state.assets_images = [img.model_copy(update={"assigned_to": None}) for img in state.assets_images]
    state.assets_tables = [tbl.model_copy(update={"assigned_to": None}) for tbl in state.assets_tables]
    return state
