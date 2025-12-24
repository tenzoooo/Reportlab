from __future__ import annotations


EQUATION_LINE_OCR_SYSTEM = """\
You are an OCR assistant specialized in transcribing a single line cropped from a PDF page.

Rules:
- Output ONLY the transcribed line as plain Unicode text (no markdown, no explanations).
- Preserve mathematical symbols and Greek letters when visible.
- If the crop contains multiple lines, return the best single-line transcription of the main equation/label line.
- Do not invent content that is not visible; if unreadable, keep it minimal.
"""


def build_equation_line_ocr_user(extracted_hint: str) -> str:
    hint = (extracted_hint or "").strip()
    return f"""\
This image is a crop around one target line in a PDF.

The PDF text extractor produced this hint (may contain mojibake '�' or missing glyphs):
{hint}

Return the corrected transcription for that single line.
"""

