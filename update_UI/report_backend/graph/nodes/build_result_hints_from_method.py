from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from pydantic import BaseModel, Field

from graph.state import AgentState, ReportResultHint, ValidationIssue, now_iso
from llm.client import LLMClient


class _ResultHintItem(BaseModel):
    exp_key: str = Field(default="")
    title: str = Field(default="")
    result_hint: str = Field(default="")


class _ResultHintsOutput(BaseModel):
    items: list[_ResultHintItem] = Field(default_factory=list)


def _build_result_hints_messages(methods: list[dict[str, str]]) -> list[dict]:
    system = (
        "あなたは実験方法から結果の構成ヒントを作る抽出器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- methods: [{exp_key, title, method_text}]\n\n"
        "# ルール\n"
        "- exp_key と title は入力の値をそのまま使う。\n"
        "- result_hint は、その実験の結果構成のヒントを日本語で短くまとめる。\n"
        "- 表が必要そうな場合は、表の属性（列名・単位・条件）やキャプションの指針も明記する。\n"
        "- グラフが必要そうな場合は、軸名・単位・系列名・条件・キャプションの指針も明記する。\n"
        "- 不明な場合は空文字を許容する。\n\n"
        "# 出力\n"
        "{\n"
        "  \"items\": [\n"
        "    {\"exp_key\": \"4.2.1\", \"title\": \"反転増幅回路\", \"result_hint\": \"...\"}\n"
        "  ]\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"methods": methods}, ensure_ascii=False)},
    ]


def _build_single_result_hint_messages(method: dict[str, str]) -> list[dict]:
    return _build_result_hints_messages([method])


def _iter_method_items(state: AgentState) -> list[dict[str, str]]:
    bundle = state.b_layer_bundle
    if not bundle or not bundle.method.items:
        return []
    items: list[dict[str, str]] = []
    for unit in bundle.method.items:
        exp_key = str(unit.exp_key or "").strip()
        title = str(unit.title or "").strip()
        text = str(unit.text or "").strip()
        if not exp_key or not title:
            continue
        if unit.child_exp_keys:
            continue
        items.append({"exp_key": exp_key, "title": title, "method_text": text})
    return items


def _merge_hints(
    methods: Iterable[dict[str, str]],
    llm_items: Iterable[_ResultHintItem],
) -> list[ReportResultHint]:
    by_key: dict[str, _ResultHintItem] = {}
    for item in llm_items:
        key = (item.exp_key or "").strip()
        if not key:
            continue
        by_key[key] = item
    merged: list[ReportResultHint] = []
    for method in methods:
        exp_key = method.get("exp_key", "")
        title = method.get("title", "")
        llm_item = by_key.get(exp_key)
        hint = (llm_item.result_hint or "").strip() if llm_item else ""
        merged.append(ReportResultHint(exp_key=exp_key, title=title, result_hint=hint))
    return merged


def _parallel_workers() -> int:
    raw = (os.environ.get("REPORT_AGENT_LLM_PARALLEL_WORKERS") or "").strip()
    if not raw:
        return 4
    try:
        return max(1, min(16, int(raw)))
    except Exception:
        return 4


def build_result_hints_from_method(state: AgentState, *, llm: LLMClient | None) -> AgentState:
    methods = _iter_method_items(state)
    if not methods:
        state.report.hints = []
        return state
    if llm is None:
        state.report.hints = []
        return state
    items: list[_ResultHintItem] = []
    workers = min(_parallel_workers(), len(methods))
    if workers <= 1:
        try:
            output = llm.parse(
                _ResultHintsOutput,
                messages=_build_result_hints_messages(methods),
                attempts=2,
            )
            items = list(output.items or [])
        except Exception as exc:
            # This hint is helpful but not required to proceed. Keep the pipeline running when
            # the network/LLM is temporarily unavailable.
            state.validation_report.warnings.append(
                ValidationIssue(code="warn_result_hints_llm_failed", message=f"Failed to build result hints from method: {type(exc).__name__}: {exc}")
            )
            state.report.hints = _merge_hints(methods, [])
            state.job_meta.updated_at = now_iso()
            return state
    else:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    llm.parse,
                    _ResultHintsOutput,
                    messages=_build_single_result_hint_messages(method),
                    attempts=2,
                ): method
                for method in methods
            }
            for future in as_completed(futures):
                try:
                    output = future.result()
                except Exception:
                    continue
                items.extend(list(output.items or []))
    state.report.hints = _merge_hints(methods, items)
    state.job_meta.updated_at = now_iso()
    return state
