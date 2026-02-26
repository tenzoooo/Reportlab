from __future__ import annotations

import re

from graph.state import (
    AgentState,
    ExcelInventory,
    ExcelSheetInventory,
    ExcelSheetSelection,
    ExcelSheetSelectionCandidate,
    now_iso,
)
from llm.client import LLMClient


_CONF_LLM_TRIGGER = 0.55

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")
_JA_TOKEN_RE = re.compile(r"[一-龠ぁ-んァ-ン]{2,}")


def _tokens(text: str) -> list[str]:
    raw = str(text or "")
    tokens = _TOKEN_RE.findall(raw)
    tokens.extend(_JA_TOKEN_RE.findall(raw))
    out: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        t = token.strip()
        if not t:
            continue
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _sheet_candidates(
    exp_key: str,
    result_no: str,
    title: str,
    method_summary: str,
    parent_title: str,
    child_titles: list[str],
    inventories: list[ExcelInventory],
) -> list[ExcelSheetSelectionCandidate]:
    tokens = _tokens(" ".join([title, parent_title, method_summary] + child_titles))
    candidates: list[ExcelSheetSelectionCandidate] = []

    for inv in inventories:
        for sheet in inv.sheets:
            confidence, evidence = _score_sheet(
                exp_key,
                result_no,
                tokens,
                sheet,
                excel_filename=str(inv.filename or ""),
            )
            candidates.append(
                ExcelSheetSelectionCandidate(
                    excel_id=inv.excel_id,
                    sheet_name=sheet.sheet_name,
                    confidence=confidence,
                    rationale="; ".join(evidence),
                    evidence=evidence,
                )
            )
    return candidates


def _score_sheet(
    exp_key: str,
    result_no: str,
    tokens: list[str],
    sheet: ExcelSheetInventory,
    excel_filename: str,
) -> tuple[float, list[str]]:
    evidence: list[str] = []
    score = 0.0
    sheet_name = str(sheet.sheet_name or "")
    headers_text = " ".join([h for h in sheet.headers if h])
    excel_name = str(excel_filename or "")

    if exp_key and exp_key in sheet_name:
        score += 0.35
        evidence.append(f"sheet_name:exp_key:{exp_key}")
    if result_no and result_no in sheet_name:
        score += 0.35
        evidence.append(f"sheet_name:result_no:{result_no}")

    for token in tokens:
        if token and token in sheet_name:
            score += 0.2
            evidence.append(f"sheet_name:token:{token}")
            break

    for token in tokens:
        if token and token in headers_text:
            score += 0.15
            evidence.append(f"header:token:{token}")
            break

    for token in tokens:
        if token and token in excel_name:
            score += 0.15
            evidence.append(f"excel_name:token:{token}")
            break

    if sheet.numeric_density >= 0.3:
        score += 0.1
        evidence.append("numeric_density")

    if score <= 0.0:
        score = 0.2 if sheet.numeric_density >= 0.2 else 0.1
    return min(score, 0.95), evidence


def _experiment_units(state: AgentState) -> list[tuple[str, str, str, str]]:
    if state.pdf.method_numbers:
        out = []
        for item in state.pdf.method_numbers:
            exp_key = str(item.exp_key or "").strip()
            title = str(item.title or "").strip()
            result_no = str(state.pdf.result_number_map.get(exp_key, "") or "").strip()
            out.append((exp_key, result_no, title, title))
        return out
    return []


def _parent_child_titles(state: AgentState) -> dict[str, tuple[str, list[str]]]:
    items = list((state.b_layer_bundle.method.items if state.b_layer_bundle else []) or [])
    titles_by_exp = {str(i.exp_key or "").strip(): str(i.title or "").strip() for i in items}
    child_titles_map: dict[str, list[str]] = {}
    for item in items:
        parent_key = str(item.parent_exp_key or "").strip()
        if not parent_key:
            continue
        child_titles_map.setdefault(parent_key, []).append(str(item.title or "").strip())
    parent_child: dict[str, tuple[str, list[str]]] = {}
    for exp_key, title in titles_by_exp.items():
        parent_key = next(
            (str(i.parent_exp_key or "").strip() for i in items if str(i.exp_key or "").strip() == exp_key),
            "",
        )
        parent_title = titles_by_exp.get(parent_key, "") if parent_key else ""
        child_titles = child_titles_map.get(exp_key, [])
        parent_child[exp_key] = (parent_title, child_titles)
    return parent_child


def _experiment_units_from_required_outputs(state: AgentState) -> list[tuple[str, str, str, str]]:
    out: list[tuple[str, str, str, str]] = []
    for item in state.required_outputs:
        exp_key = str(item.exp_key or "").strip()
        title = str(item.title or "").strip()
        method_summary = str(item.method_summary or "").strip()
        if not exp_key or not title:
            continue
        out.append((exp_key, "", title, method_summary))
    return out


def _can_call_llm(llm: LLMClient | None) -> bool:
    return bool(llm and callable(getattr(llm, "excel_sheet_select", None)))


