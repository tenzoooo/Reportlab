from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from pydantic import BaseModel, Field

from graph.nodes.summarize_method_to_overview import summarize_method_to_overview as _summarize_method_to_overview
from graph.state import AgentState, now_iso
from llm.client import LLMClient


class _MethodSummaryOutput(BaseModel):
    method_summary: str = Field(default="")


def _build_messages(exp_key: str, title: str, method_text: str) -> list[dict[str, Any]]:
    system = (
        "あなたは実験方法本文を要約する。"
        "だ・である調で2〜4文。捏造禁止。入力本文の要点のみ。"
    )
    payload = {
        "exp_key": exp_key,
        "title": title,
        "method_text": method_text,
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def summarize_method_overview(state: AgentState, *, llm: LLMClient | None = None) -> AgentState:
    items = list((state.b_layer_bundle.method.items if state.b_layer_bundle else []) or [])
    if not items or llm is None:
        return _summarize_method_to_overview(state)

    existing = {
        str(item.get("exp_key") or "").strip(): str(item.get("method_summary") or "").strip()
        for item in (state.method_tree or [])
        if isinstance(item, dict)
    }
    method_tree: list[dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=min(6, len(items))) as executor:
        futures = {}
        for item in items:
            exp_key = str(item.exp_key or "").strip()
            title = str(item.title or "").strip()
            method_text = str(item.text or "").strip()
            if not exp_key or not title or not method_text:
                continue
            if existing.get(exp_key):
                method_tree.append({"exp_key": exp_key, "title": title, "method_summary": existing[exp_key]})
                continue
            futures[
                executor.submit(
                    llm.parse, _MethodSummaryOutput, messages=_build_messages(exp_key, title, method_text), attempts=2
                )
            ] = (exp_key, title)

        for future in as_completed(futures):
            exp_key, title = futures[future]
            try:
                out = future.result()
            except Exception:
                continue
            summary = str(getattr(out, "method_summary", "") or "").strip()
            if not summary:
                continue
            method_tree.append({"exp_key": exp_key, "title": title, "method_summary": summary})

    if method_tree:
        state.method_tree = method_tree
        state.job_meta.updated_at = now_iso()

    return _summarize_method_to_overview(state)
