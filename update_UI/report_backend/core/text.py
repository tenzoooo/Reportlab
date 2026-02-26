from __future__ import annotations

import re
from typing import Final
from io import BytesIO
import zipfile
import xml.etree.ElementTree as ET


_WS_RE = re.compile(r"\s+")

# Some PDFs (especially those generated from legacy Office equation editors) encode
# math symbols using a Symbol-like font without a proper ToUnicode map.
# Text extractors may emit those glyphs as Private Use Area (PUA) codepoints (U+F0xx),
# which appear as mojibake in plain text. We normalize a small, common subset to their
# intended Unicode symbols so downstream LLM prompts remain readable.
_SYMBOL_PUA_MAP: Final[dict[int, str]] = {
    # Uppercase Greek (Symbol font A..W subset)
    0x41: "Α",
    0x42: "Β",
    0x43: "Χ",
    0x44: "Δ",
    0x45: "Ε",
    0x46: "Φ",
    0x47: "Γ",
    0x48: "Η",
    0x49: "Ι",
    0x4B: "Κ",
    0x4C: "Λ",
    0x4D: "Μ",
    0x4E: "Ν",
    0x4F: "Ο",
    0x50: "Π",
    0x51: "Θ",
    0x52: "Ρ",
    0x53: "Σ",
    0x54: "Τ",
    0x55: "Υ",
    0x57: "Ω",
    0x58: "Ξ",
    0x59: "Ψ",
    # Lowercase Greek (Symbol font a..w subset)
    0x61: "α",
    0x62: "β",
    0x63: "χ",
    0x64: "δ",
    0x65: "ε",
    0x66: "φ",
    0x67: "γ",
    0x68: "η",
    0x69: "ι",
    0x6B: "κ",
    0x6C: "λ",
    0x6D: "μ",
    0x6E: "ν",
    0x6F: "ο",
    0x70: "π",
    0x71: "θ",
    0x72: "ρ",
    0x73: "σ",
    0x74: "τ",
    0x75: "υ",
    0x77: "ω",
    0x78: "ξ",
    0x79: "ψ",
    # Common operators in equations
    0xB1: "±",
    0xD7: "×",
    0xF7: "÷",
    0xA3: "≤",
    0xB3: "≥",
    0xB5: "μ",
    0xB0: "°",
    0xA5: "∞",
    0xD6: "∂",
    0xE5: "∑",
    0xF2: "∫",
    0xD8: "√",
}

_PUA_DIRECT_MAP: Final[dict[int, str]] = {
    # Common "stretchy" bracket pieces frequently seen in PDF text extraction.
    # Map them to their plain Unicode bracket equivalents so equations remain readable.
    0xF8EB: "(",
    0xF8EC: "(",
    0xF8ED: "(",
    0xF8F6: ")",
    0xF8F7: ")",
    0xF8F8: ")",
    0xF8EE: "[",
    0xF8EF: "[",
    0xF8F0: "[",
    0xF8F9: "]",
    0xF8FA: "]",
    0xF8FB: "]",
    0xF8F1: "{",
    0xF8F2: "{",
    0xF8F3: "{",
    0xF8FC: "}",
    0xF8FD: "}",
    0xF8FE: "}",
}


def caption_len(caption: str) -> int:
    return len(_WS_RE.sub("", caption or ""))


def truncate_caption(caption: str, *, max_len: int = 15) -> str:
    s = (caption or "").strip()
    out: list[str] = []
    count = 0
    for ch in s:
        if ch.isspace():
            continue
        out.append(ch)
        count += 1
        if count >= max_len:
            break
    return "".join(out).strip()


def normalize_pdf_text(text: str) -> str:
    """
    Normalize extracted PDF text to reduce mojibake for common math glyphs.

    - Converts a subset of PUA U+F0xx characters (often from Symbol-like fonts) to Unicode.
    """
    t = text or ""
    if not t:
        return ""

    out: list[str] = []
    changed = False
    for ch in t:
        code = ord(ch)
        direct = _PUA_DIRECT_MAP.get(code)
        if direct:
            out.append(direct)
            changed = True
            continue
        if 0xF000 <= code <= 0xF0FF:
            mapped = _SYMBOL_PUA_MAP.get(code - 0xF000)
            if mapped:
                out.append(mapped)
                changed = True
                continue
        out.append(ch)
    if not changed:
        return t
    return "".join(out)


