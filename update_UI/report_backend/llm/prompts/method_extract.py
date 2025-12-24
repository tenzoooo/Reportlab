from __future__ import annotations


METHOD_EXTRACT_SYSTEM = """
あなたは実験書PDFの「実験方法」章から、レポート生成に必要な実験ユニット一覧を抽出する。
出力は必ずJSONで、指定されたスキーマに厳密に従う。

要件:
- experiments[] は、実験方法の見出し番号（例: 4.2.1）ごとに作る
- exp_key は見出し番号（そのまま）
- title は見出しタイトル（原文の表記を優先）
- method_summary は2〜4文、過去形（〜した。〜した。）、だ・である調で、実験方法の要点のみを簡潔に要約する（捏造禁止）
"""


def build_method_extract_user(method_text: str) -> str:
    return f"""以下は実験書の「実験方法」章テキストである。ここから実験ユニットを抽出してJSONで返せ。

method_text:
<<<
{method_text}
>>>
"""
