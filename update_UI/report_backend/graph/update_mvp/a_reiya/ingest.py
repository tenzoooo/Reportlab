from __future__ import annotations

from graph.state import AgentState, InputAssetKind, InputAssetRef, JobStatus, ValidationIssue, now_iso
from core.storage import Storage
from llm.client import LLMClient


_WARN_MISSING_STORAGE = "warn_input_missing_storage"
_WARN_DUPLICATE_ASSET_ID = "warn_input_duplicate_asset_id"
_WARN_DUPLICATE_STORAGE_KEY = "warn_input_duplicate_storage_key"
_WARN_MISSING_PDF = "warn_input_missing_pdf"


def _make_asset_id(kind: InputAssetKind, source_id: str) -> str:
    safe = (source_id or "").strip() or "unknown"
    return f"{kind.value}:{safe}"


def _warn(state: AgentState, *, code: str, message: str, target: str | None = None) -> None:
    state.validation_report.warnings.append(ValidationIssue(code=code, message=message, target=target))


def ingest(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    # Job creation happens in the API layer; this step enriches input metadata.
    state.status = JobStatus.running
    state.job_meta.text_model = llm.text_model
    state.job_meta.vision_model = llm.vision_model
    state.job_meta.updated_at = now_iso()

    input_assets: list[InputAssetRef] = []

    if state.pdf.storage_key:
        if not state.pdf.asset_id:
            state.pdf.asset_id = _make_asset_id(InputAssetKind.pdf, "manual")
        input_assets.append(
            InputAssetRef(
                asset_id=state.pdf.asset_id,
                kind=InputAssetKind.pdf,
                source_id="manual",
                filename=state.pdf.filename,
                storage_key=state.pdf.storage_key,
                upload_index=0,
            )
        )
        if not storage.exists(state.pdf.storage_key):
            _warn(state, code=_WARN_MISSING_STORAGE, message="PDF storage key is missing", target=state.pdf.storage_key)
    else:
        _warn(state, code=_WARN_MISSING_PDF, message="PDF storage key is missing", target="pdf")

    excel_sources = list(state.excel_files)
    if not excel_sources and state.excel.storage_key:
        if not state.excel.asset_id:
            state.excel.asset_id = _make_asset_id(InputAssetKind.excel, "primary")
        input_assets.append(
            InputAssetRef(
                asset_id=state.excel.asset_id,
                kind=InputAssetKind.excel,
                source_id="primary",
                filename=state.excel.filename,
                storage_key=state.excel.storage_key,
                upload_index=0,
            )
        )
        if not storage.exists(state.excel.storage_key):
            _warn(state, code=_WARN_MISSING_STORAGE, message="Excel storage key is missing", target=state.excel.storage_key)

    for excel in excel_sources:
        source_id = (excel.excel_id or "").strip() or f"excel_{excel.upload_index or 0}"
        if not excel.asset_id:
            excel.asset_id = _make_asset_id(InputAssetKind.excel, source_id)
        input_assets.append(
            InputAssetRef(
                asset_id=excel.asset_id,
                kind=InputAssetKind.excel,
                source_id=source_id,
                filename=excel.filename,
                storage_key=excel.storage_key,
                upload_index=excel.upload_index,
            )
        )
        if excel.storage_key and not storage.exists(excel.storage_key):
            _warn(state, code=_WARN_MISSING_STORAGE, message="Excel storage key is missing", target=excel.storage_key)

    for img in state.assets_images:
        source_id = (img.image_id or "").strip() or f"image_{img.upload_index or 0}"
        if not img.asset_id:
            img.asset_id = _make_asset_id(InputAssetKind.image, source_id)
        input_assets.append(
            InputAssetRef(
                asset_id=img.asset_id,
                kind=InputAssetKind.image,
                source_id=source_id,
                filename=img.filename,
                storage_key=img.storage_key,
                upload_index=img.upload_index,
            )
        )
        if img.storage_key and not storage.exists(img.storage_key):
            _warn(state, code=_WARN_MISSING_STORAGE, message="Image storage key is missing", target=img.storage_key)

    for table in state.assets_tables:
        source_id = (table.table_id or "").strip() or f"table_{table.upload_index or 0}"
        if not table.asset_id:
            table.asset_id = _make_asset_id(InputAssetKind.table, source_id)
        input_assets.append(
            InputAssetRef(
                asset_id=table.asset_id,
                kind=InputAssetKind.table,
                source_id=source_id,
                filename="",
                storage_key=table.storage_key,
                upload_index=table.upload_index,
            )
        )
        if table.storage_key and not storage.exists(table.storage_key):
            _warn(state, code=_WARN_MISSING_STORAGE, message="Table storage key is missing", target=table.storage_key)

    past_reports = list(state.past_reports)
    if not past_reports and state.past_report.storage_key:
        if not state.past_report.report_id:
            state.past_report.report_id = "legacy"
        past_reports = [state.past_report]
        state.past_reports = past_reports

    for report in past_reports:
        if not report.storage_key:
            continue
        source_id = (report.report_id or "").strip() or f"report_{report.upload_index or 0}"
        if not report.asset_id:
            report.asset_id = _make_asset_id(InputAssetKind.past_report, source_id)
        input_assets.append(
            InputAssetRef(
                asset_id=report.asset_id,
                kind=InputAssetKind.past_report,
                source_id=source_id,
                filename=report.filename,
                storage_key=report.storage_key,
                upload_index=report.upload_index,
            )
        )
        if report.storage_key and not storage.exists(report.storage_key):
            _warn(state, code=_WARN_MISSING_STORAGE, message="Past report storage key is missing", target=report.storage_key)

    seen_ids: dict[str, int] = {}
    seen_keys: dict[str, int] = {}
    for asset in input_assets:
        if asset.asset_id:
            seen_ids[asset.asset_id] = seen_ids.get(asset.asset_id, 0) + 1
        if asset.storage_key:
            seen_keys[asset.storage_key] = seen_keys.get(asset.storage_key, 0) + 1

    for asset_id, count in seen_ids.items():
        if count > 1:
            _warn(state, code=_WARN_DUPLICATE_ASSET_ID, message="Duplicate asset_id detected", target=asset_id)

    for key, count in seen_keys.items():
        if count > 1:
            _warn(state, code=_WARN_DUPLICATE_STORAGE_KEY, message="Duplicate storage_key detected", target=key)

    state.input_assets = input_assets
    return state
