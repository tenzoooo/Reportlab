from __future__ import annotations

import re

from graph.nodes.bind_insert_assets import _build_insert_asset_hitl
from graph.nodes_legacy.label_blocks import assign_block_labels
from graph.state import AgentState, JobStatus, TextGenerationHitl, ValidationIssue, now_iso
from models.contracts import EvidenceRef, Experiment, FigureBlock, TableBlock


_HITL_MISSING_ASSET = "HITL_INSERT_ASSET_MISSING"
_HITL_UNKNOWN_ASSET = "HITL_INSERT_ASSET_UNKNOWN"
_FAIL_MISSING_DESC = "FAIL_RESULT_DESCRIPTION_MISSING"
_FAIL_NOT_SHIMESU = "FAIL_RESULT_DESC_NOT_END_WITH_SHIMESU"
_REWIND_TARGET = "BindInsertAssets"

_LABEL_RE = re.compile(r"(図|表)\s*\d")


def _has_children(state: AgentState, *, idx: str) -> bool:
    return any(exp.idx == idx and exp.subidx for exp in state.experiments)


def _collect_labels(exp: Experiment) -> list[str]:
    labels: list[str] = []
    for block in exp.blocks:
        if isinstance(block, TableBlock):
            label = (block.table.label or "").strip()
        elif isinstance(block, FigureBlock):
            label = (block.figure.label or "").strip()
        else:
            label = ""
        if label:
            labels.append(label)
    return labels


def _labels_have_numbers(labels: list[str]) -> bool:
    return any(_LABEL_RE.search(label) for label in labels)


def _ensure_shimesu(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return s
    if s.endswith("示す。"):
        return s
    if s.endswith("示す"):
        return s + "。"
    return s + "を示す。"


def _has_evidence(exp: Experiment) -> bool:
    return any(ref.target == "result_description" for ref in exp.evidence_refs)


def _bind_by_exp(state: AgentState) -> dict[str, object]:
    return {b.exp_key: b for b in state.insert_asset_bindings if b.exp_key}


def _needs_insert_hitl(binding) -> tuple[bool, str]:
    if not binding:
        return False, ""
    if binding.type_unknown or binding.ambiguous:
        return True, _HITL_UNKNOWN_ASSET
    if binding.missing_tables or binding.missing_graphs or binding.missing_photos:
        return True, _HITL_MISSING_ASSET
    return False, ""


def _assign_hitl_for_missing_assets(state: AgentState, bindings, code: str) -> None:
    hitl = _build_insert_asset_hitl(bindings, tables=state.assets_tables, images=state.assets_images)
    if not hitl.enabled:
        return
    state.text_generation_hitl = TextGenerationHitl(
        enabled=True,
        codes=[code],
        message="Insert assets are missing or unknown.",
        html=hitl.html,
        payload=hitl.payload,
        rewind_target=_REWIND_TARGET,
    )


def generate_result_description(state: AgentState) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if not state.experiments:
        return state

    has_any_blocks = any(exp.blocks for exp in state.experiments)
    if has_any_blocks:
        assign_block_labels(state)

    bindings_by_exp = _bind_by_exp(state)
    hitl_targets = []
    hitl_code = ""

    for exp in state.experiments:
        if not exp.subidx and _has_children(state, idx=exp.idx):
            continue
        exp_key = (exp.source_idx or "").strip()
        labels = _collect_labels(exp)
        if has_any_blocks and not exp.blocks:
            binding = bindings_by_exp.get(exp_key)
            needs_hitl, code = _needs_insert_hitl(binding)
            if needs_hitl and binding:
                hitl_targets.append(binding)
                hitl_code = code
                continue
            state.validation_report.errors.append(
                ValidationIssue(code=_FAIL_MISSING_DESC, message="Result description is missing.", target=exp_key)
            )
            state.status = JobStatus.failed
            continue
        if not labels and exp.blocks:
            binding = bindings_by_exp.get(exp_key)
            needs_hitl, code = _needs_insert_hitl(binding)
            if needs_hitl and binding:
                hitl_targets.append(binding)
                hitl_code = code
                continue
            state.validation_report.errors.append(
                ValidationIssue(code=_FAIL_MISSING_DESC, message="Result description is missing.", target=exp_key)
            )
            state.status = JobStatus.failed
            continue
        if not labels:
            continue
        if not _labels_have_numbers(labels):
            state.validation_report.errors.append(
                ValidationIssue(code=_FAIL_MISSING_DESC, message="Result description lacks numbered references.", target=exp_key)
            )
            state.status = JobStatus.failed
            continue

        if not exp.result_brief.strip():
            label_text = "および".join(labels)
            exp.result_brief = _ensure_shimesu(f"測定結果を{label_text}に示す。")
            if not _has_evidence(exp):
                exp.evidence_refs.append(
                    EvidenceRef(
                        source_kind="binding",
                        text=label_text,
                        note="block_labels",
                        target="result_description",
                    )
                )
        else:
            if not _LABEL_RE.search(exp.result_brief):
                state.validation_report.errors.append(
                    ValidationIssue(code=_FAIL_MISSING_DESC, message="Result description lacks numbered references.", target=exp_key)
                )
                state.status = JobStatus.failed
                continue
            fixed = _ensure_shimesu(exp.result_brief)
            if fixed != exp.result_brief:
                exp.result_brief = fixed
                state.review_log.setdefault("auto_fixes", []).append(
                    {"code": _FAIL_NOT_SHIMESU, "target": exp_key, "detail": "append_shimesu"}
                )

        parts: list[str] = []
        if exp.method_summary.strip():
            parts.append(exp.method_summary.strip())
        if exp.result_brief.strip():
            parts.append(exp.result_brief.strip())
        if parts:
            exp.description_brief = " ".join(parts).strip()

    if hitl_targets and hitl_code:
        _assign_hitl_for_missing_assets(state, hitl_targets, hitl_code)

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["generate_result_description"]
