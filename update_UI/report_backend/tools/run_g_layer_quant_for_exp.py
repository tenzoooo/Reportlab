from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.config import load_settings
from core.storage import build_storage
from llm.client import LLMClient
from models.contracts import TableAsset
from graph.state import AgentState, now_iso
from pydantic import BaseModel, Field
from core.formula import formula_to_omml


def _build_output_payload(*, base: dict, quant_comment: list[dict]) -> dict:
    out = dict(base)
    out["quant_comment"] = quant_comment
    return out


class _QuantCommentOutput(BaseModel):
    quant_comment: str = Field(default="")
    error: str = Field(default="")


def _build_quant_messages(*, payload: dict) -> list[dict]:
    system = (
        "あなたは実験の理論式と表データから、理論通りに実験ができているかを判定し、"
        "できていない場合は誤差を定量的に考察するコメントを生成する。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# 入力\n"
        "- exp_key\n"
        "- theory_formulas: [{formula, context}]\n"
        "- tables: [{table_id, caption, table_csv}]\n\n"
        "# ルール\n"
        "- 定量的な差異があれば数値で言及する。\n"
        "- 表が複数ある場合は、表同士の比較から分かることも明記する。\n"
        "- できていない場合は誤差要因を簡潔に述べる。\n"
        "- 不足がある場合はその旨を短く述べる。\n\n"
        "# 出力\n"
        "{ \"quant_comment\": \"...\" }\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _filter_theory_formulas(*, exp_key: str, theory_formulas: list[dict]) -> list[dict]:
    key = (exp_key or "").strip()
    if not key:
        return []
    filtered: list[dict] = []
    for item in theory_formulas:
        exps = item.get("experiments") or []
        if any(str(e or "").strip().startswith(key) for e in exps):
            filtered.append(
                {
                    "formula": str(item.get("formula") or ""),
                    "context": str(item.get("context") or ""),
                }
            )
    return filtered


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate quant comments per experiment using captions.")
    parser.add_argument("--base", default="tmp_state_outputs/b_layer_after_all_steps.json")
    parser.add_argument("--input", required=True)
    parser.add_argument("--captions", required=True)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    base_path = Path(args.base)
    input_path = Path(args.input)
    captions_path = Path(args.captions)

    base_state = AgentState.model_validate(json.loads(base_path.read_text(encoding="utf-8")))
    input_data = json.loads(input_path.read_text(encoding="utf-8"))
    captions_data = json.loads(captions_path.read_text(encoding="utf-8"))

    exp_key = str(input_data.get("exp_key") or "").strip()
    if not exp_key:
        raise SystemExit("EXP_KEY_REQUIRED")

    table_caption_map = {
        str(c.get("asset_id") or ""): str(c.get("caption") or "")
        for c in (captions_data.get("table_captions") or [])
    }
    # graph captions are intentionally ignored (graphs are not used for quant comments)

    tables = [TableAsset.model_validate(t) for t in (input_data.get("assets_tables") or [])]
    theory_formulas = _filter_theory_formulas(
        exp_key=exp_key, theory_formulas=list(input_data.get("theory_formulas") or [])
    )

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)

    quant_comment: list[dict] = []
    tables_payload = [
        {
            "table_id": table.table_id,
            "caption": table_caption_map.get(table.table_id, ""),
            "table_csv": table.raw_csv,
        }
        for table in tables
    ]
    try:
        payload = {
            "exp_key": exp_key,
            "theory_formulas": theory_formulas,
            "tables": tables_payload,
        }
        out = llm.parse(_QuantCommentOutput, messages=_build_quant_messages(payload=payload), attempts=2)
        quant_comment.append(
            {
                "asset_id": "all_tables",
                "kind": "tables",
                "caption": "",
                "quant_comment": formula_to_omml(out.quant_comment),
                "error": out.error,
            }
        )
    except Exception as exc:
        quant_comment.append(
            {
                "asset_id": "all_tables",
                "kind": "tables",
                "caption": "",
                "quant_comment": "",
                "error": str(exc),
            }
        )


    base_state.job_meta.updated_at = now_iso()

    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/g_layer_quant_{exp_key}.json")
    out_path.write_text(
        json.dumps(_build_output_payload(base=input_data, quant_comment=quant_comment), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(out_path)


if __name__ == "__main__":
    main()
