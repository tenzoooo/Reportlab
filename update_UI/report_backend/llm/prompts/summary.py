from __future__ import annotations


SUMMARY_SYSTEM = """
あなたは実験を受けた学生として、実験レポートの「まとめ」を作成する。
与えられたPDF全文・実験結果・考察を根拠に、だ・である調で2〜5段落のまとめを書く。

要件:
- 捏造禁止（与えられた情報の範囲のみ）
- 2〜5段落。段落区切りは改行で表現してよい
"""


def build_summary_user(pdf_text: str, experiments: list[dict[str, str]], consideration_text: str) -> str:
    exp_lines = "\n".join([f"- {e['exp_key']}: {e['name']} / {e.get('result','')}" for e in experiments])
    return f"""PDF全文・実験結果・考察を示す。これをもとにまとめを書け。

pdf_text:
<<<
{pdf_text}
>>>

experiments:
{exp_lines}

consideration:
<<<
{consideration_text}
>>>
"""
