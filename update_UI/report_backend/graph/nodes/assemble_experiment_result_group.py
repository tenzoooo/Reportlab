from __future__ import annotations

from typing import Iterable

from graph.nodes.bind_insert_assets import _build_insert_asset_hitl
from graph.nodes.theory_compare_utils import is_theory_compare_enabled_for_exp
from graph.state import AgentState, InsertAssetBinding, JobStatus, TextGenerationHitl, ValidationIssue, now_iso
from models.contracts import (
    AssetRef,
    Experiment,
    ExperimentResultGroup,
    MetricValue,
    QuantComment,
    TextWithEvidence,
)
from models.contracts import FigureBlock, TableBlock


_HITL_METHOD_TO_RESULT_MAPPING = "HITL_METHOD_TO_RESULT_MAPPING"
_HITL_METHOD_NUMBER_MISSING = "HITL_METHOD_NUMBER_MISSING"
_HITL_INSERT_ASSET_MISSING = "HITL_INSERT_ASSET_MISSING"
_HITL_INSERT_ASSET_UNKNOWN = "HITL_INSERT_ASSET_UNKNOWN"
_FAIL_GROUP_SLOT_MISSING = "FAIL_RESULT_GROUP_SLOT_MISSING"


def _has_children(state: AgentState, *, idx: str) -> bool:
    return any(exp.idx == idx and exp.subidx for exp in state.experiments)


def _exp_key(exp: Experiment) -> str:
    return (exp.source_idx or exp.idx).strip()


def _build_result_map_hitl(missing: list[str]) -> TextGenerationHitl:
    targets = [{"exp_key": key} for key in missing]
    blocks = []
    for idx, exp_key in enumerate(missing):
        blocks.append(
            "<section>"
            f"<h3>Method {exp_key}</h3>"
            f"<label>Result number <input name=\"result_no_{idx}\" /></label>"
            "</section>"
        )
    html = "<form data-hitl=\"method_to_result_map\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": targets}
    return TextGenerationHitl(
        enabled=True,
        codes=[_HITL_METHOD_TO_RESULT_MAPPING],
        message="Result number mapping is missing.",
        html=html,
        payload=payload,
        rewind_target="MapResultNumbers",
    )


def _build_method_no_hitl(missing: list[str]) -> TextGenerationHitl:
    targets = [{"exp_key": key} for key in missing]
    blocks = []
    for idx, exp_key in enumerate(missing):
        blocks.append(
            "<section>"
            f"<h3>Experiment {exp_key}</h3>"
            f"<label>Method number <input name=\"method_no_{idx}\" /></label>"
            "</section>"
        )
    html = "<form data-hitl=\"method_number\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": targets}
    return TextGenerationHitl(
        enabled=True,
        codes=[_HITL_METHOD_NUMBER_MISSING],
        message="Method number is missing.",
        html=html,
        payload=payload,
        rewind_target="ExtractMethodNumbers",
    )


def _filter_evidence(exp: Experiment, *, target: str) -> list:
    return [ref for ref in exp.evidence_refs if ref.target == target]


def _text_with_evidence(text: str, refs: Iterable) -> TextWithEvidence:
    return TextWithEvidence(text=text.strip(), evidence_refs=list(refs))


def _asset_caption(block, *, kind: str) -> TextWithEvidence | None:
    caption = ""
    refs = []
    if kind == "table":
        caption = (block.table.caption or "").strip()
        refs = list(getattr(block.table, "evidence_refs", []) or [])
    elif kind in {"figure", "photo"}:
        caption = (block.figure.caption or "").strip()
        refs = list(getattr(block.figure, "evidence_refs", []) or [])
    if not caption:
        return None
    return _text_with_evidence(caption, refs)


def _metric_value(value: float | None, unit: str) -> MetricValue | None:
    if value is None:
        return None
    return MetricValue(value=float(value), unit=(unit or "1").strip() or "1")


