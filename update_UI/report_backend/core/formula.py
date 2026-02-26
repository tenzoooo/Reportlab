from __future__ import annotations

import re
from xml.sax.saxutils import escape

from core.text import normalize_pdf_text


_OMML_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/math"
_FULLWIDTH_TRANS = str.maketrans(
    {
        "０": "0",
        "１": "1",
        "２": "2",
        "３": "3",
        "４": "4",
        "５": "5",
        "６": "6",
        "７": "7",
        "８": "8",
        "９": "9",
        "＋": "+",
        "－": "-",
        "−": "-",
        "＝": "=",
        "／": "/",
    }
)
_WS_RE = re.compile(r"\s+")


def normalize_formula_text(raw: str) -> str:
    """
    Normalize math-like text while keeping human readability.
    """
    s = normalize_pdf_text(raw or "")
    s = s.translate(_FULLWIDTH_TRANS)
    s = _WS_RE.sub(" ", s).strip()
    return s


def formula_to_omml(text: str) -> str:
    """
    Convert a plain formula string to a minimal OMML wrapper.
    """
    s = (text or "").strip()
    if not s:
        return ""
    escaped = escape(s)
    return (
        f"<m:oMath xmlns:m=\"{_OMML_NAMESPACE}\">"
        f"<m:r><m:t xml:space=\"preserve\">{escaped}</m:t></m:r>"
        f"</m:oMath>"
    )
