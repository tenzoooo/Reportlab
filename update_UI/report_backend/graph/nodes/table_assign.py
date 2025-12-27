from __future__ import annotations

import os

from graph.state import AgentState
from graph.utils import infer_report_chapter
from graph.nodes.asset_order import insert_block_in_upload_order
from models.contracts import TableBlock, TableContent


def _disable_auto_captions() -> bool:
    return (os.environ.get("REPORT_AGENT_DISABLE_AUTO_CAPTIONS") or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def table_assign(state: AgentState) -> AgentState:
    threshold = 0.6
    disable_auto_captions = _disable_auto_captions()
    updated_assets = {tbl.table_id: tbl for tbl in state.assets_tables}

    tables_sorted = sorted(enumerate(state.assets_tables), key=lambda t: (t[1].upload_index or 0, t[0]))
    for _, tbl in tables_sorted:
        analysis = tbl.analysis
        if not analysis:
            continue

        exp_key = (getattr(analysis, "assigned_exp_key", "") or "").strip()
        score = float(getattr(analysis, "assigned_score", 0.0) or 0.0)

        if not exp_key:
            candidates = analysis.belongs_to or []
            best = max(candidates, key=lambda c: c.score, default=None)
            if best is None:
                updated_assets[tbl.table_id] = tbl.model_copy(update={"assigned_to": None})
                continue
            exp_key = best.exp_key
            score = best.score

        if not exp_key or score < threshold:
            updated_assets[tbl.table_id] = tbl.model_copy(update={"assigned_to": None})
            continue

        content = TableContent(
            label="",
            caption="" if disable_auto_captions else analysis.caption,
            rows=tbl.rows,
            quant_comment=analysis.quant_comment,
            asset_upload_index=tbl.upload_index,
        )
        block = TableBlock(table=content)

        assigned = False
        for exp in state.experiments:
            if exp.source_idx == exp_key or exp.idx == exp_key:
                insert_block_in_upload_order(exp.blocks, block)
                assigned = True
                break

        updated_assets[tbl.table_id] = tbl.model_copy(update={"assigned_to": exp_key if assigned else None})

    state.assets_tables = [updated_assets.get(tbl.table_id, tbl) for tbl in state.assets_tables]

    for exp in state.experiments:
        exp.figures = [b.figure for b in exp.blocks if getattr(b, "type", None) == "figure"]
        exp.tables = [b.table for b in exp.blocks if getattr(b, "type", None) == "table"]

    return state