def _quant_comment_for_exp(state: AgentState, *, exp_key: str, text: str, refs: list) -> QuantComment | None:
    if is_theory_compare_enabled_for_exp(state, exp_key):
        target = next((d for d in state.delta_error_results if d.exp_key == exp_key), None)
        if not target:
            return None
        unit = (target.measured_unit or target.theory_unit or "").strip() or "1"
        theory = _metric_value(target.theory_value, unit)
        measured = _metric_value(target.measured_value, unit)
        delta = _metric_value(target.delta, unit)
        abs_error = _metric_value(target.abs_error, unit)
        if not all([theory, measured, delta, abs_error]):
            return None
        metrics = {
            "theory_value": theory,
            "measured_value": measured,
            "delta": delta,
            "abs_error": abs_error,
        }
        return QuantComment(
            theory_compare=True,
            metrics=metrics,
            text=_text_with_evidence(text, refs),
        )

    target = next((d for d in state.slope_extreme_results if d.exp_key == exp_key), None)
    if not target:
        return None
    slope_unit = f"{(target.y_unit or '').strip()}/{(target.x_unit or '').strip()}".strip("/")
    slope = _metric_value(target.slope, slope_unit or "1")
    if not slope:
        return None
    if target.max_value is not None:
        extreme = {"type": "max", "value": float(target.max_value), "unit": (target.y_unit or "1").strip() or "1"}
    elif target.min_value is not None:
        extreme = {"type": "min", "value": float(target.min_value), "unit": (target.y_unit or "1").strip() or "1"}
    else:
        return None
    metrics = {"slope": slope, "extreme": extreme}
    return QuantComment(
        theory_compare=False,
        metrics=metrics,
        text=_text_with_evidence(text, refs),
    )


def _report_failure(state: AgentState, *, target: str) -> None:
    state.validation_report.errors.append(
        ValidationIssue(code=_FAIL_GROUP_SLOT_MISSING, message="Experiment result group is incomplete.", target=target)
    )
    state.status = JobStatus.failed


def _binding_by_exp(state: AgentState) -> dict[str, InsertAssetBinding]:
    return {b.exp_key: b for b in state.insert_asset_bindings if b.exp_key}


def _required_by_exp(state: AgentState) -> dict[str, tuple[int, int, int]]:
    required: dict[str, tuple[int, int, int]] = {}
    for estimate in state.required_outputs:
        exp_key = str(estimate.exp_key or "").strip()
        if not exp_key:
            continue
        required[exp_key] = (
            int(estimate.tables_count or 0),
            int(estimate.graphs_count or 0),
            int(estimate.photos_count or 0),
        )
    return required


def _assets_need_hitl(binding: InsertAssetBinding | None) -> bool:
    if not binding:
        return False
    if binding.missing_tables or binding.missing_graphs or binding.missing_photos:
        return True
    if binding.ambiguous or binding.type_unknown:
        return True
    return False


def _fallback_binding(
    *,
    exp_key: str,
    result_no: str,
    required: tuple[int, int, int],
    missing: tuple[int, int, int],
    unknown: bool,
) -> InsertAssetBinding:
    return InsertAssetBinding(
        exp_key=exp_key,
        result_no=result_no,
        required_tables=required[0],
        required_graphs=required[1],
        required_photos=required[2],
        missing_tables=missing[0],
        missing_graphs=missing[1],
        missing_photos=missing[2],
        ambiguous=unknown,
        type_unknown=unknown,
    )