_CJK_RE = re.compile(r"[\u3040-\u30FF\u4E00-\u9FFF]")
_HAS_EQUATION_OP_RE = re.compile(r"[=＋+\-−×÷／/]")
_METER_TOKEN_RE = re.compile(r"\b(?:ACV|DC|SW\d*|Current|Voltage|IN\s+OUT|OUT\s+IN)\b")


def clean_pdf_text_for_llm(text: str) -> str:
    """
    Remove extraction noise (ASCII-art-like wiring diagrams, aligned UI glyphs, etc.)
    while keeping natural-language instructions and simple equations.
    """

    lines = (text or "").splitlines()
    if not lines:
        return ""

    kept: list[str] = []
    blank_pending = False

    for raw in lines:
        s0 = raw.rstrip("\n")
        s = s0.strip()
        if not s:
            blank_pending = True
            continue

        has_cjk = bool(_CJK_RE.search(s))
        has_digits = any(ch.isdigit() for ch in s)
        has_eq_ops = bool(_HAS_EQUATION_OP_RE.search(s))
        has_parens = ("(" in s) or (")" in s) or ("（" in s) or ("）" in s)

        # Equation-ish lines: keep, but collapse whitespace.
        is_equationish = (has_digits and has_eq_ops) or (has_parens and has_eq_ops)

        # Diagram-ish lines: many alignment spaces and little/no Japanese.
        has_alignment = bool(re.search(r"\s{3,}", s0))
        ascii_ratio = sum(1 for ch in s if ord(ch) < 128) / max(1, len(s))
        has_replacement = "\ufffd" in s
        looks_like_diagram = has_alignment and (not has_cjk) and (ascii_ratio >= 0.6)

        # Common tokens in circuit diagrams / meter labels.
        has_meter_tokens = (not has_cjk) and bool(_METER_TOKEN_RE.search(s))

        if (looks_like_diagram or has_meter_tokens) and not is_equationish:
            continue

        # Remove obvious corrupted glyphs if the line is non-CJK and not an equation.
        if (not has_cjk) and (not is_equationish) and has_replacement:
            continue

        out = re.sub(r"\s+", " ", s).strip()
        if blank_pending and kept:
            kept.append("")
        blank_pending = False
        kept.append(out)

    # Trim repeated blank lines.
    cleaned: list[str] = []
    for line in kept:
        if line == "" and (not cleaned or cleaned[-1] == ""):
            continue
        cleaned.append(line)
    while cleaned and cleaned[-1] == "":
        cleaned.pop()

    return "\n".join(cleaned)


_MD_HEADING_RE = re.compile(r"^\s*([0-9]+(?:[.\uFF0E．][0-9]+){0,3})\s+(.+)$")
_MD_BULLET_RE = re.compile(r"^\s*[・•\-]\s+(.+)$")


def pdf_text_to_markdown(text: str) -> str:
    """
    Convert PDF plain text into a simple Markdown representation.
    - Numbered headings become ##/###/####.
    - Bullet-like lines become "- ...".
    """
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not raw:
        return ""
    lines = raw.splitlines()
    out: list[str] = []
    blank_pending = False
    for line in lines:
        s = line.strip()
        if not s:
            blank_pending = True
            continue
        if blank_pending and out:
            out.append("")
        blank_pending = False

        m = _MD_HEADING_RE.match(s)
        if m:
            section = m.group(1)
            title = m.group(2).strip()
            depth = section.count(".") + section.count("．") + section.count("．") + 1
            level = min(2 + depth - 1, 6)
            out.append(f"{'#' * level} {section} {title}".strip())
            continue

        b = _MD_BULLET_RE.match(s)
        if b:
            out.append(f"- {b.group(1).strip()}")
            continue

        out.append(s)

    while out and out[-1] == "":
        out.pop()
    return "\n".join(out)


