from __future__ import annotations

from graph.state import AgentState, InputAssetKind, QualityReport


_BLOCKING_SEVERITIES = {"FAIL", "HITL"}


def _resolve_role(kind: InputAssetKind, source_id: str, asset_id: str) -> str:
    if kind == InputAssetKind.pdf and (source_id == "manual" or asset_id == "pdf:manual"):
        return "manual_pdf"
    if kind == InputAssetKind.excel:
        return "results_excel"
    if kind == InputAssetKind.past_report:
        return "past_report"
    if kind == InputAssetKind.image:
        return "image"
    return "unknown"


def _refresh_quality_report(state: AgentState) -> None:
    if state.quality_report is None:
        state.quality_report = QualityReport(pass_gate=True, issues=[])
        return
    if not state.quality_report.issues:
        state.quality_report.pass_gate = True
        return
    has_blocking = any(issue.severity in _BLOCKING_SEVERITIES for issue in state.quality_report.issues)
    state.quality_report.pass_gate = not has_blocking


def _sync_upload_index(state: AgentState) -> None:
    if not state.input_assets:
        state.job_meta.next_upload_index = 0
        return

    asset_id_to_index: dict[str, int] = {}
    for idx, asset in enumerate(state.input_assets):
        asset.upload_index = idx
        asset_id_to_index[asset.asset_id] = idx

    for meta in state.normalized_inputs:
        if meta.asset_id in asset_id_to_index:
            meta.upload_index = asset_id_to_index[meta.asset_id]

    for excel in state.excel_files:
        if excel.asset_id in asset_id_to_index:
            excel.upload_index = asset_id_to_index[excel.asset_id]

    if state.past_report.asset_id and state.past_report.asset_id in asset_id_to_index:
        state.past_report.upload_index = asset_id_to_index[state.past_report.asset_id]

    for report in state.past_reports:
        if report.asset_id in asset_id_to_index:
            report.upload_index = asset_id_to_index[report.asset_id]

    state.job_meta.next_upload_index = max(asset_id_to_index.values()) + 1


def _apply_roles(state: AgentState) -> None:
    for meta in state.normalized_inputs:
        if meta.role:
            continue
        meta.role = _resolve_role(meta.kind, meta.source_id or "", meta.asset_id or "")


def normalize_a_layer_state(state: AgentState) -> AgentState:
    _sync_upload_index(state)
    _refresh_quality_report(state)
    _apply_roles(state)
    return state
