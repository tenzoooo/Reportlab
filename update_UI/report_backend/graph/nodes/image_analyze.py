from __future__ import annotations

import base64
import io
import os
from typing import cast

from core.storage import Storage
from graph.state import AgentState
from llm.client import LLMClient
from models.contracts import ImageAsset


def _to_data_url(mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def image_analyze(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    if not state.assets_images:
        return state

    experiments = [
        {
            "exp_key": e.source_idx or e.idx,
            "name": f"{e.name}（{e.idx}{('.' + e.subidx) if e.subidx else ''}）",
            "method_summary": e.method_summary,
        }
        for e in state.experiments
    ]
    method_context = ""
    if llm._settings.enable_image_grouping_with_method_context:
        method_context = "\n".join(
            [
                f"{e.source_idx or e.idx} {e.method_summary}"
                for e in state.experiments
                if e.method_summary
            ]
        )

    updated: list[ImageAsset] = []
    for img in state.assets_images:
        if img.analysis is not None:
            updated.append(img)
            continue

        raw = storage.get_bytes(img.storage_key)
        data_url = _to_data_url(img.mime_type, raw)

        extracted_hint = ""
        if (os.environ.get("REPORT_AGENT_IMAGE_OCR") or "").strip().lower() in {"1", "true", "yes", "y", "on"}:
            try:
                from core.pdf_ocr import is_tesseract_available, ocr_png_bytes

                if is_tesseract_available():
                    png_bytes = raw
                    if (img.mime_type or "").lower() not in {"image/png"}:
                        try:
                            from PIL import Image

                            im = Image.open(io.BytesIO(raw))
                            buf = io.BytesIO()
                            im.save(buf, format="PNG")
                            png_bytes = buf.getvalue()
                        except Exception:
                            png_bytes = raw

                    lang = (os.environ.get("REPORT_AGENT_IMAGE_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
                    psm_env = (os.environ.get("REPORT_AGENT_IMAGE_OCR_PSM") or "").strip()
                    psm = int(psm_env) if psm_env.isdigit() else 6
                    extracted_hint = (ocr_png_bytes(png_bytes, lang=lang, psm=psm, timeout_sec=30) or "").strip()
                    # Keep the hint reasonably small for prompt stability.
                    if len(extracted_hint) > 1500:
                        extracted_hint = extracted_hint[:1500] + "…"
            except Exception:
                extracted_hint = ""

        analysis = llm.analyze_image(
            image_b64_url=data_url,
            experiments=experiments,
            method_context=method_context,
            extracted_hint=extracted_hint,
            attempts=state.job_meta.retry_budgets.image_analyze + 1,
        )
        if extracted_hint:
            analysis = analysis.model_copy(update={"ocr_text": extracted_hint})

        updated.append(img.model_copy(update={"analysis": analysis}))

    state.assets_images = updated
    return state
