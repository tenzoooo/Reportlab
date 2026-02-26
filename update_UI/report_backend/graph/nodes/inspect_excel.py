from __future__ import annotations

import re
from typing import Iterable

from core.excel import load_workbook_bytes
from core.storage import Storage
from graph.state import (
    AgentState,
    ExcelColumnProfile,
    ExcelFile,
    ExcelInventory,
    ExcelSheetInventory,
    now_iso,
)


_PREVIEW_ROWS = 12
_PREVIEW_COLS = 12
_HEADER_SCAN_ROWS = 8
_COLUMN_SAMPLE_ROWS = 8
_MIN_HEADER_CELLS = 2

_NUMBER_RE = re.compile(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")


def _cell_to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if abs(value) >= 1e12 or (abs(value) > 0 and abs(value) < 1e-6):
            return f"{value:.6g}"
        s = f"{value:.10f}".rstrip("0").rstrip(".")
        return s if s else "0"
    return str(value)


def _is_number(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return True
    if isinstance(value, str):
        s = value.strip().replace(",", "")
        if not s:
            return False
        return bool(_NUMBER_RE.match(s))
    return False


def _sheet_preview(ws, *, rows: int, cols: int) -> list[list[str]]:
    preview: list[list[str]] = []
    for r in range(1, rows + 1):
        row: list[str] = []
        for c in range(1, cols + 1):
            row.append(_cell_to_str(ws.cell(row=r, column=c).value))
        preview.append(row)
    return preview


def _score_header_row(row: list[str]) -> int:
    non_empty = [c for c in row if str(c or "").strip()]
    if len(non_empty) < _MIN_HEADER_CELLS:
        return -1
    numeric = sum(1 for c in non_empty if _is_number(c))
    text = len(non_empty) - numeric
    return text * 2 + len(non_empty) - numeric


def _infer_header_row(preview: list[list[str]]) -> tuple[int, list[str]]:
    best_idx = 0
    best_score = -1
    for idx, row in enumerate(preview[:_HEADER_SCAN_ROWS], start=1):
        score = _score_header_row(row)
        if score > best_score:
            best_score = score
            best_idx = idx
    if best_idx <= 0:
        return 0, []
    headers = [str(c or "").strip() for c in preview[best_idx - 1]]
    return best_idx, headers


def _build_column_profiles(
    preview: list[list[str]],
    *,
    header_row_index: int,
    max_cols: int,
) -> tuple[list[ExcelColumnProfile], float]:
    columns: list[ExcelColumnProfile] = []
    numeric_cells = 0
    total_cells = 0
    start_idx = header_row_index if header_row_index > 0 else 0
    sample_rows = preview[start_idx : start_idx + _COLUMN_SAMPLE_ROWS]
    headers = preview[header_row_index - 1] if header_row_index > 0 else ["" for _ in range(max_cols)]

    for col_idx in range(max_cols):
        header = str(headers[col_idx] or "").strip() if col_idx < len(headers) else ""
        values: list[str] = []
        numeric_count = 0
        text_count = 0
        non_empty = 0
        for row in sample_rows:
            if col_idx >= len(row):
                continue
            raw = row[col_idx]
            cell = str(raw or "").strip()
            if not cell:
                continue
            values.append(cell)
            non_empty += 1
            if _is_number(cell):
                numeric_count += 1
            else:
                text_count += 1

        if non_empty:
            numeric_ratio = numeric_count / float(non_empty)
            text_ratio = text_count / float(non_empty)
        else:
            numeric_ratio = 0.0
            text_ratio = 0.0
        numeric_cells += numeric_count
        total_cells += non_empty
        columns.append(
            ExcelColumnProfile(
                column_index=col_idx + 1,
                header=header,
                sample_values=values[:4],
                numeric_ratio=numeric_ratio,
                text_ratio=text_ratio,
            )
        )

    numeric_density = (numeric_cells / float(total_cells)) if total_cells else 0.0
    return columns, numeric_density


def _collect_excel_sources(state: AgentState) -> list[ExcelFile]:
    sources: list[ExcelFile] = list(state.excel_files)
    if not sources and state.excel.storage_key:
        sources.append(
            ExcelFile(
                excel_id="primary",
                asset_id=state.excel.asset_id,
                filename=state.excel.filename,
                storage_key=state.excel.storage_key,
                upload_index=0,
                sheet_names=list(state.excel.sheet_names),
            )
        )
    return sources


def inspect_excel(state: AgentState, *, storage: Storage) -> AgentState:
    inventories: list[ExcelInventory] = []
    for excel in _collect_excel_sources(state):
        storage_key = str(excel.storage_key or "")
        if not storage_key:
            continue
        try:
            xlsx_bytes = storage.get_bytes(storage_key)
        except Exception:
            continue
        try:
            wb = load_workbook_bytes(xlsx_bytes)
        except Exception:
            continue
        sheet_names = list(getattr(wb, "sheetnames", []) or [])
        sheets: list[ExcelSheetInventory] = []
        for sheet_name in sheet_names:
            try:
                ws = wb[sheet_name]
            except Exception:
                continue
            preview = _sheet_preview(ws, rows=_PREVIEW_ROWS, cols=_PREVIEW_COLS)
            header_row_index, headers = _infer_header_row(preview)
            max_cols = max((len(r) for r in preview), default=0)
            columns, numeric_density = _build_column_profiles(
                preview,
                header_row_index=header_row_index,
                max_cols=max_cols,
            )
            sheets.append(
                ExcelSheetInventory(
                    sheet_name=sheet_name,
                    preview_rows=preview,
                    header_row_index=header_row_index,
                    headers=[h for h in headers if h],
                    columns=columns,
                    numeric_density=numeric_density,
                )
            )

        inventories.append(
            ExcelInventory(
                excel_id=str(excel.excel_id or "primary"),
                filename=str(excel.filename or ""),
                sheet_names=sheet_names,
                sheets=sheets,
            )
        )

    state.excel_inventory = inventories
    state.job_meta.updated_at = now_iso()
    return state
