from __future__ import annotations

import csv
import io
import math
import statistics

from graph.state import AgentState
from llm.client import LLMClient


def _parse_csv(raw: str) -> list[list[str]]:
    buf = io.StringIO(raw)
    reader = csv.reader(buf)
    return [[cell.strip() for cell in row] for row in reader]

def _try_float(value: str) -> float | None:
    s = (value or "").strip()
    if not s:
        return None
    s = s.replace(",", "")
    try:
        v = float(s)
        if math.isfinite(v):
            return v
    except Exception:
        return None
    return None


def _summarize_rows(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header = rows[0] if rows else []
    body = rows[1:] if len(rows) > 1 else []
    max_rows = 300
    sampled = body[:max_rows]

    col_count = max((len(r) for r in rows if isinstance(r, list)), default=0)
    if col_count <= 0:
        return ""

    def col_name(i: int) -> str:
        if i < len(header) and header[i].strip():
            return header[i].strip()
        return f"col_{i+1}"

    lines: list[str] = []
    lines.append(f"rows={len(rows)}, cols={col_count} (sampled_rows={len(sampled)})")
    for c in range(col_count):
        vals: list[float] = []
        non_empty = 0
        for r in sampled:
            if c >= len(r):
                continue
            cell = r[c]
            if cell is None:
                continue
            if str(cell).strip():
                non_empty += 1
            v = _try_float(str(cell))
            if v is not None:
                vals.append(v)
        if not vals:
            continue
        name = col_name(c)
        try:
            mean = statistics.fmean(vals)
        except Exception:
            mean = sum(vals) / max(1, len(vals))
        mn = min(vals)
        mx = max(vals)
        stdev = statistics.pstdev(vals) if len(vals) >= 2 else 0.0
        lines.append(
            f"- {name}: n={len(vals)}/{non_empty} min={mn:.6g} max={mx:.6g} mean={mean:.6g} sd={stdev:.6g}"
        )
    return "\n".join(lines)


def table_parse(state: AgentState, *, llm: LLMClient) -> AgentState:
    if not state.assets_tables:
        return state

    experiments = [
        {
            "exp_key": e.source_idx or e.idx,
            "name": f"{e.name}（{e.idx}{('.' + e.subidx) if e.subidx else ''}）",
            "method_summary": e.method_summary,
        }
        for e in state.experiments
    ]

    updated = []
    for tbl in state.assets_tables:
        rows = tbl.rows if tbl.rows else _parse_csv(tbl.raw_csv)
        table_summary = _summarize_rows(rows)
        analysis = tbl.analysis or llm.analyze_table(tbl.raw_csv, experiments=experiments, table_summary=table_summary)
        if table_summary:
            analysis = analysis.model_copy(update={"table_summary": table_summary})
        updated.append(tbl.model_copy(update={"rows": rows, "analysis": analysis}))

    state.assets_tables = updated
    return state
