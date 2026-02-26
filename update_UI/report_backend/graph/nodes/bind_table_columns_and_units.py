from __future__ import annotations

import re

from graph.state import (
    AgentState,
    ColumnUnitBinding,
    ExcelInventory,
    ExcelSheetInventory,
    TableColumnBinding,
    now_iso,
)
from llm.client import LLMClient


_CONF_LLM_TRIGGER = 0.55

_UNIT_RE = re.compile(r"[\(\[\（]([^)\]\）]{1,12})[\)\]\）]")
_UNIT_SUFFIX_RE = re.compile(r"\s([A-Za-z%/]+)$")

_UNIT_ALIASES = {
    "ohm": "ohm",
    "Ω": "ohm",
    "v": "V",
    "a": "A",
    "ma": "mA",
    "mv": "mV",
    "s": "s",
    "ms": "ms",
    "hz": "Hz",
    "khz": "kHz",
    "mhz": "MHz",
    "c": "C",
    "k": "K",
}

_DIMENSIONLESS_HINTS = {
    "id",
    "index",
    "no",
    "num",
    "count",
    "trial",
    "sample",
    "step",
    "flag",
}

_PHYSICAL_HINTS = {
    "voltage",
    "current",
    "resistance",
    "time",
    "temperature",
    "frequency",
    "capacitance",
    "inductance",
    "power",
    "pressure",
    "電圧",
    "電流",
    "抵抗",
    "時間",
    "温度",
    "周波数",
}


def _normalize_unit(unit: str) -> str:
    raw = unit.strip()
    if not raw:
        return ""
    key = raw.lower()
    return _UNIT_ALIASES.get(key, raw)


def _split_header(header: str) -> tuple[str, str]:
    raw = str(header or "").strip()
    if not raw:
        return "", ""
    match = _UNIT_RE.search(raw)
    unit = ""
    name = raw
    if match:
        unit = _normalize_unit(match.group(1))
        name = raw.replace(match.group(0), "").strip()
    else:
        suffix = _UNIT_SUFFIX_RE.search(raw)
        if suffix:
            unit = _normalize_unit(suffix.group(1))
            name = raw[: suffix.start(1)].strip()
    return name or raw, unit


def _is_dimensionless(name: str) -> bool:
    lower = name.lower()
    if lower in _DIMENSIONLESS_HINTS:
        return True
    return any(token in lower for token in _DIMENSIONLESS_HINTS)


def _is_physical(name: str) -> bool:
    lower = name.lower()
    if any(token in lower for token in _PHYSICAL_HINTS):
        return True
    return False


def _lookup_sheet(
    inventories: list[ExcelInventory], excel_id: str, sheet_name: str
) -> ExcelSheetInventory | None:
    for inv in inventories:
        if inv.excel_id != excel_id:
            continue
        for sheet in inv.sheets:
            if sheet.sheet_name == sheet_name:
                return sheet
    return None


def _can_call_llm(llm: LLMClient | None) -> bool:
    return bool(llm and callable(getattr(llm, "excel_column_bind", None)))


def _llm_bind_columns(
    *,
    llm: LLMClient,
    sheet: ExcelSheetInventory,
    exp_key: str,
    result_no: str,
) -> list[ColumnUnitBinding] | None:
    payload = {
        "experiment": {"exp_key": exp_key, "result_no": result_no},
        "sheet": {
            "sheet_name": sheet.sheet_name,
            "headers": sheet.headers,
            "preview_rows": [row[:8] for row in sheet.preview_rows[:8]],
        },
    }
    try:
        output = llm.excel_column_bind(payload=payload)
    except Exception:
        return None
    columns = []
    for item in getattr(output, "columns", []) or []:
        columns.append(
            ColumnUnitBinding(
                column_index=int(getattr(item, "column_index", 0) or 0),
                header=str(getattr(item, "header", "") or ""),
                name=str(getattr(item, "name", "") or ""),
                unit=str(getattr(item, "unit", "") or ""),
                confidence=float(getattr(item, "confidence", 0.0) or 0.0),
                rationale=str(getattr(item, "rationale", "") or ""),
                evidence=["llm"],
            )
        )
    return columns or None


