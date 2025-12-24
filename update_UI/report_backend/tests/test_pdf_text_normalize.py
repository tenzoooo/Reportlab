from __future__ import annotations

from core.text import clean_pdf_text_for_llm, is_bad_pdf_page_text, normalize_pdf_text


def test_normalize_pdf_text_maps_common_symbol_pua_glyphs():
    # Typical mojibake outputs from PDFs using Symbol-like fonts (PUA U+F0xx).
    raw = " +  = , m"
    assert normalize_pdf_text(raw) == "α + β = γ, μm"


def test_normalize_pdf_text_maps_stretchy_bracket_glyphs():
    raw = " x   y   z "
    assert normalize_pdf_text(raw) == "( x ) [ y ] { z }"


def test_clean_pdf_text_for_llm_drops_diagram_like_noise_but_keeps_equations():
    raw = "\n".join(
        [
            "図４ 変圧比の測定系",
            "                  U",
            "                                                         U  u",
            "ACV                                      IN OUT               ACV  ,�",
            "                                                                                                         (23)                     f � >�(234.5>      �f�) −234.5 ",
            "ここでR0 は時間t=0 における巻線抵抗である．",
        ]
    )
    cleaned = clean_pdf_text_for_llm(raw)
    assert "ACV" not in cleaned
    assert "IN OUT" not in cleaned
    assert "(23)" in cleaned
    assert "ここでR0" in cleaned


def test_is_bad_pdf_page_text_flags_empty_and_replacement():
    assert is_bad_pdf_page_text("") is True
    assert is_bad_pdf_page_text("   \n\t") is True
    # Single replacement char in a short, non-CJK line is often a diagram label; keep heuristics conservative.
    assert is_bad_pdf_page_text("V0=V1+V2 ,�") is False
    assert is_bad_pdf_page_text("ここでR0は…") is False
