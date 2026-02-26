from __future__ import annotations


ASSET_CLASSIFY_SYSTEM = """You are a strict classifier.
Classify the given image into one of: graph, photo, unknown.
Return JSON only with keys: kind, confidence, rationale.
- kind: graph | photo | unknown
- confidence: 0.0 to 1.0
- rationale: short reason (<= 20 words)
If unsure, choose unknown with low confidence.
"""


def build_asset_classify_user(filename: str) -> str:
    safe = (filename or "").strip()
    return f"filename: {safe}"
