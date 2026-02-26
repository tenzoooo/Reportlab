from __future__ import annotations

from graph.state import AgentState
from graph.utils import infer_report_chapter


def _exp_path(chapter: int, idx: str, subidx: str) -> str:
    parts = [str(chapter).strip(), str(idx).strip()]
    s = str(subidx or "").strip()
    if s:
        parts.append(s)
    return ".".join([p for p in parts if p])


def assign_block_labels(state: AgentState, *, chapter: int | None = None) -> int:
    """
    Assign figure/table labels deterministically if missing.
    Does not overwrite existing labels.
    """
    if chapter is None:
        chapter = infer_report_chapter(state)

    for exp in state.experiments:
        path = _exp_path(chapter, exp.idx, exp.subidx)
        fig_seq = 1
        tbl_seq = 1

        for block in exp.blocks:
            if block.type == "figure":
                if not (block.figure.label or "").strip():
                    block.figure.label = f"図 {path}.{fig_seq}"
                fig_seq += 1
            elif block.type == "table":
                if not (block.table.label or "").strip():
                    block.table.label = f"表 {path}.{tbl_seq}"
                tbl_seq += 1

    return chapter


__all__ = ["assign_block_labels"]
