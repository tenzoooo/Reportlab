from __future__ import annotations

import re

from graph.state import AgentState, MarkdownDocument, QualityIssue, now_iso
from models.contracts import TextWithEvidence


_BANNED_TERMS = [
    "ほぼ",
    "概ね",
    "顕著に",
    "著しく",
    "非常に",
    "大きく",
    "高い",
]

_SENTENCE_SPLIT_RE = re.compile(r"([。．.!?！？])")
_DIGIT_RE = re.compile(r"\d")


def _split_sentences(text: str) -> list[str]:
    parts = _SENTENCE_SPLIT_RE.split(text)
    out: list[str] = []
    buf = ""
    for part in parts:
        if not part:
            continue
        if _SENTENCE_SPLIT_RE.fullmatch(part):
            buf += part
            out.append(buf)
            buf = ""
            continue
        buf += part
    if buf:
        out.append(buf)
    return out


def _ensure_shimesu(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return s
    if s.endswith("示す。") or s.endswith("示す") or s.endswith("示す．"):
        if s.endswith("示す"):
            return s + "。"
        return s
    s = s.rstrip("。．.\n\r")
    return f"{s}示す。"


def _normalize_text(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def _format_text_block(text: str | TextWithEvidence | None) -> str:
    if isinstance(text, TextWithEvidence):
        return (text.text or "").strip()
    return (text or "").strip()


def _ensure_plain_style(line: str) -> str:
    replacements = {
        "です。": "である。",
        "でした。": "であった。",
        "です": "である",
        "でした": "であった",
        "ます。": "る。",
        "ました。": "た。",
        "ます": "る",
        "ました": "た",
        "ません。": "ない。",
        "ません": "ない",
    }
    out = line
    for src, dst in replacements.items():
        out = out.replace(src, dst)
    return out


def _remove_banned_without_digits(line: str) -> tuple[str, bool]:
    sentences = _split_sentences(line)
    rebuilt: list[str] = []
    changed = False
    for sentence in sentences:
        if not sentence:
            continue
        has_digit = bool(_DIGIT_RE.search(sentence))
        original = sentence
        if not has_digit:
            for term in _BANNED_TERMS:
                if term in sentence:
                    sentence = sentence.replace(term, "")
        if sentence != original:
            changed = True
            sentence = sentence.replace("  ", " ").strip()
        rebuilt.append(sentence)
    return "".join(rebuilt), changed


def _normalize_reference_spacing(text: str) -> str:
    return re.sub(r"(図|表)\s+(\d)", r"\1\2", text)


def _refresh_pass_gate(state: AgentState) -> None:
    state.quality_report.pass_gate = not any(
        issue.severity in {"FAIL", "HITL"} for issue in state.quality_report.issues
    )


def autofix_preformat(state: AgentState) -> AgentState:
    stage = "N.autofix_preformat"
    base_doc = state.markdown.document_styled or state.markdown.document
    if base_doc is None:
        return state
    state.preformat_autofix_attempts += 1

    text = _normalize_text(base_doc.text)
    updated = text

    if state.results_page:
        for section in state.results_page.sections:
            for group in section.groups:
                original = _format_text_block(group.result_description)
                if not original:
                    continue
                replacement = _ensure_shimesu(original)
                if replacement != original:
                    updated = updated.replace(original, replacement)

    lines = updated.split("\n")
    out_lines: list[str] = []
    changed = False
    for line in lines:
        transformed = _ensure_plain_style(line)
        transformed, removed = _remove_banned_without_digits(transformed)
        if transformed != line or removed:
            changed = True
        out_lines.append(transformed)

    updated = _normalize_reference_spacing("\n".join(out_lines))
    if updated != text:
        changed = True

    if changed:
        state.markdown.document_styled = MarkdownDocument(
            text=updated.strip() + "\n",
            generated_at=now_iso(),
            evidence_refs=list(base_doc.evidence_refs),
            assets_manifest=list(base_doc.assets_manifest),
        )
        state.quality_report.issues.append(
            QualityIssue(
                code="INFO_AUTOFIX_PREFORMAT",
                stage=stage,
                severity="INFO",
                message="Preformat autofix updated styled markdown.",
                suggested_action="autofix",
            )
        )

    _refresh_pass_gate(state)
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["autofix_preformat"]
