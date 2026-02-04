from __future__ import annotations

from core.markdown_review import review_markdown


def test_reviewer_logs_violations_but_does_not_rewrite():
    md = "\n".join(
        [
            "# 5. 実験結果",
            "",
            "## 実験 5.1：テスト",
            "",
            "手順1〜5に従ってVCEを0 Vにし、IBを0, 20, 40, 60 μAに設定して測定した。",
            "",
            "±10.6%程度であり、ほぼ一定とは言い切れない。",
            "",
            "表 5.1.1.1：Four-curve transistor output characteristics",
            "",
            "| a | b |",
            "|---|---|",
            "| 1 | 2 |",
            "",
            "以上より、この結果は能動領域である。",
            "",
            "![](image:img1)",
            "",
            "VCE≈1 V付近ではICが変化した。",
        ]
    )

    out, log = review_markdown(md)

    # No rewriting.
    assert out.strip() == md.strip()

    # Violations logged (caption language + quant-before-evidence due to extra text before table).
    assert any(v.get("type") == "english_caption" for v in (log.get("violations") or []))
    assert not any(v.get("type") == "forbidden_word_found" for v in (log.get("violations") or []))
