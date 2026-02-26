from __future__ import annotations

import os
import re
import zipfile
from io import BytesIO
from pathlib import Path

import fitz  # PyMuPDF

from core.text import clean_pdf_text_for_llm, extract_docx_text, is_bad_pdf_page_text, normalize_pdf_text, shrink_text


_PAST_REPORT_TEXT_MAX = 50_000
_PAST_REPORT_TEXT_KEYWORDS = (
    "実験結果",
    "結果",
    "考察",
    "検討",
    "Discussion",
    "Conclusion",
    "まとめ",
    "実験",
)
_PAST_REPORT_IMAGE_MAX = 8
_PAST_REPORT_IMAGE_MAX_BYTES = 5_000_000
_DOCX_IMAGE_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


def ext_from_filename(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    ext = filename.rsplit(".", 1)[-1].strip().lower()
    if not ext:
        return ""
    return "." + ext


def extract_pdf_text(pdf_bytes: bytes) -> str:
    if not pdf_bytes:
        return ""

    # Optional full OCR mode (useful for scanned PDFs).
    if (os.environ.get("REPORT_AGENT_PDF_OCR") or "").strip().lower() in {"1", "true", "yes", "y", "on"}:
        try:
            from core.pdf_ocr import ocr_pdf_bytes

            lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
            zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
            max_pages_env = (os.environ.get("REPORT_AGENT_PDF_OCR_MAX_PAGES") or "").strip()
            max_pages = int(max_pages_env) if max_pages_env.isdigit() else None
            result = ocr_pdf_bytes(pdf_bytes, lang=lang, zoom=zoom, max_pages=max_pages)
            return clean_pdf_text_for_llm(normalize_pdf_text(result.text))
        except Exception:
            # Fall back to text extraction.
            pass

    use_hybrid_ocr = (os.environ.get("REPORT_AGENT_PDF_OCR_HYBRID") or "").strip().lower() in {"1", "true", "yes", "y", "on"}
    hybrid_ocr_budget_env = (os.environ.get("REPORT_AGENT_PDF_OCR_HYBRID_MAX_PAGES") or "").strip()
    hybrid_ocr_budget = int(hybrid_ocr_budget_env) if hybrid_ocr_budget_env.isdigit() else 6

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    flags = 0
    flags |= getattr(fitz, "TEXT_DEHYPHENATE", 0)
    flags |= getattr(fitz, "TEXT_PRESERVE_WHITESPACE", 0)

    lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
    zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
    psm_env = (os.environ.get("REPORT_AGENT_PDF_OCR_PSM") or "").strip()
    psm = int(psm_env) if psm_env.isdigit() else 6
    matrix = fitz.Matrix(zoom, zoom)
    ocr_used = 0

    chunks: list[str] = []
    for page in doc:
        try:
            page_text = page.get_text("text", flags=flags, sort=True)
        except TypeError:
            page_text = page.get_text()

        page_text = normalize_pdf_text(page_text or "")
        if use_hybrid_ocr and ocr_used < hybrid_ocr_budget and is_bad_pdf_page_text(page_text):
            try:
                from core.pdf_ocr import is_tesseract_available, ocr_png_bytes

                if is_tesseract_available():
                    pix = page.get_pixmap(matrix=matrix, alpha=False)
                    ocr_text = ocr_png_bytes(pix.tobytes("png"), lang=lang, psm=psm)
                    if ocr_text and ocr_text.strip():
                        page_text = ocr_text
                        ocr_used += 1
            except Exception:
                pass

        chunks.append(page_text)

    return clean_pdf_text_for_llm(normalize_pdf_text("\n".join([c for c in chunks if c])))


def extract_past_report_text(report_bytes: bytes, *, ext: str) -> str:
    if not report_bytes:
        return ""
    if ext == ".pdf":
        return extract_pdf_text(report_bytes)
    if ext == ".docx":
        return extract_docx_text(report_bytes)
    return ""


def clip_past_report_text(text: str, *, max_chars: int = _PAST_REPORT_TEXT_MAX) -> str:
    return shrink_text(text, max_chars=max_chars, keywords=_PAST_REPORT_TEXT_KEYWORDS, backtrack=4000)


def extract_docx_images(report_bytes: bytes, *, max_images: int = _PAST_REPORT_IMAGE_MAX) -> list[tuple[str, bytes]]:
    if not report_bytes:
        return []
    images: list[tuple[str, bytes]] = []
    try:
        with zipfile.ZipFile(BytesIO(report_bytes)) as zf:
            names = [name for name in zf.namelist() if name.startswith("word/media/")]
            names.sort()
            for name in names:
                ext = Path(name).suffix.lower()
                mime = _DOCX_IMAGE_MIME.get(ext)
                if not mime:
                    continue
                data = zf.read(name)
                if not data:
                    continue
                if len(data) > _PAST_REPORT_IMAGE_MAX_BYTES:
                    continue
                images.append((mime, data))
                if len(images) >= max_images:
                    break
    except Exception:
        return []
    return images


def extract_past_report_images(report_bytes: bytes, *, ext: str) -> list[tuple[str, bytes]]:
    if not report_bytes:
        return []
    if ext == ".docx":
        return extract_docx_images(report_bytes)
    return []


_FULLWIDTH_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
_MATCH_CLEAN_RE = re.compile(r"[^0-9a-zA-Z\u3040-\u30FF\u4E00-\u9FFF]+")


def normalize_name_for_match(text: str) -> str:
    s = (text or "").strip().translate(_FULLWIDTH_DIGITS).lower()
    s = _MATCH_CLEAN_RE.sub("", s)
    return s


def _char_ngrams(text: str, *, n: int = 2) -> set[str]:
    if not text:
        return set()
    if len(text) < n:
        return {text}
    return {text[i : i + n] for i in range(len(text) - n + 1)}


def name_similarity(a: str, b: str) -> float:
    na = normalize_name_for_match(a)
    nb = normalize_name_for_match(b)
    if not na or not nb:
        return 0.0
    ga = _char_ngrams(na, n=2)
    gb = _char_ngrams(nb, n=2)
    if not ga or not gb:
        return 0.0
    inter = len(ga & gb)
    union = len(ga | gb)
    return inter / union if union else 0.0
