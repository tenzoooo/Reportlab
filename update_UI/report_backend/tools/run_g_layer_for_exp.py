from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from graph.state import AgentState, QuantCommentResult, QuantCommentTarget, now_iso
from core.storage import build_storage
from llm.client import LLMClient
from core.config import load_settings
from models.contracts import ImageAsset, TableAsset


def _image_data_url(storage: Storage, storage_key: str, mime_type: str) -> str:
    raw = storage.get_bytes(storage_key)
    import base64

    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _build_output_payload(
    *,
    exp_key: str,
    table_captions: list[dict],
    graph_captions: list[dict],
    quant_comment: list[dict],
) -> dict:
    return {
        "exp_key": exp_key,
        "table_captions": table_captions,
        "graph_captions": graph_captions,
        "quant_comment": quant_comment,
    }


def main() -> None:
    # Disable LangSmith tracing to avoid external connections during G-layer execution.
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    os.environ["LANGSMITH_TRACING"] = "false"
    os.environ["LANGSMITH_ENDPOINT"] = ""
    parser = argparse.ArgumentParser(description="Run G-layer for a single experiment and emit slim output JSON.")
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

    base_state.assets_tables = [TableAsset.model_validate(t) for t in (input_data.get("assets_tables") or [])]
    base_state.assets_images = [ImageAsset.model_validate(i) for i in (input_data.get("assets_images") or [])]
    table_ids = [t.get("table_id") for t in (input_data.get("assets_tables") or []) if t.get("table_id")]
    graph_ids = [i.get("image_id") for i in (input_data.get("assets_images") or []) if i.get("image_id")]
    base_state.g_quant_comment_inputs = [
        QuantCommentTarget.model_validate(
            {
                "exp_key": exp_key,
                "table_ids": table_ids,
                "graph_ids": graph_ids,
                "photo_ids": [],
            }
        )
    ]
    base_state.job_meta.updated_at = now_iso()

    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)

    results: list[QuantCommentResult] = []

    # Tables
    for table in base_state.assets_tables:
        try:
            analysis = llm.analyze_table(table.raw_csv, experiments=[], table_summary="")
            table.analysis = analysis
            results.append(
                QuantCommentResult(
                    exp_key=exp_key,
                    asset_id=table.table_id,
                    kind="table",
                    caption=analysis.caption,
                    quant_comment=analysis.quant_comment,
                )
            )
        except Exception as exc:
            results.append(
                QuantCommentResult(
                    exp_key=exp_key,
                    asset_id=table.table_id,
                    kind="table",
                    error=str(exc),
                )
            )

    # Graphs
    for image in base_state.assets_images:
        try:
            image_url = _image_data_url(storage, image.storage_key, image.mime_type)
            analysis = llm.analyze_image(image_b64_url=image_url, experiments=[], method_context="", extracted_hint="")
            image.analysis = analysis
            results.append(
                QuantCommentResult(
                    exp_key=exp_key,
                    asset_id=image.image_id,
                    kind=image.rough_class or "graph",
                    caption=analysis.caption,
                    quant_comment=analysis.quant_comment,
                )
            )
        except Exception as exc:
            results.append(
                QuantCommentResult(
                    exp_key=exp_key,
                    asset_id=image.image_id,
                    kind=image.rough_class or "graph",
                    error=str(exc),
                )
            )

    table_captions: list[dict] = []
    graph_captions: list[dict] = []
    quant_comment: list[dict] = []
    for r in results:
        entry = {"asset_id": r.asset_id, "caption": r.caption, "error": r.error}
        if r.kind == "table":
            table_captions.append(entry)
        else:
            graph_captions.append(entry)
        quant_comment.append(
            {"asset_id": r.asset_id, "quant_comment": r.quant_comment, "error": r.error, "kind": r.kind}
        )

    out_path = Path(args.out) if args.out else Path(f"tmp_state_outputs/g_layer_output_{exp_key}.json")
    out_path.write_text(
        json.dumps(
            _build_output_payload(
                exp_key=exp_key,
                table_captions=table_captions,
                graph_captions=graph_captions,
                quant_comment=quant_comment,
            ),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(out_path)


if __name__ == "__main__":
    main()
