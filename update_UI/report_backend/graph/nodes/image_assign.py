from __future__ import annotations

from graph.state import AgentState
from graph.utils import infer_report_chapter
from graph.nodes.asset_order import insert_block_in_upload_order
from models.contracts import FigureBlock, FigureContent


def image_assign(state: AgentState) -> AgentState:
    if not state.assets_images:
        return state

    threshold = 0.6

    chapter = infer_report_chapter(state)

    updated_assets = {img.image_id: img for img in state.assets_images}

    images_sorted = sorted(enumerate(state.assets_images), key=lambda t: (t[1].upload_index or 0, t[0]))
    for _, img in images_sorted:
        analysis = img.analysis
        if not analysis:
            continue

        candidates = analysis.belongs_to or []
        best = max(candidates, key=lambda c: c.score, default=None)
        if best is None or best.score < threshold:
            updated_assets[img.image_id] = img.model_copy(update={"assigned_to": None})
            continue

        exp_key = best.exp_key

        block = FigureBlock(
            figure=FigureContent(
                figure_image_id=img.image_id,
                asset_upload_index=img.upload_index,
                label="",
                caption=analysis.caption,
                quant_comment=analysis.quant_comment,
            )
        )

        assigned = False
        for exp in state.experiments:
            if exp.source_idx == exp_key or exp.idx == exp_key:
                insert_block_in_upload_order(exp.blocks, block)
                assigned = True
                break

        updated_assets[img.image_id] = img.model_copy(update={"assigned_to": exp_key if assigned else None})

    state.assets_images = [updated_assets.get(img.image_id, img) for img in state.assets_images]
    return state
