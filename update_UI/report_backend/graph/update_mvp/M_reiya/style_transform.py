from __future__ import annotations

import re
from typing import Iterable

from graph.state import AgentState, MarkdownDocument, QualityIssue, now_iso
from models.contracts import TextWithEvidence


_HARD_BAN_TERMS = [
    "ほぼ",
    "概ね",
    "顕著に",
    "著しく",
    "非常に",
]

_CONDITIONAL_HARD_BAN = {
    "大きく",
    "高い",
}

_SOFT_AVOID_DEFAULT = [
    "と考えられる",
    "と推察される",
    "可能性がある",
    "一般的に",
    "興味深い",
    "示唆される",
]

_SOFT_REPLACEMENTS = {
    "と考えられる": "である",
    "と推察される": "である",
    "可能性がある": "",
    "一般的に": "",
    "興味深い": "",
    "示唆される": "である",
}

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


def _is_candidate_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if s.startswith("#"):
        return False
    if s.startswith("![]("):
        return False
    if s.startswith("|"):
        return False
    if s.startswith("図") or s.startswith("表"):
        return False
    return True


def _ensure_shimesu(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return s
    if s.endswith("示す"):
        return s + "。"
    if s.endswith("示す。"):
        return s
    s = s.rstrip("。．.\n\r")
    return f"{s}示す。"


def _normalize_text(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def _format_text_block(text: str | TextWithEvidence | None) -> str:
    if isinstance(text, TextWithEvidence):
        return (text.text or "").strip()
    return (text or "").strip()


def _soft_avoid_phrases(state: AgentState) -> list[str]:
    extra = state.style_rules.get("soft_avoid_phrases") if isinstance(state.style_rules, dict) else None
    phrases = list(_SOFT_AVOID_DEFAULT)
    if isinstance(extra, list):
        for item in extra:
            if not item:
                continue
            phrase = str(item).strip()
            if phrase and phrase not in phrases:
                phrases.append(phrase)
    return phrases


def _apply_style_rules(state: AgentState, line: str, *, stage: str) -> tuple[str, list[QualityIssue]]:
    issues: list[QualityIssue] = []
    sentences = _split_sentences(line)
    rebuilt: list[str] = []

    soft_phrases = _soft_avoid_phrases(state)

    for sentence in sentences:
        original = sentence
        has_number = bool(_DIGIT_RE.search(sentence))
        for term in _HARD_BAN_TERMS:
            if term in sentence:
                sentence = sentence.replace(term, "")
                severity = "WARN" if has_number else "FAIL"
                action = "autofix" if has_number else "stop"
                issues.append(
                    QualityIssue(
                        code="FAIL_AMBIGUOUS_TERM" if not has_number else "WARN_AMBIGUOUS_TERM",
                        stage=stage,
                        severity=severity,
                        message=f"Ambiguous term '{term}' found without numeric grounding.",
                        suggested_action=action,
                    )
                )
        for term in _CONDITIONAL_HARD_BAN:
            if term in sentence and not has_number:
                sentence = sentence.replace(term, "")
                issues.append(
                    QualityIssue(
                        code="FAIL_AMBIGUOUS_TERM",
                        stage=stage,
                        severity="FAIL",
                        message=f"Ambiguous term '{term}' found without numeric grounding.",
                        suggested_action="stop",
                    )
                )
        for phrase in soft_phrases:
            if phrase in sentence:
                replacement = _SOFT_REPLACEMENTS.get(phrase, "")
                sentence = sentence.replace(phrase, replacement)
                issues.append(
                    QualityIssue(
                        code="WARN_SOFT_AVOID_PHRASE",
                        stage=stage,
                        severity="WARN",
                        message=f"Soft-avoid phrase '{phrase}' was replaced.",
                        suggested_action="autofix",
                    )
                )
        if sentence != original:
            sentence = sentence.replace("  ", " ").strip()
        rebuilt.append(sentence)

    return "".join(rebuilt).strip(), issues


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


def style_text_line(state: AgentState, line: str) -> tuple[str, list[QualityIssue]]:
    transformed, issues = _apply_style_rules(state, line, stage="M.style_transform")
    transformed = _ensure_plain_style(transformed)
    return transformed, issues


def style_transform(state: AgentState) -> AgentState:
    if not state.markdown.document:
        return state

    markdown_text = _normalize_text(state.markdown.document.text)

    # Ensure "示す" ending for result descriptions only via direct replacement.
    if state.results_page:
        for section in state.results_page.sections:
            for group in section.groups:
                original = _format_text_block(group.result_description)
                if not original:
                    continue
                replacement = _ensure_shimesu(original)
                if replacement != original:
                    markdown_text = markdown_text.replace(original, replacement)

    lines = markdown_text.split("\n")
    styled_lines: list[str] = []
    issues: list[QualityIssue] = []

    for line in lines:
        if not _is_candidate_line(line):
            styled_lines.append(line)
            continue
        transformed, line_issues = style_text_line(state, line)
        styled_lines.append(transformed)
        issues.extend(line_issues)

    document = MarkdownDocument(
        text="\n".join(styled_lines).strip() + "\n",
        generated_at=now_iso(),
        evidence_refs=list(state.markdown.document.evidence_refs),
        assets_manifest=list(state.markdown.document.assets_manifest),
    )
    state.markdown.document_styled = document

    if issues:
        state.quality_report.issues.extend(issues)
        state.quality_report.pass_gate = False
    elif not any(issue.severity == "FAIL" for issue in state.quality_report.issues):
        state.quality_report.pass_gate = True

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["style_transform"]
