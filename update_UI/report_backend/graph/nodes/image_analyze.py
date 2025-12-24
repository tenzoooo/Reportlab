from __future__ import annotations

import base64
from typing import cast

from core.storage import Storage
from graph.state import AgentState
from llm.client import LLMClient
from models.contracts import ImageAsset


def _to_data_url(mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def image_analyze(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    if not state.assets_images:
        return state

    experiments = [
        {
            "exp_key": e.source_idx or e.idx,
            "name": f"{e.name}（{e.idx}{('.' + e.subidx) if e.subidx else ''}）",
        }
        for e in state.experiments
    ]
    method_context = ""
    if llm._settings.enable_image_grouping_with_method_context:
        method_context = "\n".join(
            [
                f"{e.source_idx or e.idx} {e.method_summary}"
                for e in state.experiments
                if e.method_summary
            ]
        )

    updated: list[ImageAsset] = []
    for img in state.assets_images:
        if img.analysis is not None:
            updated.append(img)
            continue

        raw = storage.get_bytes(img.storage_key)
        data_url = _to_data_url(img.mime_type, raw)

        analysis = llm.analyze_image(
            image_b64_url=data_url,
            experiments=experiments,
            method_context=method_context,
            attempts=state.job_meta.retry_budgets.image_analyze + 1,
        )

        updated.append(img.model_copy(update={"analysis": analysis}))

    state.assets_images = updated
    return state