def is_bad_pdf_page_text(text: str) -> bool:
    """
    Decide whether a page's extracted text is clearly broken and should fall back to OCR.

    Heuristics are intentionally conservative:
    - Empty/whitespace-only pages => OCR.
    - Contains U+FFFD replacement char (�) in *meaningful* content => OCR.
    """
    t = (text or "").strip()
    if not t:
        return True
    repl = t.count("\ufffd")
    if repl <= 0:
        return False
    # Many replacement chars usually means the extractor is failing on this page.
    if repl >= 3:
        return True
    # If the page includes Japanese text, even a single replacement char is a strong failure signal.
    if _CJK_RE.search(t):
        return True
    return False


_DOCX_DOCUMENT_XML = "word/document.xml"
_PAST_REPORT_HINT_MAX_CHARS: Final[int] = 4000
_PAST_REPORT_HINT_BACKTRACK: Final[int] = 800
_PAST_REPORT_HINT_KEYWORDS: Final[tuple[str, ...]] = (
    "実験結果",
    "結果",
    "考察",
    "検討",
    "Discussion",
    "Conclusion",
    "まとめ",
    "実験",
)


def extract_docx_text(docx_bytes: bytes) -> str:
    if not docx_bytes:
        return ""
    try:
        with zipfile.ZipFile(BytesIO(docx_bytes)) as zf:
            xml = zf.read(_DOCX_DOCUMENT_XML)
    except Exception:
        return ""
    try:
        root = ET.fromstring(xml)
    except Exception:
        return ""

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    body = root.find(".//w:body", ns)
    if body is None:
        paragraphs: list[str] = []
        for p in root.findall(".//w:p", ns):
            parts: list[str] = []
            for t in p.findall(".//w:t", ns):
                if t.text:
                    parts.append(t.text)
            if parts:
                paragraphs.append("".join(parts))
        return "\n".join(paragraphs).strip()

    def _text_from_elem(elem: ET.Element) -> str:
        parts: list[str] = []
        for t in elem.findall(".//w:t", ns):
            if t.text:
                parts.append(t.text)
        return "".join(parts).strip()

    def _table_lines(tbl: ET.Element) -> list[str]:
        lines: list[str] = []
        rows = tbl.findall("./w:tr", ns)
        if not rows:
            rows = tbl.findall(".//w:tr", ns)
        for tr in rows:
            cells: list[str] = []
            cols = tr.findall("./w:tc", ns)
            if not cols:
                cols = tr.findall(".//w:tc", ns)
            for tc in cols:
                cell_parts: list[str] = []
                for p in tc.findall(".//w:p", ns):
                    text = _text_from_elem(p)
                    if text:
                        cell_parts.append(text)
                if not cell_parts:
                    text = _text_from_elem(tc)
                    if text:
                        cell_parts.append(text)
                cells.append(" / ".join(cell_parts).strip())
            if any(cells):
                lines.append(" | ".join(cells))
        return lines

    parts: list[str] = []
    for child in list(body):
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = _text_from_elem(child)
            if text:
                parts.append(text)
        elif tag == "tbl":
            rows = _table_lines(child)
            if rows:
                parts.append("TABLE:")
                parts.extend(rows)

    return "\n".join(parts).strip()


def shrink_text(
    text: str,
    *,
    max_chars: int,
    keywords: tuple[str, ...] | None = None,
    backtrack: int = _PAST_REPORT_HINT_BACKTRACK,
) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if len(t) <= max_chars:
        return t
    if keywords:
        for kw in keywords:
            pos = t.find(kw)
            if pos != -1:
                start = max(0, pos - max(0, backtrack))
                end = min(len(t), start + max_chars)
                return t[start:end]
    return t[:max_chars]


def extract_report_hint_from_text(text: str) -> str:
    """
    Extract a compact hint from past-report text for prompt augmentation.
    """
    return shrink_text(
        text,
        max_chars=_PAST_REPORT_HINT_MAX_CHARS,
        keywords=_PAST_REPORT_HINT_KEYWORDS,
        backtrack=_PAST_REPORT_HINT_BACKTRACK,
    )
