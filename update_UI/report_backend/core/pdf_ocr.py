from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass

import fitz  # PyMuPDF


@dataclass(frozen=True)
class PdfOcrResult:
    text: str
    pages: int


def is_tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def _run_tesseract(*, png_path: str, out_base: str, lang: str, psm: int, timeout_sec: int) -> str:
    cmd = [
        "tesseract",
        png_path,
        out_base,
        "-l",
        lang,
        "--psm",
        str(psm),
        "-c",
        "preserve_interword_spaces=1",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec)
    if proc.returncode != 0:
        raise RuntimeError(f"tesseract failed (code={proc.returncode}): {proc.stderr.strip()}")
    out_txt = out_base + ".txt"
    try:
        with open(out_txt, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except FileNotFoundError:
        return ""


def ocr_png_bytes(
    png_bytes: bytes,
    *,
    lang: str = "jpn+eng",
    psm: int = 6,
    timeout_sec: int = 30,
) -> str:
    if not png_bytes:
        return ""
    if not is_tesseract_available():
        raise RuntimeError("tesseract is not available on this runtime")
    with tempfile.TemporaryDirectory(prefix="report_agent_png_ocr_") as td:
        png_path = os.path.join(td, "input.png")
        with open(png_path, "wb") as f:
            f.write(png_bytes)
        out_base = os.path.join(td, "out")
        return _run_tesseract(png_path=png_path, out_base=out_base, lang=lang, psm=psm, timeout_sec=timeout_sec)


def ocr_pdf_bytes(
    pdf_bytes: bytes,
    *,
    lang: str = "jpn+eng",
    zoom: float = 2.5,
    psm: int = 6,
    max_pages: int | None = None,
    timeout_sec_per_page: int = 30,
) -> PdfOcrResult:
    """
    OCR-extract text from a PDF by rendering pages to images and running tesseract.

    Notes:
    - Requires the `tesseract` binary (and language packs) to be installed on the runtime.
    - Intended for scanned PDFs or PDFs where text extraction is unreliable.
    """
    if not pdf_bytes:
        return PdfOcrResult(text="", pages=0)
    if not is_tesseract_available():
        raise RuntimeError("tesseract is not available on this runtime")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_total = doc.page_count
    pages_n = pages_total if max_pages is None else min(pages_total, max_pages)

    matrix = fitz.Matrix(zoom, zoom)

    parts: list[str] = []
    with tempfile.TemporaryDirectory(prefix="report_agent_pdf_ocr_") as td:
        for i in range(pages_n):
            page = doc[i]
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            png_bytes = pix.tobytes("png")

            png_path = os.path.join(td, f"page_{i+1:04d}.png")
            with open(png_path, "wb") as f:
                f.write(png_bytes)

            out_base = os.path.join(td, f"page_{i+1:04d}_out")
            text = _run_tesseract(
                png_path=png_path,
                out_base=out_base,
                lang=lang,
                psm=psm,
                timeout_sec=timeout_sec_per_page,
            )
            parts.append((text or "").strip())

    joined = "\n\n".join([p for p in parts if p])
    return PdfOcrResult(text=joined, pages=pages_total)
