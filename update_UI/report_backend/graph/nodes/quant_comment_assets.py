from __future__ import annotations

from typing import Iterable

from core.storage import Storage
from graph.state import (
    AgentState,
    QuantCommentResult,
    QuantCommentTarget,
    now_iso,
)
from llm.client import LLMClient


def _experiment_catalog(state: AgentState) -> list[dict[str, str]]:
    method_summary_by_exp = {
        str(item.get("exp_key") or "").strip(): str(item.get("method_summary") or "").strip()
        for item in (state.method_tree or [])
        if isinstance(item, dict)
    }
    if state.required_outputs:
        return [
            {
                "exp_key": str(item.exp_key or "").strip(),
                "name": str(item.title or "").strip(),
                "method_summary": method_summary_by_exp.get(str(item.exp_key or "").strip(), "")
                or str(item.method_summary or "").strip(),
            }
            for item in state.required_outputs
            if str(item.exp_key or "").strip()
        ]
    if state.b_layer_bundle and state.b_layer_bundle.method.items:
        return [
            {
                "exp_key": str(item.exp_key or "").strip(),
                "name": str(item.title or "").strip(),
                "method_summary": method_summary_by_exp.get(str(item.exp_key or "").strip(), "")
                or str(item.text or "").strip(),
            }
            for item in state.b_layer_bundle.method.items
            if str(item.exp_key or "").strip()
        ]
    if method_summary_by_exp:
        return [
            {"exp_key": exp_key, "name": "", "method_summary": summary}
            for exp_key, summary in method_summary_by_exp.items()
            if exp_key and summary
        ]
    return []


def _method_context_by_exp(catalog: list[dict[str, str]]) -> dict[str, str]:
    return {str(item.get("exp_key") or ""): str(item.get("method_summary") or "") for item in catalog}


def _targets_from_bindings(state: AgentState) -> list[QuantCommentTarget]:
    targets: list[QuantCommentTarget] = []
    for binding in state.insert_asset_bindings:
        if not binding.exp_key:
            continue
        targets.append(
            QuantCommentTarget(
                exp_key=binding.exp_key,
                table_ids=list(binding.tables_asset_ids),
                graph_ids=list(binding.graphs_asset_ids),
                photo_ids=list(binding.photos_asset_ids),
            )
        )
    return targets


def _dedupe(seq: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in seq:
        key = str(item or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _image_data_url(storage: Storage, storage_key: str, mime_type: str) -> str:
    raw = storage.get_bytes(storage_key)
    import base64

    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def generate_quant_comments_from_assets(
    state: AgentState, *, storage: Storage, llm: LLMClient | None
) -> AgentState:
    if llm is None:
        return state

    catalog = _experiment_catalog(state)
    method_context_map = _method_context_by_exp(catalog)

    targets = list(state.g_quant_comment_inputs or [])
    if not targets:
        targets = _targets_from_bindings(state)

    table_by_id = {t.table_id: t for t in state.assets_tables}
    image_by_id = {i.image_id: i for i in state.assets_images}

    results: list[QuantCommentResult] = []

    for target in targets:
        exp_key = str(target.exp_key or "").strip()
        method_context = method_context_map.get(exp_key, "")

        for table_id in _dedupe(target.table_ids):
            table = table_by_id.get(table_id)
            if not table:
                results.append(
                    QuantCommentResult(
                        exp_key=exp_key,
                        asset_id=table_id,
                        kind="table",
                        error="table_not_found",
                    )
                )
                continue
            try:
                analysis = llm.analyze_table(
                    table.raw_csv,
                    experiments=catalog,
                    table_summary=table.analysis.table_summary if table.analysis else "",
                )
                table.analysis = analysis
                results.append(
                    QuantCommentResult(
                        exp_key=exp_key,
                        asset_id=table_id,
                        kind="table",
                        caption=analysis.caption,
                        quant_comment=analysis.quant_comment,
                    )
                )
            except Exception as exc:
                results.append(
                    QuantCommentResult(
                        exp_key=exp_key,
                        asset_id=table_id,
                        kind="table",
                        error=str(exc),
                    )
                )

        image_ids = _dedupe([*target.graph_ids, *target.photo_ids])
        for image_id in image_ids:
            image = image_by_id.get(image_id)
            if not image:
                results.append(
                    QuantCommentResult(
                        exp_key=exp_key,
                        asset_id=image_id,
                        kind="image",
                        error="image_not_found",
                    )
                )
                continue
            try:
                image_url = _image_data_url(storage, image.storage_key, image.mime_type)
                analysis = llm.analyze_image(
                    image_b64_url=image_url,
                    experiments=catalog,
                    method_context=method_context,
                    extracted_hint="",
                )
                image.analysis = analysis
                results.append(
                    QuantCommentResult(
                        exp_key=exp_key,
                        asset_id=image_id,
                        kind=image.rough_class or "image",
                        caption=analysis.caption,
                        quant_comment=analysis.quant_comment,
                    )
                )
            except Exception as exc:
                results.append(
                    QuantCommentResult(
                        exp_key=exp_key,
                        asset_id=image_id,
                        kind=image.rough_class or "image",
                        error=str(exc),
                    )
                )

    state.g_quant_comment_results = results
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["generate_quant_comments_from_assets"]
