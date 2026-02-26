from __future__ import annotations

from graph.nodes.bind_insert_assets import _build_insert_asset_hitl
from graph.nodes_legacy.label_blocks import assign_block_labels
from graph.state import AgentState, GraphAxisBinding, JobStatus, TextGenerationHitl, ValidationIssue, now_iso
from models.contracts import EvidenceRef, FigureBlock, TableBlock


_HITL_MISSING_ASSET = "HITL_INSERT_ASSET_MISSING"
_HITL_UNKNOWN_ASSET = "HITL_INSERT_ASSET_UNKNOWN"
_FAIL_CAPTION_MISSING = "FAIL_CAPTION_MISSING"
_REWIND_TARGET = "BindInsertAssets"


def _column_label(name: str, unit: str) -> str:
    label = (name or "").strip()
    if not label:
        label = "column"
    u = (unit or "").strip()
    if not u or u == "1":
        return label
    return f"{label} ({u})"


def _table_caption(exp_name: str, columns) -> str:
    name = (exp_name or "").strip()
    cols = [c for c in columns if c] if columns else []
    if not cols:
        return f"{name}の測定結果".strip() if name else "測定結果"
    labels = [_column_label(c.name or c.header, c.unit) for c in cols[:2]]
    if len(labels) == 1:
        return f"{name}：{labels[0]}の測定結果".strip("：")
    return f"{name}：{labels[0]}と{labels[1]}の測定結果".strip("：")


def _axis_label(label: str, unit: str) -> str:
    name = (label or "").strip()
    u = (unit or "").strip()
    if not name and not u:
        return ""
    if name and u:
        return f"{name} ({u})"
    return name or u


def _figure_caption(exp_name: str, axis: GraphAxisBinding | None, *, is_photo: bool) -> str:
    name = (exp_name or "").strip()
    if is_photo:
        return f"{name}の観測写真".strip() if name else "観測写真"
    if axis:
        x_label = _axis_label(axis.x_label, axis.x_unit)
        y_label = _axis_label(axis.y_label, axis.y_unit)
        if x_label and y_label:
            return f"{y_label}と{x_label}の関係"
        if y_label or x_label:
            return f"{(y_label or x_label)}の測定結果"
    return f"{name}のグラフ".strip() if name else "測定結果のグラフ"


def _needs_insert_hitl(binding) -> tuple[bool, str]:
    if not binding:
        return False, ""
    if binding.type_unknown or binding.ambiguous:
        return True, _HITL_UNKNOWN_ASSET
    if binding.missing_tables or binding.missing_graphs or binding.missing_photos:
        return True, _HITL_MISSING_ASSET
    return False, ""


def _normalize_caption(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _has_caption_evidence(content) -> bool:
    return any(ref.target == "caption" for ref in getattr(content, "evidence_refs", []))


def generate_captions(state: AgentState) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if not state.experiments:
        return state
    has_any_blocks = any(exp.blocks for exp in state.experiments)
    if not has_any_blocks:
        return state

    assign_block_labels(state)

    bindings_by_exp = {b.exp_key: b for b in state.table_column_bindings if b.exp_key}
    axis_by_graph = {a.graph_id: a for a in state.graph_axis_bindings if a.graph_id}
    image_by_id = {img.image_id: img for img in state.assets_images if img.image_id}
    insert_by_exp = {b.exp_key: b for b in state.insert_asset_bindings if b.exp_key}

    hitl_targets = []
    hitl_code = ""

    for exp in state.experiments:
        exp_key = (exp.source_idx or "").strip()
        binding = insert_by_exp.get(exp_key)
        if binding:
            needs_hitl, code = _needs_insert_hitl(binding)
            if needs_hitl:
                hitl_targets.append(binding)
                hitl_code = code
                continue
        if has_any_blocks and not exp.blocks:
            state.validation_report.errors.append(
                ValidationIssue(code=_FAIL_CAPTION_MISSING, message="Caption target is missing.", target=exp_key)
            )
            state.status = JobStatus.failed
            continue

        columns = bindings_by_exp.get(exp_key).columns if bindings_by_exp.get(exp_key) else []
        table_caption = _table_caption(exp.name, columns)

        for block in exp.blocks:
            if isinstance(block, TableBlock):
                if not (block.table.caption or "").strip():
                    block.table.caption = table_caption
                    if not _has_caption_evidence(block.table):
                        block.table.evidence_refs.append(
                            EvidenceRef(
                                source_kind="binding",
                                text=table_caption,
                                note="table_columns",
                                target="caption",
                            )
                        )
                else:
                    normalized = _normalize_caption(block.table.caption)
                    block.table.caption = normalized
            elif isinstance(block, FigureBlock):
                image_id = (block.figure.figure_image_id or "").strip()
                axis = axis_by_graph.get(image_id)
                img = image_by_id.get(image_id)
                is_photo = bool(img and (img.rough_class or "").strip().lower() == "photo")
                if not (block.figure.caption or "").strip():
                    caption = _figure_caption(exp.name, axis, is_photo=is_photo)
                    block.figure.caption = caption
                    if not _has_caption_evidence(block.figure):
                        block.figure.evidence_refs.append(
                            EvidenceRef(
                                source_kind="binding",
                                asset_id=image_id,
                                text=caption,
                                note="axis_binding" if axis else "generic_caption",
                                target="caption",
                            )
                        )
                else:
                    normalized = _normalize_caption(block.figure.caption)
                    block.figure.caption = normalized
                if img and img.analysis and not (img.analysis.caption or "").strip():
                    img.analysis.caption = block.figure.caption

        for block in exp.blocks:
            if isinstance(block, TableBlock):
                if not (block.table.caption or "").strip():
                    state.validation_report.errors.append(
                        ValidationIssue(code=_FAIL_CAPTION_MISSING, message="Table caption is missing.", target=exp_key)
                    )
                    state.status = JobStatus.failed
            elif isinstance(block, FigureBlock):
                if not (block.figure.caption or "").strip():
                    state.validation_report.errors.append(
                        ValidationIssue(code=_FAIL_CAPTION_MISSING, message="Figure caption is missing.", target=exp_key)
                    )
                    state.status = JobStatus.failed

    if hitl_targets and hitl_code:
        hitl = _build_insert_asset_hitl(hitl_targets, tables=state.assets_tables, images=state.assets_images)
        if hitl.enabled:
            state.text_generation_hitl = TextGenerationHitl(
                enabled=True,
                codes=[hitl_code],
                message="Insert assets are missing or unknown.",
                html=hitl.html,
                payload=hitl.payload,
                rewind_target=_REWIND_TARGET,
            )

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["generate_captions"]
