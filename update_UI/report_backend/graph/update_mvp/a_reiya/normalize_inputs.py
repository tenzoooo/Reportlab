from __future__ import annotations

import hashlib
import mimetypes
from io import BytesIO
from typing import Optional
import zipfile

import fitz  # PyMuPDF

from core.excel import load_workbook_bytes
from core.storage import Storage
from graph.state import AgentState, InputAssetKind, NormalizedAsset, ValidationIssue, now_iso


_WARN_READ_FAILED = "warn_input_read_failed"
_WARN_METADATA_FAILED = "warn_input_metadata_failed"
_WARN_DOCX_READ_FAILED = "warn_input_docx_read_failed"

_DOCX_DOCUMENT_XML = "word/document.xml"


def _warn(state: AgentState, *, code: str, message: str, target: str | None = None) -> None:
    state.validation_report.warnings.append(ValidationIssue(code=code, message=message, target=target))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _pdf_page_count(data: bytes) -> Optional[int]:
    try:
        with fitz.open(stream=data, filetype="pdf") as doc:
            return doc.page_count
    except Exception:
        return None


def _excel_sheet_names(data: bytes) -> list[str]:
    try:
        wb = load_workbook_bytes(data)
        names = [str(n) for n in wb.sheetnames]
        try:
            wb.close()
        except Exception:
            pass
        return names
    except Exception:
        return []


def _guess_mime(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename or "")
    return guessed or ""


def _docx_readable(data: bytes) -> bool:
    if not data:
        return False
    try:
        with zipfile.ZipFile(BytesIO(data)) as zf:
            zf.read(_DOCX_DOCUMENT_XML)
        return True
    except Exception:
        return False


def normalize_inputs(state: AgentState, *, storage: Storage) -> AgentState:
    normalized: list[NormalizedAsset] = []

    excel_by_id = {excel.excel_id: excel for excel in state.excel_files}
    images_by_id = {img.image_id: img for img in state.assets_images}
    images_by_asset_id = {img.asset_id: img for img in state.assets_images if img.asset_id}

    for asset in state.input_assets:
        meta = NormalizedAsset(
            asset_id=asset.asset_id,
            kind=asset.kind,
            source_id=asset.source_id,
            filename=asset.filename,
            storage_key=asset.storage_key,
            upload_index=asset.upload_index,
        )

        if not asset.storage_key:
            normalized.append(meta)
            continue

        try:
            data = storage.get_bytes(asset.storage_key)
        except Exception as exc:
            _warn(
                state,
                code=_WARN_READ_FAILED,
                message=f"Failed to read asset bytes: {exc}",
                target=asset.storage_key,
            )
            normalized.append(meta)
            continue

        meta.size_bytes = len(data)
        meta.sha256 = _sha256(data)
        if not meta.mime_type:
            meta.mime_type = _guess_mime(asset.filename or asset.storage_key)

        if asset.kind == InputAssetKind.pdf:
            pages = _pdf_page_count(data)
            meta.page_count = pages
            if pages is not None:
                state.pdf.pages = pages
            if pages is None:
                _warn(state, code=_WARN_METADATA_FAILED, message="Failed to read PDF page count", target=asset.storage_key)

        if asset.kind == InputAssetKind.excel:
            sheet_names = _excel_sheet_names(data)
            meta.sheet_names = sheet_names
            if asset.source_id == "primary" and state.excel.storage_key:
                state.excel.sheet_names = sheet_names
            else:
                excel = excel_by_id.get(asset.source_id)
                if excel is not None:
                    excel.sheet_names = sheet_names
            if not sheet_names:
                _warn(
                    state,
                    code=_WARN_METADATA_FAILED,
                    message="Failed to read Excel sheet names",
                    target=asset.storage_key,
                )

        if asset.kind == InputAssetKind.past_report:
            ext = (asset.filename or asset.storage_key or "").lower()
            if ext.endswith(".docx") and not _docx_readable(data):
                _warn(
                    state,
                    code=_WARN_DOCX_READ_FAILED,
                    message="Failed to read DOCX document",
                    target=asset.storage_key,
                )

        if asset.kind == InputAssetKind.image:
            img = images_by_id.get(asset.source_id) or images_by_asset_id.get(asset.asset_id)
            if img is not None:
                meta.mime_type = img.mime_type

        normalized.append(meta)

    state.normalized_inputs = normalized
    state.job_meta.updated_at = now_iso()
    return state
