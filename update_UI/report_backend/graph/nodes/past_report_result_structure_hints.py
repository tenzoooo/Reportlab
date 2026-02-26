from __future__ import annotations

import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from graph.state import AgentState, PastReportData, PastReportHeading, PastReportResultStructureHint, now_iso
from llm.client import LLMClient
from llm.schemas.past_report_result_structure import PastReportResultStructureOutput

logger = logging.getLogger(__name__)

_ERR_MISSING_RESULT_SECTIONS = "past_report_result_sections_missing"
_ERR_LLM_MISSING = "past_report_result_hints_llm_missing"
_ERR_LLM_FAILED = "past_report_result_hints_llm_failed"
_DEFAULT_PARALLEL_WORKERS = 2
_VERBISH_HEADING_TOKENS = ["した", "して", "する", "します", "すると"]


def _ensure_past_reports(state: AgentState) -> list[PastReportData]:
    if state.past_reports:
        return list(state.past_reports)
    if state.past_report.storage_key:
        if not state.past_report.report_id:
            state.past_report.report_id = "legacy"
        state.past_reports = [state.past_report]
        return list(state.past_reports)
    return []


def _build_messages(*, sections: list[dict[str, str]]) -> list[dict[str, str]]:
    system = (
        "あなたは過去レポートの結果セクションから、結果の構成ヒントを抽出する抽出器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- sections: heading_line と section_text を持つ配列\n\n"
        "# 出力\n"
        "{\n"
        "  \"items\": [\n"
        "    {\n"
        "      \"heading_line\": \"...\",\n"
        "      \"title\": \"...\",\n"
        "      \"summary\": \"...\",\n"
        "      \"tables_count\": 0,\n"
        "      \"graphs_count\": 0,\n"
        "      \"tables\": [\n"
        "        {\"caption\": \"...\", \"columns\": [{\"name\": \"\", \"unit\": \"\"}]}\n"
        "      ],\n"
        "      \"graphs\": [\n"
        "        {\"chart_type\": \"\", \"x_name\": \"\", \"x_unit\": \"\", \"y_name\": \"\", \"y_unit\": \"\", "
        "\"series_names\": [], \"condition_names\": [], \"caption\": \"\"}\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "# ルール\n"
        "- items は入力 sections と同じ順序・件数で返す。\n"
        "- title は動詞を含めない名詞句にする（見出しの名詞部分をそのまま使用）。\n"
        "- heading_line に動詞（例: した/する/すると）が含まれるセクションは出力しない。\n"
        "- tables_count は tables の件数と一致させる。\n"
        "- graphs_count は graphs の件数と一致させる。\n"
        "- 不明な項目は空文字や空配列でよい。\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"sections": sections}, ensure_ascii=False)},
    ]


def _llm_parallel_workers() -> int:
    raw = (os.environ.get("REPORT_AGENT_LLM_PARALLEL_WORKERS") or "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    return _DEFAULT_PARALLEL_WORKERS


def _has_verbish_heading(text: str) -> bool:
    s = (text or "").strip()
    if not s:
        return False
    return any(token in s for token in _VERBISH_HEADING_TOKENS)


def _normalize_counts(hint: PastReportResultStructureHint) -> PastReportResultStructureHint:
    tables_len = len(hint.tables or [])
    graphs_len = len(hint.graphs or [])
    hint.tables_count = max(int(hint.tables_count or 0), tables_len)
    hint.graphs_count = max(int(hint.graphs_count or 0), graphs_len)
    return hint


def _coerce_hints(
    *,
    items: Iterable[PastReportResultStructureHint],
    headings: list[PastReportHeading],
) -> list[PastReportResultStructureHint]:
    headings_by_line = {str(h.heading_line or "").strip(): h for h in headings}
    out: list[PastReportResultStructureHint] = []
    for idx, item in enumerate(items):
        heading_line = (item.heading_line or "").strip()
        if not heading_line and idx < len(headings):
            heading_line = str(headings[idx].heading_line or "").strip()
        heading = headings_by_line.get(heading_line)
        title = str(heading.title or "").strip() if heading else ""
        if not title:
            title = heading_line
        hint = PastReportResultStructureHint(
            heading_line=heading_line,
            title=title,
            summary=str(item.summary or "").strip(),
            tables_count=int(item.tables_count or 0),
            graphs_count=int(item.graphs_count or 0),
            tables=list(item.tables or []),
            graphs=list(item.graphs or []),
        )
        out.append(_normalize_counts(hint))
    return out


def _run_llm_for_section(
    *,
    llm: LLMClient,
    section: dict[str, str],
) -> PastReportResultStructureHint:
    output = llm.parse(
        PastReportResultStructureOutput,
        messages=_build_messages(sections=[section]),
        attempts=2,
    )
    item = (output.items or [None])[0]
    if item is None:
        raise ValueError("LLM returned empty items")
    return PastReportResultStructureHint(**item.model_dump())


def past_report_result_structure_hints(
    state: AgentState,
    *,
    llm: LLMClient | None,
) -> AgentState:
    reports = _ensure_past_reports(state)
    if not reports:
        logger.info("past_report_result_structure_hints: no past reports to process")
        return state

    changed = False
    for report in reports:
        if report.result_structure_hints_ready:
            continue
        if not report.result_section_headings:
            report.result_structure_hints_error = _ERR_MISSING_RESULT_SECTIONS
            report.result_structure_hints_ready = True
            changed = True
            continue
        if llm is None:
            report.result_structure_hints_error = _ERR_LLM_MISSING
            report.result_structure_hints_ready = True
            changed = True
            continue

        sections: list[dict[str, str]] = []
        filtered_headings: list[PastReportHeading] = []
        for heading in report.result_section_headings:
            heading_line = str(heading.heading_line or "").strip()
            section_text = str(heading.section_text or "").strip()
            title = str(heading.title or "").strip()
            if not heading_line and not section_text:
                continue
            if _has_verbish_heading(f"{heading_line} {title}"):
                continue
            filtered_headings.append(heading)
            sections.append(
                {
                    "heading_line": heading_line,
                    "title": title,
                    "section_text": section_text,
                }
            )

        if not sections:
            report.result_structure_hints_error = _ERR_MISSING_RESULT_SECTIONS
            report.result_structure_hints_ready = True
            changed = True
            continue

        items: list[PastReportResultStructureHint] = []
        failed = False
        workers = min(_llm_parallel_workers(), max(1, len(sections)))
        try:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {
                    executor.submit(_run_llm_for_section, llm=llm, section=section): idx
                    for idx, section in enumerate(sections)
                }
                results: dict[int, PastReportResultStructureHint] = {}
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        results[idx] = future.result()
                    except Exception as exc:
                        logger.warning("past_report_result_structure_hints: llm failed: %s", exc)
                        failed = True
                items = [results[idx] for idx in range(len(sections)) if idx in results]
        except Exception as exc:
            logger.warning("past_report_result_structure_hints: llm failed: %s", exc)
            failed = True

        report.result_structure_hints = _coerce_hints(items=items, headings=filtered_headings)
        report.result_structure_hints_ready = True
        report.result_structure_hints_error = "" if not failed else _ERR_LLM_FAILED
        changed = True

    if changed:
        state.job_meta.updated_at = now_iso()
    return state


__all__ = ["past_report_result_structure_hints"]
