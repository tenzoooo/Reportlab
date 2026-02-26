from __future__ import annotations

from graph.state import AgentState, JobMeta, TextGenerationHitl
from graph.nodes.assemble_experiment_result_group import assemble_experiment_result_group
from graph.nodes.assemble_results_page import assemble_results_page
from graph.nodes.unit_init import unit_init
from graph.update_mvp.L_reiya.compose_markdown_document import compose_markdown_document
from models.contracts import AssetRef, EvidenceRef, ExperimentResultGroup, QuantComment, TextWithEvidence


def _text_with_evidence(text: str) -> TextWithEvidence:
    return TextWithEvidence(text=(text or "").strip(), evidence_refs=[])


def _fallback_groups(state: AgentState) -> list[ExperimentResultGroup]:
    table_by_id = {t.table_id: t for t in state.assets_tables}
    image_by_id = {i.image_id: i for i in state.assets_images}
    qc_by_asset: dict[str, str] = {}
    for item in state.g_quant_comment_results:
        asset_id = (item.asset_id or "").strip()
        if asset_id and item.quant_comment:
            qc_by_asset.setdefault(asset_id, item.quant_comment)

    groups: list[ExperimentResultGroup] = []
    for exp in state.experiments:
        exp_key = (exp.source_idx or exp.idx).strip()
        if not exp_key:
            continue
        result_no = state.pdf.result_number_map.get(exp_key, exp_key).strip()
        overview = _text_with_evidence(exp.method_summary or "")

        binding = next((b for b in state.insert_asset_bindings if b.exp_key == exp_key), None)
        table_ids = list(getattr(binding, "tables_asset_ids", []) or [])
        graph_ids = list(getattr(binding, "graphs_asset_ids", []) or [])
        photo_ids = list(getattr(binding, "photos_asset_ids", []) or [])

        tables: list[AssetRef] = []
        figures: list[AssetRef] = []
        photos: list[AssetRef] = []

        for idx, table_id in enumerate(table_ids, start=1):
            tbl = table_by_id.get(table_id)
            caption = ""
            if tbl and tbl.analysis and tbl.analysis.caption:
                caption = tbl.analysis.caption
            label = f"表{idx}"
            tables.append(AssetRef(asset_id=table_id, asset_kind="table", label=label, caption=_text_with_evidence(caption)))

        for idx, image_id in enumerate(graph_ids, start=1):
            img = image_by_id.get(image_id)
            caption = ""
            if img and img.analysis and img.analysis.caption:
                caption = img.analysis.caption
            label = f"図{idx}"
            figures.append(AssetRef(asset_id=image_id, asset_kind="figure", label=label, caption=_text_with_evidence(caption)))

        for idx, image_id in enumerate(photo_ids, start=1):
            img = image_by_id.get(image_id)
            caption = ""
            if img and img.analysis and img.analysis.caption:
                caption = img.analysis.caption
            label = f"写真{idx}"
            photos.append(AssetRef(asset_id=image_id, asset_kind="photo", label=label, caption=_text_with_evidence(caption)))

        quant_candidates = [
            qc_by_asset.get(a.asset_id, "") for a in tables + figures + photos if qc_by_asset.get(a.asset_id, "")
        ]
        quant_comment_text = "\n".join(quant_candidates).strip() if quant_candidates else "定量コメントなし。"
        result_desc = quant_candidates[0] if quant_candidates else (exp.method_summary or "")

        groups.append(
            ExperimentResultGroup(
                result_no=result_no or exp_key,
                method_no=exp.method_no or exp_key,
                experiment_name=exp.name or exp_key,
                experiment_overview=overview,
                result_description=_text_with_evidence(result_desc),
                tables=tables,
                figures=figures,
                photos=photos,
                quant_comment=QuantComment(
                    theory_compare=False,
                    metrics={},
                    text=_text_with_evidence(quant_comment_text),
                ),
                evidence_refs=[EvidenceRef(source_kind="computed", asset_id="", text="fallback", target="result_group")],
            )
        )
    return groups


def _ensure_job_meta(payload: dict) -> dict:
    if payload.get("job_meta"):
        return payload
    patched = dict(payload)
    patched["job_meta"] = JobMeta(job_id="manual", run_id="manual").model_dump()
    return patched


def build_experiment_page(state: AgentState) -> AgentState:
    if not state.experiments and state.method_tree:
        state = unit_init(state)
    if not state.pdf.result_number_map:
        for exp in state.experiments:
            exp_key = (exp.source_idx or exp.idx).strip()
            if exp_key:
                state.pdf.result_number_map[exp_key] = exp_key
        state.text_generation_hitl = TextGenerationHitl()
    state = assemble_experiment_result_group(state)
    if not state.result_groups and state.experiments:
        state.result_groups = _fallback_groups(state)
    state.text_generation_hitl = TextGenerationHitl()
    state = assemble_results_page(state)
    return state


def build_experiment_page_from_payload(payload: dict) -> AgentState:
    patched = _ensure_job_meta(payload)
    state = AgentState.model_validate(patched)
    return build_experiment_page(state)
