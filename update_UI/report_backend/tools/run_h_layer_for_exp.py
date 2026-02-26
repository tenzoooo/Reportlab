from __future__ import annotations

import argparse
import base64
import json
import re
import os
from pathlib import Path

from pydantic import BaseModel, Field

from core.config import load_settings
from core.storage import build_storage
from graph.state import AgentState, now_iso
from llm.client import LLMClient


def _experiment_meta(*, state: AgentState, exp_key: str) -> dict:
    title = ""
    parent = None
    method = state.b_layer_bundle.method if state.b_layer_bundle else None
    units = list(method.experiment_units or []) if method else []
    items = list(method.items or []) if method else []

    for unit in units:
        if str(unit.exp_key or "").strip() == exp_key:
            title = str(unit.title or "")
            if unit.parent:
                parent = {"exp_key": str(unit.parent.exp_key or ""), "title": str(unit.parent.title or "")}
            return {"exp_key": exp_key, "title": title, "parent": parent}

    for item in items:
        if str(item.exp_key or "").strip() == exp_key:
            title = str(item.title or "")
            parent_exp_key = str(item.parent_exp_key or "").strip()
            if parent_exp_key:
                parent_title = ""
                for candidate in items:
                    if str(candidate.exp_key or "").strip() == parent_exp_key:
                        parent_title = str(candidate.title or "")
                        break
                parent = {"exp_key": parent_exp_key, "title": parent_title}
            return {"exp_key": exp_key, "title": title, "parent": parent}

    return {"exp_key": exp_key, "title": title, "parent": parent}


def _method_text(*, state: AgentState, exp_key: str) -> str:
    method = state.b_layer_bundle.method if state.b_layer_bundle else None
    if not method:
        return ""
    for unit in list(method.experiment_units or []):
        if str(unit.exp_key or "").strip() == exp_key:
            return str(unit.method_text or "")
    for item in list(method.items or []):
        if str(item.exp_key or "").strip() == exp_key:
            return str(item.method_text or "")
    return ""


def _collect_table_hints(raw: dict) -> list[str]:
    hints: list[str] = []
    for sel in raw.get("excel_range_selections") or []:
        result = sel.get("result") or {}
        for t in result.get("table_expectations") or []:
            name = str(t.get("name") or "").strip()
            hint = str(t.get("hint") or "").strip()
            if name and hint:
                hints.append(f"{name}: {hint}")
            elif name:
                hints.append(name)
            elif hint:
                hints.append(hint)
    return hints


def _collect_graph_hints(raw: dict) -> list[str]:
    hints: list[str] = []
    for sel in raw.get("excel_range_selections") or []:
        result = sel.get("result") or {}
        for g in result.get("graph_expectations") or []:
            name = str(g.get("name") or "").strip()
            hint = str(g.get("hint") or "").strip()
            x_label = str(g.get("x_axis_label") or "").strip()
            y_label = str(g.get("y_axis_label") or "").strip()
            axis_hint = ""
            if x_label or y_label:
                axis_hint = f"(x:{x_label}, y:{y_label})".strip()
            parts = [p for p in [name, hint, axis_hint] if p]
            if parts:
                hints.append(" ".join(parts))
    return hints


class _ResultDescriptionOutput(BaseModel):
    result_description: str = Field(default="")
    error: str = Field(default="")


class _MethodSummaryOutput(BaseModel):
    method_summary: str = Field(default="")
    error: str = Field(default="")


