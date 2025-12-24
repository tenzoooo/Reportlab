from __future__ import annotations

import csv
import io

from graph.state import AgentState
from llm.client import LLMClient


def _parse_csv(raw: str) -> list[list[str]]:
    buf = io.StringIO(raw)
    reader = csv.reader(buf)
    return [[cell.strip() for cell in row] for row in reader]


def table_parse(state: AgentState, *, llm: LLMClient) -> AgentState:
    if not state.assets_tables:
        return state

    experiments = [
        {
            "exp_key": e.source_idx or e.idx,
            "name": f"{e.name}（{e.idx}{('.' + e.subidx) if e.subidx else ''}）",
        }
        for e in state.experiments
    ]

    updated = []
    for tbl in state.assets_tables:
        rows = tbl.rows if tbl.rows else _parse_csv(tbl.raw_csv)
        analysis = tbl.analysis or llm.analyze_table(tbl.raw_csv, experiments=experiments)
        updated.append(tbl.model_copy(update={"rows": rows, "analysis": analysis}))

    state.assets_tables = updated
    return state
