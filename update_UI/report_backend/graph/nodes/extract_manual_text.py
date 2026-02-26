from __future__ import annotations

import os
from typing import Any

import fitz  # PyMuPDF

from core.text import clean_pdf_text_for_llm, normalize_pdf_text, is_bad_pdf_page_text, pdf_text_to_markdown
from core.storage import Storage
from graph.state import AgentState, PdfTextBlock, now_iso
from llm.client import LLMClient

def _is_truthy_env(name: str, default: str = "") -> bool:
    value = (os.environ.get(name) or default).strip().lower()
    return value in {"1", "true", "yes", "y", "on"}

def extract_manual_text(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    """
    B1. ExtractManualText
    Performs core PDF text extraction and populates state.pdf.page_texts and state.pdf.text.
    Includes OCR capabilities if enabled via environment variables.
    """
    
    if not state.pdf.storage_key:
        return state

    pdf_bytes = storage.get_bytes(state.pdf.storage_key)
    
    use_full_ocr = _is_truthy_env("REPORT_AGENT_PDF_OCR", "0")
    use_hybrid_ocr = _is_truthy_env("REPORT_AGENT_PDF_OCR_HYBRID", "0")
    
    # --- 1. OCR Flow (Optional) ---
    if use_full_ocr:
        try:
            from core.pdf_ocr import ocr_pdf_bytes
            lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip()
            zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
            ocr = ocr_pdf_bytes(pdf_bytes, lang=lang, zoom=zoom)
            state.pdf.text = clean_pdf_text_for_llm(normalize_pdf_text(ocr.text))
            state.pdf.markdown_text = pdf_text_to_markdown(state.pdf.text)
            state.pdf.page_texts = [
                PdfTextBlock(page=idx + 1, text=clean_pdf_text_for_llm(normalize_pdf_text(page_text)))
                for idx, page_text in enumerate(ocr.page_texts or [])
            ]
            state.pdf.pages = ocr.pages
            state.job_meta.updated_at = now_iso()
            return state
        except Exception:
            use_full_ocr = False # Fallback to standard extraction

    # --- 2. Standard Text Extraction ---
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    state.pdf.pages = len(doc)
    
    flags = fitz.TEXT_DEHYPHENATE | fitz.TEXT_PRESERVE_WHITESPACE
    
    chunks: list[str] = []
    page_texts: list[PdfTextBlock] = []
    
    for page in doc:
        try:
            page_text = page.get_text("text", flags=flags, sort=True)
        except Exception:
            page_text = page.get_text()
            
        page_text = normalize_pdf_text(page_text or "")
        
        # Simple Hybrid OCR if text is garbage
        if use_hybrid_ocr and is_bad_pdf_page_text(page_text):
            try:
                from core.pdf_ocr import ocr_png_bytes
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                ocr_text = ocr_png_bytes(pix.tobytes("png"))
                if ocr_text and ocr_text.strip():
                    page_text = ocr_text
            except Exception:
                pass
                
        cleaned_text = clean_pdf_text_for_llm(page_text)
        page_texts.append(PdfTextBlock(page=page.number + 1, text=cleaned_text))
        chunks.append(cleaned_text)

    state.pdf.text = "\n".join(chunks)
    state.pdf.markdown_text = pdf_text_to_markdown(state.pdf.text)
    state.pdf.page_texts = page_texts
    
    state.job_meta.updated_at = now_iso()
    return state
