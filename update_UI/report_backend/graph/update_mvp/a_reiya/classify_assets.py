from __future__ import annotations

import base64
import mimetypes

from core.storage import Storage
from graph.state import AgentState, ValidationIssue, now_iso
from llm.client import LLMClient
from llm.prompts.asset_classify import ASSET_CLASSIFY_SYSTEM, build_asset_classify_user
from llm.schemas.asset_classify import AssetClassifyOutput
from graph.update_mvp.a_reiya.normalize_state import normalize_a_layer_state


_ROUGH_GRAPH = "graph"
_ROUGH_PHOTO = "photo"
_ROUGH_UNKNOWN = "unknown"
_METHOD_HEURISTIC = "heuristic"
_METHOD_LLM = "llm"

_WARN_CLASSIFY_READ_FAILED = "warn_classify_read_failed"
_WARN_CLASSIFY_LLM_FAILED = "warn_classify_llm_failed"

_HEURISTIC_CONFIDENCE_STRONG = 0.7
_HEURISTIC_CONFIDENCE_AMBIGUOUS = 0.4

_GRAPH_HINT_TOKENS = {
    "graph",
    "chart",
    "plot",
    "figure",
    "wave",
    "scope",
    "osc",
    "spectrum",
    "gr",
    "グラフ",
    "波形",
    "波",
}
_PHOTO_HINT_TOKENS = {
    "photo",
    "image",
    "pic",
    "picture",
    "snapshot",
    "photo",
    "obs",
    "observation",
    "写真",
    "観測",
    "実験",
}


def _warn(state: AgentState, *, code: str, message: str, target: str | None = None) -> None:
    state.validation_report.warnings.append(ValidationIssue(code=code, message=message, target=target))


def _to_data_url(mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def _guess_mime(filename: str, fallback: str) -> str:
    guessed, _ = mimetypes.guess_type(filename or "")
    return guessed or fallback or "image/png"


def _clamp_confidence(value: float | None) -> float:
    try:
        v = float(value or 0.0)
    except Exception:
        return 0.0
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _normalize_kind(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s in {_ROUGH_GRAPH, _ROUGH_PHOTO, _ROUGH_UNKNOWN}:
        return s
    return _ROUGH_UNKNOWN


def _heuristic_classify(filename: str) -> tuple[str, float, str]:
    name = (filename or "").lower()
    graph_hit = any(token in name for token in _GRAPH_HINT_TOKENS)
    photo_hit = any(token in name for token in _PHOTO_HINT_TOKENS)
    if graph_hit and not photo_hit:
        return _ROUGH_GRAPH, _HEURISTIC_CONFIDENCE_STRONG, "filename_graph_hint"
    if photo_hit and not graph_hit:
        return _ROUGH_PHOTO, _HEURISTIC_CONFIDENCE_STRONG, "filename_photo_hint"
    if graph_hit and photo_hit:
        return _ROUGH_UNKNOWN, _HEURISTIC_CONFIDENCE_AMBIGUOUS, "filename_conflict"
    return _ROUGH_UNKNOWN, 0.0, "no_hint"


def classify_assets(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    if not state.assets_images:
        return normalize_a_layer_state(state)

    updated = []
    for img in state.assets_images:
        if img.rough_class:
            updated.append(img)
            continue

        kind, confidence, rationale = _heuristic_classify(img.filename)
        method = _METHOD_HEURISTIC

        if kind == _ROUGH_UNKNOWN and not llm.mock:
            if not img.storage_key:
                _warn(
                    state,
                    code=_WARN_CLASSIFY_READ_FAILED,
                    message="Image storage key is missing for classification",
                    target=img.image_id,
                )
            else:
                try:
                    raw = storage.get_bytes(img.storage_key)
                    mime = _guess_mime(img.filename, img.mime_type)
                    data_url = _to_data_url(mime, raw)
                    messages = [
                        {"role": "system", "content": ASSET_CLASSIFY_SYSTEM},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": build_asset_classify_user(img.filename)},
                                {"type": "image_url", "image_url": {"url": data_url}},
                            ],
                        },
                    ]
                    out = llm.parse(
                        AssetClassifyOutput,
                        model=llm.vision_model,
                        messages=messages,
                        attempts=2,
                    )
                    kind = _normalize_kind(out.kind)
                    confidence = _clamp_confidence(out.confidence)
                    rationale = (out.rationale or "").strip()
                    method = _METHOD_LLM
                except Exception as exc:
                    _warn(
                        state,
                        code=_WARN_CLASSIFY_LLM_FAILED,
                        message=f"Image classification failed: {exc}",
                        target=img.image_id,
                    )

        updated.append(
            img.model_copy(
                update={
                    "rough_class": kind,
                    "rough_class_confidence": confidence,
                    "rough_class_method": method,
                    "rough_class_rationale": rationale,
                }
            )
        )

    state.assets_images = updated
    state.job_meta.updated_at = now_iso()
    return normalize_a_layer_state(state)