def _llm_select_sheet(
    *,
    llm: LLMClient,
    exp_key: str,
    result_no: str,
    title: str,
    method_summary: str,
    inventories: list[ExcelInventory],
) -> ExcelSheetSelection | None:
    payload = {
        "experiment": {
            "exp_key": exp_key,
            "result_no": result_no,
            "title": title,
            "method_summary": method_summary,
        },
        "sheets": [
            {
                "excel_id": inv.excel_id,
                "sheet_name": sheet.sheet_name,
                "headers": sheet.headers,
                "preview_rows": [row[:8] for row in sheet.preview_rows[:6]],
            }
            for inv in inventories
            for sheet in inv.sheets
        ],
    }
    try:
        output = llm.excel_sheet_select(payload=payload)
    except Exception:
        return None

    selected_excel_id = str(getattr(output, "excel_id", "") or "").strip()
    selected_sheet = str(getattr(output, "sheet_name", "") or "").strip()
    confidence = float(getattr(output, "confidence", 0.0) or 0.0)
    rationale = str(getattr(output, "rationale", "") or "").strip()

    if not selected_excel_id or not selected_sheet:
        return None
    for inv in inventories:
        if inv.excel_id != selected_excel_id:
            continue
        for sheet in inv.sheets:
            if sheet.sheet_name == selected_sheet:
                return ExcelSheetSelection(
                    exp_key=exp_key,
                    result_no=result_no,
                    title=title,
                    selected_excel_id=selected_excel_id,
                    selected_sheet=selected_sheet,
                    confidence=max(0.0, min(confidence, 1.0)),
                    rationale=rationale,
                    evidence=["llm"],
                    candidates=[],
                    used_llm=True,
                )
    return None


def select_excel_sheet_per_experiment(
    state: AgentState, *, llm: LLMClient | None = None
) -> AgentState:
    selections: list[ExcelSheetSelection] = []
    inventories = list(state.excel_inventory)
    parent_child = _parent_child_titles(state)

    for exp_key, result_no, title, method_summary in _experiment_units(state):
        parent_title, child_titles = parent_child.get(exp_key, ("", []))
        candidates = _sheet_candidates(
            exp_key,
            result_no,
            title,
            method_summary,
            parent_title,
            child_titles,
            inventories,
        )
        candidates.sort(key=lambda c: c.confidence, reverse=True)
        chosen = candidates[0] if candidates else ExcelSheetSelectionCandidate()
        selection = ExcelSheetSelection(
            exp_key=exp_key,
            result_no=result_no,
            title=title,
            selected_excel_id=chosen.excel_id,
            selected_sheet=chosen.sheet_name,
            confidence=chosen.confidence,
            rationale=chosen.rationale,
            evidence=list(chosen.evidence),
            candidates=candidates,
            used_llm=False,
        )

        if selection.confidence < _CONF_LLM_TRIGGER and _can_call_llm(llm):
            llm_pick = _llm_select_sheet(
                llm=llm,
                exp_key=exp_key,
                result_no=result_no,
                title=title,
                method_summary=method_summary,
                inventories=inventories,
            )
            if llm_pick and llm_pick.confidence >= selection.confidence:
                llm_pick.candidates = candidates
                selection = llm_pick

        selections.append(selection)

    state.excel_sheet_selections = selections
    state.job_meta.updated_at = now_iso()
    return state


def select_excel_sheet_per_required_outputs(
    state: AgentState, *, llm: LLMClient | None = None
) -> AgentState:
    selections: list[ExcelSheetSelection] = []
    inventories = list(state.excel_inventory)
    parent_child = _parent_child_titles(state)

    for exp_key, result_no, title, method_summary in _experiment_units_from_required_outputs(state):
        parent_title, child_titles = parent_child.get(exp_key, ("", []))
        candidates = _sheet_candidates(
            exp_key,
            result_no,
            title,
            method_summary,
            parent_title,
            child_titles,
            inventories,
        )
        candidates.sort(key=lambda c: c.confidence, reverse=True)
        chosen = candidates[0] if candidates else ExcelSheetSelectionCandidate()
        selection = ExcelSheetSelection(
            exp_key=exp_key,
            result_no=result_no,
            title=title,
            selected_excel_id=chosen.excel_id,
            selected_sheet=chosen.sheet_name,
            confidence=chosen.confidence,
            rationale=chosen.rationale,
            evidence=list(chosen.evidence),
            candidates=candidates,
            used_llm=False,
        )

        if selection.confidence < _CONF_LLM_TRIGGER and _can_call_llm(llm):
            llm_pick = _llm_select_sheet(
                llm=llm,
                exp_key=exp_key,
                result_no=result_no,
                title=title,
                method_summary=method_summary,
                inventories=inventories,
            )
            if llm_pick and llm_pick.confidence >= selection.confidence:
                llm_pick.candidates = candidates
                selection = llm_pick

        selections.append(selection)

    state.excel_sheet_selections = selections
    state.job_meta.updated_at = now_iso()
    return state