def bind_table_columns_and_units(
    state: AgentState, *, llm: LLMClient | None = None
) -> AgentState:
    bindings: list[TableColumnBinding] = []
    inventories = list(state.excel_inventory)

    for selection in state.excel_sheet_selections:
        sheet = _lookup_sheet(inventories, selection.selected_excel_id, selection.selected_sheet)
        if sheet is None:
            bindings.append(
                TableColumnBinding(
                    exp_key=selection.exp_key,
                    result_no=selection.result_no,
                    excel_id=selection.selected_excel_id,
                    sheet_name=selection.selected_sheet,
                    header_row_index=0,
                    columns=[],
                    confidence=0.2,
                    missing_mappings=["sheet_missing"],
                    missing_units=[],
                    used_llm=False,
                )
            )
            continue

        missing_units: list[str] = []
        missing_mappings: list[str] = []
        columns: list[ColumnUnitBinding] = []
        numeric_columns = [c for c in sheet.columns if c.numeric_ratio >= 0.5]

        if sheet.header_row_index <= 0:
            missing_mappings.append("header_row_unknown")

        for col in numeric_columns or sheet.columns:
            header = col.header or ""
            name, unit = _split_header(header)
            evidence: list[str] = []
            confidence = 0.7 if header else 0.4
            if unit:
                confidence = 0.9
                evidence.append("unit_in_header")
            elif _is_dimensionless(name):
                unit = "1"
                confidence = 0.85
                evidence.append("dimensionless")
            elif _is_physical(name):
                missing_units.append(name or header or f"col_{col.column_index}")
                confidence = 0.4
                evidence.append("unit_missing")

            if not header:
                missing_mappings.append(f"col_{col.column_index}")

            columns.append(
                ColumnUnitBinding(
                    column_index=col.column_index,
                    header=header,
                    name=name or header,
                    unit=unit,
                    confidence=confidence,
                    rationale="column binding",
                    evidence=evidence,
                )
            )

        if columns:
            confidence = min(c.confidence for c in columns)
        else:
            confidence = 0.2

        used_llm = False
        if confidence < _CONF_LLM_TRIGGER and _can_call_llm(llm):
            llm_columns = _llm_bind_columns(
                llm=llm,
                sheet=sheet,
                exp_key=selection.exp_key,
                result_no=selection.result_no,
            )
            if llm_columns:
                used_llm = True
                columns_by_index = {c.column_index: c for c in columns}
                for col in llm_columns:
                    if col.column_index in columns_by_index:
                        columns_by_index[col.column_index].name = col.name or columns_by_index[col.column_index].name
                        if col.unit:
                            columns_by_index[col.column_index].unit = col.unit
                            columns_by_index[col.column_index].confidence = max(
                                columns_by_index[col.column_index].confidence, 0.6
                            )
                            columns_by_index[col.column_index].evidence.append("llm_unit")
                columns = list(columns_by_index.values())
                missing_units = [
                    c.name or c.header or f"col_{c.column_index}" for c in columns if not c.unit and _is_physical(c.name)
                ]
                confidence = min(c.confidence for c in columns) if columns else confidence

        bindings.append(
            TableColumnBinding(
                exp_key=selection.exp_key,
                result_no=selection.result_no,
                excel_id=selection.selected_excel_id,
                sheet_name=selection.selected_sheet,
                header_row_index=sheet.header_row_index,
                columns=columns,
                confidence=confidence,
                missing_units=missing_units,
                missing_mappings=missing_mappings,
                used_llm=used_llm,
            )
        )

    state.table_column_bindings = bindings
    state.job_meta.updated_at = now_iso()
    return state
