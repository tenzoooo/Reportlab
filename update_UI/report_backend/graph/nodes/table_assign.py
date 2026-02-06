from __future__ import annotations

from graph.state import AgentState
from models.contracts import TableBlock, TableContent


def _exp_keys_for_lookup(exp) -> set[str]:
    keys: set[str] = set()
    source_idx = str(getattr(exp, "source_idx", "") or "").strip()
    idx = str(getattr(exp, "idx", "") or "").strip()
    subidx = str(getattr(exp, "subidx", "") or "").strip()
    if source_idx:
        keys.add(source_idx)
    if idx:
        keys.add(idx)
        if subidx:
            keys.add(f"{idx}.{subidx}")
    return keys


def _resolve_assigned_exp_key(table) -> str:
    key = str(getattr(table, "assigned_to", "") or "").strip()
    if key:
        return key
    analysis = getattr(table, "analysis", None)
    if not analysis:
        return ""
    key = str(getattr(analysis, "assigned_exp_key", "") or "").strip()
    if key:
        return key
    belongs = list(getattr(analysis, "belongs_to", []) or [])
    if not belongs:
        return ""
    return str(getattr(belongs[0], "exp_key", "") or "").strip()


def _reorder_blocks(blocks: list):
    def _upload_order(block) -> int:
        if getattr(block, "type", "") == "table":
            return int(getattr(getattr(block, "table", None), "asset_upload_index", 10**9) or 10**9)
        if getattr(block, "type", "") == "figure":
            return int(getattr(getattr(block, "figure", None), "asset_upload_index", 10**9) or 10**9)
        return 10**9

    return sorted(list(blocks or []), key=_upload_order)


def table_assign(state: AgentState) -> AgentState:
    exp_key_to_index: dict[str, int] = {}
    for idx, exp in enumerate(state.experiments):
        for key in _exp_keys_for_lookup(exp):
            exp_key_to_index[key] = idx

    table_blocks_by_exp: dict[int, list[TableBlock]] = {}
    for table in state.assets_tables:
        exp_key = _resolve_assigned_exp_key(table)
        if exp_key:
            table.assigned_to = exp_key
        exp_idx = exp_key_to_index.get(exp_key)
        if exp_idx is None:
            continue
        analysis = table.analysis
        table_blocks_by_exp.setdefault(exp_idx, []).append(
            TableBlock(
                table=TableContent(
                    asset_upload_index=table.upload_index,
                    label="",
                    caption=str(getattr(analysis, "caption", "") or ""),
                    rows=[list(row or []) for row in (table.rows or [])],
                    quant_comment=str(getattr(analysis, "quant_comment", "") or ""),
                    evidence_refs=list(getattr(analysis, "evidence_refs", []) or []),
                )
            )
        )

    for idx, exp in enumerate(state.experiments):
        non_table_blocks = [b for b in list(exp.blocks or []) if getattr(b, "type", "") != "table"]
        next_blocks = non_table_blocks + table_blocks_by_exp.get(idx, [])
        exp.blocks = _reorder_blocks(next_blocks)

    return state


__all__ = ["table_assign"]
