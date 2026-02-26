from __future__ import annotations

import re

from graph.nodes.theory_compare_utils import any_theory_compare_enabled, is_theory_compare_enabled_for_exp
from graph.state import (
    AgentState,
    ExcelInventory,
    TheoryParamBinding,
    TheoryParamValue,
    now_iso,
)
from llm.client import LLMClient


_CONF_LLM_TRIGGER = 0.55

_PARAM_RE = re.compile(r"\b[A-Za-z][A-Za-z0-9_]*\b")
_STOP_SYMBOLS = {
    "sin",
    "cos",
    "tan",
    "log",
    "ln",
    "exp",
    "sqrt",
    "pi",
    "max",
    "min",
}

_PARAM_SYNONYMS = {
    "R": ["抵抗", "resistance", "ohm"],
    "V": ["電圧", "voltage"],
    "I": ["電流", "current"],
    "C": ["容量", "capacitance"],
    "L": ["インダクタンス", "inductance"],
    "T": ["温度", "temperature"],
    "f": ["周波数", "frequency"],
}


def _extract_required_params(state: AgentState) -> list[str]:
    params: list[str] = []
    seen: set[str] = set()
    for formula in state.pdf.theory_formulas:
        expr = str(formula.normalized or formula.raw or "")
        if "=" in expr:
            expr = expr.split("=", 1)[-1]
        for token in _PARAM_RE.findall(expr):
            if token in _STOP_SYMBOLS:
                continue
            if token in seen:
                continue
            seen.add(token)
            params.append(token)
    return params


def _parse_number(text: str) -> float | None:
    if not text:
        return None
    cleaned = text.strip().replace(",", "")
    try:
        return float(cleaned)
    except Exception:
        return None


def _find_param_in_sheet(
    sheet, symbol: str, synonyms: list[str]
) -> TheoryParamValue | None:
    labels = [symbol] + synonyms
    label_hits = [l for l in labels if l]
    if not label_hits:
        return None

    for col in sheet.columns:
        header = str(col.header or "")
        if any(label in header for label in label_hits):
            for val in col.sample_values:
                num = _parse_number(val)
                if num is not None:
                    return TheoryParamValue(
                        symbol=symbol,
                        value=num,
                        unit="",
                        source=f"{sheet.sheet_name}:{header}",
                        confidence=0.8,
                        evidence=[f"header:{header}"],
                    )

    for row in sheet.preview_rows[:12]:
        for idx, cell in enumerate(row):
            cell_text = str(cell or "")
            if not cell_text:
                continue
            if not any(label in cell_text for label in label_hits):
                continue
            right = row[idx + 1] if idx + 1 < len(row) else ""
            num = _parse_number(str(right))
            if num is not None:
                return TheoryParamValue(
                    symbol=symbol,
                    value=num,
                    unit="",
                    source=f"{sheet.sheet_name}:row",
                    confidence=0.7,
                    evidence=[f"row_label:{cell_text}"],
                )
    return None


def _lookup_sheet(inventories: list[ExcelInventory], excel_id: str, sheet_name: str):
    for inv in inventories:
        if inv.excel_id != excel_id:
            continue
        for sheet in inv.sheets:
            if sheet.sheet_name == sheet_name:
                return sheet
    return None


def _can_call_llm(llm: LLMClient | None) -> bool:
    return bool(llm and callable(getattr(llm, "excel_param_bind", None)))


def _llm_bind_params(
    *, llm: LLMClient, required_params: list[str], sheet
) -> list[TheoryParamValue] | None:
    payload = {
        "required_params": required_params,
        "sheet": {
            "sheet_name": sheet.sheet_name,
            "headers": sheet.headers,
            "preview_rows": [row[:8] for row in sheet.preview_rows[:10]],
        },
    }
    try:
        output = llm.excel_param_bind(payload=payload)
    except Exception:
        return None

    params = []
    for item in getattr(output, "params", []) or []:
        value = getattr(item, "value", None)
        try:
            value = float(value) if value is not None else None
        except Exception:
            value = None
        params.append(
            TheoryParamValue(
                symbol=str(getattr(item, "symbol", "") or ""),
                value=value,
                unit=str(getattr(item, "unit", "") or ""),
                source=str(getattr(item, "source_hint", "") or ""),
                confidence=float(getattr(item, "confidence", 0.0) or 0.0),
                evidence=["llm"],
            )
        )
    return params or None


def bind_theory_substitution_params(
    state: AgentState, *, llm: LLMClient | None = None
) -> AgentState:
    if not any_theory_compare_enabled(state):
        state.theory_param_bindings = []
        state.job_meta.updated_at = now_iso()
        return state

    required_params = _extract_required_params(state)
    inventories = list(state.excel_inventory)
    bindings: list[TheoryParamBinding] = []

    for selection in state.excel_sheet_selections:
        if not is_theory_compare_enabled_for_exp(state, selection.exp_key):
            continue
        sheet = _lookup_sheet(inventories, selection.selected_excel_id, selection.selected_sheet)
        params: list[TheoryParamValue] = []
        missing_params: list[str] = []
        for symbol in required_params:
            synonyms = _PARAM_SYNONYMS.get(symbol, [])
            found = _find_param_in_sheet(sheet, symbol, synonyms) if sheet else None
            if found:
                params.append(found)
            else:
                missing_params.append(symbol)

        confidence = min((p.confidence for p in params), default=0.4)
        used_llm = False
        if confidence < _CONF_LLM_TRIGGER and sheet and _can_call_llm(llm):
            llm_params = _llm_bind_params(llm=llm, required_params=required_params, sheet=sheet)
            if llm_params:
                used_llm = True
                params_by_symbol = {p.symbol: p for p in params}
                for param in llm_params:
                    if param.symbol in required_params and param.value is not None:
                        params_by_symbol[param.symbol] = param
                params = list(params_by_symbol.values())
                missing_params = [p for p in required_params if p not in params_by_symbol]
                confidence = min((p.confidence for p in params), default=confidence)

        bindings.append(
            TheoryParamBinding(
                exp_key=selection.exp_key,
                result_no=selection.result_no,
                required_params=required_params,
                params=params,
                confidence=confidence,
                missing_params=missing_params,
                used_llm=used_llm,
            )
        )

    state.theory_param_bindings = bindings
    state.job_meta.updated_at = now_iso()
    return state
