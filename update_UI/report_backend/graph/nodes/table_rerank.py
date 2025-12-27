from __future__ import annotations

from graph.state import AgentState
from llm.client import LLMClient


def table_rerank(state: AgentState, *, llm: LLMClient) -> AgentState:
    """
    Second-stage reranking for table assignment.

    Uses the text model to pick the best exp_key among the table-analyze candidates,
    and stores the result into TableAnalysis.assigned_* fields.
    """
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
        analysis = tbl.analysis
        if analysis is None or not analysis.belongs_to:
            updated.append(tbl)
            continue

        candidates = [
            {"exp_key": c.exp_key, "score": c.score, "rationale": c.rationale}
            for c in (analysis.belongs_to or [])
        ]
        payload = {
            "experiments": experiments,
            "candidates": candidates,
            "table_analysis": {
                "caption": analysis.caption,
                "result_summary": analysis.result_summary,
                "quant_comment": analysis.quant_comment,
                "table_summary": getattr(analysis, "table_summary", ""),
            },
        }

        out = llm.rerank_table_assignment(payload=payload, attempts=state.job_meta.retry_budgets.table_parse + 1)
        if out and out.exp_key:
            analysis = analysis.model_copy(
                update={
                    "assigned_exp_key": out.exp_key,
                    "assigned_score": out.score,
                    "assigned_rationale": out.rationale,
                }
            )
            updated.append(tbl.model_copy(update={"analysis": analysis}))
        else:
            updated.append(tbl)

    state.assets_tables = updated
    return state
