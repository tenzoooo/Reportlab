from __future__ import annotations

from graph.state import AgentState
from llm.client import LLMClient


def image_rerank(state: AgentState, *, llm: LLMClient) -> AgentState:
    """
    Second-stage reranking for image assignment.

    Uses the text model to pick the best exp_key among the vision model candidates,
    and stores the result into ImageAnalysis.assigned_* fields.
    """
    if not state.assets_images:
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
    for img in state.assets_images:
        analysis = img.analysis
        if analysis is None or not analysis.belongs_to:
            updated.append(img)
            continue

        candidates = [
            {"exp_key": c.exp_key, "score": c.score, "rationale": c.rationale}
            for c in (analysis.belongs_to or [])
        ]
        payload = {
            "experiments": experiments,
            "candidates": candidates,
            "image_analysis": {
                "caption": analysis.caption,
                "result_summary": analysis.result_summary,
                "quant_comment": analysis.quant_comment,
                "ocr_text": getattr(analysis, "ocr_text", ""),
            },
        }

        out = llm.rerank_image_assignment(payload=payload, attempts=state.job_meta.retry_budgets.image_analyze + 1)
        if out and out.exp_key:
            analysis = analysis.model_copy(
                update={
                    "assigned_exp_key": out.exp_key,
                    "assigned_score": out.score,
                    "assigned_rationale": out.rationale,
                }
            )
            updated.append(img.model_copy(update={"analysis": analysis}))
        else:
            updated.append(img)

    state.assets_images = updated
    return state