def assemble_experiment_result_group(state: AgentState) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if not state.experiments:
        state.result_groups = []
        return state

    missing_result_map: list[str] = []
    missing_method_no: list[str] = []
    exp_keys: dict[str, Experiment] = {}

    for exp in state.experiments:
        if not exp.subidx and _has_children(state, idx=exp.idx):
            continue
        exp_key = _exp_key(exp)
        if not exp_key:
            continue
        exp_keys[exp_key] = exp
        result_no = state.pdf.result_number_map.get(exp_key, "")
        if not result_no:
            missing_result_map.append(exp_key)
        if not (exp.method_no or "").strip():
            missing_method_no.append(exp_key)

    if missing_result_map:
        state.text_generation_hitl = _build_result_map_hitl(sorted(set(missing_result_map)))
        state.job_meta.updated_at = now_iso()
        return state

    if missing_method_no:
        state.text_generation_hitl = _build_method_no_hitl(sorted(set(missing_method_no)))
        state.job_meta.updated_at = now_iso()
        return state

    binding_by_exp = _binding_by_exp(state)
    required_by_exp = _required_by_exp(state)
    hitl_bindings: list[InsertAssetBinding] = []

    for exp_key, exp in exp_keys.items():
        required = required_by_exp.get(exp_key, (0, 0, 0))
        binding = binding_by_exp.get(exp_key)
        if binding is None and any(required):
            hitl_bindings.append(
                InsertAssetBinding(
                    exp_key=exp_key,
                    result_no=state.pdf.result_number_map.get(exp_key, ""),
                    required_tables=required[0],
                    required_graphs=required[1],
                    required_photos=required[2],
                    missing_tables=required[0],
                    missing_graphs=required[1],
                    missing_photos=required[2],
                )
            )
            continue
        if _assets_need_hitl(binding):
            hitl_bindings.append(binding)

    if hitl_bindings:
        hitl = _build_insert_asset_hitl(hitl_bindings, tables=state.assets_tables, images=state.assets_images)
        if hitl.enabled:
            state.text_generation_hitl = TextGenerationHitl(
                enabled=True,
                codes=hitl.codes or [_HITL_INSERT_ASSET_MISSING],
                message="Insert assets are missing or unknown.",
                html=hitl.html,
                payload=hitl.payload,
                rewind_target="BindInsertAssets",
            )
            state.job_meta.updated_at = now_iso()
            return state

    groups: list[ExperimentResultGroup] = []
    image_by_id = {img.image_id: img for img in state.assets_images if img.image_id}
    table_by_upload = {tbl.upload_index: tbl for tbl in state.assets_tables if tbl.upload_index}

    for exp_key, exp in exp_keys.items():
        result_no = state.pdf.result_number_map.get(exp_key, "").strip()
        if not result_no:
            _report_failure(state, target=exp_key)
            continue
        method_no = (exp.method_no or "").strip() or None
        name = (exp.name or "").strip() or f"実験 {result_no}"

        overview_text = (exp.method_summary or "").strip()
        if not overview_text:
            _report_failure(state, target=exp_key)
            continue
        overview = _text_with_evidence(overview_text, _filter_evidence(exp, target="method_summary"))

        result_text = (exp.result_brief or "").strip()
        if not result_text:
            _report_failure(state, target=exp_key)
            continue
        result_desc = _text_with_evidence(result_text, _filter_evidence(exp, target="result_description"))

        qc_text = (exp.quant_comment or "").strip()
        if not qc_text:
            _report_failure(state, target=exp_key)
            continue
        qc_refs = _filter_evidence(exp, target="quant_comment")
        quant_comment = _quant_comment_for_exp(state, exp_key=exp_key, text=qc_text, refs=qc_refs)
        if not quant_comment:
            _report_failure(state, target=exp_key)
            continue

        binding = binding_by_exp.get(exp_key)
        required = required_by_exp.get(exp_key, (0, 0, 0))
        table_ids = list(getattr(binding, "tables_asset_ids", []) or [])
        graph_ids = list(getattr(binding, "graphs_asset_ids", []) or [])
        photo_ids = list(getattr(binding, "photos_asset_ids", []) or [])

        tables: list[AssetRef] = []
        figures: list[AssetRef] = []
        photos: list[AssetRef] = []
        unknown_assets = False

        table_blocks = [b for b in exp.blocks if isinstance(b, TableBlock)]
        figure_blocks = [b for b in exp.blocks if isinstance(b, FigureBlock)]

        for idx, block in enumerate(table_blocks):
            asset_id = ""
            if idx < len(table_ids):
                asset_id = table_ids[idx]
            elif block.table.asset_upload_index:
                match = table_by_upload.get(block.table.asset_upload_index)
                if match:
                    asset_id = match.table_id
            if not asset_id:
                unknown_assets = True
                continue
            caption = _asset_caption(block, kind="table")
            if caption is None:
                _report_failure(state, target=exp_key)
                continue
            label = (block.table.label or "").strip()
            if not label:
                _report_failure(state, target=exp_key)
                continue
            tables.append(
                AssetRef(
                    asset_id=asset_id,
                    asset_kind="table",
                    label=label,
                    caption=caption,
                )
            )

        if len(table_ids) > len(table_blocks):
            unknown_assets = True

        for block in figure_blocks:
            asset_id = (block.figure.figure_image_id or "").strip()
            if not asset_id and block.figure.asset_upload_index:
                match = next((img for img in state.assets_images if img.upload_index == block.figure.asset_upload_index), None)
                if match:
                    asset_id = match.image_id
            if not asset_id:
                if photo_ids:
                    asset_id = photo_ids.pop(0)
                elif graph_ids:
                    asset_id = graph_ids.pop(0)
            if not asset_id:
                unknown_assets = True
                continue
            img = image_by_id.get(asset_id)
            asset_kind = "figure"
            if img and (img.rough_class or "").strip().lower() == "photo":
                asset_kind = "photo"
            elif asset_id in photo_ids:
                asset_kind = "photo"
            elif asset_id in graph_ids:
                asset_kind = "figure"
            if asset_kind == "photo":
                if asset_id in photo_ids:
                    photo_ids.remove(asset_id)
            else:
                if asset_id in graph_ids:
                    graph_ids.remove(asset_id)
            caption = _asset_caption(block, kind=asset_kind)
            if caption is None:
                _report_failure(state, target=exp_key)
                continue
            label = (block.figure.label or "").strip()
            if not label:
                _report_failure(state, target=exp_key)
                continue
            asset_ref = AssetRef(
                asset_id=asset_id,
                asset_kind=asset_kind,
                label=label,
                caption=caption,
            )
            if asset_kind == "photo":
                photos.append(asset_ref)
            else:
                figures.append(asset_ref)

        if graph_ids or photo_ids:
            unknown_assets = True

        missing_counts = (
            max(0, required[0] - len(tables)),
            max(0, required[1] - len(figures)),
            max(0, required[2] - len(photos)),
        )
        extra_assets = (
            len(tables) > required[0],
            len(figures) > required[1],
            len(photos) > required[2],
        )
        needs_unknown = unknown_assets or any(extra_assets)

        if needs_unknown:
            hitl_binding = binding or _fallback_binding(
                exp_key=exp_key,
                result_no=result_no,
                required=required,
                missing=missing_counts,
                unknown=True,
            )
            hitl = _build_insert_asset_hitl(
                [hitl_binding],
                tables=state.assets_tables,
                images=state.assets_images,
            )
            if hitl.enabled:
                state.text_generation_hitl = TextGenerationHitl(
                    enabled=True,
                    codes=hitl.codes or [_HITL_INSERT_ASSET_UNKNOWN],
                    message="Insert assets are missing or unknown.",
                    html=hitl.html,
                    payload=hitl.payload,
                    rewind_target="BindInsertAssets",
                )
                state.job_meta.updated_at = now_iso()
                return state
            _report_failure(state, target=exp_key)
            continue

        if missing_counts != (0, 0, 0):
            hitl_binding = binding or _fallback_binding(
                exp_key=exp_key,
                result_no=result_no,
                required=required,
                missing=missing_counts,
                unknown=False,
            )
            hitl = _build_insert_asset_hitl(
                [hitl_binding],
                tables=state.assets_tables,
                images=state.assets_images,
            )
            if hitl.enabled:
                state.text_generation_hitl = TextGenerationHitl(
                    enabled=True,
                    codes=hitl.codes or [_HITL_INSERT_ASSET_MISSING],
                    message="Insert assets are missing or unknown.",
                    html=hitl.html,
                    payload=hitl.payload,
                    rewind_target="BindInsertAssets",
                )
                state.job_meta.updated_at = now_iso()
                return state
            _report_failure(state, target=exp_key)
            continue

        groups.append(
            ExperimentResultGroup(
                result_no=result_no,
                method_no=method_no,
                experiment_name=name,
                experiment_overview=overview,
                result_description=result_desc,
                tables=tables,
                figures=figures,
                photos=photos,
                quant_comment=quant_comment,
                evidence_refs=[],
            )
        )

    state.result_groups = groups
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["assemble_experiment_result_group"]
