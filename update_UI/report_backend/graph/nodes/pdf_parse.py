from __future__ import annotations

import base64
import os
import re
from typing import Any

import fitz  # PyMuPDF

from core.text import clean_pdf_text_for_llm, is_bad_pdf_page_text, normalize_pdf_text
from core.storage import Storage
from graph.state import AgentState
from llm.client import LLMClient


_METHOD_CHAPTER_RE = re.compile(r"(?m)^\s*(\d+)[.．]\s*実験方法\b")
_DISCUSSION_CHAPTER_RE = re.compile(r"(?m)^\s*(\d+)[.．]\s*(考察|検討事項|検討|報告事項|報告|Discussion)\b")
_CHAPTER_START_RE = re.compile(r"(?m)^\s*(\d+)[.．]\s+\S")
_HEADING_RE = re.compile(r"^\s*([0-9０-９]+(?:[.\uFF0E．][0-9０-９]+){0,3})\s+(.+)$")
_HAS_EQUATION_OP_RE = re.compile(r"[=＋+\-−×÷／/]")


def _to_data_url(mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def _is_truthy_env(name: str, default: str = "") -> bool:
    value = (os.environ.get(name) or default).strip().lower()
    return value in {"1", "true", "yes", "y", "on"}


def _should_ocr_line(text: str) -> bool:
    s = (text or "").strip()
    if "�" not in s:
        return False
    # Only target equation-like lines; diagram labels with mojibake should be dropped by cleaning anyway.
    has_digits = any(ch.isdigit() for ch in s)
    has_ops = bool(_HAS_EQUATION_OP_RE.search(s))
    has_parens = ("(" in s) or (")" in s) or ("（" in s) or ("）" in s)
    has_equation_hint = ("式" in s) or ("∫" in s) or ("∑" in s)
    return (has_digits and (has_ops or has_parens)) or (has_ops and has_parens) or has_equation_hint


def _slice_section(text: str, *, start_match: re.Match[str]) -> str:
    start = start_match.start()
    end_match = _CHAPTER_START_RE.search(text, start_match.end())
    end = end_match.start() if end_match else len(text)
    return text[start:end]


def _extract_prompts(discussion_text: str) -> list[str]:
    prompts: list[str] = []
    for line in discussion_text.splitlines():
        l = line.strip()
        if not l:
            continue
        if any(s in l for s in ["せよ", "しなさい", "求めよ", "検討せよ", "考察せよ", "示せ", "述べよ", "表わしなさい", "表しなさい"]):
            prompts.append(l)
    return prompts


def pdf_parse(state: AgentState, *, storage: Storage, llm: LLMClient | None = None) -> AgentState:
    if not state.pdf.storage_key:
        return state

    pdf_bytes = storage.get_bytes(state.pdf.storage_key)
    use_full_ocr = _is_truthy_env("REPORT_AGENT_PDF_OCR", "0")
    use_hybrid_ocr = _is_truthy_env("REPORT_AGENT_PDF_OCR_HYBRID", "0")
    if use_full_ocr:
        try:
            from core.pdf_ocr import ocr_pdf_bytes

            lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
            zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
            max_pages_env = (os.environ.get("REPORT_AGENT_PDF_OCR_MAX_PAGES") or "").strip()
            max_pages = int(max_pages_env) if max_pages_env.isdigit() else None
            ocr = ocr_pdf_bytes(pdf_bytes, lang=lang, zoom=zoom, max_pages=max_pages)
            text = clean_pdf_text_for_llm(normalize_pdf_text(ocr.text))
            state.pdf.pages = ocr.pages
            state.pdf.text = text
            # Continue with heading/section parsing below.
        except Exception:
            # Fall back to text extraction.
            use_full_ocr = False

    doc = None if use_full_ocr else fitz.open(stream=pdf_bytes, filetype="pdf")
    # NOTE:
    # Some PDFs have fragmented text objects; using `sort=True` and dehyphenation improves
    # line ordering and reduces "missing prefix" artifacts in extracted lines.
    flags = 0
    flags |= getattr(fitz, "TEXT_DEHYPHENATE", 0)
    flags |= getattr(fitz, "TEXT_PRESERVE_WHITESPACE", 0)

    max_repairs = int((os.environ.get("REPORT_AGENT_PDF_LINE_OCR_MAX") or "6").strip() or "6")
    enable_line_ocr = _is_truthy_env("REPORT_AGENT_PDF_LINE_OCR", "1")
    repairs_used = 0

    hybrid_ocr_budget_env = (os.environ.get("REPORT_AGENT_PDF_OCR_HYBRID_MAX_PAGES") or "").strip()
    hybrid_ocr_budget = int(hybrid_ocr_budget_env) if hybrid_ocr_budget_env.isdigit() else 6
    lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
    zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
    psm_env = (os.environ.get("REPORT_AGENT_PDF_OCR_PSM") or "").strip()
    psm = int(psm_env) if psm_env.isdigit() else 6
    hybrid_matrix = fitz.Matrix(zoom, zoom)
    hybrid_ocr_used = 0
    hybrid_tesseract_ok = False
    if use_hybrid_ocr:
        try:
            from core.pdf_ocr import is_tesseract_available

            hybrid_tesseract_ok = is_tesseract_available()
        except Exception:
            hybrid_tesseract_ok = False

    if not use_full_ocr and doc is not None:
        chunks: list[str] = []
        for page in doc:
            page_lines: list[dict[str, Any]] = []
            try:
                text_dict = page.get_text("dict", flags=flags, sort=True)
                for block in text_dict.get("blocks", []):
                    if not isinstance(block, dict) or block.get("type") != 0:
                        continue
                    for line in block.get("lines", []) or []:
                        if not isinstance(line, dict):
                            continue
                        spans = line.get("spans", []) or []
                        pieces: list[str] = []
                        for span in spans:
                            if isinstance(span, dict):
                                pieces.append(str(span.get("text") or ""))
                        line_text = normalize_pdf_text("".join(pieces)).strip()
                        if not line_text:
                            continue
                        bbox = line.get("bbox")
                        page_lines.append({"text": line_text, "bbox": bbox})
            except Exception:
                # Fallback: plain text only (no bbox => no line OCR).
                try:
                    page_text = page.get_text("text", flags=flags, sort=True)
                except TypeError:
                    page_text = page.get_text()
                page_text = normalize_pdf_text(page_text or "")
                if (
                    use_hybrid_ocr
                    and hybrid_tesseract_ok
                    and hybrid_ocr_used < hybrid_ocr_budget
                    and is_bad_pdf_page_text(page_text)
                ):
                    try:
                        from core.pdf_ocr import ocr_png_bytes

                        pix = page.get_pixmap(matrix=hybrid_matrix, alpha=False)
                        ocr_text = ocr_png_bytes(pix.tobytes("png"), lang=lang, psm=psm)
                        if ocr_text and ocr_text.strip():
                            page_text = ocr_text
                            hybrid_ocr_used += 1
                    except Exception:
                        pass
                chunks.append(page_text)
                continue

            if enable_line_ocr and llm is not None and (not llm.mock) and repairs_used < max_repairs:
                for item in page_lines:
                    if repairs_used >= max_repairs:
                        break
                    line_text = item.get("text") or ""
                    if not _should_ocr_line(line_text):
                        continue
                    bbox = item.get("bbox")
                    if not bbox or not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
                        continue
                    try:
                        clip = fitz.Rect(bbox)
                        clip = fitz.Rect(clip.x0 - 6, clip.y0 - 6, clip.x1 + 6, clip.y1 + 6)
                        clip = clip & page.rect
                        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
                        png_bytes = pix.tobytes("png")
                        out = llm.ocr_equation_line(
                            image_b64_url=_to_data_url("image/png", png_bytes),
                            extracted_hint=line_text,
                            attempts=1,
                        )
                        fixed = (out.text or "").strip()
                        if fixed:
                            item["text"] = fixed
                            repairs_used += 1
                    except Exception:
                        continue

            page_text = "\n".join([it["text"] for it in page_lines if it.get("text")])
            page_text = normalize_pdf_text(page_text)
            if (
                use_hybrid_ocr
                and hybrid_tesseract_ok
                and hybrid_ocr_used < hybrid_ocr_budget
                and is_bad_pdf_page_text(page_text)
            ):
                try:
                    from core.pdf_ocr import ocr_png_bytes

                    pix = page.get_pixmap(matrix=hybrid_matrix, alpha=False)
                    ocr_text = ocr_png_bytes(pix.tobytes("png"), lang=lang, psm=psm)
                    if ocr_text and ocr_text.strip():
                        page_text = ocr_text
                        hybrid_ocr_used += 1
                except Exception:
                    pass
            chunks.append(page_text)

        text = clean_pdf_text_for_llm(normalize_pdf_text("\n".join([c for c in chunks if c])))
        state.pdf.pages = doc.page_count
        state.pdf.text = text

    headings: list[dict[str, Any]] = []
    for line in (state.pdf.text or "").splitlines():
        match = _HEADING_RE.match(line.strip())
        if not match:
            continue
        section_raw = match.group(1)
        section = section_raw.replace("\uFF0E", ".").replace("．", ".")
        section = section.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        headings.append({"section": section, "title": match.group(2).strip()})
    state.pdf.headings = headings

    text = state.pdf.text or ""
    method_match = _METHOD_CHAPTER_RE.search(text)
    if method_match:
        state.pdf.method_chapter = int(method_match.group(1))
        state.pdf.method_text = _slice_section(text, start_match=method_match)
    else:
        state.pdf.method_text = text

    discussion_match = _DISCUSSION_CHAPTER_RE.search(text)
    if discussion_match:
        state.pdf.discussion_chapter = int(discussion_match.group(1))
        state.pdf.discussion_text = _slice_section(text, start_match=discussion_match)
    else:
        # Fallback: try to collect any blocks mentioning typical consideration headings.
        matches: list[re.Match[str]] = list(_DISCUSSION_CHAPTER_RE.finditer(text))
        if matches:
            state.pdf.discussion_text = "\n\n".join([_slice_section(text, start_match=m) for m in matches[:3]]).strip()
        else:
            state.pdf.discussion_text = ""

    # Prompts extraction is handled by the dedicated LLM-based node `discussion_extract`.
    # Keep this empty here so "LLM-first" behavior is consistent.
    state.pdf.consideration_prompts = []
    return state