def _build_result_description_messages(*, payload: dict) -> list[dict]:
    system = (
        "あなたは実験レポートの結果説明文を生成するライターです。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- exp_key\n"
        "- title\n"
        "- method_text\n"
        "- method_summary\n"
        "- table_hints: [string]\n"
        "- graph_hints: [string]\n\n"
        "# ルール\n"
        "- method_textをわかりやすく要約し、結果説明へ自然に接続する。\n"
        "- method_summaryがある場合は内容を反映する（箇条書きなし、常体、大学2年生相当の語彙）。\n"
        "- table_hints/graph_hintsの情報を使い、結果で述べるべき内容を具体的に盛り込む。\n"
        "- 箇条書きを使わず、実験を実施した人の目線で記述する。\n"
        "- レポートに記載する体裁（丁寧語、説明的、客観）で書く。\n"
        "- 過去形・能動態で書く。\n"
        "- 日本語で1段落。冗長さは避けるが、必要事項は省略しない。\n\n"
        "# 出力\n"
        "{ \"result_description\": \"...\" }\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _build_method_summary_messages(*, payload: dict) -> list[dict]:
    system = (
        "あなたは実験方法の要約文を作成するライターです。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- exp_key\n"
        "- title\n"
        "- method_text\n\n"
        "# ルール\n"
        "- method_textをわかりやすく要約する。\n"
        "- 箇条書きを使わず、実験を実施した人の目線で記述する。\n"
        "- レポートに記載する体裁（丁寧語、説明的、客観）で書く。\n"
        "- 過去形・能動態で書く。\n"
        "- 日本語で1段落。冗長さは避けるが、必要事項は省略しない。\n\n"
        "# 出力\n"
        "{ \"method_summary\": \"...\" }\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _fallback_result_description(*, method_text: str, table_hints: list[str], graph_hints: list[str]) -> str:
    summary = ""
    if method_text:
        head = method_text.replace("\n", " ").strip()
        sentences = [s.strip() for s in head.split("。") if s.strip()]
        summary = "。".join(sentences[:2]).strip()
        if summary and not summary.endswith("。"):
            summary = summary + "。"
    def _dedupe(values: list[str]) -> list[str]:
        seen = set()
        out: list[str] = []
        for v in values:
            key = v.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(key)
        return out
    table_hints = _dedupe(table_hints)
    graph_hints = _dedupe(graph_hints)
    text = ""
    if summary:
        text = f"本実験では、{summary.replace('する。','した。')}"
    if table_hints:
        if text:
            text += " "
        text += "結果は表に整理し、" + "、".join(table_hints)
    if graph_hints:
        if text:
            text += " "
        text += "図では" + "、".join(graph_hints)
    return text.strip()


def _fallback_method_summary(method_text: str) -> str:
    text = method_text.replace("\n", " ").strip()
    if not text:
        return ""
    # Remove simple bullet markers.
    text = re.sub(r"[・•●■□◆◇\-–—]\s*", "", text)
    sentences = [s.strip() for s in text.split("。") if s.strip()]
    summary = "。".join(sentences).strip()
    if summary and not summary.endswith("。"):
        summary = summary + "。"
    # Rough de-polite to plain style.
    summary = summary.replace("です。", "だ。")
    summary = summary.replace("でした。", "だった。")
    summary = summary.replace("ます。", "る。")
    summary = summary.replace("しました。", "した。")
    summary = summary.replace("します。", "する。")
    return summary


def _write_debug_dump(
    *,
    exp_key: str,
    payload: dict,
    messages: list[dict],
    raw_content: str | None,
    error: str = "",
) -> None:
    try:
        out = {
            "exp_key": exp_key,
            "payload": payload,
            "messages": messages,
            "raw_content": raw_content or "",
            "error": error,
        }
        Path(f"/tmp/h_layer_result_description_debug_{exp_key}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        return


def _fetch_raw_completion(*, llm: LLMClient, messages: list[dict]) -> str:
    try:
        completion = llm._client.chat.completions.create(model=llm.text_model, messages=messages)
        return str(completion.choices[0].message.content or "")
    except Exception:
        return ""


def _to_data_url(*, mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def _collect_table_captions(raw: dict) -> list[str]:
    captions: list[str] = []
    for sel in raw.get("excel_range_selections") or []:
        result = sel.get("result") or {}
        for t in result.get("table_expectations") or []:
            name = str(t.get("name") or "").strip()
            if name:
                captions.append(name)
    return captions


def _collect_graph_captions(raw: dict) -> list[str]:
    captions: list[str] = []
    for sel in raw.get("excel_range_selections") or []:
        result = sel.get("result") or {}
        for g in result.get("graph_expectations") or []:
            name = str(g.get("name") or "").strip()
            if name:
                captions.append(name)
    return captions


def _build_output(
    *,
    base: dict,
    exp_key: str,
    exp_title: str,
    parent: dict | None,
    result_description: str,
    method_summary: str,
) -> dict:
    def _bump_first_number(key: str) -> str:
        parts = key.split(".")
        if not parts:
            return key
        try:
            parts[0] = str(int(parts[0]) + 1)
        except Exception:
            return key
        return ".".join(parts)

    label_key = _bump_first_number(exp_key)
    table_caps = _collect_table_captions(base)
    graph_caps = _collect_graph_captions(base)
    graph_analysis: list[dict] = list(base.get("graph_analysis") or [])
    table_labels = []
    tables = []
    for idx, tbl in enumerate(base.get("assets_tables") or []):
        label = f"表：{label_key}.{idx + 1}"
        table_labels.append(
            {
                "table_id": tbl.get("table_id") or tbl.get("asset_id"),
                "label": label,
            }
        )
        tables.append(
            {
                "table_id": tbl.get("table_id") or tbl.get("asset_id"),
                "label": label,
                "caption": table_caps[idx] if idx < len(table_caps) else "",
                "rows": tbl.get("rows") or [],
                "storage_key": tbl.get("storage_key") or "",
            }
        )
    graph_labels = []
    graphs = []
    for idx, img in enumerate(base.get("assets_images") or []):
        label = f"図：{label_key}.{idx + 1}"
        graph_labels.append(
            {
                "image_id": img.get("image_id") or img.get("asset_id"),
                "label": label,
            }
        )
        analysis_caption = ""
        for item in graph_analysis:
            if item.get("image_id") == img.get("image_id"):
                analysis_caption = str((item.get("analysis") or {}).get("caption") or "")
                break
        graphs.append(
            {
                "image_id": img.get("image_id") or img.get("asset_id"),
                "label": label,
                "caption": analysis_caption or (graph_caps[idx] if idx < len(graph_caps) else ""),
                "storage_key": img.get("storage_key") or "",
            }
        )

    out = dict(base)
    out.update(
        {
            "exp_key": exp_key,
            "experiment_number": label_key,
            "experiment_title": exp_title,
            "experiment_name": exp_title,
            "experiment_parent": parent,
            "method_summary": method_summary,
            "result_description": result_description,
            "table_labels": table_labels,
            "graph_labels": graph_labels,
            "table_captions": table_caps,
            "graph_captions": graph_caps,
            "tables": tables,
            "graphs": graphs,
            "graph_analysis": graph_analysis,
        }
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Build H-layer JSON for markdown generation.")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    base_path = Path(args.base)
    input_path = Path(args.input)

    base_state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    input_data = json.loads(input_path.read_text(encoding="utf-8"))

    exp_key = str(input_data.get("exp_key") or "").strip()
    if not exp_key:
        raise SystemExit("EXP_KEY_REQUIRED")

    meta = _experiment_meta(state=base_state, exp_key=exp_key)
    method_text = _method_text(state=base_state, exp_key=exp_key)
    table_hints = _collect_table_hints(input_data)
    graph_hints = _collect_graph_hints(input_data)

    result_description = ""
    graph_analysis: list[dict] = []
    if method_text or table_hints or graph_hints:
        settings = load_settings()
        storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
        llm = LLMClient(settings)
        summary_for_prompt = _fallback_method_summary(method_text)
        payload = {
            "exp_key": exp_key,
            "title": meta.get("title") or "",
            "method_text": method_text,
            "method_summary": summary_for_prompt,
            "table_hints": table_hints,
            "graph_hints": graph_hints,
        }
        try:
            messages = _build_result_description_messages(payload=payload)
            out = llm.parse(_ResultDescriptionOutput, messages=messages, attempts=4)
            result_description = (out.result_description or "").strip()
            if not result_description:
                raw_content = _fetch_raw_completion(llm=llm, messages=messages)
                _write_debug_dump(
                    exp_key=exp_key,
                    payload=payload,
                    messages=messages,
                    raw_content=raw_content,
                    error="EMPTY_RESULT_DESCRIPTION",
                )
        except Exception as exc:
            raw_content = ""
            try:
                messages = _build_result_description_messages(payload=payload)
                raw_content = _fetch_raw_completion(llm=llm, messages=messages)
            except Exception:
                raw_content = ""
            _write_debug_dump(
                exp_key=exp_key,
                payload=payload,
                messages=messages,
                raw_content=raw_content,
                error=str(exc),
            )
            result_description = ""
        try:
            images = list(input_data.get("assets_images") or [])
            experiments = [{"exp_key": exp_key, "title": meta.get("title") or ""}]
            for img in images:
                image_id = str(img.get("image_id") or img.get("asset_id") or "").strip()
                storage_key = str(img.get("storage_key") or "").strip()
                mime_type = str(img.get("mime_type") or "image/png")
                if not image_id or not storage_key:
                    continue
                try:
                    raw = storage.get_bytes(storage_key)
                    image_url = _to_data_url(mime_type=mime_type, data=raw)
                    analysis = llm.analyze_image(
                        image_b64_url=image_url,
                        experiments=experiments,
                        method_context=method_text,
                        extracted_hint="",
                    )
                    graph_analysis.append({"image_id": image_id, "analysis": analysis.model_dump(), "error": ""})
                except Exception as exc:
                    graph_analysis.append({"image_id": image_id, "analysis": {}, "error": str(exc)})
        except Exception as exc:
            graph_analysis.append({"image_id": "", "analysis": {}, "error": str(exc)})
    input_data["graph_analysis"] = graph_analysis
    base_state.job_meta.updated_at = now_iso()

    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/h_layer_output_{exp_key}.json")
    out_path.write_text(
        json.dumps(
            _build_output(
                base=input_data,
                exp_key=exp_key,
                exp_title=meta.get("title") or "",
                parent=meta.get("parent"),
                result_description=result_description,
                method_summary="",
            ),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(out_path)


if __name__ == "__main__":
    main()
