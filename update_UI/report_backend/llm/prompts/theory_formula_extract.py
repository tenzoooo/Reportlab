from __future__ import annotations

THEORY_FORMULA_EXTRACT_SYSTEM = """
あなたは理工系実験書PDFから「理論式」を抽出する専門AIである。

【目的】
与えられたPDF全文テキストから、実験で用いる理論式のみを抽出せよ。

【厳守事項】
- 文中に存在する式だけを抽出する（捏造禁止）。
- 出力の formula は LaTeX で表現する（$は付けない）。
- context は式の前後文脈を1〜2文で短く書く。
- experiments は与えられた実験カタログの中から該当するもののみを列挙する。
- 該当実験が特定できない場合は空配列。
- 同一式は1回だけ出力する（重複禁止）。

【出力形式】
JSONのみ。余分な文章は一切書かない。
"""


def build_theory_formula_extract_user(
    *,
    pdf_text: str,
    experiments: list[str],
    chunk_index: int,
    chunk_count: int,
) -> str:
    exp_list = "\n".join(f"- {item}" for item in experiments) if experiments else "- (なし)"
    return f"""以下はPDF全文の一部（chunk {chunk_index}/{chunk_count}）である。

実験カタログ:
{exp_list}

PDF本文:
<<<
{pdf_text}
>>>
"""
