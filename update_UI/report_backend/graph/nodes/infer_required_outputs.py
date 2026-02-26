from __future__ import annotations

import json
from typing import Iterable

from pydantic import BaseModel, Field

from graph.state import AgentState, OutputExpectation, RequiredOutputCandidate, RequiredOutputEstimate, now_iso
from llm.client import LLMClient


class _RequiredOutputsLLMItem(BaseModel):
    exp_key: str = Field(default="")
    title: str = Field(default="")
    method_summary: str = Field(default="")
    tables_count: int = Field(default=0, ge=0)
    graphs_count: int = Field(default=0, ge=0)
    photos_count: int = Field(default=0, ge=0)
    table_expectations: list[OutputExpectation] = Field(default_factory=list)
    graph_expectations: list[OutputExpectation] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)
    candidates: list[RequiredOutputCandidate] = Field(default_factory=list)


class _RequiredOutputsLLMResponse(BaseModel):
    items: list[_RequiredOutputsLLMItem] = Field(default_factory=list)


def _build_required_outputs_messages(payload: dict[str, object]) -> list[dict]:
    system = (
        "あなたは実験方法と結果ヒントから、必要なアウトプット数（表・グラフ・写真）を推定する抽出器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- methods: [{exp_key, title, method_text, result_hint}]\n\n"
        "# ルール\n"
        "- exp_key と title は入力の値をそのまま使う。\n"
        "- method_summary は method_text と result_hint を短く要約したもの。\n"
        "- tables_count / graphs_count / photos_count は 0 以上の整数。\n"
        "- table_expectations / graph_expectations は、表/グラフの期待内容を{name, hint, x_axis_label, y_axis_label}で1対1対応させた配列。\n"
        "- hint は可能な限り詳細に。最低限「単位」「測定範囲」「列名」「条件」「期待レンジ」を含める。\n"
        "- graph_expectations の x_axis_label / y_axis_label を必ず埋める。\n"
        "- confidence は 0〜1 の小数。\n"
        "- rationale は推定根拠を簡潔に。\n"
        "- evidence は根拠となる語句の短い断片。\n"
        "- candidates は曖昧な場合のみ入れる。空なら []。\n\n"
        "# 出力\n"
        "{\n"
        "  \"items\": [\n"
        "    {\n"
        "      \"exp_key\": \"4.2.1\",\n"
        "      \"title\": \"反転増幅回路\",\n"
        "      \"method_summary\": \"...\",\n"
        "      \"tables_count\": 2,\n"
        "      \"graphs_count\": 1,\n"
        "      \"photos_count\": 0,\n"
        "      \"table_expectations\": [{\"name\": \"入力電圧と出力電圧の対応表\", \"hint\": \"Vin-Voutの対応\", \"x_axis_label\": \"\", \"y_axis_label\": \"\"}],\n"
        "      \"graph_expectations\": [{\"name\": \"Vin-Vout特性グラフ\", \"hint\": \"直線領域と飽和\", \"x_axis_label\": \"入力電圧 [V]\", \"y_axis_label\": \"出力電圧 [V]\"}],\n"
        "      \"confidence\": 0.8,\n"
        "      \"rationale\": \"...\",\n"
        "      \"evidence\": [\"表\", \"グラフ\"],\n"
        "      \"candidates\": []\n"
        "    }\n"
        "  ]\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _iter_method_units(state: AgentState) -> list[dict[str, str]]:
    bundle = state.b_layer_bundle
    if not bundle or not bundle.method.items:
        return []
    hints = {h.exp_key: h.result_hint for h in (state.report.hints or []) if h.exp_key}
    out: list[dict[str, str]] = []
    for item in bundle.method.items:
        exp_key = str(item.exp_key or "").strip()
        title = str(item.title or "").strip()
        method_text = str(item.text or "").strip()
        if not exp_key or not title:
            continue
        if item.child_exp_keys:
            continue
        out.append(
            {
                "exp_key": exp_key,
                "title": title,
                "method_text": method_text,
                "result_hint": str(hints.get(exp_key, "")),
            }
        )
    return out


def _clamp_int(value: int | float | None) -> int:
    try:
        return max(0, int(value or 0))
    except Exception:
        return 0


def _clamp_conf(value: float | int | None) -> float:
    try:
        raw = float(value or 0.0)
    except Exception:
        raw = 0.0
    if raw < 0.0:
        return 0.0
    if raw > 1.0:
        return 1.0
    return raw


def _normalize_items(items: Iterable[_RequiredOutputsLLMItem], methods: list[dict[str, str]]) -> list[RequiredOutputEstimate]:
    method_map = {m["exp_key"]: m for m in methods}
    normalized: list[RequiredOutputEstimate] = []
    for item in items:
        exp_key = (item.exp_key or "").strip()
        if not exp_key:
            continue
        method = method_map.get(exp_key, {})
        title = (item.title or method.get("title", "")).strip()
        summary = (item.method_summary or "").strip()
        if not summary:
            summary = (method.get("method_text", "") or "")[:200]
        normalized.append(
            RequiredOutputEstimate(
                exp_key=exp_key,
                title=title,
                method_summary=summary,
                tables_count=_clamp_int(item.tables_count),
                graphs_count=_clamp_int(item.graphs_count),
                photos_count=_clamp_int(item.photos_count),
                table_expectations=list(item.table_expectations or []),
                graph_expectations=list(item.graph_expectations or []),
                confidence=_clamp_conf(item.confidence),
                rationale=str(item.rationale or ""),
                evidence=list(item.evidence or []),
                candidates=list(item.candidates or []),
            )
        )
    return normalized


def infer_required_outputs(state: AgentState, *, llm: LLMClient | None) -> AgentState:
    methods = _iter_method_units(state)
    if not methods:
        state.required_outputs = []
        return state
    if llm is None:
        state.required_outputs = []
        return state
    payload = {"methods": methods}
    resp = llm.parse(
        _RequiredOutputsLLMResponse,
        messages=_build_required_outputs_messages(payload),
        attempts=2,
    )
    state.required_outputs = _normalize_items(list(resp.items or []), methods)
    state.job_meta.updated_at = now_iso()
    return state
